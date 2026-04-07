# Project Brief - Drone Head

## Project Overview

**Drone Head** is a real-time location tracking and mission management system for drones, ground units, and naval units. It provides a comprehensive dashboard for monitoring and controlling various types of units in real-time.

## Core Objectives

1. **Real-time Tracking**: Monitor position, status, and battery levels of all units
2. **Fleet Management**: Organize units into hubs and fleets for efficient operations
3. **Mission Planning**: Create and manage missions with automatic fleet assignment
4. **Geographic Constraints**: Define no-go zones, water areas, and road networks
5. **Simulation**: Simulate unit movement and behavior

## Key Features

### Unit Types
- **Drones**: Air units with altitude tracking and flight simulation
- **Ground Units**: Infantry, IFV, tanks, and trucks with road-based pathfinding
- **Naval Units**: Boats, battleships, and aircraft carriers operating on water

### Management Systems
- **Hubs**: Base locations for organizing units
- **Fleets**: Groups of drones that can be assigned to missions
- **Missions**: Tasks with priority queues and auto-completion conditions
- **Waypoints**: Reference points for navigation and missions

### Geographic Features
- **Road Network**: Defined roads with type-based access rules
- **Walkable Paths**: Footpaths for human units
- **No-Go Zones**: Restricted areas for all unit types
- **Water Areas**: Designated zones for naval unit operations

## Technical Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Database | SQLite (better-sqlite3) |
| Authentication | JWT, bcrypt |
| Real-time | Server-Sent Events (SSE) |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Maps | Leaflet.js + CartoDB Dark Matter |
| Deployment | Docker, Docker Compose |

## Project Structure

```
drone-head/
├── backend/           # Express API server
├── frontend/          # Vanilla JS frontend
├── docs/              # Documentation
├── memory-bank/       # Cline Memory Bank
└── .clinerules        # Cline rules
```

## Current Status

- **Backend**: Fully functional with complete API
- **Frontend**: Dashboard with map integration
- **Authentication**: JWT-based (optional in development)
- **Real-time**: SSE for live updates

## Future Enhancements

1. Persistent storage for operational data
2. Advanced mission planning tools
3. Multi-user collaboration
4. Historical tracking and analytics
5. Mobile responsive improvements

## Success Criteria

- All unit types can be created, tracked, and managed
- Real-time updates work reliably
- Pathfinding correctly respects constraints
- Missions auto-assign and complete as expected
- System handles concurrent users

---

*Created: 2024*
*Last Updated: 2024*