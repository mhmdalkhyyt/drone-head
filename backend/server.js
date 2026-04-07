/**
 * Drone Head - User-Scoped Server
 * Real-time location tracking and mission management system
 * with user-based access control
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const DataAccessLayer = require('./dataAccess');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'drone-head-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const DEVELOPMENT_MODE = process.env.DEVELOPMENT_MODE === 'develop' || process.env.DEVELOPMENT_MODE === 'true';

// ─── Authentication Middleware ────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  // Skip authentication in development mode
  if (DEVELOPMENT_MODE) {
    // Use the first existing user in development mode
    const devUser = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
    if (devUser) {
      req.user = { id: devUser.id, username: devUser.username, isAdmin: devUser.role === 'admin' };
    } else {
      // If no users exist, create a dev user
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('dev-user', '$2b$10$usHWNlkSI5ON59lz7AalS.qs5IgUuCoNo6La1W2Dw7Dc1JqsWy4l6');
      req.user = { id: result.lastInsertRowid, username: 'dev-user', isAdmin: true };
    }
    return next();
  }
  
  // Check Authorization header OR query parameter (for SSE connections)
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // Also check query parameter for SSE and other connections that can't send headers
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

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

// ─── Ownership Validation Middleware ──────────────────────────────────────────
function requireOwnership(req, res, next) {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Check if entity exists and belongs to user
  const entity = db.prepare('SELECT * FROM drones WHERE id = ?').get(id);
  
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }
  
  if (entity.user_id !== userId && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied - not your entity' });
  }
  
  req.entity = entity;
  next();
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
db.pragma('foreign_keys = ON');

// Create tables (for new installations)
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- User profiles
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

  -- User states
  CREATE TABLE IF NOT EXISTS user_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    state_data TEXT NOT NULL,
    name TEXT DEFAULT 'Saved State',
    saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_states_user_id ON user_states(user_id);

  -- Drones table with user ownership
  CREATE TABLE IF NOT EXISTS drones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    altitude REAL DEFAULT 0,
    speed REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_drones_user_id ON drones(user_id);

  -- Hubs table with user ownership
  CREATE TABLE IF NOT EXISTS hubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_hubs_user_id ON hubs(user_id);

  -- Fleets table with user ownership
  CREATE TABLE IF NOT EXISTS fleets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hub_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    drone_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'idle',
    current_mission_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_fleets_user_id ON fleets(user_id);

  -- Missions table with user ownership
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hub_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    required_drones INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 100,
    status TEXT DEFAULT 'queued',
    assigned_fleet_id INTEGER,
    waypoint_id INTEGER,
    end_condition TEXT DEFAULT 'manual',
    end_condition_value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_missions_user_id ON missions(user_id);

  -- Ground units table with user ownership
  CREATE TABLE IF NOT EXISTS ground_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'truck',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed REAL DEFAULT 70,
    status TEXT DEFAULT 'idle',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    on_road INTEGER DEFAULT 0,
    current_path TEXT DEFAULT '[]',
    path_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ground_units_user_id ON ground_units(user_id);

  -- Roads table with user ownership
  CREATE TABLE IF NOT EXISTS roads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'street',
    coordinates TEXT NOT NULL,
    speed_limit REAL DEFAULT 50,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_roads_user_id ON roads(user_id);

  -- Walkable paths table with user ownership
  CREATE TABLE IF NOT EXISTS walkable_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'footpath',
    coordinates TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_walkable_paths_user_id ON walkable_paths(user_id);

  -- No-go zones table with user ownership
  CREATE TABLE IF NOT EXISTS no_go_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    coordinates TEXT NOT NULL,
    ruleset TEXT DEFAULT 'FORBIDDEN: Drones are not allowed to enter this area.',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_no_go_zones_user_id ON no_go_zones(user_id);

  -- Naval units table with user ownership
  CREATE TABLE IF NOT EXISTS naval_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'fast-boat',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed REAL DEFAULT 80,
    status TEXT DEFAULT 'idle',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    current_path TEXT DEFAULT '[]',
    path_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_naval_units_user_id ON naval_units(user_id);

  -- Water areas table with user ownership
  CREATE TABLE IF NOT EXISTS water_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    coordinates TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_water_areas_user_id ON water_areas(user_id);

  -- Waypoints table with user ownership
  CREATE TABLE IF NOT EXISTS waypoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id INTEGER,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    hub_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);

  -- Migrations tracking table
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Initialize data access layer
const dal = new DataAccessLayer(db);

// ─── In-memory stores for simulations and SSE ─────────────────────────────────
const simulations = new Map(); // id → { droneId, targetLat, targetLng, speed, intervalId }
const groundUnitMovements = new Map();
const navalUnitMovements = new Map();

// SSE clients by user
const userSSEClients = new Map(); // userId → Set of res

// ─── Utility Functions ────────────────────────────────────────────────────────

// Haversine distance calculation (in km)
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

// Check if a point is inside any no-go zone
function isPointInNoGoZone(userId, lat, lng) {
  const point = [lat, lng];
  const zones = dal.getNoGoZones(userId);
  for (const zone of zones) {
    const coordinates = JSON.parse(zone.coordinates);
    if (isPointInPolygon(point, coordinates)) {
      return zone;
    }
  }
  return null;
}

// Check if a point is inside any water area
function isPointInWater(userId, lat, lng) {
  const point = [lat, lng];
  const areas = dal.getWaterAreas(userId);
  for (const area of areas) {
    const coordinates = JSON.parse(area.coordinates);
    if (isPointInPolygon(point, coordinates)) {
      return area;
    }
  }
  return null;
}

// Line segment intersection
function lineSegmentsIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;
  
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;
  
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - y3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - y3)) / denom;
  
  return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

// Check if line intersects polygon
function lineIntersectsPolygon(p1, p2, polygon) {
  if (isPointInPolygon(p1, polygon) || isPointInPolygon(p2, polygon)) {
    return true;
  }
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (lineSegmentsIntersect(p1, p2, polygon[j], polygon[i])) {
      return true;
    }
  }
  return false;
}

// Check if path intersects any no-go zone
function doesPathIntersectNoGoZone(userId, startLat, startLng, endLat, endLng) {
  const startPoint = [startLat, startLng];
  const endPoint = [endLat, endLng];
  const zones = dal.getNoGoZones(userId);
  
  for (const zone of zones) {
    const coordinates = JSON.parse(zone.coordinates);
    if (lineIntersectsPolygon(startPoint, endPoint, coordinates)) {
      return zone;
    }
  }
  return null;
}

// ─── SSE Broadcasting ─────────────────────────────────────────────────────────

function broadcastToUser(userId, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  const clients = userSSEClients.get(userId);
  if (clients) {
    clients.forEach(res => res.write(msg));
  }
}

function broadcastSnapshotToUser(userId) {
  const drones = dal.getDrones(userId);
  const hubs = dal.getHubs(userId);
  const fleets = dal.getFleets(userId);
  const missions = dal.getMissions(userId);
  const groundUnits = dal.getGroundUnits(userId);
  const roads = dal.getRoads(userId);
  const paths = dal.getWalkablePaths(userId);
  const noGoZones = dal.getNoGoZones(userId);
  const navalUnits = dal.getNavalUnits(userId);
  const waterAreas = dal.getWaterAreas(userId);
  const waypoints = dal.getWaypoints(userId);
  
  broadcastToUser(userId, {
    type: 'snapshot',
    drones: drones.map(d => ({
      ...d,
      hubId: d.hub_id,
      createdAt: d.created_at,
      updatedAt: d.updated_at
    })),
    hubs: hubs.map(h => ({
      ...h,
      createdAt: h.created_at
    })),
    fleets: fleets.map(f => ({
      ...f,
      droneIds: JSON.parse(f.drone_ids || '[]'),
      hubId: f.hub_id,
      currentMissionId: f.current_mission_id,
      createdAt: f.created_at
    })),
    missions: missions.map(m => ({
      ...m,
      hubId: m.hub_id,
      assignedFleetId: m.assigned_fleet_id,
      waypointId: m.waypoint_id,
      createdAt: m.created_at,
      startedAt: m.started_at,
      completedAt: m.completed_at
    })),
    groundUnits: groundUnits.map(g => ({
      ...g,
      hubId: g.hub_id,
      currentPath: JSON.parse(g.current_path || '[]'),
      createdAt: g.created_at,
      updatedAt: g.updated_at
    })),
    roads: roads.map(r => ({
      ...r,
      coordinates: JSON.parse(r.coordinates),
      speedLimit: r.speed_limit,
      createdAt: r.created_at
    })),
    paths: paths.map(p => ({
      ...p,
      coordinates: JSON.parse(p.coordinates),
      createdAt: p.created_at
    })),
    noGoZones: noGoZones.map(z => ({
      ...z,
      coordinates: JSON.parse(z.coordinates),
      createdAt: z.created_at
    })),
    navalUnits: navalUnits.map(n => ({
      ...n,
      hubId: n.hub_id,
      currentPath: JSON.parse(n.current_path || '[]'),
      createdAt: n.created_at,
      updatedAt: n.updated_at
    })),
    waterAreas: waterAreas.map(w => ({
      ...w,
      coordinates: JSON.parse(w.coordinates),
      createdAt: w.created_at
    })),
    waypoints: waypoints.map(w => ({
      ...w,
      createdAt: w.created_at
    }))
  });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

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
    
    // Generate JWT token
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

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/auth/users', authenticateToken, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, created_at FROM users').all();
    res.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

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

// ─── State Routes ─────────────────────────────────────────────────────────────

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

// ─── Drone Routes ─────────────────────────────────────────────────────────────

app.get('/api/drones', authenticateToken, (req, res) => {
  const drones = dal.getDrones(req.user.id);
  res.json(drones.map(d => ({
    ...d,
    hubId: d.hub_id,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  })));
});

app.get('/api/drones/:id', authenticateToken, (req, res) => {
  const drone = dal.getDrone(req.user.id, req.params.id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  res.json({
    ...drone,
    hubId: drone.hub_id,
    createdAt: drone.created_at,
    updatedAt: drone.updated_at
  });
});

app.post('/api/drones', authenticateToken, (req, res) => {
  const { name, lat, lng, altitude, speed, status, battery, hubId } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const drone = dal.createDrone(req.user.id, {
    name: name || `Drone ${Date.now()}`,
    lat, lng, altitude, speed, status, battery, hubId
  });
  
  broadcastSnapshotToUser(req.user.id);
  res.status(201).json(drone);
});

app.post('/api/drones/:id/location', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { lat, lng, altitude, speed, status, battery, name, hubId } = req.body;
  
  const drone = dal.getDrone(req.user.id, id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  
  const updated = dal.updateDrone(req.user.id, id, {
    lat, lng, altitude, speed, status, battery, name, hubId
  });
  
  broadcastToUser(req.user.id, { type: 'drone:update', drone: {
    ...updated,
    hubId: updated.hub_id
  }});
  
  res.json({
    ...updated,
    hubId: updated.hub_id
  });
});

app.delete('/api/drones/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Stop any simulation
  if (simulations.has(id)) {
    clearInterval(simulations.get(id).intervalId);
    simulations.delete(id);
  }
  
  if (!dal.deleteDrone(req.user.id, id)) {
    return res.status(404).json({ error: 'Drone not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'drone:remove', id });
  res.json({ success: true });
});

// ─── Hub Routes ───────────────────────────────────────────────────────────────

app.get('/api/hubs', authenticateToken, (req, res) => {
  const hubs = dal.getHubs(req.user.id);
  res.json(hubs.map(h => ({ ...h, createdAt: h.created_at })));
});

app.get('/api/hubs/:id', authenticateToken, (req, res) => {
  const hub = dal.getHub(req.user.id, req.params.id);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  res.json({ ...hub, createdAt: hub.created_at });
});

app.post('/api/hubs', authenticateToken, (req, res) => {
  const { name, lat, lng } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const hub = dal.createHub(req.user.id, {
    name: name || `Hub ${Date.now()}`,
    lat, lng
  });
  
  broadcastSnapshotToUser(req.user.id);
  res.status(201).json(hub);
});

app.patch('/api/hubs/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  const hub = dal.updateHub(req.user.id, id, { name });
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  
  broadcastToUser(req.user.id, { type: 'hub:update', hub });
  res.json(hub);
});

app.delete('/api/hubs/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteHub(req.user.id, id)) {
    return res.status(404).json({ error: 'Hub not found' });
  }
  
  broadcastSnapshotToUser(req.user.id);
  res.json({ success: true });
});

// ─── Fleet Routes ─────────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/fleets', authenticateToken, (req, res) => {
  const { hubId } = req.params;
  const fleets = dal.getFleets(req.user.id, hubId);
  res.json(fleets.map(f => ({
    ...f,
    droneIds: JSON.parse(f.drone_ids || '[]'),
    hubId: f.hub_id,
    currentMissionId: f.current_mission_id,
    createdAt: f.created_at
  })));
});

app.post('/api/hubs/:hubId/fleets', authenticateToken, (req, res) => {
  const { hubId } = req.params;
  const { name } = req.body;
  
  // Verify hub exists
  const hub = dal.getHub(req.user.id, hubId);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  
  const fleet = dal.createFleet(req.user.id, { hubId, name: name || `Fleet ${Date.now()}` });
  
  broadcastToUser(req.user.id, { type: 'fleet:update', fleet });
  res.status(201).json(fleet);
});

app.delete('/api/hubs/:hubId/fleets/:fleetId', authenticateToken, (req, res) => {
  const { fleetId } = req.params;
  
  if (!dal.deleteFleet(req.user.id, fleetId)) {
    return res.status(404).json({ error: 'Fleet not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'fleet:remove', id: fleetId });
  res.json({ success: true });
});

// ─── Mission Routes ───────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/missions', authenticateToken, (req, res) => {
  const { hubId } = req.params;
  const missions = dal.getMissions(req.user.id, hubId);
  res.json(missions.map(m => ({
    ...m,
    hubId: m.hub_id,
    assignedFleetId: m.assigned_fleet_id,
    waypointId: m.waypoint_id,
    createdAt: m.created_at,
    startedAt: m.started_at,
    completedAt: m.completed_at
  })));
});

app.post('/api/hubs/:hubId/missions', authenticateToken, (req, res) => {
  const { hubId } = req.params;
  const { title, type, requiredDrones, priority, waypointId, endCondition, endConditionValue } = req.body;
  
  if (!title) return res.status(400).json({ error: 'title is required' });
  
  const mission = dal.createMission(req.user.id, {
    hubId, title, type, requiredDrones, priority, waypointId, endCondition, endConditionValue
  });
  
  broadcastToUser(req.user.id, { type: 'mission:update', mission });
  res.status(201).json(mission);
});

app.delete('/api/hubs/:hubId/missions/:missionId', authenticateToken, (req, res) => {
  const { missionId } = req.params;
  
  if (!dal.deleteMission(req.user.id, missionId)) {
    return res.status(404).json({ error: 'Mission not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'mission:remove', id: missionId });
  res.json({ success: true });
});

app.post('/api/hubs/:hubId/missions/:missionId/complete', authenticateToken, (req, res) => {
  const { missionId } = req.params;
  
  const mission = dal.getMission(req.user.id, missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  
  dal.updateMission(req.user.id, missionId, { 
    status: 'done', 
    completedAt: new Date().toISOString() 
  });
  
  broadcastToUser(req.user.id, { type: 'mission:update', mission: {
    ...mission,
    status: 'done',
    completedAt: new Date().toISOString()
  }});
  
  res.json({ success: true });
});

// ─── Ground Unit Routes ───────────────────────────────────────────────────────

app.get('/api/ground-units', authenticateToken, (req, res) => {
  const groundUnits = dal.getGroundUnits(req.user.id);
  res.json(groundUnits.map(g => ({
    ...g,
    hubId: g.hub_id,
    currentPath: JSON.parse(g.current_path || '[]'),
    isRadioTower: g.is_radio_tower || 0,
    radioRangeMeters: g.radio_range_meters || 500,
    radioEffects: g.radio_effects ? JSON.parse(g.radio_effects) : null,
    radioActive: g.radio_active || 1,
    createdAt: g.created_at,
    updatedAt: g.updated_at
  })));
});

app.post('/api/ground-units', authenticateToken, (req, res) => {
  const { name, type, lat, lng, hubId, speed, battery, isRadioTower, radioRangeMeters, radioEffects, radioActive } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  const unit = dal.createGroundUnit(req.user.id, {
    name: name || `Unit ${Date.now()}`,
    type, lat, lng, hubId, speed, battery
  });
  
  // If creating as radio tower, update with radio properties
  if (isRadioTower) {
    dal.updateGroundUnit(req.user.id, unit.id, {
      onRoad: 1 // Using on_road as marker for radio tower creation
    });
    const updateFields = {};
    if (radioRangeMeters !== undefined) updateFields.radio_range_meters = radioRangeMeters;
    if (radioEffects !== undefined) updateFields.radio_effects = typeof radioEffects === 'string' ? radioEffects : JSON.stringify(radioEffects);
    if (radioActive !== undefined) updateFields.radio_active = radioActive ? 1 : 0;
    
    // Direct SQL update for radio fields
    if (Object.keys(updateFields).length > 0) {
      const sets = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updateFields);
      db.prepare(`UPDATE ground_units SET ${sets}, is_radio_tower = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`)
        .run(...values, req.user.id, unit.id);
    }
  }
  
  const updatedUnit = dal.getGroundUnit(req.user.id, unit.id);
  broadcastToUser(req.user.id, { type: 'groundunit:update', unit: {
    ...updatedUnit,
    hubId: updatedUnit.hub_id,
    currentPath: JSON.parse(updatedUnit.current_path || '[]'),
    isRadioTower: updatedUnit.is_radio_tower || 0,
    radioRangeMeters: updatedUnit.radio_range_meters || 500,
    radioEffects: updatedUnit.radio_effects ? JSON.parse(updatedUnit.radio_effects) : null,
    radioActive: updatedUnit.radio_active || 1
  }});
  res.status(201).json({
    ...updatedUnit,
    hubId: updatedUnit.hub_id,
    currentPath: JSON.parse(updatedUnit.current_path || '[]'),
    isRadioTower: updatedUnit.is_radio_tower || 0,
    radioRangeMeters: updatedUnit.radio_range_meters || 500,
    radioEffects: updatedUnit.radio_effects ? JSON.parse(updatedUnit.radio_effects) : null,
    radioActive: updatedUnit.radio_active || 1
  });
});

app.post('/api/ground-units/:id/location', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { lat, lng, speed, status, battery, name, hubId } = req.body;
  
  const unit = dal.getGroundUnit(req.user.id, id);
  if (!unit) return res.status(404).json({ error: 'Ground unit not found' });
  
  const updated = dal.updateGroundUnit(req.user.id, id, {
    lat, lng, speed, status, battery, name, hubId
  });
  
  broadcastToUser(req.user.id, { type: 'groundunit:update', unit: {
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    isRadioTower: updated.is_radio_tower || 0,
    radioRangeMeters: updated.radio_range_meters || 500,
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null,
    radioActive: updated.radio_active || 1
  }});
  
  res.json({
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    isRadioTower: updated.is_radio_tower || 0,
    radioRangeMeters: updated.radio_range_meters || 500,
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null,
    radioActive: updated.radio_active || 1
  });
});

app.delete('/api/ground-units/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Stop any movement
  if (groundUnitMovements.has(id)) {
    clearInterval(groundUnitMovements.get(id));
    groundUnitMovements.delete(id);
  }
  
  if (!dal.deleteGroundUnit(req.user.id, id)) {
    return res.status(404).json({ error: 'Ground unit not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'groundunit:remove', id });
  res.json({ success: true });
});

// ─── Radio Tower Routes ───────────────────────────────────────────────────────

// Get all active radio towers
app.get('/api/radio-towers', authenticateToken, (req, res) => {
  const radioTowers = dal.getRadioTowers(req.user.id);
  res.json(radioTowers.map(t => ({
    ...t,
    hubId: t.hub_id,
    currentPath: JSON.parse(t.current_path || '[]'),
    radioEffects: t.radio_effects ? JSON.parse(t.radio_effects) : null,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  })));
});

// Get a specific radio tower
app.get('/api/radio-towers/:id', authenticateToken, (req, res) => {
  const tower = dal.getRadioTower(req.user.id, req.params.id);
  if (!tower) return res.status(404).json({ error: 'Radio tower not found' });
  
  res.json({
    ...tower,
    hubId: tower.hub_id,
    currentPath: JSON.parse(tower.current_path || '[]'),
    radioEffects: tower.radio_effects ? JSON.parse(tower.radio_effects) : null
  });
});

// Configure radio tower effects
app.post('/api/radio-towers/:id/configure', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { radioRangeMeters, radioEffects, radioActive } = req.body;
  
  const tower = dal.getRadioTower(req.user.id, id);
  if (!tower) return res.status(404).json({ error: 'Radio tower not found' });
  
  const updated = dal.updateRadioTower(req.user.id, id, {
    radioRangeMeters,
    radioEffects,
    radioActive
  });
  
  broadcastToUser(req.user.id, { type: 'radio:update', tower: {
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null
  }});
  
  res.json({
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null
  });
});

// Toggle radio tower on/off
app.post('/api/radio-towers/:id/toggle', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const tower = dal.getRadioTower(req.user.id, id);
  if (!tower) return res.status(404).json({ error: 'Radio tower not found' });
  
  // Toggle radio_active field
  const newActive = tower.radio_active ? 0 : 1;
  db.prepare('UPDATE ground_units SET radio_active = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?')
    .run(newActive, req.user.id, id);
  
  const updated = dal.getGroundUnit(req.user.id, id);
  broadcastToUser(req.user.id, { type: 'radio:update', tower: {
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null,
    radioActive: newActive
  }});
  
  res.json({
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]'),
    radioEffects: updated.radio_effects ? JSON.parse(updated.radio_effects) : null,
    radioActive: newActive
  });
});

// Get units affected by radio towers
app.get('/api/radio-effects', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const radioTowers = dal.getRadioTowers(userId);
  const drones = dal.getDrones(userId);
  const groundUnits = dal.getGroundUnits(userId);
  const navalUnits = dal.getNavalUnits(userId);
  
  const effects = {
    drones: {},
    groundUnits: {},
    navalUnits: {},
    radioTowers: {}
  };
  
  // Calculate Haversine distance in meters
  function distanceInMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  // Check each radio tower
  for (const tower of radioTowers) {
    if (!tower.radio_active) continue;
    
    const towerPos = { lat: tower.lat, lng: tower.lng };
    const range = tower.radio_range_meters || 500;
    const effects_config = tower.radio_effects ? JSON.parse(tower.radio_effects) : {
      drones: { speedBoost: 1.2, batteryEfficiency: 1.1 },
      ground: { speedBoost: 1.15, accuracyBoost: 1.2 },
      naval: { speedBoost: 1.1, commsRangeBoost: 1.3 },
      radio: { rangeExtension: 1.5, powerBoost: 1.2 }
    };
    
    effects.radioTowers[tower.id] = {
      lat: tower.lat,
      lng: tower.lng,
      range: range,
      effects: effects_config
    };
    
    // Check drones
    for (const drone of drones) {
      const dist = distanceInMeters(towerPos.lat, towerPos.lng, drone.lat, drone.lng);
      if (dist <= range) {
        effects.drones[drone.id] = {
          towerId: tower.id,
          distance: dist,
          effects: effects_config.drones || { speedBoost: 1.2, batteryEfficiency: 1.1 }
        };
      }
    }
    
    // Check ground units
    for (const unit of groundUnits) {
      const dist = distanceInMeters(towerPos.lat, towerPos.lng, unit.lat, unit.lng);
      if (dist <= range) {
        effects.groundUnits[unit.id] = {
          towerId: tower.id,
          distance: dist,
          effects: effects_config.ground || { speedBoost: 1.15, accuracyBoost: 1.2 }
        };
      }
    }
    
    // Check naval units
    for (const unit of navalUnits) {
      const dist = distanceInMeters(towerPos.lat, towerPos.lng, unit.lat, unit.lng);
      if (dist <= range) {
        effects.navalUnits[unit.id] = {
          towerId: tower.id,
          distance: dist,
          effects: effects_config.naval || { speedBoost: 1.1, commsRangeBoost: 1.3 }
        };
      }
    }
  }
  
  res.json(effects);
});

// ─── Naval Unit Routes ────────────────────────────────────────────────────────

app.get('/api/naval-units', authenticateToken, (req, res) => {
  const navalUnits = dal.getNavalUnits(req.user.id);
  res.json(navalUnits.map(n => ({
    ...n,
    hubId: n.hub_id,
    currentPath: JSON.parse(n.current_path || '[]'),
    createdAt: n.created_at,
    updatedAt: n.updated_at
  })));
});

app.post('/api/naval-units', authenticateToken, (req, res) => {
  const { name, type, lat, lng, hubId, speed, battery } = req.body;
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  
  // Check if point is in water
  const inWater = isPointInWater(req.user.id, lat, lng);
  if (!inWater) {
    return res.status(400).json({ error: 'Naval units can only be placed on water areas' });
  }
  
  const unit = dal.createNavalUnit(req.user.id, {
    name: name || `Unit ${Date.now()}`,
    type, lat, lng, hubId, speed, battery
  });
  
  broadcastToUser(req.user.id, { type: 'navalunit:update', unit });
  res.status(201).json(unit);
});

app.post('/api/naval-units/:id/location', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { lat, lng, speed, status, battery, name, hubId } = req.body;
  
  const unit = dal.getNavalUnit(req.user.id, id);
  if (!unit) return res.status(404).json({ error: 'Naval unit not found' });
  
  const updated = dal.updateNavalUnit(req.user.id, id, {
    lat, lng, speed, status, battery, name, hubId
  });
  
  broadcastToUser(req.user.id, { type: 'navalunit:update', unit: {
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]')
  }});
  
  res.json({
    ...updated,
    hubId: updated.hub_id,
    currentPath: JSON.parse(updated.current_path || '[]')
  });
});

app.delete('/api/naval-units/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Stop any movement
  if (navalUnitMovements.has(id)) {
    clearInterval(navalUnitMovements.get(id));
    navalUnitMovements.delete(id);
  }
  
  if (!dal.deleteNavalUnit(req.user.id, id)) {
    return res.status(404).json({ error: 'Naval unit not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'navalunit:remove', id });
  res.json({ success: true });
});

// ─── Road Routes ──────────────────────────────────────────────────────────────

app.get('/api/roads', authenticateToken, (req, res) => {
  const roads = dal.getRoads(req.user.id);
  res.json(roads.map(r => ({
    ...r,
    coordinates: JSON.parse(r.coordinates),
    speedLimit: r.speed_limit,
    createdAt: r.created_at
  })));
});

app.post('/api/roads', authenticateToken, (req, res) => {
  const { name, type, coordinates, speedLimit } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    return res.status(400).json({ error: 'At least 2 coordinate points are required' });
  }
  
  const road = dal.createRoad(req.user.id, {
    name: name || `Road ${Date.now()}`,
    type, coordinates, speedLimit
  });
  
  broadcastToUser(req.user.id, { type: 'road:update', road });
  res.status(201).json(road);
});

app.patch('/api/roads/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, type, coordinates, speedLimit } = req.body;
  
  const road = dal.getRoad(req.user.id, id);
  if (!road) return res.status(404).json({ error: 'Road not found' });
  
  const updated = dal.updateRoad(req.user.id, id, { name, type, coordinates, speedLimit });
  
  broadcastToUser(req.user.id, { type: 'road:update', road: {
    ...updated,
    coordinates: JSON.parse(updated.coordinates),
    speedLimit: updated.speed_limit
  }});
  
  res.json({
    ...updated,
    coordinates: JSON.parse(updated.coordinates),
    speedLimit: updated.speed_limit
  });
});

app.delete('/api/roads/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteRoad(req.user.id, id)) {
    return res.status(404).json({ error: 'Road not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'road:remove', id });
  res.json({ success: true });
});

// ─── Walkable Path Routes ─────────────────────────────────────────────────────

app.get('/api/walkable-paths', authenticateToken, (req, res) => {
  const paths = dal.getWalkablePaths(req.user.id);
  res.json(paths.map(p => ({
    ...p,
    coordinates: JSON.parse(p.coordinates),
    createdAt: p.created_at
  })));
});

app.post('/api/walkable-paths', authenticateToken, (req, res) => {
  const { name, type, coordinates } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    return res.status(400).json({ error: 'At least 2 coordinate points are required' });
  }
  
  const aPath = dal.createWalkablePath(req.user.id, {
    name: name || `Path ${Date.now()}`,
    type, coordinates
  });
  
  broadcastToUser(req.user.id, { type: 'path:update', path: aPath });
  res.status(201).json(aPath);
});

app.patch('/api/walkable-paths/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, type, coordinates } = req.body;
  
  const aPath = dal.getWalkablePath(req.user.id, id);
  if (!aPath) return res.status(404).json({ error: 'Path not found' });
  
  const updated = dal.updateWalkablePath(req.user.id, id, { name, type, coordinates });
  
  broadcastToUser(req.user.id, { type: 'path:update', path: {
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  }});
  
  res.json({
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  });
});

app.delete('/api/walkable-paths/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteWalkablePath(req.user.id, id)) {
    return res.status(404).json({ error: 'Path not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'path:remove', id });
  res.json({ success: true });
});

// ─── No-Go Zone Routes ────────────────────────────────────────────────────────

app.get('/api/no-go-zones', authenticateToken, (req, res) => {
  const zones = dal.getNoGoZones(req.user.id);
  res.json(zones.map(z => ({
    ...z,
    coordinates: JSON.parse(z.coordinates),
    createdAt: z.created_at
  })));
});

app.post('/api/no-go-zones', authenticateToken, (req, res) => {
  const { name, coordinates, ruleset } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'At least 3 coordinate points are required' });
  }
  
  const zone = dal.createNoGoZone(req.user.id, {
    name: name || `No-Go Zone ${Date.now()}`,
    coordinates, ruleset
  });
  
  broadcastToUser(req.user.id, { type: 'nogozone:update', zone });
  res.status(201).json(zone);
});

app.patch('/api/no-go-zones/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, coordinates, ruleset } = req.body;
  
  const zone = dal.getNoGoZone(req.user.id, id);
  if (!zone) return res.status(404).json({ error: 'No-go zone not found' });
  
  const updated = dal.updateNoGoZone(req.user.id, id, { name, coordinates, ruleset });
  
  broadcastToUser(req.user.id, { type: 'nogozone:update', zone: {
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  }});
  
  res.json({
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  });
});

app.delete('/api/no-go-zones/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteNoGoZone(req.user.id, id)) {
    return res.status(404).json({ error: 'No-go zone not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'nogozone:remove', id });
  res.json({ success: true });
});

// ─── Water Area Routes ────────────────────────────────────────────────────────

app.get('/api/water-areas', authenticateToken, (req, res) => {
  const areas = dal.getWaterAreas(req.user.id);
  res.json(areas.map(w => ({
    ...w,
    coordinates: JSON.parse(w.coordinates),
    createdAt: w.created_at
  })));
});

app.post('/api/water-areas', authenticateToken, (req, res) => {
  const { name, coordinates } = req.body;
  
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({ error: 'At least 3 coordinate points are required' });
  }
  
  const area = dal.createWaterArea(req.user.id, {
    name: name || `Water Area ${Date.now()}`,
    coordinates
  });
  
  broadcastToUser(req.user.id, { type: 'waterarea:update', area });
  res.status(201).json(area);
});

app.patch('/api/water-areas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, coordinates } = req.body;
  
  const area = dal.getWaterArea(req.user.id, id);
  if (!area) return res.status(404).json({ error: 'Water area not found' });
  
  const updated = dal.updateWaterArea(req.user.id, id, { name, coordinates });
  
  broadcastToUser(req.user.id, { type: 'waterarea:update', area: {
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  }});
  
  res.json({
    ...updated,
    coordinates: JSON.parse(updated.coordinates)
  });
});

app.delete('/api/water-areas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteWaterArea(req.user.id, id)) {
    return res.status(404).json({ error: 'Water area not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'waterarea:remove', id });
  res.json({ success: true });
});

// ─── Waypoint Routes ──────────────────────────────────────────────────────────

app.get('/api/waypoints', authenticateToken, (req, res) => {
  const waypoints = dal.getWaypoints(req.user.id);
  res.json(waypoints.map(w => ({ ...w, createdAt: w.created_at })));
});

app.post('/api/waypoints', authenticateToken, (req, res) => {
  const { name, type, entityId, lat, lng, hubId } = req.body;
  
  if (!type || !['hub', 'drone', 'ground-unit', 'naval-unit', 'coordinates'].includes(type)) {
    return res.status(400).json({ error: 'Valid type is required' });
  }
  
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Coordinates are required' });
  }
  
  const waypoint = dal.createWaypoint(req.user.id, {
    name: name || `Waypoint ${Date.now()}`,
    type, entityId, lat, lng, hubId
  });
  
  broadcastToUser(req.user.id, { type: 'waypoint:update', waypoint });
  res.status(201).json(waypoint);
});

app.patch('/api/waypoints/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, lat, lng } = req.body;
  
  const waypoint = dal.getWaypoint(req.user.id, id);
  if (!waypoint) return res.status(404).json({ error: 'Waypoint not found' });
  
  const updated = dal.updateWaypoint(req.user.id, id, { name, lat, lng });
  
  broadcastToUser(req.user.id, { type: 'waypoint:update', waypoint: updated });
  res.json(updated);
});

app.delete('/api/waypoints/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!dal.deleteWaypoint(req.user.id, id)) {
    return res.status(404).json({ error: 'Waypoint not found' });
  }
  
  broadcastToUser(req.user.id, { type: 'waypoint:remove', id });
  res.json({ success: true });
});

// ─── SSE Events ───────────────────────────────────────────────────────────────

app.get('/api/events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Track this SSE connection FIRST (before sending snapshot)
  if (!userSSEClients.has(req.user.id)) {
    userSSEClients.set(req.user.id, new Set());
  }
  userSSEClients.get(req.user.id).add(res);

  // Send snapshot after connection is registered
  broadcastSnapshotToUser(req.user.id);

  req.on('close', () => {
    const clients = userSSEClients.get(req.user.id);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        userSSEClients.delete(req.user.id);
      }
    }
  });
});

// ─── Drone Simulation ─────────────────────────────────────────────────────────

app.post('/api/drones/:id/simulate', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { targetLat, targetLng, speed } = req.body;
  
  if (targetLat === undefined || targetLng === undefined) {
    return res.status(400).json({ error: 'targetLat and targetLng are required' });
  }
  
  const drone = dal.getDrone(req.user.id, id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  
  // Stop existing simulation
  if (simulations.has(id)) {
    clearInterval(simulations.get(id).intervalId);
  }
  
  const simSpeed = speed !== undefined ? parseFloat(speed) : (drone.speed || 20);
  const updateInterval = 500;
  const distancePerUpdate = simSpeed / 3600 * (updateInterval / 1000);
  
  let currentLat = drone.lat;
  let currentLng = drone.lng;
  const target = { lat: parseFloat(targetLat), lng: parseFloat(targetLng) };
  
  const intervalId = setInterval(() => {
    const drone = dal.getDrone(req.user.id, id);
    if (!drone) {
      clearInterval(intervalId);
      simulations.delete(id);
      return;
    }
    
    const dist = distance(currentLat, currentLng, target.lat, target.lng);
    
    if (dist < 0.01) {
      // Check if target is in no-go zone
      const targetInNoGo = isPointInNoGoZone(req.user.id, target.lat, target.lng);
      if (targetInNoGo) {
        clearInterval(intervalId);
        simulations.delete(id);
        broadcastToUser(req.user.id, { 
          type: 'simulation:blocked', 
          droneId: id, 
          zone: targetInNoGo,
          reason: 'destination'
        });
        return;
      }
      
      // Move to exact target
      currentLat = target.lat;
      currentLng = target.lng;
      clearInterval(intervalId);
      simulations.delete(id);
      
      const updated = dal.updateDrone(req.user.id, id, {
        lat: currentLat, lng: currentLng, speed: 0
      });
      
      broadcastToUser(req.user.id, { type: 'drone:update', drone: {
        ...updated,
        hubId: updated.hub_id
      }});
      broadcastToUser(req.user.id, { type: 'simulation:end', droneId: id });
      return;
    }
    
    // Calculate direction
    const latDiff = target.lat - currentLat;
    const lngDiff = target.lng - currentLng;
    const angle = Math.atan2(lngDiff, latDiff);
    
    const latStep = (distancePerUpdate / 111.32) * Math.cos(angle);
    const lngStep = (distancePerUpdate / (111.32 * Math.cos(currentLat * Math.PI / 180))) * Math.sin(angle);
    
    const nextLat = currentLat + latStep;
    const nextLng = currentLng + lngStep;
    
    // Check for no-go zone
    const nextInNoGo = isPointInNoGoZone(req.user.id, nextLat, nextLng);
    if (nextInNoGo) {
      clearInterval(intervalId);
      simulations.delete(id);
      
      const updated = dal.updateDrone(req.user.id, id, {
        lat: currentLat, lng: currentLng, speed: 0, status: 'warning'
      });
      
      broadcastToUser(req.user.id, { type: 'drone:update', drone: {
        ...updated,
        hubId: updated.hub_id
      }});
      broadcastToUser(req.user.id, { 
        type: 'simulation:blocked', 
        droneId: id, 
        zone: nextInNoGo,
        reason: 'path'
      });
      return;
    }
    
    currentLat = nextLat;
    currentLng = nextLng;
    
    const updated = dal.updateDrone(req.user.id, id, {
      lat: currentLat, lng: currentLng, speed: simSpeed
    });
    
    broadcastToUser(req.user.id, { type: 'drone:update', drone: {
      ...updated,
      hubId: updated.hub_id
    }});
  }, updateInterval);
  
  simulations.set(id, { droneId: id, targetLat: target.lat, targetLng: target.lng, speed: simSpeed, intervalId });
  
  res.json({ success: true, simulation: { droneId: id, target, speed: simSpeed } });
});

app.delete('/api/drones/:id/simulate', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!simulations.has(id)) {
    return res.status(404).json({ error: 'No active simulation' });
  }
  
  const sim = simulations.get(id);
  clearInterval(sim.intervalId);
  simulations.delete(id);
  
  const drone = dal.getDrone(req.user.id, id);
  if (drone) {
    const updated = dal.updateDrone(req.user.id, id, { speed: 0 });
    broadcastToUser(req.user.id, { type: 'drone:update', drone: {
      ...updated,
      hubId: updated.hub_id
    }});
  }
  
  broadcastToUser(req.user.id, { type: 'simulation:end', droneId: id });
  res.json({ success: true });
});

// ─── Serve Static Files ───────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Drone API running at http://localhost:${PORT}`);
  console.log(`   User-scoped with authentication`);
  console.log(`   Development mode: ${DEVELOPMENT_MODE}`);
});