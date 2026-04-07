# 🛠️ Development Guide

This guide provides everything you need to develop on the Drone Head application.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Running the Application](#running-the-application)
- [Code Structure](#code-structure)
- [Coding Standards](#coding-standards)
- [Debugging](#debugging)
- [Common Development Tasks](#common-development-tasks)
- [Testing](#testing)
- [Git Workflow](#git-workflow)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 16+ | JavaScript runtime |
| npm | 7+ | Package manager |
| Git | 2.x+ | Version control |
| Docker | 20+ (optional) | Container runtime |
| Docker Compose | 2+ (optional) | Container orchestration |

### Recommended Tools

- **Editor**: Visual Studio Code with extensions:
  - ESLint
  - Prettier
  - SQLite Viewer
  - REST Client
- **API Testing**: Postman or Insomnia
- **Database Browser**: DB Browser for SQLite or VS Code SQLite extension

---

## Development Environment Setup

### 1. Clone the Repository

```bash
git clone git@github.com:mhmdalkhyyt/drone-head.git
cd drone-head
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

This installs:
- `express` - Web framework
- `better-sqlite3` - SQLite database
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT authentication
- `cors` - Cross-origin resource sharing
- `nodemon` - Development auto-restart

### 3. Create Data Directory

```bash
mkdir -p backend/data
```

### 4. Configure Environment (Optional)

Create `backend/.env` for custom configuration:

```bash
PORT=3000
JWT_SECRET=your-custom-secret-key
DEVELOPMENT_MODE=true
DATA_DIR=backend/data
DB_PATH=backend/data/data.db
```

---

## Running the Application

### Local Development

#### Start Backend Server

```bash
cd backend

# Production mode
npm start

# Development mode with auto-restart
npm run dev
```

The server starts at `http://localhost:3000`

#### Access Frontend

Option 1 - Direct file access:
```
file:///path/to/drone-head/frontend/index.html
```

Option 2 - Static file server:
```bash
npx serve frontend
# Access at http://localhost:3001
```

### Docker Development

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

---

## Code Structure

### Backend Architecture

```
backend/
├── server.js              # Main Express application
├── package.json           # Dependencies
├── Dockerfile             # Container config
└── data/
    └── data.db            # SQLite database
```

#### server.js Structure

```javascript
// Lines 1-15: Imports and configuration
const express = require('express');
// ... other imports

// Lines 16-37: Authentication middleware
function authenticateToken(req, res, next) { ... }

// Lines 42-85: SQLite database setup
const db = new Database(DB_PATH);

// Lines 87-122: In-memory stores
const drones = new Map();
const hubs = new Map();
// ...

// Lines 125-384: Authentication routes
app.post('/api/auth/register', ...);
app.post('/api/auth/login', ...);

// Lines 385-485: State management routes
app.post('/api/states', ...);

// Lines 920-1047: Drone routes
app.get('/api/drones', ...);

// Lines 1049-1349: Ground unit routes
app.post('/api/ground-units', ...);

// Lines 1351-1425: Road routes
app.post('/api/roads', ...);

// Lines 1488-1534: Hub routes
app.post('/api/hubs', ...);

// Lines 1536-1597: Fleet routes
app.post('/api/hubs/:hubId/fleets', ...);

// Lines 1713-1785: Mission routes
app.post('/api/hubs/:hubId/missions', ...);

// Lines 1787-1865: No-Go Zone routes
app.post('/api/no-go-zones', ...);

// Lines 1867-2125: Naval unit and water area routes
app.post('/api/naval-units', ...);

// Lines 2225-2251: SSE endpoint
app.get('/api/events', ...);

// Lines 2253-2425: Simulation functions
app.post('/api/drones/:id/simulate', ...);

// Lines 2427-2548: Background schedulers
setInterval(() => { ... }, 3000);

// Lines 2550-2566: Static files and server start
app.use(express.static(...));
app.listen(PORT, ...);
```

### Frontend Architecture

```
frontend/
├── index.html             # Main dashboard
├── app.js                 # Main application logic
├── style.css              # Main styles
├── auth.js                # Authentication
├── auth.css               # Auth styles
├── profile.html           # User profile
├── profile.js             # Profile logic
├── profile.css            # Profile styles
└── login/
    ├── login.html         # Login page
    ├── login.js           # Login logic
    └── login.css          # Login styles
```

#### app.js Structure

```javascript
// Lines 1-91: State management
const state = {
  drones: {},
  hubs: {},
  // ...
};

// Lines 93-123: Map setup
const map = L.map('map', ...);

// Lines 125-182: Icon factories
function droneIcon(status) { ... }
function hubIcon(hub) { ... }

// Lines 184-224: Popup content generators
function popupContent(d) { ... }

// Lines 226-399: Marker management
function upsertMarker(d) { ... }

// Lines 401-455: Road and path rendering
function renderRoads() { ... }

// Lines 457-485: Context menu handlers
function addContextMenuToDroneMarker(...) { ... }

// Lines 487-607: Ground unit handlers
function selectGroundUnit(id) { ... }

// Lines 609-655: Hub management
function focusHub(hubId) { ... }

// Lines 657-668: HUD stats
function updateHUDStats() { ... }

// Lines 670-750: Drone sidebar
function renderSidebar() { ... }

// Lines 752-912: Hub panel and fleets/missions
function openHubPanel(hubId) { ... }

// ... (continues for 3200+ lines)
```

---

## Coding Standards

### JavaScript Style Guide

#### Naming Conventions

```javascript
// Constants - UPPER_SNAKE_CASE
const API_BASE = '/api';
const JWT_SECRET = 'secret';

// Variables - camelCase
let droneCount = 0;
const currentState = {};

// Functions - camelCase
function calculateDistance(lat1, lng1, lat2, lng2) { ... }

// Classes - PascalCase
class DroneController { ... }

// Private variables - underscore prefix
const _internalCache = new Map();
```

#### Code Formatting

```javascript
// Use strict equality
if (drone.id === targetId) { ... }

// Arrow functions for callbacks
drones.forEach(drone => { ... });

// Template literals for strings
const message = `Drone ${drone.name} updated`;

// Destructuring
const { lat, lng } = position;

// Optional chaining
const fleet = state.fleets[drone.fleetId]?.name;
```

#### Error Handling

```javascript
// Try-catch for async operations
try {
  const result = await db.prepare('SELECT * FROM users').all();
} catch (error) {
  console.error('Database error:', error);
  res.status(500).json({ error: 'Database error' });
}

// Validation with early return
function createDrone(data) {
  if (!data.lat || !data.lng) {
    return { error: 'Coordinates required' };
  }
  // ...
}
```

### Backend Patterns

#### Route Handler Pattern

```javascript
// GET endpoint
app.get('/api/resource', (req, res) => {
  const resources = [...resourcesMap.values()];
  res.json(resources);
});

// POST endpoint
app.post('/api/resource', (req, res) => {
  const { field1, field2 } = req.body;
  
  // Validation
  if (!field1) {
    return res.status(400).json({ error: 'field1 required' });
  }
  
  // Create resource
  const id = `resource-${seq++}`;
  const resource = { id, field1, field2 };
  resourcesMap.set(id, resource);
  
  // Broadcast if real-time
  broadcastResource(resource);
  
  res.status(201).json(resource);
});

// DELETE endpoint
app.delete('/api/resource/:id', (req, res) => {
  const { id } = req.params;
  if (!resourcesMap.has(id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  resourcesMap.delete(id);
  broadcastRemove(id);
  res.json({ success: true });
});
```

#### Broadcasting Pattern

```javascript
// Broadcast to all SSE clients
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

// Type-specific broadcasts
function broadcastDrone(drone) {
  broadcast({ type: 'drone:update', drone });
}

function broadcastDroneRemove(id) {
  broadcast({ type: 'drone:remove', id });
}
```

### Frontend Patterns

#### SSE Connection Pattern

```javascript
// Establish connection
const eventSource = new EventSource('/api/events');

// Handle snapshot (initial data)
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'snapshot') {
    // Initialize state from snapshot
    state.drones = data.drones.reduce((acc, d) => {
      acc[d.id] = d;
      return acc;
    }, {});
    // ... initialize other state
  }
  
  // Handle updates
  if (data.type === 'drone:update') {
    state.drones[data.drone.id] = data.drone;
    upsertMarker(data.drone);
  }
});
```

#### API Call Pattern

```javascript
// GET request
async function getDrones() {
  const res = await fetch('/api/drones');
  return res.json();
}

// POST request
async function createDrone(data) {
  const res = await fetch('/api/drones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// With authentication
async function getProfile() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
```

---

## Debugging

### Backend Debugging

#### Console Logging

```javascript
// Add debug logs
console.log('[DroneAPI] Creating drone:', data);
console.log('[Simulation] Drone position:', { lat, lng });

// Error logging
console.error('[Auth] Login failed:', error);
```

#### Node.js Inspector

```bash
# Start with inspector
node --inspect server.js

# Attach Chrome DevTools
chrome://inspect
```

#### Debugging SSE

```javascript
// Log SSE client connections
app.get('/api/events', (req, res) => {
  console.log('[SSE] New client connected. Total:', sseClients.size + 1);
  
  res.on('close', () => {
    console.log('[SSE] Client disconnected. Total:', sseClients.size);
  });
});
```

### Frontend Debugging

#### Browser Console

```javascript
// Log state changes
console.log('Drone updated:', drone);
console.log('Current state:', state);

// Debug map events
map.on('click', (e) => {
  console.log('Map clicked:', e.latlng);
});
```

#### Network Tab

Check:
- SSE connection at `/api/events`
- API requests and responses
- WebSocket/SSE messages

#### Leaflet Map Debug

```javascript
// Add debug markers
L.circleMarker([lat, lng], { radius: 10, color: 'red' }).addTo(map);

// Log map events
map.on('move', () => console.log('Map moved:', map.getCenter()));
```

---

## Common Development Tasks

### Adding a New Entity Type

1. **Define in-memory store** (server.js):
```javascript
const customUnits = new Map();
let customUnitSeq = 1;
```

2. **Add CRUD routes**:
```javascript
// GET all
app.get('/api/custom-units', (req, res) => {
  res.json([...customUnits.values()]);
});

// POST create
app.post('/api/custom-units', (req, res) => {
  const { name, lat, lng } = req.body;
  const id = `custom-${customUnitSeq++}`;
  const unit = { id, name, lat, lng, createdAt: new Date().toISOString() };
  customUnits.set(id, unit);
  broadcastCustomUnit(unit);
  res.status(201).json(unit);
});

// DELETE
app.delete('/api/custom-units/:id', (req, res) => {
  customUnits.delete(req.params.id);
  broadcastCustomUnitRemove(req.params.id);
  res.json({ success: true });
});
```

3. **Add broadcast functions**:
```javascript
function broadcastCustomUnit(unit) {
  broadcast({ type: 'customunit:update', unit });
}

function broadcastCustomUnitRemove(id) {
  broadcast({ type: 'customunit:remove', id });
}
```

4. **Add to SSE snapshot**:
```javascript
res.write(`data: ${JSON.stringify({
  // ... existing
  customUnits: [...customUnits.values()],
})}\n\n`);
```

5. **Frontend: Add to state** (app.js):
```javascript
const state = {
  // ... existing
  customUnits: {},
  customMarkers: {},
};
```

6. **Frontend: Add marker management**:
```javascript
function upsertCustomMarker(unit) {
  if (state.customMarkers[unit.id]) {
    state.customMarkers[unit.id].setLatLng([unit.lat, unit.lng]);
  } else {
    const marker = L.marker([unit.lat, unit.lng]).addTo(map);
    state.customMarkers[unit.id] = marker;
  }
}
```

7. **Frontend: Handle updates**:
```javascript
// In SSE handler
if (data.type === 'customunit:update') {
  state.customUnits[data.unit.id] = data.unit;
  upsertCustomMarker(data.unit);
}
```

### Adding a New API Endpoint

1. **Add route handler** (server.js):
```javascript
// After existing routes
app.post('/api/custom-action', (req, res) => {
  const { entityId, action } = req.body;
  
  // Validate
  if (!entityId || !action) {
    return res.status(400).json({ error: 'entityId and action required' });
  }
  
  // Process action
  const result = processAction(entityId, action);
  
  res.json(result);
});
```

2. **Frontend: Add API function** (app.js):
```javascript
async function performCustomAction(entityId, action) {
  const res = await fetch('/api/custom-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId, action })
  });
  return res.json();
}
```

3. **Frontend: Add UI trigger**:
```javascript
document.getElementById('custom-action-btn').addEventListener('click', () => {
  performCustomAction(selectedId, 'custom-action');
});
```

### Modifying Data Models

#### Adding Fields to Existing Entities

1. **Backend: Update creation** (server.js):
```javascript
// In POST route
const drone = {
  id,
  name: data.name,
  lat: data.lat,
  lng: data.lng,
  // New field
  newField: data.newField ?? 'default',
  // ...
};
```

2. **Backend: Update location handler**:
```javascript
// In POST /location route
if (newField !== undefined) drone.newField = newField;
```

3. **Frontend: Update state interface**:
```javascript
// In state handling
state.drones[id] = { ...drone, newField: data.newField };
```

4. **Frontend: Update UI**:
```javascript
// In popup or card
document.getElementById('new-field').textContent = drone.newField;
```

---

## Testing

### Manual Testing Checklist

#### Authentication
- [ ] Register new user
- [ ] Login with credentials
- [ ] Token stored in localStorage
- [ ] Profile page accessible
- [ ] Logout clears token

#### Drone Management
- [ ] Create drone via API
- [ ] Drone appears on map
- [ ] Update drone location
- [ ] Drone moves in real-time
- [ ] Delete drone removes from map

#### Hub Management
- [ ] Create hub
- [ ] Hub marker on map
- [ ] Assign drone to hub
- [ ] Hub panel shows drones
- [ ] Delete hub unassigns drones

#### Fleet Management
- [ ] Create fleet in hub
- [ ] Add drones to fleet
- [ ] Fleet status updates
- [ ] Delete fleet removes drones

#### Mission Management
- [ ] Create mission
- [ ] Mission appears in queue
- [ ] Fleet auto-assigned to mission
- [ ] Mission status updates
- [ ] Complete mission

#### Ground Units
- [ ] Create ground unit
- [ ] Unit appears on map
- [ ] Move unit to destination
- [ ] Path displayed on map
- [ ] Unit follows path

#### Naval Units
- [ ] Create naval unit on water
- [ ] Unit cannot be placed on land
- [ ] Move unit on water
- [ ] Path displayed

#### No-Go Zones
- [ ] Create no-go zone
- [ ] Zone displayed on map
- [ ] Drone blocked from entering
- [ ] Ground unit blocked

### API Testing with curl

```bash
# Create drone
curl -X POST http://localhost:3000/api/drones/drone-1/location \
  -H "Content-Type: application/json" \
  -d '{"lat": 59.3293, "lng": 18.0686, "name": "Test Drone"}'

# Create hub
curl -X POST http://localhost:3000/api/hubs \
  -H "Content-Type: application/json" \
  -d '{"name": "Base Alpha", "lat": 59.3293, "lng": 18.0686}'

# Create fleet
curl -X POST http://localhost:3000/api/hubs/hub-1/fleets \
  -H "Content-Type: application/json" \
  -d '{"name": "Fleet Alpha"}'

# Create mission
curl -X POST http://localhost:3000/api/hubs/hub-1/missions \
  -H "Content-Type: application/json" \
  -d '{"title": "Recon Mission", "type": "surveillance"}'
```

---

## Git Workflow

### Branch Strategy

```
main
  ├── develop
  ├── feature/drone-simulation
  ├── feature/ground-units
  └── hotfix/auth-bug
```

### Commit Message Convention

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(drones): add simulation mode
fix(auth): handle expired tokens
docs(api): update endpoint documentation
```

### Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and test
# 3. Commit changes
git add .
git commit -m "feat: add my feature"

# 4. Push and create PR
git push origin feature/my-feature
```

---

## Performance Tips

### Backend Optimization

1. **Minimize broadcast frequency**:
```javascript
// Batch updates
let pendingUpdates = [];
setInterval(() => {
  if (pendingUpdates.length) {
    broadcast({ type: 'batch', updates: pendingUpdates });
    pendingUpdates = [];
  }
}, 100);
```

2. **Use efficient data structures**:
```javascript
// Use Map for O(1) lookup
const drones = new Map(); // Instead of array
```

### Frontend Optimization

1. **Debounce UI updates**:
```javascript
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

2. **Lazy load markers**:
```javascript
// Only render markers in viewport
const visibleMarkers = Object.values(state.drones).filter(d => 
  map.getBounds().contains([d.lat, d.lng])
);
```

---

*Last updated: 2024*