# 🏗️ System Architecture

This document describes the architecture of the Drone Head application, a real-time location tracking and mission management system for drones, ground units, and naval units.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Component Diagrams](#component-diagrams)
- [Key Design Decisions](#key-design-decisions)
- [Scalability Considerations](#scalability-considerations)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DRONE HEAD SYSTEM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐         ┌─────────────────────────────────┐  │
│  │   Frontend      │◄───────►│          Backend                │  │
│  │   (Vanilla JS)  │  HTTP/  │      (Express.js Server)        │  │
│  │                 │  SSE    │                                 │  │
│  │  - Leaflet Map  │         │  ┌───────────────────────────┐ │  │
│  │  - UI Panels    │         │  │   API Routes              │ │  │
│  │  - Controls     │         │  │   /api/*                  │ │  │
│  │  - Authentication│        │  └───────────────────────────┘ │  │
│  └─────────────────┘         │                                 │  │
│                              │  ┌───────────────────────────┐ │  │
│                              │  │   In-Memory Stores        │ │  │
│                              │  │   - drones, hubs, fleets  │ │  │
│                              │  │   - missions, waypoints   │ │  │
│                              │  │   - groundUnits, roads    │ │  │
│                              │  │   - navalUnits, waterAreas│ │  │
│                              │  └───────────────────────────┘ │  │
│                              │                                 │  │
│                              │  ┌───────────────────────────┐ │  │
│                              │  │   SQLite Database         │ │  │
│                              │  │   - users                 │ │  │
│                              │  │   - user_profiles         │ │  │
│                              │  │   - user_states           │ │  │
│                              │  └───────────────────────────┘ │  │
│                              └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Main App | `frontend/app.js` | Map management, state sync, UI rendering |
| Authentication | `frontend/auth.js` | Login/logout, token management |
| Login Page | `frontend/login/login.js` | Login form handling |
| Profile Page | `frontend/profile.js` | User profile management |
| Map Layer | `frontend/app.js` (map) | Leaflet.js integration |
| SSE Client | `frontend/app.js` (SSE) | Real-time updates from backend |

### Backend Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Express Server | `backend/server.js` | HTTP API server |
| Auth Middleware | `server.js:16-37` | JWT token verification |
| API Routes | `server.js:125-2225` | RESTful endpoints |
| In-Memory Stores | `server.js:88-119` | Real-time data caches |
| SQLite Wrapper | `server.js:51-85` | Persistent user data |
| SSE Handler | `server.js:2227-2251` | Server-Sent Events stream |
| Simulations | `server.js:2253-2425` | Unit movement simulations |
| Scheduler | `server.js:2427-2548` | Mission auto-assignment |

### Data Stores

#### In-Memory Stores (Maps)
```javascript
const drones       = new Map(); // id → drone
const hubs         = new Map(); // id → hub
const fleets       = new Map(); // id → fleet
const missions     = new Map(); // id → mission
const waypoints    = new Map(); // id → waypoint
const noGoZones    = new Map(); // id → no-go zone
const groundUnits  = new Map(); // id → ground unit
const roads        = new Map(); // id → road
const walkablePaths= new Map(); // id → path
const navalUnits   = new Map(); // id → naval unit
const waterAreas   = new Map(); // id → water area
const simulations  = new Map(); // id → simulation state
```

#### SQLite Tables
```sql
users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at TEXT
)

user_profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER FK,
    display_name TEXT,
    email TEXT,
    preferences TEXT
)

user_states (
    id INTEGER PRIMARY KEY,
    user_id INTEGER FK,
    state_data TEXT,
    name TEXT,
    saved_at TEXT
)
```

---

## Data Flow

### Real-Time Update Flow

```
┌──────────────┐     SSE Connect     ┌──────────────┐
│   Frontend   │ ──────────────────► │   Backend    │
│              │                     │              │
│  1. Connect  │                     │  1. Accept   │
│     to /api/ │                     │     conn     │
│     events   │                     │              │
└──────────────┘                     └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  Add to      │
                                    │  sseClients  │
                                    └──────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
           ┌──────────────┐                              ┌──────────────┐
           │ Unit Update  │                              │  Entity      │
           │  (Drone/     │                              │  Create/     │
           │   Ground/    │                              │  Delete      │
           │   Naval)     │                              │              │
           └──────────────┘                              └──────────────┘
                    │                                             │
                    ▼                                             ▼
           ┌──────────────┐                              ┌──────────────┐
           │ broadcast()  │                              │ broadcast*   │
           │  function    │                              │  (specific)  │
           └──────────────┘                              └──────────────┘
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           ▼
                                    ┌──────────────┐
                                    │ Write to     │
                                    │  all clients │
                                    └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │   Frontend   │
                                    │  receives    │
                                    │  & updates   │
                                    └──────────────┘
```

### Mission Assignment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mission Scheduler (3s interval)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ For each hub:                           │
        │   1. Get queued missions (sorted)       │
        │   2. Get idle fleets                    │
        │   3. Find capable fleet for top mission │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ If capable fleet found:                 │
        │   - Assign fleet to mission             │
        │   - Update statuses                     │
        │   - Broadcast updates                   │
        └─────────────────────────────────────────┘
```

### Pathfinding Flow (Ground Units)

```
┌──────────────────┐
│ Move Request     │
│ (start → end)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Find Nearest     │────►│ Is start on road?│
│ Road             │     └────────┬─────────┘
└──────────────────┘              │
                                  ▼
                         ┌──────────────────┐
                         │ No → Return null │
                         └──────────────────┘
                                  │
                                 Yes
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ Reconstruct      │◄────│ A* Pathfinding   │
│ Path             │     │ on road graph    │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ Check unit type  │     │ No path found    │
│ can use roads?   │     │ → humans: direct │
└────────┬─────────┘     │ → others: error  │
         │               └──────────────────┘
         ▼
┌──────────────────┐
│ Valid path       │
│ returned         │
└──────────────────┘
```

---

## Component Diagrams

### Authentication Flow

```
┌─────────────┐    POST /api/auth/login    ┌─────────────┐
│   Client    │ ─────────────────────────► │  Backend    │
└─────────────┘                            └──────┬──────┘
                                                  │
                    ┌─────────────────────────────┤
                    │                             ▼
                    │                    ┌──────────────────┐
                    │                    │ Find user in     │
                    │                    │ SQLite           │
                    │                    └────────┬─────────┘
                    │                             │
                    │              ┌──────────────┴──────────────┐
                    │              ▼                             ▼
                    │     ┌──────────────────┐         ┌──────────────────┐
                    │     │ Invalid password │         │ Valid password   │
                    │     └────────┬─────────┘         └────────┬─────────┘
                    │              │                            │
                    │              ▼                            ▼
                    │     ┌──────────────────┐         ┌──────────────────┐
                    │     │ 401 Unauthorized │         │ Generate JWT     │
                    │     └──────────────────┘         └────────┬─────────┘
                    │                                          │
                    └──────────────────────────────────────────┤
                                                               ▼
                                                      ┌──────────────────┐
                                                      │ Return token +   │
                                                      │ user info        │
                                                      └──────────────────┘
```

### Drone Simulation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              POST /api/drones/:id/simulate                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ Validate target coordinates             │
        │ Stop existing simulation if any         │
        │ Create simulation state                 │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ Interval Loop (500ms):                  │
        │   1. Calculate distance to target       │
        │   2. Check if reached (< 10m)           │
        │   3. Check no-go zone entry             │
        │   4. Calculate next position            │
        │   5. Broadcast update                   │
        └─────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
           ┌──────────────┐    ┌──────────────┐
           │ Reached      │    │ Blocked by   │
           │ target       │    │ no-go zone   │
           └──────┬───────┘    └──────┬───────┘
                  │                   │
                  └─────────┬─────────┘
                            ▼
                   ┌──────────────┐
                   │ Stop         │
                   │ simulation   │
                   └──────────────┘
```

---

## Key Design Decisions

### 1. In-Memory Data Stores
**Decision**: Use JavaScript Maps for real-time entity storage  
**Rationale**: 
- O(1) lookup by ID
- Easy iteration for broadcasting
- No database overhead for real-time operations
**Trade-off**: Data is lost on server restart (except user data in SQLite)

### 2. Server-Sent Events (SSE)
**Decision**: Use SSE instead of WebSockets  
**Rationale**:
- Simpler unidirectional communication
- Built-in reconnection handling
- Sufficient for server-to-client updates
**Trade-off**: No client-to-server real-time messaging

### 3. SQLite for User Data
**Decision**: Use SQLite with better-sqlite3  
**Rationale**:
- No separate database server needed
- Synchronous API simplifies code
- Good for single-server deployments
**Trade-off**: Not suitable for horizontal scaling

### 4. A* Pathfinding Algorithm
**Decision**: Implement A* for ground unit pathfinding  
**Rationale**:
- Efficient for grid/graph-based pathfinding
- Considers road types and unit capabilities
- Provides optimal paths
**Trade-off**: Requires graph construction from road data

### 5. Round-Robin Fleet Assignment
**Decision**: Use round-robin for mission assignment  
**Rationale**:
- Distributes workload evenly
- Simple to implement
- Prevents fleet exhaustion
**Trade-off**: May not always select "best" fleet

---

## Scalability Considerations

### Current Limitations

1. **Single Server**: All data in memory, no distributed state
2. **SQLite**: Single-file database, limited concurrent writes
3. **SSE**: Each client maintains open connection

### Potential Improvements

| Area | Current | Scalable Alternative |
|------|---------|---------------------|
| Data Store | In-Memory Maps | Redis cluster |
| Database | SQLite | PostgreSQL |
| Real-time | SSE | WebSocket + pub/sub |
| Deployment | Single container | Kubernetes + load balancer |

### Horizontal Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                            │
└─────────────────────────────────────────────────────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
      │  Server 1   │      │  Server 2   │      │  Server 3   │
      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │      Redis Cluster      │
                    │   (Distributed state)   │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │    PostgreSQL Master    │
                    │   (Persistent storage)  │
                    └─────────────────────────┘
```

---

## File Structure

```
drone-head/
├── backend/
│   ├── server.js              # Main application (2500+ lines)
│   ├── package.json           # Dependencies
│   ├── Dockerfile             # Container configuration
│   └── data/
│       └── data.db            # SQLite database
├── frontend/
│   ├── index.html             # Main dashboard
│   ├── app.js                 # Main application (3200+ lines)
│   ├── style.css              # Main styles
│   ├── auth.js                # Authentication logic
│   ├── auth.css               # Auth styles
│   ├── profile.html           # User profile page
│   ├── profile.js             # Profile logic
│   ├── profile.css            # Profile styles
│   ├── cookie-policy.js       # Cookie policy
│   ├── cookie-policy.css      # Cookie policy styles
│   └── login/
│       ├── login.html         # Login page
│       ├── login.js           # Login logic
│       └── login.css          # Login styles
├── docker-compose.yml         # Docker orchestration
├── docs/                      # Documentation
├── memory-bank/               # Cline Memory Bank
└── .clinerules                # Cline rules
```

---

## API Endpoints Overview

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Authentication | `/api/auth/*` | User registration, login, profile |
| Drones | `/api/drones/*` | Drone CRUD, location updates |
| Hubs | `/api/hubs/*` | Hub management |
| Fleets | `/api/hubs/:hubId/fleets` | Fleet management |
| Missions | `/api/hubs/:hubId/missions` | Mission queue |
| Ground Units | `/api/ground-units/*` | Ground unit CRUD, movement |
| Naval Units | `/api/naval-units/*` | Naval unit CRUD, movement |
| Roads/Paths | `/api/roads/*`, `/api/walkable-paths/*` | Path network |
| Zones/Areas | `/api/no-go-zones/*`, `/api/water-areas/*` | Geographic constraints |
| Waypoints | `/api/waypoints/*` | Mission waypoints |
| States | `/api/states/*` | Save/load application states |
| Events | `/api/events` | SSE stream |

---

*Last updated: 2024*