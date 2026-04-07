# ✨ Features Guide

Comprehensive guide to all features in the Drone Head application.

## Table of Contents

- [Unit Management](#unit-management)
  - [Drones](#drones)
  - [Ground Units](#ground-units)
  - [Radio Towers](#radio-towers)
  - [Naval Units](#naval-units)
- [Organization](#organization)
  - [Hubs](#hubs)
  - [Fleets](#fleets)
- [Mission System](#mission-system)
- [Geographic Features](#geographic-features)
  - [Roads](#roads)
  - [Walkable Paths](#walkable-paths)
  - [No-Go Zones](#no-go-zones)
  - [Water Areas](#water-areas)
  - [Areas of Interest (AOIs)](#areas-of-interest-aois)
  - [EW Signal Areas](#ew-signal-areas)
- [Waypoints](#waypoints)
- [Real-time Features](#real-time-features)
- [User Features](#user-features)

---

## Unit Management

### Drones

Air units for reconnaissance and mission execution.

#### Capabilities
- Real-time position tracking with altitude
- Speed and battery monitoring
- Flight simulation with constraint enforcement
- Hub assignment for organization
- Automatic fleet assignment to missions

#### Status Values
- `active` - Drone is operational
- `idle` - Drone is stationary
- `warning` - Drone has issues (e.g., blocked by no-go zone)

#### Creating a Drone
1. Right-click on map and select "Create Drone"
2. Enter drone name and initial position
3. Configure altitude, speed, and battery level

#### Flight Simulation
1. Select a drone from the panel
2. Click "Simulate Flight"
3. Drag to set target position on map
4. Drone will fly to target, respecting no-go zones

### Ground Units

Terrestrial units for ground operations.

#### Unit Types
| Type | Description | Road Access |
|------|-------------|-------------|
| `humans` | Infantry units | Footpaths only |
| `ifv` | Infantry Fighting Vehicles | Streets and highways |
| `tank` | Main Battle Tanks | Highways only |
| `truck` | Transport trucks | All road types |

#### Capabilities
- A* pathfinding on road networks
- Unit type-specific road access
- Movement simulation
- No-go zone enforcement
- Hub assignment

#### Creating a Ground Unit
1. Right-click on map and select "Create Ground Unit"
2. Choose unit type (humans/ifv/tank/truck)
3. Enter name and configure speed/battery

#### Movement
1. Select ground unit
2. Click "Move" and drag to target
3. Unit follows road network using A* pathfinding
4. Humans can walk directly if no road path exists

### Radio Towers

Specialized ground units providing radio coverage and effects.

#### Capabilities
- Configurable radio range (in meters)
- Radio effects (jamming, detection, etc.)
- Visual range circles on map
- Toggle on/off functionality
- Unit-based placement (anywhere on map)

#### Creating a Radio Tower
1. Create a ground unit
2. Enable "Radio Tower" mode
3. Configure radio range
4. Define radio effects (JSON format)

#### Radio Effects
Radio effects are defined as JSON and applied to units within range:
```json
{
  "jamming": true,
  "detection": true,
  "communication": "blocked"
}
```

#### Visual Indicators
- Tower marker on map
- Semi-transparent circle showing range
- Color-coded based on active/inactive status

### Naval Units

Water-based units for maritime operations.

#### Unit Types
| Type | Description | Speed |
|------|-------------|-------|
| `fast-boat` | Quick patrol boats | High |
| `battleship` | Heavy warships | Medium |
| `aircraft-carrier` | Mobile airbases | Low |

#### Capabilities
- Direct movement on water areas
- Water area restriction enforcement
- No-go zone enforcement
- Hub assignment

#### Creating a Naval Unit
1. Ensure water area is defined at location
2. Right-click on water and select "Create Naval Unit"
3. Choose type and configure settings

#### Movement
1. Select naval unit
2. Click "Move" and drag to target on water
3. Unit moves directly (no pathfinding required)
4. Blocked if target is not on water area

---

## Organization

### Hubs

Base locations for organizing units and operations.

#### Capabilities
- Central point for unit assignment
- Fleet and mission management per hub
- Visual marker on map
- Hub panel with tabs

#### Hub Panel Tabs
- **Fleets**: View and manage fleets
- **Missions**: View and manage missions
- **Info**: Hub details and statistics
- **Drones**: List of assigned drones

#### Creating a Hub
1. Right-click on map and select "Create Hub"
2. Enter hub name
3. Hub marker appears at location

### Fleets

Groups of drones assigned to a hub.

#### Capabilities
- Round-robin assignment to missions
- Status tracking (idle/on-mission)
- Current mission tracking
- Automatic drone capacity management

#### Fleet Status
- `idle` - Fleet is available for missions
- `on-mission` - Fleet is executing a mission

#### Creating a Fleet
1. Open hub panel
2. Go to "Fleets" tab
3. Click "Create Fleet"
4. Enter fleet name

---

## Mission System

Mission definitions for automated fleet operations.

### Mission Types
- `general` - General purpose mission
- `recon` - Reconnaissance
- `patrol` - Patrol route
- `strike` - Attack mission
- `rescue` - Rescue operation

### Priority System
- Lower number = higher priority
- Missions assigned in priority order
- Default priority: 100

### End Conditions
| Condition | Description |
|-----------|-------------|
| `manual` | Must be completed manually |
| `arrival` | Completes when fleet arrives at waypoint |
| `drone_reached` | Completes when specific drone reaches target |
| `time_elapsed` | Completes after specified duration |
| `fleet_idle` | Completes when fleet goes idle |

### Creating a Mission
1. Open hub panel
2. Go to "Missions" tab
3. Click "Create Mission"
4. Configure:
   - Title
   - Type
   - Required drones
   - Priority
   - Waypoint (optional)
   - End condition

### Mission Assignment
- Automatic every 3 seconds
- Round-robin across fleets
- Matches fleet capacity to mission requirements
- Updates all connected clients in real-time

---

## Geographic Features

### Roads

Road network for ground unit pathfinding.

#### Road Types
| Type | Access |
|------|--------|
| `street` | All units |
| `highway` | IFV, tanks, trucks (not humans) |
| `footpath` | Humans only |

#### Creating a Road
1. Enable "Create Road" mode
2. Click points to define road path
3. Enter name, type, and speed limit
4. Road appears on map

### Walkable Paths

Footpaths for human unit movement.

#### Capabilities
- Human-only access
- Direct movement for humans when no road path
- Visual display on map

#### Creating a Walkable Path
1. Enable "Create Path" mode
2. Click points to define path
3. Enter name and type
4. Path appears on map

### No-Go Zones

Restricted areas that units cannot enter.

#### Enforcement
- **Drones**: Blocked during flight simulation
- **Ground Units**: Pathfinding avoids zones
- **Naval Units**: Movement blocked

#### Creating a No-Go Zone
1. Enable "Create No-Go Zone" mode
2. Click points to define polygon
3. Enter name and ruleset
4. Zone appears as red polygon

#### Ruleset Format
```
FORBIDDEN: [Description of restriction]
```

### Water Areas

Designated zones for naval unit operations.

#### Capabilities
- Defines where naval units can exist
- Visual display on map
- Naval unit placement validation

#### Creating a Water Area
1. Enable "Create Water Area" mode
2. Click points to define polygon
3. Enter name
4. Area appears as blue polygon

### Areas of Interest (AOIs)

Custom polygon areas for marking regions of interest.

#### Capabilities
- User-defined polygon shapes
- Custom naming
- Visual display with customizable colors
- Selection and management
- Persistent storage

#### Creating an AOI
1. Enable "Create AOI" mode
2. Click points to define polygon
3. Enter name
4. Polygon appears with highlight

#### AOI Management
- Select AOI for details
- Delete unwanted AOIs
- Visual highlighting on selection

### EW Signal Areas

Electronic warfare signal coverage areas.

#### Capabilities
- Rectangular/box shape
- Signal coverage visualization
- EW operations planning

#### Creating an EW Area
1. Enable "Create EW Area" mode
2. Click first corner
3. Drag to define rectangle
4. Click to confirm

---

## Waypoints

Navigation points for missions and operations.

### Waypoint Types
| Type | Description |
|------|-------------|
| `hub` | Linked to a hub location |
| `drone` | Linked to a drone position |
| `ground-unit` | Linked to ground unit position |
| `naval-unit` | Linked to naval unit position |
| `coordinates` | Standalone coordinate point |

#### Creating a Waypoint
1. Right-click on map and select "Create Waypoint"
2. Choose waypoint type
3. Enter name
4. For entity types, select the entity

---

## Real-time Features

### Server-Sent Events (SSE)

All changes are broadcast to connected clients in real-time.

#### Update Types
- Entity creation/update/delete
- Simulation start/stop/block
- Mission assignment
- Fleet status changes

#### Reconnection
- Automatic reconnection on disconnect
- Full snapshot sent on reconnect
- No data loss during brief disconnections

### Live Map Updates

- Unit positions update in real-time
- Radio range circles update dynamically
- AOI and zone changes visible immediately
- Path visualization for moving units

---

## User Features

### Authentication

- User registration with secure password hashing
- JWT token-based authentication
- Profile management
- Account deletion

### User-Scoped Data

- Complete data isolation between users
- Each user sees only their own data
- Automatic cleanup on user deletion

### Saved States

- Save current scenario state
- Load saved states
- Multiple states per user
- Named state management

---

*Last updated: 2026-04*