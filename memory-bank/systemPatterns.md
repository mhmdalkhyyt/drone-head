# System Patterns - Drone Head

## Architecture Overview

Drone Head follows a **monolithic server** architecture with **persistent SQLite storage**, **user-scoped data access**, and **real-time broadcasting** via Server-Sent Events.

```
┌─────────────────────────────────────────────────────────────┐
│                      DRONE HEAD                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │   Frontend      │◄───────►│      Backend            │   │
│  │   (Vanilla JS)  │ HTTP/SSE│     (Express.js)        │   │
│  │                 │         │                         │   │
│  │  - Leaflet Map  │         │  ┌───────────────────┐  │   │
│  │  - UI Panels    │         │  │  API Routes       │  │   │
│  │  - SSE Client   │         │  └───────────────────┘  │   │
│  └─────────────────┘         │                         │   │
│                              │  ┌───────────────────┐  │   │
│                              │  │  Data Access      │  │   │
│                              │  │  Layer (DAL)      │  │   │
│                              │  └───────────────────┘  │   │
│                              │                         │   │
│                              │  ┌───────────────────┐  │   │
│                              │  │  SQLite Database  │  │   │
│                              │  │  - All entities   │  │   │
│                              │  │  - User-scoped    │  │   │
│                              │  └───────────────────┘  │   │
│                              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Persistent SQLite Storage

**Decision**: All operational data stored in SQLite with user ownership.

**Rationale**:
- Data survives server restarts
- No separate database server needed
- Synchronous API simplifies code
- User-scoped queries ensure data isolation

**Implementation**:
```sql
CREATE TABLE drones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  ...
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 2. Data Access Layer (DAL)

**Decision**: Centralized class-based data access layer.

**Rationale**:
- Clean separation of database logic
- Consistent user-scoped operations
- Easier to maintain and test
- Reduces code duplication

**Implementation**:
```javascript
class DataAccessLayer {
  constructor(db) {
    this.db = db;
  }
  
  getDrones(userId) {
    return this.db.prepare(
      'SELECT * FROM drones WHERE user_id = ?'
    ).all(userId);
  }
  
  createDrone(userId, data) {
    // Insert with user_id automatically
  }
}
```

### 3. User Ownership Model

**Decision**: Every entity has a `user_id` for multi-user support.

**Rationale**:
- True data isolation between users
- Each user sees only their own data
- Simple to implement with foreign keys
- Cascading deletes on user removal

**Trade-offs**:
- All queries must include user context
- Slightly more complex queries

### 4. Server-Sent Events (SSE)

**Decision**: Use SSE instead of WebSockets for real-time updates.

**Rationale**:
- Simpler unidirectional communication (server → client)
- Built-in reconnection handling
- Sufficient for use case
- User-scoped event broadcasting

**Implementation**:
```javascript
const userSSEClients = new Map(); // userId → Set of res

app.get('/api/events', authenticateToken, (req, res) => {
  broadcastSnapshotToUser(req.user.id);
  if (!userSSEClients.has(req.user.id)) {
    userSSEClients.set(req.user.id, new Set());
  }
  userSSEClients.get(req.user.id).add(res);
});

function broadcastToUser(userId, data) {
  const clients = userSSEClients.get(userId);
  if (clients) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => res.write(msg));
  }
}
```

### 5. A* Pathfinding

**Decision**: Implement A* algorithm for ground unit pathfinding on road networks.

**Rationale**:
- Efficient for graph-based pathfinding
- Considers road types and unit capabilities
- Provides optimal paths

**Implementation**:
```javascript
function findPathOnRoads(startLat, startLng, endLat, endLng, unitType) {
  const { graph, nodeIdCache } = buildRoadGraph();
  // A* implementation...
}
```

### 6. Radio Tower System

**Decision**: Radio towers implemented as specialized ground units.

**Rationale**:
- Reuse ground unit infrastructure
- Flexible placement anywhere
- Configurable range and effects
- Visual range circles on map

**Implementation**:
```javascript
// Ground units with is_radio_tower = 1
const towers = dal.getRadioTowers(userId);
// Each tower has radio_range_meters and radio_effects
```

## Design Patterns

### Repository Pattern (via DAL)

Each entity type has repository methods in the Data Access Layer:

```javascript
// GET all
app.get('/api/drones', authenticateToken, (req, res) => {
  const drones = dal.getDrones(req.user.id);
  res.json(drones);
});

// GET by ID
app.get('/api/drones/:id', authenticateToken, (req, res) => {
  const drone = dal.getDrone(req.user.id, req.params.id);
  if (!drone) return res.status(404).json({ error: 'Not found' });
  res.json(drone);
});

// POST create
app.post('/api/drones/:id/location', authenticateToken, (req, res) => {
  const drone = dal.createDrone(req.user.id, req.body);
  broadcastToUser(req.user.id, { type: 'drone:create', drone });
  res.status(201).json(drone);
});

// DELETE
app.delete('/api/drones/:id', authenticateToken, (req, res) => {
  if (!dal.deleteDrone(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  broadcastToUser(req.user.id, { type: 'drone:remove', id: req.params.id });
  res.json({ success: true });
});
```

### Observer Pattern (SSE Broadcasting)

All changes are broadcast to connected clients for that user:

```javascript
function broadcastToUser(userId, data) {
  const clients = userSSEClients.get(userId);
  if (clients) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => res.write(msg));
  }
}

function broadcastDroneUpdate(userId, drone) {
  broadcastToUser(userId, { type: 'drone:update', drone });
}
```

### Factory Pattern (Icons)

Icon generation based on entity type/status:

```javascript
function droneIcon(status) {
  return L.divIcon({
    className: '',
    html: `<div class="drone-marker drone-marker--${status}">🚁</div>`,
    iconSize: [36, 36],
  });
}
```

## Data Flow Patterns

### Create Flow
```
Client POST → Authenticate → Validate → DAL.create → Broadcast → Return Entity
```

### Update Flow
```
Client POST → Authenticate → DAL.get → Validate → DAL.update → Broadcast → Return Entity
```

### Delete Flow
```
Client DELETE → Authenticate → DAL.delete → Broadcast Remove → Return Success
```

### Real-time Sync Flow
```
Client Connect SSE → Authenticate → Send Snapshot → Wait for Changes → Broadcast Updates
```

## Critical Implementation Paths

### Unit Movement Pipeline

1. **Request Received**: `POST /api/units/:id/move`
2. **Validation**: Check target is valid (not in no-go zone, on water, etc.)
3. **Path Calculation**: A* for ground units, direct for others
4. **Path Storage**: Save path to unit's `current_path`
5. **Simulation Start**: `setInterval` for periodic updates
6. **Position Updates**: Calculate new position, broadcast
7. **Completion**: Stop simulation when reached

### Mission Assignment Pipeline

1. **Scheduler Tick**: Every 3 seconds
2. **Find Queued Missions**: Sort by priority
3. **Find Idle Fleets**: Filter by hub and status
4. **Match**: Find capable fleet for top mission
5. **Assign**: Update statuses, broadcast
6. **Monitor**: Check end conditions every 2 seconds

### Radio Tower Pipeline

1. **Ground Unit Created**: With `is_radio_tower = 1`
2. **Range Configured**: `radio_range_meters` set
3. **Effects Defined**: `radio_effects` JSON stored
4. **Visualized**: Circle overlay on map
5. **Applied**: Effects calculated for units in range

## Scalability Considerations

### Current Limitations
- Single server process
- SQLite database
- SSE connections per process
- All data in single database

### Scaling Paths
1. **Vertical**: Increase server resources
2. **Horizontal** (future):
   - Redis for distributed SSE and state
   - PostgreSQL for database
   - WebSocket + pub/sub for real-time
   - Load balancer for distribution

---

*Created: 2024*
*Last Updated: 2026-04*