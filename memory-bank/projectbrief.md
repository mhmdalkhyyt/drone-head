# Project Brief - Drone Head

## Project Overview

**Drone Head** is a real-time location tracking and mission management system for drones, ground units, and naval units. It provides a comprehensive dashboard for monitoring and controlling various types of units in real-time with full user-based access control and persistent data storage.

## Core Objectives

1. **Real-time Tracking**: Monitor position, status, and battery levels of all units via SSE
2. **Fleet Management**: Organize units into hubs and fleets for efficient operations
3. **Mission Planning**: Create and manage missions with automatic fleet assignment
4. **Geographic Constraints**: Define no-go zones, water areas, road networks, and AOIs
5. **Simulation**: Simulate unit movement and behavior with constraint enforcement
6. **Multi-User Support**: User-scoped data with JWT authentication

## Key Features

### Unit Types
- **Drones**: Air units with altitude tracking and flight simulation
- **Ground Units**: Infantry, IFV, tanks, and trucks with road-based pathfinding
- **Naval Units**: Boats, battleships, and aircraft carriers operating on water
- **Radio Towers**: Special ground units providing radio range and effects

### Management Systems
- **Hubs**: Base locations for organizing units
- **Fleets**: Groups of drones that can be assigned to missions
- **Missions**: Tasks with priority queues and auto-completion conditions
- **Waypoints**: Reference points for navigation and missions
- **Areas of Interest (AOIs)**: Custom polygon areas for marking regions
- **EW Signal Areas**: Electronic warfare signal areas

### Geographic Features
- **Road Network**: Defined roads with type-based access rules
- **Walkable Paths**: Footpaths for human units
- **No-Go Zones**: Restricted areas for all unit types
- **Water Areas**: Designated zones for naval unit operations
- **Radio Range Visualization**: Visual radio coverage areas

## Technical Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Database | SQLite (better-sqlite3) with user ownership |
| Authentication | JWT, bcrypt |
| Real-time | Server-Sent Events (SSE) |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Maps | Leaflet.js + CartoDB Dark Matter |
| Deployment | Docker, Docker Compose |

## Project Structure

```
drone-head/
├── backend/
│   ├── server.js              # Main application (~1,764 lines)
│   ├── dataAccess.js          # Data access layer
│   ├── package.json
│   ├── Dockerfile
│   └── data/
│       └── data.db
├── frontend/
│   ├── index.html             # Main dashboard
│   ├── app.js                 # Main application (~4,192 lines)
│   ├── style.css
│   ├── auth-client.js         # Authentication client module
│   ├── auth.css
│   ├── profile.html
│   ├── profile.js
│   ├── profile.css
│   └── login/
│       ├── login.html
│       ├── login.js
│       └── login.css
├── docker-compose.yml
├── docs/                      # Documentation
├── memory-bank/               # Cline Memory Bank
└── .clinerules                # Cline rules
```

## Current Status

- **Backend**: Fully functional with persistent SQLite storage and user ownership
- **Frontend**: Comprehensive dashboard with map integration and RTS-style controls
- **Authentication**: JWT-based with user-scoped data access
- **Real-time**: SSE for live updates to all connected clients
- **Data Persistence**: All operational data persisted in SQLite

## Database Schema

All entities are stored in SQLite with user ownership:
- `users` - User accounts
- `user_profiles` - User profile information
- `user_states` - Saved application states
- `drones` - Drone units
- `hubs` - Base locations
- `fleets` - Drone groups
- `missions` - Mission definitions
- `ground_units` - Ground unit entities (includes radio towers)
- `naval_units` - Naval unit entities
- `roads` - Road network
- `walkable_paths` - Footpaths
- `no_go_zones` - Restricted areas
- `water_areas` - Water zones
- `waypoints` - Navigation waypoints

## Future Enhancements

1. Advanced mission planning tools (waypoint sequences, templates)
2. Enhanced radio effect system
3. Historical tracking and analytics
4. Mobile responsive improvements
5. Automated testing suite
6. Security hardening (rate limiting, input validation)

## Success Criteria

- All unit types can be created, tracked, and managed
- Real-time updates work reliably via SSE
- Pathfinding correctly respects constraints
- Missions auto-assign and complete as expected
- User data is properly isolated and persistent
- System handles concurrent users

---

*Created: 2024*
*Last Updated: 2026-04*