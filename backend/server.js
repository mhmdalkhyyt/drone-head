const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'drone-head-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const DEVELOPMENT_MODE = process.env.DEVELOPMENT_MODE === 'develop' || process.env.DEVELOPMENT_MODE === 'true';

// ─── Authentication Middleware ────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  // Skip authentication in development mode
  if (DEVELOPMENT_MODE) {
    req.user = { id: 'dev-user', username: 'development' };
    return next();
  }
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

app.use(cors());
app.use(express.json());

// ─── SQLite Database Setup ──────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'data.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    preferences TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

  CREATE TABLE IF NOT EXISTS user_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    state_data TEXT NOT NULL,
    name TEXT DEFAULT 'Saved State',
    saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id);
`);

// ─── In-memory stores ─────────────────────────────────────────────────────────
const drones   = new Map();   // id → drone { id, name, lat, lng, altitude, speed, status, battery, hubId, updatedAt }
const hubs     = new Map();   // id → hub
const fleets   = new Map();   // id → fleet   { id, hubId, name, droneIds[], status }
const missions = new Map();   // id → mission  { id, hubId, title, type, requiredDrones, priority, status, assignedFleetId }
const simulations = new Map(); // id → { droneId, targetLat, targetLng, speed, intervalId }
const noGoZones = new Map();  // id → { id, name, coordinates: [[lat,lng],...], ruleset, createdAt }

// Ground units and road network
const groundUnits = new Map(); // id → groundUnit { id, name, type, lat, lng, speed, status, battery, hubId, updatedAt, onRoad }
const roads       = new Map(); // id → road { id, name, type, coordinates: [[lat,lng],...], speedLimit }
const walkablePaths = new Map(); // id → path { id, name, type, coordinates: [[lat,lng],...] }

// Naval units and water areas
const navalUnits = new Map(); // id → navalUnit { id, name, type, lat, lng, speed, status, battery, hubId, updatedAt }
const waterAreas = new Map(); // id → waterArea { id, name, coordinates: [[lat,lng],...], createdAt }

// Waypoints for missions
const waypoints = new Map(); // id → waypoint { id, type, entityId, lat, lng, name, hubId }

let hubSeq     = 1;
let fleetSeq   = 1;
let missionSeq = 1;
let noGoSeq    = 1;
let groundUnitSeq = 1;
let roadSeq    = 1;
let pathSeq    = 1;
let navalUnitSeq = 1;
let waterAreaSeq = 1;
let waypointSeq = 1;

// Track round-robin fleet assignments for each hub
const hubFleetAssignments = new Map(); // hubId → nextFleetIndex

// SSE clients
const sseClients = new Set();


// ─── Auth Routes ──────────────────────────────────────────────────────────────

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    
    // Generate JWT token for auto-login after registration
    const token = jwt.sign(
      { id: result.lastInsertRowid, username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.status(201).json({ 
      message: 'User created successfully',
      token,
      user: { id: result.lastInsertRowid, username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Delete user (requires authentication, deletes own account)
app.delete('/api/auth/user', authenticateToken, (req, res) => {
  try {
    // Delete user's states first
    db.prepare('DELETE FROM user_states WHERE user_id = ?').run(req.user.id);
    
    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// List all users (admin endpoint - requires authentication)
app.get('/api/auth/users', authenticateToken, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, created_at FROM users').all();
    res.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get current user profile with extended info
app.get('/api/auth/me/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get basic user info
    const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get or create profile
    let profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    if (!profile) {
      db.prepare('INSERT INTO user_profiles (user_id, display_name, preferences) VALUES (?, NULL, NULL)').run(userId);
      profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    }
    
    res.json({ 
      user: { id: user.id, username: user.username, created_at: user.created_at },
      profile: { 
        id: profile.id, 
        display_name: profile.display_name, 
        email: profile.email,
        preferences: profile.preferences ? JSON.parse(profile.preferences) : null,
        updated_at: profile.updated_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
app.put('/api/auth/me/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name, email, preferences } = req.body;
    
    // Validate email if provided
    if (email && !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Update or insert profile
    const existingProfile = db.prepare('SELECT id FROM user_profiles WHERE user_id = ?').get(userId);
    
    if (existingProfile) {
      db.prepare(`
        UPDATE user_profiles 
        SET display_name = COALESCE(?, display_name),
            email = COALESCE(?, email),
            preferences = COALESCE(?, preferences),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(display_name, email, preferences ? JSON.stringify(preferences) : null, userId);
    } else {
      db.prepare(`
        INSERT INTO user_profiles (user_id, display_name, email, preferences)
        VALUES (?, ?, ?, ?)
      `).run(userId, display_name, email, preferences ? JSON.stringify(preferences) : null);
    }
    
    // Fetch updated profile
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    
    res.json({ 
      message: 'Profile updated successfully',
      profile: { 
        id: profile.id, 
        display_name: profile.display_name, 
        email: profile.email,
        preferences: profile.preferences ? JSON.parse(profile.preferences) : null,
        updated_at: profile.updated_at
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
app.put('/api/auth/me/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // Get current user
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete specific user (admin)
app.delete('/api/auth/users/:id', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Delete user's states first
    db.prepare('DELETE FROM user_states WHERE user_id = ?').run(userId);
    
    // Delete user
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── State Routes ─────────────────────────────────────────────────────────────

// Save state for current user
app.post('/api/states', authenticateToken, (req, res) => {
  try {
    const { state_data, name } = req.body;
    
    if (!state_data) {
      return res.status(400).json({ error: 'State data is required' });
    }
    
    const result = db.prepare(
      'INSERT INTO user_states (user_id, state_data, name) VALUES (?, ?, ?)'
    ).run(req.user.id, JSON.stringify(state_data), name || 'Saved State');
    
    res.status(201).json({
      message: 'State saved successfully',
      state: { id: result.lastInsertRowid, name: name || 'Saved State' }
    });
  } catch (error) {
    console.error('Save state error:', error);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

// Get all saved states for current user
app.get('/api/states', authenticateToken, (req, res) => {
  try {
    const states = db.prepare(
      'SELECT id, name, saved_at FROM user_states WHERE user_id = ? ORDER BY saved_at DESC'
    ).all(req.user.id);
    
    res.json({ states });
  } catch (error) {
    console.error('Get states error:', error);
    res.status(500).json({ error: 'Failed to get states' });
  }
});

// Get full state data by ID
app.get('/api/states/:id', authenticateToken, (req, res) => {
  try {
    const stateId = parseInt(req.params.id);
    
    const state = db.prepare(
      'SELECT * FROM user_states WHERE id = ? AND user_id = ?'
    ).get(stateId, req.user.id);
    
    if (!state) {
      return res.status(404).json({ error: 'State not found' });
    }
    
    res.json({ state: { ...state, state_data: JSON.parse(state.state_data) } });
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ error: 'Failed to get state' });
  }
});

// Load state (returns the state data)
app.post('/api/states/:id/load', authenticateToken, (req, res) => {
  try {
    const stateId = parseInt(req.params.id);
    
    const state = db.prepare(
      'SELECT * FROM user_states WHERE id = ? AND user_id = ?'
    ).get(stateId, req.user.id);
    
    if (!state) {
      return res.status(404).json({ error: 'State not found' });
    }
    
    res.json({ 
      message: 'State loaded successfully',
      state_data: JSON.parse(state.state_data)
    });
  } catch (error) {
    console.error('Load state error:', error);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

// Delete a saved state
app.delete('/api/states/:id', authenticateToken, (req, res) => {
  try {
    const stateId = parseInt(req.params.id);
    
    const result = db.prepare(
      'DELETE FROM user_states WHERE id = ? AND user_id = ?'
    ).run(stateId, req.user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'State not found' });
    }
    
    res.json({ message: 'State deleted successfully' });
  } catch (error) {
    console.error('Delete state error:', error);
    res.status(500).json({ error: 'Failed to delete state' });
  }
});

// ─── Broadcast helpers ────────────────────────────────────────────────────────
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

function broadcastHub(hub)         { broadcast({ type: 'hub:update',     hub }); }
function broadcastHubRemove(id)    { broadcast({ type: 'hub:remove',     id  }); }
function broadcastFleet(fleet)     { broadcast({ type: 'fleet:update',   fleet }); }
function broadcastFleetRemove(id)  { broadcast({ type: 'fleet:remove',   id  }); }
function broadcastMission(mission) { broadcast({ type: 'mission:update', mission }); }
function broadcastMissionRemove(id){ broadcast({ type: 'mission:remove', id  }); }
function broadcastNoGoZone(zone)   { broadcast({ type: 'nogozone:update', zone }); }
function broadcastNoGoZoneRemove(id) { broadcast({ type: 'nogozone:remove', id }); }
function broadcastGroundUnit(unit) { broadcast({ type: 'groundunit:update', unit }); }
function broadcastGroundUnitRemove(id) { broadcast({ type: 'groundunit:remove', id }); }
function broadcastRoad(road)       { broadcast({ type: 'road:update', road }); }
function broadcastRoadRemove(id)   { broadcast({ type: 'road:remove', id }); }
function broadcastPath(aPath)      { broadcast({ type: 'path:update', path: aPath }); }
function broadcastPathRemove(id)   { broadcast({ type: 'path:remove', id }); }
function broadcastNavalUnit(unit)  { broadcast({ type: 'navalunit:update', unit }); }
function broadcastNavalUnitRemove(id) { broadcast({ type: 'navalunit:remove', id }); }
function broadcastWaterArea(area)  { broadcast({ type: 'waterarea:update', area }); }
function broadcastWaterAreaRemove(id) { broadcast({ type: 'waterarea:remove', id }); }

// ─── Utility: get missions for a hub sorted by priority then insertion ────────
function hubMissionQueue(hubId) {
  return [...missions.values()]
    .filter(m => m.hubId === hubId)
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
}

// ─── Utility: get drone with full relationships ───────────────────────────────
function getDroneWithRelations(droneId) {
  const drone = drones.get(droneId);
  if (!drone) return null;

  const result = { ...drone };

  // Add hub info if assigned
  if (drone.hubId) {
    const hub = hubs.get(drone.hubId);
    result.hub = hub ? { id: hub.id, name: hub.name, lat: hub.lat, lng: hub.lng } : null;
  }

  // Find fleet membership
  let fleet = null;
  for (const [fid, f] of fleets.entries()) {
    if (f.droneIds.includes(droneId)) {
      fleet = { id: f.id, name: f.name, hubId: f.hubId, status: f.status };
      break;
    }
  }
  result.fleet = fleet;

  return result;
}

// ─── Utility: get drones for a hub ────────────────────────────────────────────
function getHubDrones(hubId) {
  return [...drones.values()].filter(d => d.hubId === hubId);
}

// ─── Utility: get unassigned drones ───────────────────────────────────────────
function getUnassignedDrones() {
  return [...drones.values()].filter(d => !d.hubId);
}

// ─── Haversine distance calculation (in km) ───────────────────────────────────
function distance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ─── Distance from point to line segment ──────────────────────────────────────
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) {
    return distance(px, py, x1, y1);
  }
  
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  return distance(px, py, closestX, closestY);
}

// ─── Find nearest point on road/path ──────────────────────────────────────────
function findNearestPointOnPolyline(lat, lng, coordinates) {
  let minDist = Infinity;
  let nearest = null;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lat1, lng1] = coordinates[i];
    const [lat2, lng2] = coordinates[i + 1];
    
    const dist = distanceToSegment(lat, lng, lat1, lng1, lat2, lng2);
    if (dist < minDist) {
      minDist = dist;
      // Find the exact point on the segment
      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      const lenSq = dx * dx + dy * dy;
      let t = ((lat - lat1) * dy + (lng - lng1) * dx) / lenSq;
      t = Math.max(0, Math.min(1, t));
      nearest = [lat1 + t * dy, lng1 + t * dx];
    }
  }
  
  return { point: nearest, distance: minDist };
}

// ─── Find nearest road for a ground unit ──────────────────────────────────────
function findNearestRoad(lat, lng, maxDistance = 0.01) {
  let nearestRoad = null;
  let minDist = Infinity;
  
  for (const road of roads.values()) {
    const result = findNearestPointOnPolyline(lat, lng, road.coordinates);
    if (result.distance < minDist && result.distance <= maxDistance) {
      minDist = result.distance;
      nearestRoad = { road, point: result.point };
    }
  }
  
  return nearestRoad;
}

// ─── Check if point is on a road ──────────────────────────────────────────────
function isPointOnRoad(lat, lng, tolerance = 0.001) {
  for (const road of roads.values()) {
    const result = findNearestPointOnPolyline(lat, lng, road.coordinates);
    if (result.distance <= tolerance) {
      return { onRoad: true, road, point: result.point };
    }
  }
  return { onRoad: false, road: null, point: null };
}

// ─── Check if point is on a walkable path ─────────────────────────────────────
function isPointOnWalkablePath(lat, lng, tolerance = 0.001) {
  for (const aPath of walkablePaths.values()) {
    const result = findNearestPointOnPolyline(lat, lng, aPath.coordinates);
    if (result.distance <= tolerance) {
      return { onPath: true, path: aPath, point: result.point };
    }
  }
  return { onPath: false, path: null, point: null };
}

// ─── Check if unit type can use road/path ─────────────────────────────────────
const UNIT_PATH_RULES = {
  humans: ['highway', 'street', 'residential', 'avenue', 'footpath', 'sidewalk', 'trail'],
  ifv:    ['highway', 'street', 'residential'],
  tank:   ['highway', 'street', 'residential'],
  truck:  ['highway', 'street', 'residential', 'avenue']
};

function canUnitUsePath(unitType, pathType) {
  const allowedTypes = UNIT_PATH_RULES[unitType] || UNIT_PATH_RULES.vehicle;
  return allowedTypes.includes(pathType);
}

// ─── Build graph from roads for pathfinding ───────────────────────────────────
function buildRoadGraph() {
  const graph = new Map(); // nodeId → { neighbors: [], roadType: string }
  const nodeIdCache = new Map(); // "lat,lng" → nodeId
  let nodeIdCounter = 0;
  
  // Create nodes at road endpoints and intersections
  roads.forEach(road => {
    if (road.coordinates.length < 2) return;
    
    const startKey = `${road.coordinates[0][0].toFixed(6)},${road.coordinates[0][1].toFixed(6)}`;
    const endKey = `${road.coordinates[road.coordinates.length - 1][0].toFixed(6)},${road.coordinates[road.coordinates.length - 1][1].toFixed(6)}`;
    
    if (!nodeIdCache.has(startKey)) {
      nodeIdCache.set(startKey, nodeIdCounter++);
      graph.set(nodeIdCache.get(startKey), { neighbors: [], roadType: road.type });
    }
    if (!nodeIdCache.has(endKey)) {
      nodeIdCache.set(endKey, nodeIdCounter++);
      graph.set(nodeIdCache.get(endKey), { neighbors: [], roadType: road.type });
    }
    
    const startId = nodeIdCache.get(startKey);
    const endId = nodeIdCache.get(endKey);
    
    // Add bidirectional edges
    const startNode = graph.get(startId);
    const endNode = graph.get(endId);
    
    if (!startNode.neighbors.find(n => n.id === endId)) {
      startNode.neighbors.push({ id: endId, distance: distance(...road.coordinates[0], ...road.coordinates[road.coordinates.length - 1]), roadType: road.type });
    }
    if (!endNode.neighbors.find(n => n.id === startId)) {
      endNode.neighbors.push({ id: startId, distance: distance(...road.coordinates[0], ...road.coordinates[road.coordinates.length - 1]), roadType: road.type });
    }
  });
  
  return { graph, nodeIdCache };
}

// ─── A* Pathfinding on road graph ─────────────────────────────────────────────
function findPathOnRoads(startLat, startLng, endLat, endLng, unitType) {
  const { graph, nodeIdCache } = buildRoadGraph();
  
  // Find nearest nodes for start and end
  const startRoad = findNearestRoad(startLat, startLng);
  const endRoad = findNearestRoad(endLat, endLng);
  
  if (!startRoad || !endRoad) {
    return null; // No roads found
  }
  
  // Get node IDs
  const startKey = `${startRoad.point[0].toFixed(6)},${startRoad.point[1].toFixed(6)}`;
  const endKey = `${endRoad.point[0].toFixed(6)},${endRoad.point[1].toFixed(6)}`;
  
  const startNodeId = nodeIdCache.get(startKey);
  const endNodeId = nodeIdCache.get(endKey);
  
  if (startNodeId === undefined || endNodeId === undefined) {
    return null;
  }
  
  // A* algorithm
  const openSet = new Set([startNodeId]);
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();
  
  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, distance(startLat, startLng, endLat, endLng));
  
  while (openSet.size > 0) {
    // Get node with lowest fScore
    let current = null;
    let lowestFScore = Infinity;
    for (const nodeId of openSet) {
      const fscore = fScore.get(nodeId) || Infinity;
      if (fscore < lowestFScore) {
        lowestFScore = fscore;
        current = nodeId;
      }
    }
    
    if (current === null) break;
    if (current === endNodeId) {
      // Reconstruct path
      const path = [endRoad.point];
      let node = current;
      while (cameFrom.has(node)) {
        const { prev, roadType } = cameFrom.get(node);
        path.unshift(getNodeCoordinates(node, nodeIdCache));
        if (!canUnitUsePath(unitType, roadType)) {
          return null; // Path uses roads this unit can't use
        }
        node = prev;
      }
      path.unshift(startRoad.point);
      return path;
    }
    
    openSet.delete(current);
    
    const currentNode = graph.get(current);
    if (!currentNode) continue;
    
    for (const neighbor of currentNode.neighbors) {
      const tentativeGScore = (gScore.get(current) || Infinity) + neighbor.distance;
      
      if (tentativeGScore < (gScore.get(neighbor.id) || Infinity)) {
        if (!canUnitUsePath(unitType, neighbor.roadType)) continue;
        
        cameFrom.set(neighbor.id, { prev: current, roadType: neighbor.roadType });
        gScore.set(neighbor.id, tentativeGScore);
        fScore.set(neighbor.id, tentativeGScore + distance(...getNodeCoordinates(neighbor.id, nodeIdCache), endLat, endLng));
        openSet.add(neighbor.id);
      }
    }
  }
  
  return null; // No path found
}

function getNodeCoordinates(nodeId, nodeIdCache) {
  for (const [key, id] of nodeIdCache.entries()) {
    if (id === nodeId) {
      const [lat, lng] = key.split(',').map(Number);
      return [lat, lng];
    }
  }
  return [0, 0];
}

// ─── No-Go Zone collision detection ───────────────────────────────────────────

// Point-in-polygon detection using ray casting algorithm
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Check if a point (lat, lng) is inside any no-go zone
function isPointInNoGoZone(lat, lng) {
  const point = [lat, lng];
  for (const zone of noGoZones.values()) {
    if (isPointInPolygon(point, zone.coordinates)) {
      return zone;
    }
  }
  return null;
}

// Check if two line segments intersect
function lineSegmentsIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;
  
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;
  
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  
  return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

// Check if a line segment intersects with a polygon
function lineIntersectsPolygon(p1, p2, polygon) {
  // Check if either endpoint is inside the polygon
  if (isPointInPolygon(p1, polygon) || isPointInPolygon(p2, polygon)) {
    return true;
  }
  
  // Check if any edge of the polygon intersects with the line segment
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (lineSegmentsIntersect(p1, p2, polygon[j], polygon[i])) {
      return true;
    }
  }
  return false;
}

// Check if flight path intersects any no-go zone
function doesPathIntersectNoGoZone(startLat, startLng, endLat, endLng) {
  const startPoint = [startLat, startLng];
  const endPoint = [endLat, endLng];
  
  for (const zone of noGoZones.values()) {
    if (lineIntersectsPolygon(startPoint, endPoint, zone.coordinates)) {
      return zone;
    }
  }
  return null;
}

// ─── Water area detection for naval units ─────────────────────────────────────

// Check if a point (lat, lng) is inside any water area
function isPointInWater(lat, lng) {
  const point = [lat, lng];
  for (const area of waterAreas.values()) {
    if (isPointInPolygon(point, area.coordinates)) {
      return area;
    }
  }
  return null;
}

// Check if both start and end points are in water areas
function arePointsInWater(startLat, startLng, endLat, endLng) {
  const startInWater = isPointInWater(startLat, startLng);
  const endInWater = isPointInWater(endLat, endLng);
  return { startInWater, endInWater, bothInWater: startInWater && endInWater };
}

// Check if a line segment intersects with any water area boundary
function lineIntersectsWater(startLat, startLng, endLat, endLng) {
  const startPoint = [startLat, startLng];
  const endPoint = [endLat, endLng];
  
  for (const area of waterAreas.values()) {
    if (lineIntersectsPolygon(startPoint, endPoint, area.coordinates)) {
      return area;
    }
  }
  return null;
}

// Get default speed for naval unit type
function getNavalUnitSpeed(type) {
  const speeds = {
    'fast-boat': 80,
    'battleship': 45,
    'aircraft-carrier': 55
  };
  return speeds[type] || 50;
}

// Get naval unit type info
function getNavalUnitTypeInfo(type) {
  const types = {
    'fast-boat': { name: 'Fast Boat', icon: '🚤', description: 'Quick reconnaissance vessel' },
    'battleship': { name: 'Battleship', icon: '🚢', description: 'Heavily armed warship' },
    'aircraft-carrier': { name: 'Aircraft Carrier', icon: '🛥️', description: 'Mobile airbase' }
  };
  return types[type] || { name: 'Naval Unit', icon: '🚤', description: 'Water vessel' };
}

// ─── Drone routes ─────────────────────────────────────────────────────────────

app.get('/api/drones', (_req, res) => res.json([...drones.values()]));

app.get('/api/drones/:id', (req, res) => {
  const drone = drones.get(req.params.id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  res.json(drone);
});

// Get drone with full relationships (hub, fleet)
app.get('/api/drones/:id/with-relations', (req, res) => {
  const drone = getDroneWithRelations(req.params.id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  res.json(drone);
});

// Get unassigned drones (not assigned to any hub)
app.get('/api/drones/unassigned', (_req, res) => {
  res.json(getUnassignedDrones());
});

// Get drones assigned to a specific hub
app.get('/api/hubs/:hubId/drones', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json(getHubDrones(hubId));
});

// Assign drone to a hub with round-robin fleet assignment
app.post('/api/drones/:id/assign-hub', (req, res) => {
  const { id } = req.params;
  const { hubId } = req.body;

  const drone = drones.get(id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  if (!hubId || !hubs.has(hubId)) return res.status(400).json({ error: 'Valid hubId is required' });

  // If drone is in a fleet, ensure the fleet belongs to the target hub
  for (const [fid, fleet] of fleets.entries()) {
    if (fleet.droneIds.includes(id)) {
      if (fleet.hubId !== hubId) {
        return res.status(400).json({ error: 'Drone is in a fleet belonging to a different hub. Remove from fleet first.' });
      }
    }
  }

  // Get all fleets for the target hub
  const hubFleets = [...fleets.values()].filter(f => f.hubId === hubId);

  // Round-robin assignment logic
  let selectedFleet = null;
  if (hubFleets.length > 0) {
    // Get the next fleet index for this hub (round-robin)
    const nextIndex = hubFleetAssignments.get(hubId) || 0;
    selectedFleet = hubFleets[nextIndex % hubFleets.length];

    // Update the round-robin index for next assignment
    hubFleetAssignments.set(hubId, nextIndex + 1);

    // Add drone to the selected fleet
    if (!selectedFleet.droneIds.includes(id)) {
      selectedFleet.droneIds.push(id);
      broadcastFleet(selectedFleet);
    }
  }

  // Update drone hub assignment
  drone.hubId = hubId;
  drone.updatedAt = new Date().toISOString();
  drones.set(id, drone);
  broadcast({ type: 'update', drone });
  res.json(drone);
});

// Unassign drone from hub
app.delete('/api/drones/:id/assign-hub', (req, res) => {
  const { id } = req.params;
  const drone = drones.get(id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });

  // If drone is in a fleet, remove from fleet first
  for (const [fid, fleet] of fleets.entries()) {
    if (fleet.droneIds.includes(id)) {
      fleet.droneIds = fleet.droneIds.filter(did => did !== id);
      broadcastFleet(fleet);
    }
  }

  drone.hubId = null;
  drone.updatedAt = new Date().toISOString();
  drones.set(id, drone);
  broadcast({ type: 'update', drone });
  res.json(drone);
});

app.post('/api/drones/:id/location', (req, res) => {
  const { id } = req.params;
  const { lat, lng, altitude, speed, status, battery, name, hubId } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).json({ error: 'lat and lng are required' });

  const existing = drones.get(id) || { id };
  const updated = {
    ...existing,
    id,
    name:      name      ?? existing.name      ?? id,
    lat:       parseFloat(lat),
    lng:       parseFloat(lng),
    altitude:  altitude  !== undefined ? parseFloat(altitude)  : (existing.altitude  ?? 0),
    speed:     speed     !== undefined ? parseFloat(speed)     : (existing.speed     ?? 0),
    status:    status    ?? existing.status    ?? 'active',
    battery:   battery   !== undefined ? parseFloat(battery)   : (existing.battery   ?? 100),
    hubId:     hubId !== undefined ? hubId : existing.hubId,
    updatedAt: new Date().toISOString(),
  };
  drones.set(id, updated);
  broadcast({ type: 'update', drone: updated });
  res.json(updated);
});

app.delete('/api/drones/:id', (req, res) => {
  const { id } = req.params;
  if (!drones.has(id)) return res.status(404).json({ error: 'Drone not found' });
  drones.delete(id);
  broadcast({ type: 'remove', id });
  res.json({ success: true });
});

// ─── Ground Unit routes ───────────────────────────────────────────────────────

// Get all ground units
app.get('/api/ground-units', (_req, res) => {
  res.json([...groundUnits.values()]);
});

// Get ground units for a specific hub
app.get('/api/hubs/:hubId/ground-units', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json([...groundUnits.values()].filter(u => u.hubId === hubId));
});

// Create a ground unit
app.post('/api/ground-units', (req, res) => {
  const { name, type, lat, lng, hubId, speed, battery } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const validTypes = ['humans', 'ifv', 'tank', 'truck'];
  const unitType = type || 'truck';
  if (!validTypes.includes(unitType)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }
  
  const id = `ground-${groundUnitSeq++}`;
  
  // Check if on road
  const onRoadResult = isPointOnRoad(lat, lng);
  
  const unit = {
    id,
    name: name || `Unit ${id}`,
    type: unitType,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    speed: speed || getDefaultSpeed(unitType),
    status: 'idle',
    battery: battery !== undefined ? parseFloat(battery) : 100,
    hubId: hubId || null,
    onRoad: onRoadResult.onRoad,
    currentPath: [],
    pathIndex: 0,
    updatedAt: new Date().toISOString()
  };
  
  groundUnits.set(id, unit);
  broadcastGroundUnit(unit);
  res.status(201).json(unit);
});

// Get a single ground unit
app.get('/api/ground-units/:id', (req, res) => {
  const unit = groundUnits.get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Ground unit not found' });
  res.json(unit);
});

// Update ground unit location
app.post('/api/ground-units/:id/location', (req, res) => {
  const { id } = req.params;
  const { lat, lng, speed, status, battery, name, hubId } = req.body;
  
  const unit = groundUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Ground unit not found' });
  
  if (lat !== undefined) unit.lat = parseFloat(lat);
  if (lng !== undefined) unit.lng = parseFloat(lng);
  if (speed !== undefined) unit.speed = parseFloat(speed);
  if (status !== undefined) unit.status = status;
  if (battery !== undefined) unit.battery = parseFloat(battery);
  if (name !== undefined) unit.name = name;
  if (hubId !== undefined) unit.hubId = hubId;
  
  // Update onRoad status
  const onRoadResult = isPointOnRoad(unit.lat, unit.lng);
  unit.onRoad = onRoadResult.onRoad;
  unit.updatedAt = new Date().toISOString();
  
  groundUnits.set(id, unit);
  broadcastGroundUnit(unit);
  res.json(unit);
});

// Move ground unit to target (with pathfinding)
app.post('/api/ground-units/:id/move', async (req, res) => {
  const { id } = req.params;
  const { targetLat, targetLng } = req.body;
  
  if (targetLat === undefined || targetLng === undefined) {
    return res.status(400).json({ error: 'targetLat and targetLng are required' });
  }
  
  const unit = groundUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Ground unit not found' });
  
  // Check if destination is in no-go zone
  const targetInNoGo = isPointInNoGoZone(targetLat, targetLng);
  if (targetInNoGo) {
    return res.status(400).json({ error: `Destination is in no-go zone: ${targetInNoGo.name}` });
  }
  
  // Find path on roads
  const path = findPathOnRoads(unit.lat, unit.lng, targetLat, targetLng, unit.type);
  
  if (!path || path.length === 0) {
    // No road path found - check if direct movement is possible (humans can go off-road)
    if (unit.type === 'humans') {
      // Infantry can move directly but slower off-road
      unit.currentPath = [[unit.lat, unit.lng], [targetLat, targetLng]];
      unit.pathIndex = 0;
      unit.status = 'moving';
      unit.updatedAt = new Date().toISOString();
      groundUnits.set(id, unit);
      broadcastGroundUnit(unit);
      return res.json({ success: true, path: unit.currentPath, mode: 'direct' });
    }
    return res.status(400).json({ error: 'No valid path found. Ensure the unit is on a road and the destination is reachable.' });
  }
  
  unit.currentPath = path;
  unit.pathIndex = 0;
  unit.status = 'moving';
  unit.updatedAt = new Date().toISOString();
  
  groundUnits.set(id, unit);
  broadcastGroundUnit(unit);
  
  // Start movement simulation
  startGroundUnitMovement(id);
  
  res.json({ success: true, path, mode: 'road' });
});

// Get default speed for unit type
function getDefaultSpeed(type) {
  const speeds = {
    humans: 5,
    ifv: 60,
    tank: 40,
    truck: 70
  };
  return speeds[type] || 70;
}

// Ground unit movement simulation
const groundUnitMovements = new Map();

function startGroundUnitMovement(unitId) {
  const unit = groundUnits.get(unitId);
  if (!unit || !unit.currentPath || unit.currentPath.length === 0) return;
  
  // Stop existing movement
  if (groundUnitMovements.has(unitId)) {
    clearInterval(groundUnitMovements.get(unitId));
  }
  
  let pathIndex = 0;
  const updateInterval = 1000; // Update every second
  
  const intervalId = setInterval(() => {
    const unit = groundUnits.get(unitId);
    if (!unit || unit.status !== 'moving') {
      clearInterval(intervalId);
      groundUnitMovements.delete(unitId);
      return;
    }
    
    if (pathIndex >= unit.currentPath.length - 1) {
      // Reached destination
      unit.status = 'idle';
      unit.currentPath = [];
      unit.pathIndex = 0;
      unit.updatedAt = new Date().toISOString();
      groundUnits.set(unitId, unit);
      broadcastGroundUnit(unit);
      clearInterval(intervalId);
      groundUnitMovements.delete(unitId);
      return;
    }
    
    const currentWaypoint = unit.currentPath[pathIndex];
    const nextWaypoint = unit.currentPath[pathIndex + 1];
    
    // Check if next waypoint is in no-go zone
    const nextInNoGo = isPointInNoGoZone(nextWaypoint[0], nextWaypoint[1]);
    if (nextInNoGo) {
      unit.status = 'warning';
      unit.currentPath = [];
      unit.pathIndex = 0;
      unit.updatedAt = new Date().toISOString();
      groundUnits.set(unitId, unit);
      broadcastGroundUnit(unit);
      broadcast({ type: 'groundunit:blocked', unitId, zone: nextInNoGo });
      clearInterval(intervalId);
      groundUnitMovements.delete(unitId);
      return;
    }
    
    // Calculate movement towards next waypoint
    const dist = distance(currentWaypoint[0], currentWaypoint[1], nextWaypoint[0], nextWaypoint[1]);
    const speed = unit.speed || getDefaultSpeed(unit.type);
    const distancePerUpdate = (speed / 3600) * (updateInterval / 1000);
    
    if (dist <= distancePerUpdate) {
      // Reached this waypoint, move to next
      pathIndex++;
      if (pathIndex >= unit.currentPath.length - 1) {
        // Reached final destination
        unit.lat = unit.currentPath[unit.currentPath.length - 1][0];
        unit.lng = unit.currentPath[unit.currentPath.length - 1][1];
        unit.status = 'idle';
        unit.currentPath = [];
        unit.pathIndex = 0;
        unit.updatedAt = new Date().toISOString();
        groundUnits.set(unitId, unit);
        broadcastGroundUnit(unit);
        clearInterval(intervalId);
        groundUnitMovements.delete(unitId);
        return;
      }
    } else {
      // Move towards next waypoint
      const latDiff = nextWaypoint[0] - currentWaypoint[0];
      const lngDiff = nextWaypoint[1] - currentWaypoint[1];
      const angle = Math.atan2(lngDiff, latDiff);
      
      const latStep = (distancePerUpdate / 111.32) * Math.cos(angle);
      const lngStep = (distancePerUpdate / (111.32 * Math.cos(currentWaypoint[0] * Math.PI / 180))) * Math.sin(angle);
      
      unit.lat = currentWaypoint[0] + latStep;
      unit.lng = currentWaypoint[1] + lngStep;
    }
    
    unit.pathIndex = pathIndex;
    unit.updatedAt = new Date().toISOString();
    groundUnits.set(unitId, unit);
    broadcastGroundUnit(unit);
  }, updateInterval);
  
  groundUnitMovements.set(unitId, intervalId);
}

// Stop ground unit movement
app.delete('/api/ground-units/:id/move', (req, res) => {
  const { id } = req.params;
  
  const unit = groundUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Ground unit not found' });
  
  if (groundUnitMovements.has(id)) {
    clearInterval(groundUnitMovements.get(id));
    groundUnitMovements.delete(id);
  }
  
  unit.status = 'idle';
  unit.currentPath = [];
  unit.pathIndex = 0;
  unit.updatedAt = new Date().toISOString();
  groundUnits.set(id, unit);
  broadcastGroundUnit(unit);
  
  res.json({ success: true });
});

// Delete a ground unit
app.delete('/api/ground-units/:id', (req, res) => {
  const { id } = req.params;
  if (!groundUnits.has(id)) return res.status(404).json({ error: 'Ground unit not found' });
  
  if (groundUnitMovements.has(id)) {
    clearInterval(groundUnitMovements.get(id));
  }
  
  groundUnits.delete(id);
  broadcastGroundUnitRemove(id);
  res.json({ success: true });
});

// Check if path is valid for unit
app.post('/api/ground-units/check-path', (req, res) => {
  const { startLat, startLng, endLat, endLng, unitType } = req.body;
  
  if (startLat === undefined || startLng === undefined || 
      endLat === undefined || endLng === undefined || !unitType) {
    return res.status(400).json({ error: 'startLat, startLng, endLat, endLng, and unitType are required' });
  }
  
  const path = findPathOnRoads(startLat, startLng, endLat, endLng, unitType);
  
  if (path) {
    res.json({ valid: true, path, mode: 'road' });
  } else if (unitType === 'humans') {
    res.json({ valid: true, path: [[startLat, startLng], [endLat, endLng]], mode: 'direct' });
  } else {
    res.json({ valid: false, error: 'No valid path found' });
  }
});

// ─── Road routes ──────────────────────────────────────────────────────────────

// Get all roads
app.get('/api/roads', (_req, res) => {
  res.json([...roads.values()]);
});

// Create a road
app.post('/api/roads', (req, res) => {
  const { name, type, coordinates, speedLimit } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    return res.status(400).json({ error: 'At least 2 coordinate points are required' });
  }
  
  const validTypes = ['highway', 'street', 'residential', 'avenue', 'footpath', 'sidewalk', 'trail'];
  const roadType = type || 'street';
  if (!validTypes.includes(roadType)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }
  
  const id = `road-${roadSeq++}`;
  const road = {
    id,
    name: name || `Road ${id}`,
    type: roadType,
    coordinates: coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]),
    speedLimit: speedLimit || getDefaultSpeedLimit(roadType),
    createdAt: new Date().toISOString()
  };
  
  roads.set(id, road);
  broadcastRoad(road);
  res.status(201).json(road);
});

function getDefaultSpeedLimit(type) {
  const limits = {
    highway: 100,
    street: 50,
    residential: 30,
    avenue: 60,
    footpath: 10,
    sidewalk: 5,
    trail: 15
  };
  return limits[type] || 50;
}

// Update a road
app.patch('/api/roads/:id', (req, res) => {
  const road = roads.get(req.params.id);
  if (!road) return res.status(404).json({ error: 'Road not found' });
  
  const { name, type, coordinates, speedLimit } = req.body;
  if (name) road.name = name;
  if (type) road.type = type;
  if (coordinates && Array.isArray(coordinates)) {
    road.coordinates = coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]);
  }
  if (speedLimit !== undefined) road.speedLimit = parseFloat(speedLimit);
  
  broadcastRoad(road);
  res.json(road);
});

// Delete a road
app.delete('/api/roads/:id', (req, res) => {
  const { id } = req.params;
  if (!roads.has(id)) return res.status(404).json({ error: 'Road not found' });
  
  roads.delete(id);
  broadcastRoadRemove(id);
  res.json({ success: true });
});

// ─── Walkable Path routes ─────────────────────────────────────────────────────

// Get all walkable paths
app.get('/api/walkable-paths', (_req, res) => {
  res.json([...walkablePaths.values()]);
});

// Create a walkable path
app.post('/api/walkable-paths', (req, res) => {
  const { name, type, coordinates } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    return res.status(400).json({ error: 'At least 2 coordinate points are required' });
  }
  
  const validTypes = ['footpath', 'sidewalk', 'trail', 'bike-path'];
  const pathType = type || 'footpath';
  if (!validTypes.includes(pathType)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }
  
  const id = `path-${pathSeq++}`;
  const aPath = {
    id,
    name: name || `Path ${id}`,
    type: pathType,
    coordinates: coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]),
    createdAt: new Date().toISOString()
  };
  
  walkablePaths.set(id, aPath);
  broadcastPath(aPath);
  res.status(201).json(aPath);
});

// Update a walkable path
app.patch('/api/walkable-paths/:id', (req, res) => {
  const aPath = walkablePaths.get(req.params.id);
  if (!aPath) return res.status(404).json({ error: 'Path not found' });
  
  const { name, type, coordinates } = req.body;
  if (name) aPath.name = name;
  if (type) aPath.type = type;
  if (coordinates && Array.isArray(coordinates)) {
    aPath.coordinates = coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]);
  }
  
  broadcastPath(aPath);
  res.json(aPath);
});

// Delete a walkable path
app.delete('/api/walkable-paths/:id', (req, res) => {
  const { id } = req.params;
  if (!walkablePaths.has(id)) return res.status(404).json({ error: 'Path not found' });
  
  walkablePaths.delete(id);
  broadcastPathRemove(id);
  res.json({ success: true });
});

// ─── Hub routes ───────────────────────────────────────────────────────────────

app.get('/api/hubs', (_req, res) => res.json([...hubs.values()]));

app.post('/api/hubs', (req, res) => {
  const { name, lat, lng } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).json({ error: 'lat and lng are required' });

  const id  = `hub-${hubSeq++}`;
  const hub = { id, name: name || `Hub ${id}`, lat: parseFloat(lat), lng: parseFloat(lng), createdAt: new Date().toISOString() };
  hubs.set(id, hub);
  broadcastHub(hub);
  res.status(201).json(hub);
});

app.get('/api/hubs/:id', (req, res) => {
  const hub = hubs.get(req.params.id);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  res.json(hub);
});

app.patch('/api/hubs/:id', (req, res) => {
  const hub = hubs.get(req.params.id);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  const { name } = req.body;
  if (name) hub.name = name;
  broadcastHub(hub);
  res.json(hub);
});

app.delete('/api/hubs/:id', (req, res) => {
  const { id } = req.params;
  if (!hubs.has(id)) return res.status(404).json({ error: 'Hub not found' });
  hubs.delete(id);
  // Remove child fleets + missions
  [...fleets.values()].filter(f => f.hubId === id).forEach(f => { fleets.delete(f.id); broadcastFleetRemove(f.id); });
  [...missions.values()].filter(m => m.hubId === id).forEach(m => { missions.delete(m.id); broadcastMissionRemove(m.id); });
  // Unassign drones from this hub
  [...drones.values()].filter(d => d.hubId === id).forEach(d => {
    d.hubId = null;
    d.updatedAt = new Date().toISOString();
    broadcast({ type: 'update', drone: d });
  });
  broadcastHubRemove(id);
  res.json({ success: true });
});

// ─── Fleet routes ─────────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/fleets', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json([...fleets.values()].filter(f => f.hubId === hubId));
});

app.post('/api/hubs/:hubId/fleets', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  const { name } = req.body;
  const id    = `fleet-${fleetSeq++}`;
  const fleet = { id, hubId, name: name || `Fleet ${id}`, droneIds: [], status: 'idle', currentMissionId: null, createdAt: new Date().toISOString() };
  fleets.set(id, fleet);
  broadcastFleet(fleet);
  res.status(201).json(fleet);
});

app.delete('/api/hubs/:hubId/fleets/:fleetId', (req, res) => {
  const { hubId, fleetId } = req.params;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  fleets.delete(fleetId);
  broadcastFleetRemove(fleetId);
  res.json({ success: true });
});

// Add drone to fleet
app.post('/api/hubs/:hubId/fleets/:fleetId/drones', (req, res) => {
  const { hubId, fleetId } = req.params;
  const { droneId } = req.body;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  const drone = drones.get(droneId);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  
  // Auto-assign drone to hub if not already assigned
  if (!drone.hubId) {
    drone.hubId = hubId;
    drone.updatedAt = new Date().toISOString();
    broadcast({ type: 'update', drone });
  } else if (drone.hubId !== hubId) {
    return res.status(400).json({ error: 'Drone is assigned to a different hub' });
  }
  
  if (!fleet.droneIds.includes(droneId)) {
    fleet.droneIds.push(droneId);
    broadcastFleet(fleet);
  }
  res.json(fleet);
});

// Remove drone from fleet
app.delete('/api/hubs/:hubId/fleets/:fleetId/drones/:droneId', (req, res) => {
  const { hubId, fleetId, droneId } = req.params;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  fleet.droneIds = fleet.droneIds.filter(id => id !== droneId);
  broadcastFleet(fleet);
  res.json(fleet);
});

// ─── Waypoint routes ──────────────────────────────────────────────────────────

// Get all waypoints
app.get('/api/waypoints', (_req, res) => {
  res.json([...waypoints.values()]);
});

// Get waypoints for a specific hub
app.get('/api/hubs/:hubId/waypoints', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json([...waypoints.values()].filter(w => w.hubId === hubId));
});

// Create a waypoint
app.post('/api/waypoints', (req, res) => {
  const { name, type, entityId, lat, lng, hubId } = req.body;
  
  if (!type || !['hub', 'drone', 'ground-unit', 'naval-unit', 'coordinates'].includes(type)) {
    return res.status(400).json({ error: 'Valid type is required (hub, drone, ground-unit, naval-unit, coordinates)' });
  }
  
  // For entity-based waypoints, verify entity exists
  if (entityId) {
    if (type === 'hub' && !hubs.has(entityId)) {
      return res.status(400).json({ error: 'Invalid hub entityId' });
    }
    if (type === 'drone' && !drones.has(entityId)) {
      return res.status(400).json({ error: 'Invalid drone entityId' });
    }
    if (type === 'ground-unit' && !groundUnits.has(entityId)) {
      return res.status(400).json({ error: 'Invalid ground unit entityId' });
    }
    if (type === 'naval-unit' && !navalUnits.has(entityId)) {
      return res.status(400).json({ error: 'Invalid naval unit entityId' });
    }
  }
  
  // Get coordinates from entity if not provided
  let waypointLat = lat;
  let waypointLng = lng;
  
  if (type === 'hub' && hubs.has(entityId)) {
    const hub = hubs.get(entityId);
    waypointLat = hub.lat;
    waypointLng = hub.lng;
  } else if (type === 'drone' && drones.has(entityId)) {
    const drone = drones.get(entityId);
    waypointLat = drone.lat;
    waypointLng = drone.lng;
  } else if (type === 'ground-unit' && groundUnits.has(entityId)) {
    const unit = groundUnits.get(entityId);
    waypointLat = unit.lat;
    waypointLng = unit.lng;
  } else if (type === 'naval-unit' && navalUnits.has(entityId)) {
    const unit = navalUnits.get(entityId);
    waypointLat = unit.lat;
    waypointLng = unit.lng;
  }
  
  if (waypointLat === undefined || waypointLng === undefined) {
    return res.status(400).json({ error: 'Coordinates are required (either directly or via entityId)' });
  }
  
  const id = `waypoint-${waypointSeq++}`;
  const waypoint = {
    id,
    name: name || `Waypoint ${id}`,
    type,
    entityId: entityId || null,
    lat: parseFloat(waypointLat),
    lng: parseFloat(waypointLng),
    hubId: hubId || null,
    createdAt: new Date().toISOString()
  };
  
  waypoints.set(id, waypoint);
  broadcast({ type: 'waypoint:update', waypoint });
  res.status(201).json(waypoint);
});

// Update a waypoint
app.patch('/api/waypoints/:id', (req, res) => {
  const waypoint = waypoints.get(req.params.id);
  if (!waypoint) return res.status(404).json({ error: 'Waypoint not found' });
  
  const { name, lat, lng } = req.body;
  if (name) waypoint.name = name;
  if (lat !== undefined) waypoint.lat = parseFloat(lat);
  if (lng !== undefined) waypoint.lng = parseFloat(lng);
  
  broadcast({ type: 'waypoint:update', waypoint });
  res.json(waypoint);
});

// Delete a waypoint
app.delete('/api/waypoints/:id', (req, res) => {
  const { id } = req.params;
  const waypoint = waypoints.get(id);
  if (!waypoint) return res.status(404).json({ error: 'Waypoint not found' });
  
  // Unbind from any missions
  [...missions.values()].forEach(m => {
    if (m.waypointId === id) {
      m.waypointId = null;
      broadcastMission(m);
    }
  });
  
  waypoints.delete(id);
  broadcast({ type: 'waypoint:remove', id });
  res.json({ success: true });
});

// ─── Mission routes ───────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/missions', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json(hubMissionQueue(hubId));
});

app.post('/api/hubs/:hubId/missions', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  const { title, type, requiredDrones, priority, waypointId, endCondition, endConditionValue } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  // Validate waypoint if provided
  if (waypointId && !waypoints.has(waypointId)) {
    return res.status(400).json({ error: 'Invalid waypointId' });
  }

  // Validate endCondition
  const validEndConditions = ['manual', 'arrival', 'drone_reached', 'time_elapsed', 'fleet_idle'];
  if (endCondition && !validEndConditions.includes(endCondition)) {
    return res.status(400).json({ error: `Invalid endCondition. Must be one of: ${validEndConditions.join(', ')}` });
  }

  const id      = `mission-${missionSeq++}`;
  const mission = {
    id,
    hubId,
    title,
    type:           type           || 'general',
    requiredDrones: requiredDrones !== undefined ? parseInt(requiredDrones) : 1,
    priority:       priority       !== undefined ? parseInt(priority)       : 100,
    status:         'queued',
    assignedFleetId: null,
    waypointId:     waypointId     || null,
    endCondition:   endCondition   || 'manual',
    endConditionValue: endConditionValue || null,
    createdAt:      new Date().toISOString(),
  };
  missions.set(id, mission);
  broadcastMission(mission);
  res.status(201).json(mission);
});

app.delete('/api/hubs/:hubId/missions/:missionId', (req, res) => {
  const { hubId, missionId } = req.params;
  const mission = missions.get(missionId);
  if (!mission || mission.hubId !== hubId) return res.status(404).json({ error: 'Mission not found' });
  // Free assigned fleet if active
  if (mission.assignedFleetId) {
    const fleet = fleets.get(mission.assignedFleetId);
    if (fleet) { fleet.status = 'idle'; fleet.currentMissionId = null; broadcastFleet(fleet); }
  }
  missions.delete(missionId);
  broadcastMissionRemove(missionId);
  res.json({ success: true });
});

// Mark mission complete (manual or future auto)
app.post('/api/hubs/:hubId/missions/:missionId/complete', (req, res) => {
  const { hubId, missionId } = req.params;
  const mission = missions.get(missionId);
  if (!mission || mission.hubId !== hubId) return res.status(404).json({ error: 'Mission not found' });
  if (mission.assignedFleetId) {
    const fleet = fleets.get(mission.assignedFleetId);
    if (fleet) { fleet.status = 'idle'; fleet.currentMissionId = null; broadcastFleet(fleet); }
  }
  mission.status = 'done';
  mission.completedAt = new Date().toISOString();
  broadcastMission(mission);
  res.json(mission);
});

// Simulate a computer-generated mission (triggers notification toast)
app.post('/api/missions/simulate', (req, res) => {
  const { title, type, priority, hubId } = req.body;
  
  // Generate random mission if not provided
  const missionTitle = title || `Auto-Mission ${missionSeq++}`;
  const missionType = type || ['general', 'surveillance', 'delivery', 'search', 'inspection'][Math.floor(Math.random() * 5)];
  const missionPriority = priority || ['high', 'medium', 'low'][Math.floor(Math.random() * 3)];
  const missionHubId = hubId || [...hubs.keys()][Math.floor(Math.random() * hubs.size)] || null;
  
  // Create a simulated mission object
  const simulatedMission = {
    id: `sim-mission-${Date.now()}`,
    title: missionTitle,
    type: missionType,
    priority: missionPriority,
    hubId: missionHubId,
    status: 'active',
    requiredDrones: Math.floor(Math.random() * 3) + 1,
    createdAt: new Date().toISOString()
  };
  
  // Broadcast the mission notification via SSE
  broadcast({ 
    type: 'mission:notification', 
    mission: simulatedMission,
    priority: missionPriority
  });
  
  res.status(201).json({ 
    success: true, 
    mission: simulatedMission,
    message: 'Mission simulation triggered'
  });
});

// ─── No-Go Zone routes ────────────────────────────────────────────────────────

// Get all no-go zones
app.get('/api/no-go-zones', (_req, res) => {
  res.json([...noGoZones.values()]);
});

// Get a single no-go zone
app.get('/api/no-go-zones/:id', (req, res) => {
  const zone = noGoZones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'No-go zone not found' });
  res.json(zone);
});

// Create a no-go zone
app.post('/api/no-go-zones', (req, res) => {
  const { name, coordinates, ruleset } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'At least 3 coordinate points are required' });
  }
  
  const id = `nogo-${noGoSeq++}`;
  const zone = {
    id,
    name: name || `No-Go Zone ${id}`,
    coordinates: coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]),
    ruleset: ruleset || 'FORBIDDEN: Drones are not allowed to enter this area.',
    createdAt: new Date().toISOString()
  };
  
  noGoZones.set(id, zone);
  broadcastNoGoZone(zone);
  res.status(201).json(zone);
});

// Update a no-go zone
app.patch('/api/no-go-zones/:id', (req, res) => {
  const zone = noGoZones.get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'No-go zone not found' });
  
  const { name, coordinates, ruleset } = req.body;
  if (name) zone.name = name;
  if (coordinates && Array.isArray(coordinates)) {
    zone.coordinates = coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]);
  }
  if (ruleset !== undefined) zone.ruleset = ruleset;
  
  broadcastNoGoZone(zone);
  res.json(zone);
});

// Delete a no-go zone
app.delete('/api/no-go-zones/:id', (req, res) => {
  const { id } = req.params;
  if (!noGoZones.has(id)) return res.status(404).json({ error: 'No-go zone not found' });
  
  noGoZones.delete(id);
  broadcastNoGoZoneRemove(id);
  res.json({ success: true });
});

// Check if a path intersects any no-go zone
app.post('/api/no-go-zones/check-path', (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.body;
  
  if (startLat === undefined || startLng === undefined || 
      endLat === undefined || endLng === undefined) {
    return res.status(400).json({ error: 'startLat, startLng, endLat, and endLng are required' });
  }
  
  const intersectingZone = doesPathIntersectNoGoZone(startLat, startLng, endLat, endLng);
  
  if (intersectingZone) {
    return res.json({ blocked: true, zone: intersectingZone });
  }
  
  res.json({ blocked: false });
});

// ─── Water Area routes ────────────────────────────────────────────────────────

// Get all water areas
app.get('/api/water-areas', (_req, res) => {
  res.json([...waterAreas.values()]);
});

// Create a water area
app.post('/api/water-areas', (req, res) => {
  const { name, coordinates } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'At least 3 coordinate points are required' });
  }
  
  const id = `water-${waterAreaSeq++}`;
  const area = {
    id,
    name: name || `Water Area ${id}`,
    coordinates: coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]),
    createdAt: new Date().toISOString()
  };
  
  waterAreas.set(id, area);
  broadcastWaterArea(area);
  res.status(201).json(area);
});

// Update a water area
app.patch('/api/water-areas/:id', (req, res) => {
  const area = waterAreas.get(req.params.id);
  if (!area) return res.status(404).json({ error: 'Water area not found' });
  
  const { name, coordinates } = req.body;
  if (name) area.name = name;
  if (coordinates && Array.isArray(coordinates)) {
    area.coordinates = coordinates.map(p => [parseFloat(p[0]), parseFloat(p[1])]);
  }
  
  broadcastWaterArea(area);
  res.json(area);
});

// Delete a water area
app.delete('/api/water-areas/:id', (req, res) => {
  const { id } = req.params;
  if (!waterAreas.has(id)) return res.status(404).json({ error: 'Water area not found' });
  
  waterAreas.delete(id);
  broadcastWaterAreaRemove(id);
  res.json({ success: true });
});

// Check if a point is in water
app.post('/api/water-areas/check-point', (req, res) => {
  const { lat, lng } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const waterArea = isPointInWater(lat, lng);
  
  if (waterArea) {
    res.json({ inWater: true, area: waterArea });
  } else {
    res.json({ inWater: false });
  }
});

// ─── Naval Unit routes ────────────────────────────────────────────────────────

// Get all naval units
app.get('/api/naval-units', (_req, res) => {
  res.json([...navalUnits.values()]);
});

// Get naval units for a specific hub
app.get('/api/hubs/:hubId/naval-units', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json([...navalUnits.values()].filter(u => u.hubId === hubId));
});

// Create a naval unit
app.post('/api/naval-units', (req, res) => {
  const { name, type, lat, lng, hubId, speed, battery } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const validTypes = ['fast-boat', 'battleship', 'aircraft-carrier'];
  const unitType = type || 'fast-boat';
  if (!validTypes.includes(unitType)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }
  
  // Check if point is in water
  const inWater = isPointInWater(lat, lng);
  if (!inWater) {
    return res.status(400).json({ error: 'Naval units can only be placed on water areas' });
  }
  
  const id = `naval-${navalUnitSeq++}`;
  
  const unit = {
    id,
    name: name || `Unit ${id}`,
    type: unitType,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    speed: speed || getNavalUnitSpeed(unitType),
    status: 'idle',
    battery: battery !== undefined ? parseFloat(battery) : 100,
    hubId: hubId || null,
    currentPath: [],
    pathIndex: 0,
    updatedAt: new Date().toISOString()
  };
  
  navalUnits.set(id, unit);
  broadcastNavalUnit(unit);
  res.status(201).json(unit);
});

// Get a single naval unit
app.get('/api/naval-units/:id', (req, res) => {
  const unit = navalUnits.get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Naval unit not found' });
  res.json(unit);
});

// Update naval unit location
app.post('/api/naval-units/:id/location', (req, res) => {
  const { id } = req.params;
  const { lat, lng, speed, status, battery, name, hubId } = req.body;
  
  const unit = navalUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Naval unit not found' });
  
  if (lat !== undefined) unit.lat = parseFloat(lat);
  if (lng !== undefined) unit.lng = parseFloat(lng);
  if (speed !== undefined) unit.speed = parseFloat(speed);
  if (status !== undefined) unit.status = status;
  if (battery !== undefined) unit.battery = parseFloat(battery);
  if (name !== undefined) unit.name = name;
  if (hubId !== undefined) unit.hubId = hubId;
  
  unit.updatedAt = new Date().toISOString();
  
  navalUnits.set(id, unit);
  broadcastNavalUnit(unit);
  res.json(unit);
});

// Move naval unit to target (direct movement on water)
app.post('/api/naval-units/:id/move', async (req, res) => {
  const { id } = req.params;
  const { targetLat, targetLng } = req.body;
  
  if (targetLat === undefined || targetLng === undefined) {
    return res.status(400).json({ error: 'targetLat and targetLng are required' });
  }
  
  const unit = navalUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Naval unit not found' });
  
  // Check if start point is in water
  const startInWater = isPointInWater(unit.lat, unit.lng);
  if (!startInWater) {
    return res.status(400).json({ error: 'Naval unit is not on water' });
  }
  
  // Check if destination is in water
  const endInWater = isPointInWater(targetLat, targetLng);
  if (!endInWater) {
    return res.status(400).json({ error: 'Destination is not on water. Naval units can only move on water.' });
  }
  
  // Check if destination is in a no-go zone
  const targetInNoGo = isPointInNoGoZone(targetLat, targetLng);
  if (targetInNoGo) {
    return res.status(400).json({ error: `Destination is in no-go zone: ${targetInNoGo.name}` });
  }
  
  // Create direct path on water
  unit.currentPath = [[unit.lat, unit.lng], [targetLat, targetLng]];
  unit.pathIndex = 0;
  unit.status = 'moving';
  unit.updatedAt = new Date().toISOString();
  
  navalUnits.set(id, unit);
  broadcastNavalUnit(unit);
  
  // Start movement simulation
  startNavalUnitMovement(id);
  
  res.json({ success: true, path: unit.currentPath, mode: 'water' });
});

// Stop naval unit movement
app.delete('/api/naval-units/:id/move', (req, res) => {
  const { id } = req.params;
  
  const unit = navalUnits.get(id);
  if (!unit) return res.status(404).json({ error: 'Naval unit not found' });
  
  if (navalUnitMovements.has(id)) {
    clearInterval(navalUnitMovements.get(id));
    navalUnitMovements.delete(id);
  }
  
  unit.status = 'idle';
  unit.currentPath = [];
  unit.pathIndex = 0;
  unit.updatedAt = new Date().toISOString();
  navalUnits.set(id, unit);
  broadcastNavalUnit(unit);
  
  res.json({ success: true });
});

// Delete a naval unit
app.delete('/api/naval-units/:id', (req, res) => {
  const { id } = req.params;
  if (!navalUnits.has(id)) return res.status(404).json({ error: 'Naval unit not found' });
  
  if (navalUnitMovements.has(id)) {
    clearInterval(navalUnitMovements.get(id));
  }
  
  navalUnits.delete(id);
  broadcastNavalUnitRemove(id);
  res.json({ success: true });
});

// Check if path is valid for naval unit
app.post('/api/naval-units/check-path', (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.body;
  
  if (startLat === undefined || startLng === undefined || 
      endLat === undefined || endLng === undefined) {
    return res.status(400).json({ error: 'startLat, startLng, endLat, and endLng are required' });
  }
  
  const startInWater = isPointInWater(startLat, startLng);
  const endInWater = isPointInWater(endLat, endLng);
  
  if (!startInWater) {
    return res.status(400).json({ error: 'Start point is not on water' });
  }
  
  if (!endInWater) {
    return res.status(400).json({ error: 'End point is not on water' });
  }
  
  res.json({ valid: true, path: [[startLat, startLng], [endLat, endLng]], mode: 'water' });
});

// Naval unit movement simulation
const navalUnitMovements = new Map();

function startNavalUnitMovement(unitId) {
  const unit = navalUnits.get(unitId);
  if (!unit || !unit.currentPath || unit.currentPath.length === 0) return;
  
  // Stop existing movement
  if (navalUnitMovements.has(unitId)) {
    clearInterval(navalUnitMovements.get(unitId));
  }
  
  let pathIndex = 0;
  const updateInterval = 1000; // Update every second
  
  const intervalId = setInterval(() => {
    const unit = navalUnits.get(unitId);
    if (!unit || unit.status !== 'moving') {
      clearInterval(intervalId);
      navalUnitMovements.delete(unitId);
      return;
    }
    
    if (pathIndex >= unit.currentPath.length - 1) {
      // Reached destination
      unit.status = 'idle';
      unit.currentPath = [];
      unit.pathIndex = 0;
      unit.updatedAt = new Date().toISOString();
      navalUnits.set(unitId, unit);
      broadcastNavalUnit(unit);
      clearInterval(intervalId);
      navalUnitMovements.delete(unitId);
      return;
    }
    
    const currentWaypoint = unit.currentPath[pathIndex];
    const nextWaypoint = unit.currentPath[pathIndex + 1];
    
    // Check if next waypoint is in a no-go zone
    const nextInNoGo = isPointInNoGoZone(nextWaypoint[0], nextWaypoint[1]);
    if (nextInNoGo) {
      unit.status = 'warning';
      unit.currentPath = [];
      unit.pathIndex = 0;
      unit.updatedAt = new Date().toISOString();
      navalUnits.set(unitId, unit);
      broadcastNavalUnit(unit);
      broadcast({ type: 'navalunit:blocked', unitId, zone: nextInNoGo });
      clearInterval(intervalId);
      navalUnitMovements.delete(unitId);
      return;
    }
    
    // Calculate movement towards next waypoint
    const dist = distance(currentWaypoint[0], currentWaypoint[1], nextWaypoint[0], nextWaypoint[1]);
    const speed = unit.speed || getNavalUnitSpeed(unit.type);
    const distancePerUpdate = (speed / 3600) * (updateInterval / 1000);
    
    if (dist <= distancePerUpdate) {
      // Reached this waypoint, move to next
      pathIndex++;
      if (pathIndex >= unit.currentPath.length - 1) {
        // Reached final destination
        unit.lat = unit.currentPath[unit.currentPath.length - 1][0];
        unit.lng = unit.currentPath[unit.currentPath.length - 1][1];
        unit.status = 'idle';
        unit.currentPath = [];
        unit.pathIndex = 0;
        unit.updatedAt = new Date().toISOString();
        navalUnits.set(unitId, unit);
        broadcastNavalUnit(unit);
        clearInterval(intervalId);
        navalUnitMovements.delete(unitId);
        return;
      }
    } else {
      // Move towards next waypoint
      const latDiff = nextWaypoint[0] - currentWaypoint[0];
      const lngDiff = nextWaypoint[1] - currentWaypoint[1];
      const angle = Math.atan2(lngDiff, latDiff);
      
      const latStep = (distancePerUpdate / 111.32) * Math.cos(angle);
      const lngStep = (distancePerUpdate / (111.32 * Math.cos(currentWaypoint[0] * Math.PI / 180))) * Math.sin(angle);
      
      unit.lat = currentWaypoint[0] + latStep;
      unit.lng = currentWaypoint[1] + lngStep;
    }
    
    unit.pathIndex = pathIndex;
    unit.updatedAt = new Date().toISOString();
    navalUnits.set(unitId, unit);
    broadcastNavalUnit(unit);
  }, updateInterval);
  
  navalUnitMovements.set(unitId, intervalId);
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Send full snapshot
  res.write(`data: ${JSON.stringify({
    type:      'snapshot',
    drones:    [...drones.values()],
    hubs:      [...hubs.values()],
    fleets:    [...fleets.values()],
    missions:  [...missions.values()],
    waypoints: [...waypoints.values()],
    noGoZones: [...noGoZones.values()],
    groundUnits: [...groundUnits.values()],
    roads:     [...roads.values()],
    paths:     [...walkablePaths.values()],
    navalUnits: [...navalUnits.values()],
    waterAreas: [...waterAreas.values()],
  })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ─── Drone flight simulation ──────────────────────────────────────────────────

// Start drone simulation towards a target location
app.post('/api/drones/:id/simulate', (req, res) => {
  const { id } = req.params;
  const { targetLat, targetLng, speed } = req.body;
  
  if (targetLat === undefined || targetLng === undefined) {
    return res.status(400).json({ error: 'targetLat and targetLng are required' });
  }
  
  const drone = drones.get(id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  
  // Stop any existing simulation for this drone
  if (simulations.has(id)) {
    clearInterval(simulations.get(id).intervalId);
    simulations.delete(id);
  }
  
  const simSpeed = speed !== undefined ? parseFloat(speed) : (drone.speed || 20);
  const updateInterval = 500; // Update every 500ms
  // Distance moved per update (km): speed (km/h) / 3600 (s/h) * 0.5 (s)
  const distancePerUpdate = simSpeed / 3600 * (updateInterval / 1000);
  
  let currentLat = drone.lat;
  let currentLng = drone.lng;
  const target = { lat: parseFloat(targetLat), lng: parseFloat(targetLng) };
  
  const intervalId = setInterval(() => {
    const drone = drones.get(id);
    if (!drone) {
      clearInterval(intervalId);
      simulations.delete(id);
      return;
    }
    
    const dist = distance(currentLat, currentLng, target.lat, target.lng);
    
    // Check if reached destination (within 10 meters)
    if (dist < 0.01) {
      // Check if target is in a no-go zone
      const targetInNoGo = isPointInNoGoZone(target.lat, target.lng);
      if (targetInNoGo) {
        clearInterval(intervalId);
        simulations.delete(id);
        broadcast({ type: 'simulation:blocked', droneId: id, zone: targetInNoGo, reason: 'destination' });
        console.log(`[Simulation] Drone "${drone.name}" (${id}) blocked - destination is in no-go zone: ${targetInNoGo.name}`);
        return;
      }
      
      // Move to exact target position
      currentLat = target.lat;
      currentLng = target.lng;
      clearInterval(intervalId);
      simulations.delete(id);
      
      const updated = {
        ...drone,
        lat: currentLat,
        lng: currentLng,
        speed: 0,
        updatedAt: new Date().toISOString(),
      };
      drones.set(id, updated);
      broadcast({ type: 'update', drone: updated });
      broadcast({ type: 'simulation:end', droneId: id });
      return;
    }
    
    // Calculate direction to target
    const latDiff = target.lat - currentLat;
    const lngDiff = target.lng - currentLng;
    const angle = Math.atan2(lngDiff, latDiff);
    
    // Move towards target
    const latStep = (distancePerUpdate / 111.32) * Math.cos(angle); // 111.32 km per degree latitude
    const lngStep = (distancePerUpdate / (111.32 * Math.cos(currentLat * Math.PI / 180))) * Math.sin(angle);
    
    const nextLat = currentLat + latStep;
    const nextLng = currentLng + lngStep;
    
    // Check if next position would enter a no-go zone
    const nextInNoGo = isPointInNoGoZone(nextLat, nextLng);
    if (nextInNoGo) {
      // Stop the drone before entering the no-go zone
      clearInterval(intervalId);
      simulations.delete(id);
      
      const updated = {
        ...drone,
        lat: currentLat,
        lng: currentLng,
        speed: 0,
        status: 'warning',
        updatedAt: new Date().toISOString(),
      };
      drones.set(id, updated);
      broadcast({ type: 'update', drone: updated });
      broadcast({ type: 'simulation:blocked', droneId: id, zone: nextInNoGo, reason: 'path' });
      console.log(`[Simulation] Drone "${drone.name}" (${id}) stopped - would enter no-go zone: ${nextInNoGo.name}`);
      return;
    }
    
    // Check if path from current to next position intersects any no-go zone
    const pathIntersection = doesPathIntersectNoGoZone(currentLat, currentLng, nextLat, nextLng);
    if (pathIntersection) {
      // Stop the drone before entering the no-go zone
      clearInterval(intervalId);
      simulations.delete(id);
      
      const updated = {
        ...drone,
        lat: currentLat,
        lng: currentLng,
        speed: 0,
        status: 'warning',
        updatedAt: new Date().toISOString(),
      };
      drones.set(id, updated);
      broadcast({ type: 'update', drone: updated });
      broadcast({ type: 'simulation:blocked', droneId: id, zone: pathIntersection, reason: 'path' });
      console.log(`[Simulation] Drone "${drone.name}" (${id}) stopped - path intersects no-go zone: ${pathIntersection.name}`);
      return;
    }
    
    currentLat = nextLat;
    currentLng = nextLng;
    
    const updated = {
      ...drone,
      lat: currentLat,
      lng: currentLng,
      speed: simSpeed,
      updatedAt: new Date().toISOString(),
    };
    drones.set(id, updated);
    broadcast({ type: 'update', drone: updated });
  }, updateInterval);
  
  simulations.set(id, { droneId: id, targetLat: target.lat, targetLng: target.lng, speed: simSpeed, intervalId });
  
  console.log(`[Simulation] Drone "${drone.name}" (${id}) flying to (${target.lat}, ${target.lng}) at ${simSpeed} km/h`);
  res.json({ success: true, simulation: { droneId: id, target: { lat: target.lat, lng: target.lng }, speed: simSpeed } });
});

// Stop drone simulation
app.delete('/api/drones/:id/simulate', (req, res) => {
  const { id } = req.params;
  
  if (!simulations.has(id)) {
    return res.status(404).json({ error: 'No active simulation for this drone' });
  }
  
  const sim = simulations.get(id);
  clearInterval(sim.intervalId);
  simulations.delete(id);
  
  const drone = drones.get(id);
  if (drone) {
    const updated = {
      ...drone,
      speed: 0,
      updatedAt: new Date().toISOString(),
    };
    drones.set(id, updated);
    broadcast({ type: 'update', drone: updated });
    broadcast({ type: 'simulation:end', droneId: id });
  }
  
  console.log(`[Simulation] Drone "${drone?.name}" (${id}) simulation stopped`);
  res.json({ success: true });
});

// ─── Idle fleet → mission scheduler ──────────────────────────────────────────
setInterval(() => {
  hubs.forEach(hub => {
    const queue = hubMissionQueue(hub.id).filter(m => m.status === 'queued');
    if (!queue.length) return;

    const idleFleets = [...fleets.values()].filter(f => f.hubId === hub.id && f.status === 'idle' && f.droneIds.length > 0);
    if (!idleFleets.length) return;

    const topMission = queue[0];

    const capable = idleFleets.find(f => f.droneIds.length >= topMission.requiredDrones);
    if (!capable) return;

    // Assign
    capable.status          = 'on-mission';
    capable.currentMissionId = topMission.id;
    topMission.status        = 'active';
    topMission.assignedFleetId = capable.id;
    topMission.startedAt     = new Date().toISOString();

    broadcastFleet(capable);
    broadcastMission(topMission);

    console.log(`[Scheduler] Fleet "${capable.name}" assigned to mission "${topMission.title}" at hub "${hub.name}"`);
  });
}, 3000);

// ─── Mission auto-completion monitor ──────────────────────────────────────────
setInterval(() => {
  const activeMissions = [...missions.values()].filter(m => m.status === 'active');
  
  for (const mission of activeMissions) {
    const fleet = mission.assignedFleetId ? fleets.get(mission.assignedFleetId) : null;
    if (!fleet) continue;

    // Get waypoint coordinates if mission has a waypoint
    let waypoint = null;
    if (mission.waypointId) {
      waypoint = waypoints.get(mission.waypointId);
    }

    // Check end conditions
    let shouldComplete = false;

    switch (mission.endCondition) {
      case 'arrival':
        // Complete when fleet's drones reach the waypoint
        if (waypoint) {
          const dronesAtWaypoint = fleet.droneIds.filter(droneId => {
            const drone = drones.get(droneId);
            if (!drone) return false;
            const dist = distance(drone.lat, drone.lng, waypoint.lat, waypoint.lng);
            return dist < 0.01; // Within 10 meters
          });
          // Complete if all assigned drones have reached the waypoint
          if (dronesAtWaypoint.length === fleet.droneIds.length) {
            shouldComplete = true;
          }
        }
        break;

      case 'drone_reached':
        // Complete when any single drone reaches the waypoint
        if (waypoint) {
          const anyDroneReached = fleet.droneIds.some(droneId => {
            const drone = drones.get(droneId);
            if (!drone) return false;
            const dist = distance(drone.lat, drone.lng, waypoint.lat, waypoint.lng);
            return dist < 0.01;
          });
          if (anyDroneReached) {
            shouldComplete = true;
          }
        }
        break;

      case 'time_elapsed':
        // Complete after specified time (in seconds) has elapsed
        if (mission.startedAt && mission.endConditionValue) {
          const startedAt = new Date(mission.startedAt).getTime();
          const elapsed = Date.now() - startedAt;
          const threshold = mission.endConditionValue * 1000; // Convert seconds to ms
          if (elapsed >= threshold) {
            shouldComplete = true;
          }
        }
        break;

      case 'fleet_idle':
        // Complete when fleet returns to idle state (all drones back at hub or stopped)
        const allDronesIdle = fleet.droneIds.every(droneId => {
          const drone = drones.get(droneId);
          return drone && (drone.status === 'idle' || drone.status === 'active');
        });
        if (allDronesIdle && fleet.status === 'idle') {
          shouldComplete = true;
        }
        break;

      case 'manual':
      default:
        // Manual completion only - do nothing
        break;
    }

    if (shouldComplete) {
      // Complete the mission
      mission.status = 'done';
      mission.completedAt = new Date().toISOString();
      
      // Free the fleet
      fleet.status = 'idle';
      fleet.currentMissionId = null;
      
      broadcastFleet(fleet);
      broadcastMission(mission);
      
      console.log(`[AutoComplete] Mission "${mission.title}" completed via ${mission.endCondition} condition`);
    }
  }
}, 2000);

// ─── Serve static files from frontend directory ─────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Drone API running at http://localhost:${PORT}`);
  console.log(`   Hub endpoints: GET/POST /api/hubs  |  DELETE /api/hubs/:id`);
  console.log(`   Fleet endpoints: GET/POST /api/hubs/:hubId/fleets`);
  console.log(`   Mission endpoints: GET/POST /api/hubs/:hubId/missions`);
  console.log(`   No-Go Zone endpoints: GET/POST /api/no-go-zones  |  DELETE /api/no-go-zones/:id`);
  console.log(`   Ground Unit endpoints: GET/POST /api/ground-units  |  DELETE /api/ground-units/:id`);
  console.log(`   Road endpoints: GET/POST /api/roads  |  DELETE /api/roads/:id`);
  console.log(`   Path endpoints: GET/POST /api/walkable-paths  |  DELETE /api/walkable-paths/:id`);
  console.log(`   Auth endpoints: POST /api/auth/register, POST /api/auth/login`);
  console.log(`   State endpoints: GET/POST /api/states, GET/POST/DELETE /api/states/:id`);
  console.log(`   SSE: GET /api/events`);
});