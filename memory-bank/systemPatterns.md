# System Patterns - Drone Head

## Architecture Overview

Drone Head follows a **monolithic server** architecture with **in-memory data stores** and **real-time broadcasting** via Server-Sent Events.

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
│                              │  │  In-Memory Maps   │  │   │
│                              │  │  - drones, hubs   │  │   │
│                              │  │  - fleets, missions│ │   │
│                              │  └───────────────────┘  │   │
│                              │                         │   │
│                              │  ┌───────────────────┐  │   │
│                              │  │  SQLite Database  │  │   │
│                              │  │  - users          │  │   │
│                              │  └───────────────────┘  │   │
│                              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. In-Memory Data Stores

**Decision**: Use JavaScript `Map` objects for all operational data.

**Rationale**:
- O(1) lookup by ID
- Easy iteration for broadcasting
- No database overhead for real-time operations
- Simple to understand and debug

**Trade-offs**:
- Data lost on server restart
- Not suitable for horizontal scaling
- Limited by available memory

**Implementation**:
```javascript
const drones = new Map();   // id → drone
const hubs = new Map();     // id → hub
// ... etc
```

### 2. Server-Sent Events (SSE)

**Decision**: Use SSE instead of WebSockets for real-time updates.

**Rationale**:
- Simpler unidirectional communication (server → client)
- Built-in reconnection handling
- Sufficient for use case (no client → server real-time needed)
- Works well with HTTP/1.1

**Trade-offs**:
- No bidirectional communication
- Limited to server-to-client updates

**Implementation**:
```javascript
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  sseClients.add(res);
  // Send snapshot
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}
```

### 3. SQLite for User Data

**Decision**: Use SQLite with better-sqlite3 for persistent user data.

**Rationale**:
- No separate database server needed
- Synchronous API simplifies code
- Good for single-server deployments
- Small data volume (users only)

**Trade-offs**:
- Not suitable for horizontal scaling
- Limited concurrent writes

### 4. Round-Robin Fleet Assignment

**Decision**: Use round-robin algorithm for automatic fleet-to-mission assignment.

**Rationale**:
- Distributes workload evenly across fleets
- Simple to implement
- Prevents fleet exhaustion
- Deterministic behavior

**Implementation**:
```javascript
const hubFleetAssignments = new Map(); // hubId → nextFleetIndex

// In assignment logic
const nextIndex = hubFleetAssignments.get(hubId) || 0;
const selectedFleet = hubFleets[nextIndex % hubFleets.length];
hubFleetAssignments.set(hubId, nextIndex + 1);
```

### 5. A* Pathfinding

**Decision**: Implement A* algorithm for ground unit pathfinding on road networks.

**Rationale**:
- Efficient for graph-based pathfinding
- Considers road types and unit capabilities
- Provides optimal paths
- Well-understood algorithm

**Implementation**:
```javascript
function findPathOnRoads(startLat, startLng, endLat, endLng, unitType) {
  const { graph, nodeIdCache } = buildRoadGraph();
  // A* implementation...
}
```

## Design Patterns

### Repository Pattern (Implicit)

Each entity type has implicit repository methods:

```javascript
// GET all
app.get('/api/drones', (_req, res) => {
  res.json([...drones.values()]);
});

// GET by ID
app.get('/api/drones/:id', (req, res) => {
  const drone = drones.get(req.params.id);
  if (!drone) return res.status(404).json({ error: 'Not found' });
  res.json(drone);
});

// POST create
app.post('/api/drones/:id/location', (req, res) => {
  // Create or update
});

// DELETE
app.delete('/api/drones/:id', (req, res) => {
  drones.delete(req.params.id);
  broadcast({ type: 'remove', id: req.params.id });
});
```

### Observer Pattern (SSE Broadcasting)

All changes are broadcast to connected clients:

```javascript
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

function broadcastDrone(drone) {
  broadcast({ type: 'drone:update', drone });
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
Client POST → Validate → Create Entity → Broadcast → Return Entity
```

### Update Flow
```
Client POST → Find Entity → Update Fields → Broadcast → Return Entity
```

### Delete Flow
```
Client DELETE → Find Entity → Delete → Broadcast Remove → Return Success
```

### Real-time Sync Flow
```
Client Connect SSE → Send Snapshot → Wait for Changes → Broadcast Updates
```

## Critical Implementation Paths

### Unit Movement Pipeline

1. **Request Received**: `POST /api/units/:id/move`
2. **Validation**: Check target is valid (not in no-go zone, on water, etc.)
3. **Path Calculation**: A* for ground units, direct for others
4. **Path Storage**: Save path to unit's `currentPath`
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

## Scalability Considerations

### Current Limitations
- Single server process
- In-memory state
- SQLite database
- SSE connections per process

### Scaling Paths
1. **Vertical**: Increase server resources
2. **Horizontal** (future):
   - Redis for distributed state
   - PostgreSQL for database
   - WebSocket + pub/sub for real-time
   - Load balancer for distribution

---

*Created: 2024*
*Last Updated: 2024*