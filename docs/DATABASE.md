# 🗄️ Database Documentation

This document describes the database schema and data models used in the Drone Head application.

## Overview

The application uses two types of data storage:

1. **In-Memory Stores** - For real-time entity data (drones, hubs, fleets, etc.)
2. **SQLite Database** - For persistent user data (users, profiles, saved states)

---

## In-Memory Data Stores

All real-time entity data is stored in JavaScript `Map` objects for O(1) lookup performance.

### Data Store Summary

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `drones` | Active drones | ❌ Lost on restart |
| `hubs` | Base locations | ❌ Lost on restart |
| `fleets` | Drone groups | ❌ Lost on restart |
| `missions` | Mission queue | ❌ Lost on restart |
| `waypoints` | Location markers | ❌ Lost on restart |
| `noGoZones` | Restricted areas | ❌ Lost on restart |
| `groundUnits` | Ground units | ❌ Lost on restart |
| `roads` | Road network | ❌ Lost on restart |
| `walkablePaths` | Foot paths | ❌ Lost on restart |
| `navalUnits` | Naval units | ❌ Lost on restart |
| `waterAreas` | Water boundaries | ❌ Lost on restart |
| `simulations` | Active simulations | ❌ Lost on restart |

---

## Entity Data Models

### Drone

```javascript
{
  id: string,           // Unique identifier (e.g., "drone-1")
  name: string,         // Display name
  lat: number,          // Latitude
  lng: number,          // Longitude
  altitude: number,     // Altitude in meters
  speed: number,        // Speed in km/h
  status: string,       // "active", "idle", "warning"
  battery: number,      // Battery percentage (0-100)
  hubId: string|null,   // Assigned hub (null if unassigned)
  updatedAt: string     // ISO timestamp
}
```

### Hub

```javascript
{
  id: string,           // Unique identifier (e.g., "hub-1")
  name: string,         // Display name
  lat: number,          // Latitude
  lng: number,          // Longitude
  createdAt: string     // ISO timestamp
}
```

### Fleet

```javascript
{
  id: string,           // Unique identifier (e.g., "fleet-1")
  hubId: string,        // Parent hub
  name: string,         // Display name
  droneIds: string[],   // Array of drone IDs
  status: string,       // "idle", "on-mission"
  currentMissionId: string|null, // Active mission
  createdAt: string     // ISO timestamp
}
```

### Mission

```javascript
{
  id: string,           // Unique identifier (e.g., "mission-1")
  hubId: string,        // Parent hub
  title: string,        // Mission title
  type: string,         // "general", "surveillance", "delivery", "search", "inspection"
  requiredDrones: number, // Minimum drones needed
  priority: number,     // Lower = higher priority (default: 100)
  status: string,       // "queued", "active", "done"
  assignedFleetId: string|null, // Assigned fleet
  waypointId: string|null, // Target waypoint
  endCondition: string, // "manual", "arrival", "drone_reached", "time_elapsed", "fleet_idle"
  endConditionValue: any, // Condition-specific value
  createdAt: string,    // ISO timestamp
  startedAt: string|null, // When mission became active
  completedAt: string|null  // When mission completed
}
```

### Waypoint

```javascript
{
  id: string,           // Unique identifier (e.g., "waypoint-1")
  name: string,         // Display name
  type: string,         // "hub", "drone", "ground-unit", "naval-unit", "coordinates"
  entityId: string|null, // Referenced entity ID
  lat: number,          // Latitude
  lng: number,          // Longitude
  hubId: string|null,   // Associated hub
  createdAt: string     // ISO timestamp
}
```

### Ground Unit

```javascript
{
  id: string,           // Unique identifier (e.g., "ground-1")
  name: string,         // Display name
  type: string,         // "humans", "ifv", "tank", "truck"
  lat: number,          // Latitude
  lng: number,          // Longitude
  speed: number,        // Speed in km/h
  status: string,       // "idle", "moving", "warning"
  battery: number,      // Battery percentage (0-100)
  hubId: string|null,   // Assigned hub
  onRoad: boolean,      // Currently on road
  currentPath: number[][], // Path coordinates [[lat,lng],...]
  pathIndex: number,    // Current waypoint index
  updatedAt: string     // ISO timestamp
}
```

### Road

```javascript
{
  id: string,           // Unique identifier (e.g., "road-1")
  name: string,         // Display name
  type: string,         // "highway", "street", "residential", "avenue", "footpath", "sidewalk", "trail"
  coordinates: number[][], // Path coordinates [[lat,lng],...]
  speedLimit: number,   // Default speed limit in km/h
  createdAt: string     // ISO timestamp
}
```

### Walkable Path

```javascript
{
  id: string,           // Unique identifier (e.g., "path-1")
  name: string,         // Display name
  type: string,         // "footpath", "sidewalk", "trail", "bike-path"
  coordinates: number[][], // Path coordinates [[lat,lng],...]
  createdAt: string     // ISO timestamp
}
```

### No-Go Zone

```javascript
{
  id: string,           // Unique identifier (e.g., "nogo-1")
  name: string,         // Display name
  coordinates: number[][], // Polygon coordinates [[lat,lng],...]
  ruleset: string,      // Restriction description
  createdAt: string     // ISO timestamp
}
```

### Naval Unit

```javascript
{
  id: string,           // Unique identifier (e.g., "naval-1")
  name: string,         // Display name
  type: string,         // "fast-boat", "battleship", "aircraft-carrier"
  lat: number,          // Latitude
  lng: number,          // Longitude
  speed: number,        // Speed in km/h
  status: string,       // "idle", "moving", "warning"
  battery: number,      // Battery percentage (0-100)
  hubId: string|null,   // Assigned hub
  currentPath: number[][], // Path coordinates [[lat,lng],...]
  pathIndex: number,    // Current waypoint index
  updatedAt: string     // ISO timestamp
}
```

### Water Area

```javascript
{
  id: string,           // Unique identifier (e.g., "water-1")
  name: string,         // Display name
  coordinates: number[][], // Polygon coordinates [[lat,lng],...]
  createdAt: string     // ISO timestamp
}
```

### Simulation State

```javascript
{
  droneId: string,      // Drone being simulated
  targetLat: number,    // Target latitude
  targetLng: number,    // Target longitude
  speed: number,        // Simulation speed
  intervalId: number    // setInterval ID
}
```

---

## SQLite Database Schema

User data is persisted in SQLite at `backend/data/data.db`.

### Database Initialization

```sql
-- Created on first startup if not exists
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
```

### User Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique user ID |
| username | TEXT | UNIQUE, NOT NULL | Username |
| password_hash | TEXT | NOT NULL | Bcrypt password hash |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

**Usage:**
```sql
-- Insert user
INSERT INTO users (username, password_hash) VALUES ('john', '$2b$10$...');

-- Find user
SELECT * FROM users WHERE username = 'john';

-- Delete user
DELETE FROM users WHERE id = 1;
```

### User Profile Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique profile ID |
| user_id | INTEGER | UNIQUE, NOT NULL, FK | Reference to users.id |
| display_name | TEXT | - | Display name |
| email | TEXT | - | Email address |
| preferences | TEXT | - | JSON preferences |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TEXT | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Usage:**
```sql
-- Get profile
SELECT * FROM user_profiles WHERE user_id = 1;

-- Update profile
UPDATE user_profiles 
SET display_name = 'John Doe', email = 'john@example.com'
WHERE user_id = 1;

-- Insert or update
INSERT INTO user_profiles (user_id, display_name) VALUES (1, 'John Doe')
ON CONFLICT(user_id) DO UPDATE SET
  display_name = excluded.display_name,
  updated_at = CURRENT_TIMESTAMP;
```

### User States Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique state ID |
| user_id | INTEGER | NOT NULL, FK | Reference to users.id |
| state_data | TEXT | NOT NULL | JSON state data |
| name | TEXT | DEFAULT 'Saved State' | State name |
| saved_at | TEXT | DEFAULT CURRENT_TIMESTAMP | Save timestamp |

**Usage:**
```sql
-- Save state
INSERT INTO user_states (user_id, state_data, name) 
VALUES (1, '{"drones":[...]}', 'My State');

-- Get states
SELECT id, name, saved_at FROM user_states WHERE user_id = 1 ORDER BY saved_at DESC;

-- Get full state
SELECT * FROM user_states WHERE id = 1 AND user_id = 1;

-- Delete state
DELETE FROM user_states WHERE id = 1 AND user_id = 1;
```

---

## Entity Relationships

### Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │───────│  Profile    │       │   States    │
│             │   1:1 │             │       │   1:N       │
└─────────────┘       └─────────────┘       └─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Hub      │───────│   Fleet     │───────│  Mission    │
│             │   1:N │             │   1:1 │   1:N       │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │
       │ 1:N                 │ N:1 (via droneIds)
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│   Drone     │◄──────│             │
│             │       └─────────────┘
└─────────────┘
```

### Relationships

| From | To | Type | Description |
|------|-----|------|-------------|
| User | Profile | 1:1 | One profile per user |
| User | States | 1:N | Multiple saved states |
| Hub | Fleets | 1:N | Multiple fleets per hub |
| Hub | Missions | 1:N | Multiple missions per hub |
| Hub | Drones | 1:N | Multiple drones per hub |
| Hub | Ground Units | 1:N | Multiple ground units per hub |
| Hub | Naval Units | 1:N | Multiple naval units per hub |
| Fleet | Drones | N:N | Drones via droneIds array |
| Fleet | Mission | 1:1 | One active mission per fleet |
| Mission | Waypoint | N:1 | Optional waypoint reference |

---

## Data Access Patterns

### In-Memory Operations

```javascript
// Create
const id = `drone-${seq++}`;
const drone = { id, ...data };
drones.set(id, drone);

// Read
const drone = drones.get(id);
const allDrones = [...drones.values()];

// Update
const drone = drones.get(id);
drone.lat = newLat;
drones.set(id, drone);

// Delete
drones.delete(id);

// Query
const hubDrones = [...drones.values()].filter(d => d.hubId === hubId);
```

### SQLite Operations

```javascript
const db = new Database('data/data.db');

// Insert
const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
const result = stmt.run(username, passwordHash);
const userId = result.lastInsertRowid;

// Select single
const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

// Select multiple
const users = db.prepare('SELECT * FROM users').all();

// Update
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

// Delete
db.prepare('DELETE FROM users WHERE id = ?').run(userId);

// Transaction
const insertUser = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
const insertProfile = db.prepare('INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)');

db.transaction((username, passwordHash, displayName) => {
  const result = insertUser.run(username, passwordHash);
  insertProfile.run(result.lastInsertRowid, displayName);
})(username, passwordHash, displayName);
```

---

## Data Persistence Strategy

### What's Persisted

- User accounts and credentials
- User profiles and preferences
- Saved application states

### What's Not Persisted

- Active drones and their positions
- Hubs, fleets, missions
- Ground units, naval units
- Roads, paths, zones
- Water areas, waypoints

### Why

**In-Memory Benefits:**
- Fast O(1) lookups
- Easy broadcasting of changes
- No database overhead for real-time ops
- Simple state management

**SQLite for User Data:**
- Accounts need to survive restarts
- Saved states are user-specific
- Small data volume

### Implications

- **On server restart:** All operational data is lost
- **Development workflow:** Recreate entities after restart
- **Production consideration:** Consider persisting operational data

---

## Migration Guide

### Adding a New Entity Type

1. **Define in-memory store:**
```javascript
const myEntities = new Map();
let myEntitySeq = 1;
```

2. **Add broadcast function:**
```javascript
function broadcastMyEntity(entity) {
  broadcast({ type: 'myentity:update', entity });
}

function broadcastMyEntityRemove(id) {
  broadcast({ type: 'myentity:remove', id });
}
```

3. **Add to SSE snapshot:**
```javascript
res.write(`data: ${JSON.stringify({
  // ... existing
  myEntities: [...myEntities.values()],
})}\n\n`);
```

4. **Add CRUD routes** (see API documentation)

---

## Performance Considerations

### In-Memory Stores

- **Lookup:** O(1) via Map.get()
- **Iteration:** O(n) for filtering
- **Memory:** All data in RAM
- **Scale:** Limited by available memory

### SQLite Queries

- **Indexed:** user_id on profiles and states
- **Small dataset:** User data is minimal
- **Synchronous:** Blocking but fast for small data

### Optimization Tips

1. **Batch operations:**
```javascript
// Instead of multiple broadcasts
entities.forEach(e => broadcastEntity(e));

// Use batch broadcast
broadcast({ type: 'batch', entities: [...entities.values()] });
```

2. **Filter before iterate:**
```javascript
// Good
const result = [...drones.values()].filter(d => d.hubId === id);

// Avoid
for (const [key, value] of drones.entries()) {
  if (value.hubId === id) { /* ... */ }
}
```

---

*Last updated: 2024*