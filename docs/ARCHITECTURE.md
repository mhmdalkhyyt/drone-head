# 🏗️ System Architecture

This document describes the architecture of the Drone Head application, a real-time location tracking and mission management system for drones, ground units, and naval units with full user-based access control and persistent data storage.

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
│                              │  │   Data Access Layer       │ │  │
│                              │  │   (user-scoped ops)       │ │  │
│                              │  └───────────────────────────┘ │  │
│                              │                                 │  │
│                              │  ┌───────────────────────────┐ │  │
│                              │  │   SQLite Database         │ │  │
│                              │  │   - All entities          │ │  │
│                              │  │   - User-scoped           │ │  │
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
| Authentication | `frontend/auth-client.js` | Login/logout, token management, API calls |
| Login Page | `frontend/login/login.js` | Login form handling |
| Profile Page | `frontend/profile.js` | User profile management |
| Map Layer | `frontend/app.js` (map) | Leaflet.js integration |
| SSE Client | `frontend/app.js` (SSE) | Real-time updates from backend |

### Backend Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Express Server | `backend/server.js` | HTTP API server |
| Auth Middleware | `server.js:23-44` | JWT token verification |
| Ownership Middleware | `server.js:47-64` | Entity ownership validation |
| API Routes | `server.js:1200-1600` | RESTful endpoints |
| Data Access Layer | `backend/dataAccess.js` | User-scoped database operations |
| SQLite Database | `server.js:69-305` | Persistent storage setup |
| SSE Handler | `server.js:1581-1607` | Server-Sent Events stream |
| Simulations | `server.js:1609-1752` | Unit movement simulations |

### Data Stores

#### SQLite Database (All User-Scoped)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | id, username, password_hash, role |
| `user_profiles` | User profile info | user_id, display_name, email |
| `user_states` | Saved states | user_id, state_data, name |
| `drones` | Drone units | user_id, name, lat, lng, battery |
| `hubs` | Base locations | user_id, name, lat, lng |
| `fleets` | Drone groups | user_id, hub_id, drone_ids, status |
| `missions` | Mission definitions | user_id, hub_id, title, priority |
| `ground_units` | Ground units | user_id, type, lat, lng, is_radio_tower |
| `naval_units` | Naval units | user_id, type, lat, lng |
| `roads` | Road network | user_id, name, type, coordinates |
| `walkable_paths` | Footpaths | user_id, name, coordinates |
| `no_go_zones` | Restricted areas | user_id, name, coordinates |
| `water_areas` | Water zones | user_id, name, coordinates |
| `waypoints` | Navigation points | user_id, name, type, lat, lng |

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
└──────────────┘                     └──────┬───────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │  Authenticate│
                                     │  & Get User  │
                                     └──────┬───────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │ Send Snapshot│
                                     │ to User      │
                                     └──────┬───────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
            ┌──────────────┐                              ┌──────────────┐
            │ Unit Update  │                              │  Entity      │
            │  (Drone/     │                              │  Create/     │
            │   Ground/    │                              │  Delete      │
            │   Naval)     │                              │              │
            └──────┬───────┘                              └──────┬───────┘
                   │                                             │
                   ▼                                             ▼
            ┌──────────────┐                              ┌──────────────┐
            │ DAL.update*  │                              │ DAL.delete*  │
            │  Database    │                              │  Database    │
            └──────┬───────┘                              └──────┬───────┘
                   │                                             │
                   ▼                                             ▼
            ┌──────────────┐                              ┌──────────────┐
            │ broadcastTo  │                              │ broadcastTo  │
            │  User()      │                              │  User()      │
            └──────┬───────┘                              └──────┬───────┘
                   │                                             │
                   └──────────────────────┬──────────────────────┘
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
         │ For each user's hub:                    │
         │   1. Get queued missions (sorted)       │
         │   2. Get idle fleets                    │
         │   3. Find capable fleet for top mission │
         └─────────────────────────────────────────┘
                               │
                               ▼
         ┌─────────────────────────────────────────┐
         │ If capable fleet found:                 │
         │   - Assign fleet to mission             │
         │   - Update via DAL                      │
         │   - Broadcast to user                   │
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
         │   5. Broadcast update to user           │
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

### Radio Tower Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              Ground Unit Created as Radio Tower                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
         ┌─────────────────────────────────────────┐
         │ is_radio_tower = 1                      │
         │ radio_range_meters configured           │
         │ radio_effects defined                   │
         └─────────────────────────────────────────┘
                               │
                               ▼
         ┌─────────────────────────────────────────┐
         │ Frontend displays:                      │
         │   - Tower marker on map                 │
         │   - Range circle overlay                │
         │   - Radio active toggle                 │
         └─────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Persistent SQLite Storage
**Decision**: All operational data stored in SQLite with user ownership  
**Rationale**: 
- Data survives server restarts
- No separate database server needed
- User-scoped queries ensure data isolation
**Trade-off**: Single-writer limitation, not suitable for horizontal scaling

### 2. Data Access Layer (DAL)
**Decision**: Centralized class-based data access layer  
**Rationale**:
- Clean separation of database logic
- Consistent user-scoped operations
- Easier to maintain and test
**Trade-off**: Additional abstraction layer

### 3. User Ownership Model
**Decision**: Every entity has a `user_id` for multi-user support  
**Rationale**:
- True data isolation between users
- Simple to implement with foreign keys
- Cascading deletes on user removal
**Trade-off**: All queries must include user context

### 4. Server-Sent Events (SSE)
**Decision**: Use SSE instead of WebSockets  
**Rationale**:
- Simpler unidirectional communication
- Built-in reconnection handling
- Sufficient for server-to-client updates
**Trade-off**: No client-to-server real-time messaging

### 5. SQLite for All Data
**Decision**: Use SQLite with better-sqlite3 for all persistent data  
**Rationale**:
- No separate database server needed
- Synchronous API simplifies code
- Good for single-server deployments
**Trade-off**: Not suitable for horizontal scaling

### 6. A* Pathfinding Algorithm
**Decision**: Implement A* for ground unit pathfinding  
**Rationale**:
- Efficient for grid/graph-based pathfinding
- Considers road types and unit capabilities
- Provides optimal paths
**Trade-off**: Requires graph construction from road data

### 7. Round-Robin Fleet Assignment
**Decision**: Use round-robin for mission assignment  
**Rationale**:
- Distributes workload evenly
- Simple to implement
- Prevents fleet exhaustion
**Trade-off**: May not always select "best" fleet

### 8. Radio Towers as Specialized Ground Units
**Decision**: Radio towers implemented as ground units with special flag  
**Rationale**:
- Reuse ground unit infrastructure
- Flexible placement anywhere
- Configurable range and effects
**Trade-off**: Mixed concerns in ground_units table

---

## Scalability Considerations

### Current Limitations

1. **Single Server**: All data in single SQLite database
2. **SQLite**: Single-file database, limited concurrent writes
3. **SSE**: Each client maintains open connection per user
4. **In-Memory Simulations**: Simulation state lost on restart

### Potential Improvements

| Area | Current | Scalable Alternative |
|------|---------|---------------------|
| Data Store | SQLite | PostgreSQL |
| Real-time | SSE | WebSocket + pub/sub |
| State | In-Memory | Redis cluster |
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
│   ├── server.js              # Main application (~1,764 lines)
│   ├── dataAccess.js          # Data access layer (~687 lines)
│   ├── package.json           # Dependencies
│   ├── Dockerfile             # Container configuration
│   └── data/
│       └── data.db            # SQLite database
├── frontend/
│   ├── index.html             # Main dashboard
│   ├── app.js                 # Main application (~4,192 lines)
│   ├── style.css              # Main styles
│   ├── auth-client.js         # Authentication module (~234 lines)
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
| Drones | `/api/drones/*` | Drone CRUD, location updates, simulation |
| Hubs | `/api/hubs/*` | Hub management |
| Fleets | `/api/hubs/:hubId/fleets` | Fleet management |
| Missions | `/api/hubs/:hubId/missions` | Mission queue |
| Ground Units | `/api/ground-units/*` | Ground unit CRUD, movement |
| Radio Towers | `/api/ground-units/*` (is_radio_tower) | Radio tower operations |
| Naval Units | `/api/naval-units/*` | Naval unit CRUD, movement |
| Roads/Paths | `/api/roads/*`, `/api/walkable-paths/*` | Path network |
| Zones/Areas | `/api/no-go-zones/*`, `/api/water-areas/*` | Geographic constraints |
| AOIs | `/api/aois/*` | Areas of Interest |
| EW Areas | `/api/ew-areas/*` | Electronic warfare areas |
| Waypoints | `/api/waypoints/*` | Mission waypoints |
| States | `/api/states/*` | Save/load application states |
| Events | `/api/events` | SSE stream |

---

*Last updated: 2026-04*