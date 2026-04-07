# 🎯 Features Documentation

This document provides detailed documentation for all features in the Drone Head application.

## Table of Contents

- [Drone Fleet Management](#drone-fleet-management)
- [Hub System](#hub-system)
- [Fleet Management](#fleet-management)
- [Mission System](#mission-system)
- [Ground Units](#ground-units)
- [Naval Units](#naval-units)
- [Road Network & Pathfinding](#road-network--pathfinding)
- [No-Go Zones](#no-go-zones)
- [Water Areas](#water-areas)
- [Waypoints](#waypoints)
- [Real-time Updates](#real-time-updates)
- [State Persistence](#state-persistence)

---

## Drone Fleet Management

### Overview

Drones are the primary units in the system. They can be tracked in real-time, assigned to hubs, grouped into fleets, and used for missions.

### Drone Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier (auto-generated) |
| name | string | Display name |
| lat | number | Latitude position |
| lng | number | Longitude position |
| altitude | number | Altitude in meters |
| speed | number | Speed in km/h |
| status | string | "active", "idle", "warning" |
| battery | number | Battery level (0-100%) |
| hubId | string|null | Assigned hub ID |
| updatedAt | string | Last update timestamp |

### Creating Drones

Drones are created by updating their location:

```javascript
// POST /api/drones/:id/location
{
  "lat": 59.3293,
  "lng": 18.0686,
  "name": "Alpha-1",
  "altitude": 150,
  "speed": 20,
  "battery": 100,
  "status": "active"
}
```

### Drone Assignment

**To Hub:**
```javascript
// POST /api/drones/:id/assign-hub
{ "hubId": "hub-1" }
```

When assigned to a hub:
- Drone is automatically added to a fleet via round-robin
- If drone is in a fleet of a different hub, it's removed first
- Round-robin ensures even distribution across fleets

**From Hub:**
```javascript
// DELETE /api/drones/:id/assign-hub
```

### Drone Simulation

Simulate drone flight to a target location:

```javascript
// POST /api/drones/:id/simulate
{
  "targetLat": 59.3350,
  "targetLng": 18.0750,
  "speed": 20
}
```

**Simulation Behavior:**
- Drone moves towards target at specified speed
- Updates broadcast every 500ms
- Stops automatically if:
  - Reaches target (within 10m)
  - Would enter a no-go zone
  - Path intersects a no-go zone

**Stop Simulation:**
```javascript
// DELETE /api/drones/:id/simulate
```

### Battery Levels

Battery is visualized with color coding:
- **High (>50%)**: Green
- **Medium (20-50%)**: Yellow
- **Low (<20%)**: Red

---

## Hub System

### Overview

Hubs are base locations where drones, ground units, and naval units can be organized. Each hub can have multiple fleets and missions.

### Hub Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |
| lat | number | Latitude |
| lng | number | Longitude |
| createdAt | string | Creation timestamp |

### Creating Hubs

```javascript
// POST /api/hubs
{
  "name": "Base Alpha",
  "lat": 59.3293,
  "lng": 18.0686
}
```

### Hub Operations

**Get Hubs:**
```javascript
// GET /api/hubs - All hubs
// GET /api/hubs/:id - Single hub
// GET /api/hubs/:hubId/drones - Drones in hub
// GET /api/hubs/:hubId/ground-units - Ground units in hub
// GET /api/hubs/:hubId/naval-units - Naval units in hub
// GET /api/hubs/:hubId/fleets - Fleets in hub
// GET /api/hubs/:hubId/missions - Missions in hub
// GET /api/hubs/:hubId/waypoints - Waypoints for hub
```

**Update Hub:**
```javascript
// PATCH /api/hubs/:id
{ "name": "Updated Name" }
```

**Delete Hub:**
```javascript
// DELETE /api/hubs/:id
```

**Cascade Effects:**
- All fleets in hub are deleted
- All missions in hub are deleted
- All drones are unassigned from hub

---

## Fleet Management

### Overview

Fleets are groups of drones within a hub. They can be assigned to missions and managed together.

### Fleet Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| hubId | string | Parent hub ID |
| name | string | Display name |
| droneIds | string[] | Array of drone IDs |
| status | string | "idle", "on-mission" |
| currentMissionId | string|null | Active mission ID |
| createdAt | string | Creation timestamp |

### Creating Fleets

```javascript
// POST /api/hubs/:hubId/fleets
{ "name": "Fleet Alpha" }
```

### Fleet Operations

**Add Drone to Fleet:**
```javascript
// POST /api/hubs/:hubId/fleets/:fleetId/drones
{ "droneId": "drone-1" }
```

**Remove Drone from Fleet:**
```javascript
// DELETE /api/hubs/:hubId/fleets/:fleetId/drones/:droneId
```

**Delete Fleet:**
```javascript
// DELETE /api/hubs/:hubId/fleets/:fleetId
```

### Fleet Status

- **idle**: Fleet is available for missions
- **on-mission**: Fleet is executing a mission

---

## Mission System

### Overview

Missions are tasks assigned to fleets. They have a priority queue system and can auto-complete based on conditions.

### Mission Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| hubId | string | Parent hub ID |
| title | string | Mission title |
| type | string | Mission type |
| requiredDrones | number | Minimum drones needed |
| priority | number | Queue priority (lower = higher) |
| status | string | "queued", "active", "done" |
| assignedFleetId | string|null | Assigned fleet |
| waypointId | string|null | Target waypoint |
| endCondition | string | Auto-complete condition |
| endConditionValue | any | Condition value |
| createdAt | string | Creation timestamp |
| startedAt | string|null | When started |
| completedAt | string|null | When completed |

### Mission Types

| Type | Icon | Description |
|------|------|-------------|
| general | 📋 | General purpose |
| surveillance | 👁 | Reconnaissance |
| delivery | 📦 | Transport mission |
| search | 🔍 | Search operation |
| inspection | 🔧 | Equipment inspection |

### End Conditions

| Condition | Description |
|-----------|-------------|
| manual | Manual completion only |
| arrival | Complete when all drones reach waypoint |
| drone_reached | Complete when any drone reaches waypoint |
| time_elapsed | Complete after N seconds (endConditionValue) |
| fleet_idle | Complete when fleet returns to idle |

### Creating Missions

```javascript
// POST /api/hubs/:hubId/missions
{
  "title": "Recon Mission",
  "type": "surveillance",
  "requiredDrones": 2,
  "priority": 10,
  "waypointId": "waypoint-1",
  "endCondition": "arrival"
}
```

### Mission Queue

Missions are automatically assigned to fleets:
- Checked every 3 seconds
- Top priority mission is selected first
- First capable fleet is assigned (meets requiredDrones)
- Round-robin distribution across fleets

### Completing Missions

**Manual:**
```javascript
// POST /api/hubs/:hubId/missions/:missionId/complete
```

**Automatic:**
- Triggered by end condition
- Fleet is freed (status → idle)
- Mission status → done

---

## Ground Units

### Overview

Ground units are terrestrial vehicles and infantry that can move on roads or off-road (humans only).

### Unit Types

| Type | Icon | Speed | Road Access |
|------|------|-------|-------------|
| humans | 👤 | 5 km/h | All roads + off-road |
| ifv | 🛡️ | 60 km/h | Highway, street, residential |
| tank | 🪖 | 40 km/h | Highway, street, residential |
| truck | 🚚 | 70 km/h | Highway, street, residential, avenue |

### Ground Unit Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |
| type | string | Unit type |
| lat | number | Latitude |
| lng | number | Longitude |
| speed | number | Speed in km/h |
| status | string | "idle", "moving", "warning" |
| battery | number | Battery level |
| hubId | string|null | Assigned hub |
| onRoad | boolean | Currently on road |
| currentPath | number[][] | Path coordinates |
| pathIndex | number | Current waypoint index |
| updatedAt | string | Last update |

### Creating Ground Units

```javascript
// POST /api/ground-units
{
  "name": "Scout Team",
  "type": "humans",
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": "hub-1"
}
```

### Moving Ground Units

**With Pathfinding:**
```javascript
// POST /api/ground-units/:id/move
{
  "targetLat": 59.3350,
  "targetLng": 18.0750
}
```

**Pathfinding Behavior:**
- Uses A* algorithm on road network
- Checks unit type against road type access
- Returns path if found, or error if not
- Humans can move directly (off-road) if no road path

**Movement Modes:**
- **road**: Path found on road network
- **direct**: Direct movement (humans only)

**Stop Movement:**
```javascript
// DELETE /api/ground-units/:id/move
```

### Path Validation

```javascript
// POST /api/ground-units/check-path
{
  "startLat": 59.3293,
  "startLng": 18.0686,
  "endLat": 59.3350,
  "endLng": 18.0750,
  "unitType": "humans"
}
```

---

## Naval Units

### Overview

Naval units are water-based vessels that can only operate within defined water areas.

### Unit Types

| Type | Icon | Speed | Description |
|------|------|-------|-------------|
| fast-boat | 🚤 | 80 km/h | Quick reconnaissance |
| battleship | 🚢 | 45 km/h | Heavily armed |
| aircraft-carrier | 🛥️ | 55 km/h | Mobile airbase |

### Naval Unit Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |
| type | string | Unit type |
| lat | number | Latitude |
| lng | number | Longitude |
| speed | number | Speed in km/h |
| status | string | "idle", "moving", "warning" |
| battery | number | Battery level |
| hubId | string|null | Assigned hub |
| currentPath | number[][] | Path coordinates |
| pathIndex | number | Current waypoint index |
| updatedAt | string | Last update |

### Creating Naval Units

```javascript
// POST /api/naval-units
{
  "name": "Patrol Boat",
  "type": "fast-boat",
  "lat": 59.3200,
  "lng": 18.0800,
  "hubId": "hub-1"
}
```

**Requirements:**
- Position must be within a water area
- Returns error if not on water

### Moving Naval Units

```javascript
// POST /api/naval-units/:id/move
{
  "targetLat": 59.3300,
  "targetLng": 18.0900
}
```

**Movement Behavior:**
- Direct movement on water (no pathfinding)
- Both start and end must be in water areas
- Cannot enter no-go zones
- Updates broadcast every second

**Stop Movement:**
```javascript
// DELETE /api/naval-units/:id/move
```

### Path Validation

```javascript
// POST /api/naval-units/check-path
{
  "startLat": 59.3200,
  "startLng": 18.0800,
  "endLat": 59.3300,
  "endLng": 18.0900
}
```

---

## Road Network & Pathfinding

### Overview

The road network defines drivable paths for ground units. Different unit types have access to different road types.

### Road Types

| Type | Speed Limit | Access |
|------|-------------|--------|
| highway | 100 km/h | All vehicles |
| avenue | 60 km/h | All vehicles except humans |
| street | 50 km/h | All vehicles except humans |
| residential | 30 km/h | All vehicles except humans |
| footpath | 10 km/h | Humans only |
| sidewalk | 5 km/h | Humans only |
| trail | 15 km/h | Humans only |

### Unit Access Rules

```javascript
const UNIT_PATH_RULES = {
  humans: ['highway', 'street', 'residential', 'avenue', 'footpath', 'sidewalk', 'trail'],
  ifv:    ['highway', 'street', 'residential'],
  tank:   ['highway', 'street', 'residential'],
  truck:  ['highway', 'street', 'residential', 'avenue']
};
```

### Creating Roads

```javascript
// POST /api/roads
{
  "name": "Main Street",
  "type": "street",
  "coordinates": [[59.3293, 18.0686], [59.3295, 18.0690]],
  "speedLimit": 50
}
```

### Pathfinding Algorithm

**A* Algorithm:**
1. Find nearest road for start position
2. Find nearest road for end position
3. Build road graph from road network
4. Run A* search considering:
   - Distance between nodes
   - Unit type road access
   - Heuristic (straight-line distance)
5. Return path if found

**Graph Construction:**
- Nodes at road endpoints and intersections
- Edges between connected road segments
- Edge weight = distance
- Edge property = road type

### Walkable Paths

Separate from roads, for human movement:

```javascript
// POST /api/walkable-paths
{
  "name": "Park Trail",
  "type": "trail",
  "coordinates": [[59.3293, 18.0686], [59.3295, 18.0690]]
}
```

---

## No-Go Zones

### Overview

No-go zones are restricted areas where units cannot enter. They are enforced during movement and simulation.

### No-Go Zone Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |
| coordinates | number[][] | Polygon coordinates |
| ruleset | string | Restriction description |
| createdAt | string | Creation timestamp |

### Creating No-Go Zones

```javascript
// POST /api/no-go-zones
{
  "name": "Restricted Area",
  "coordinates": [
    [59.3300, 18.0700],
    [59.3350, 18.0700],
    [59.3350, 18.0800],
    [59.3300, 18.0800]
  ],
  "ruleset": "FORBIDDEN: Drones are not allowed."
}
```

**Requirements:**
- Minimum 3 coordinates (polygon)
- Coordinates in [lat, lng] format

### Enforcement

**Drones:**
- Simulation stops before entering
- Path intersection checked before movement
- Status set to "warning" if blocked

**Ground Units:**
- Pathfinding avoids no-go zones
- Movement stops if destination in zone
- Status set to "warning" if blocked

**Naval Units:**
- Cannot move to destination in zone
- Movement stops if path enters zone
- Status set to "warning" if blocked

### Path Collision Detection

```javascript
// POST /api/no-go-zones/check-path
{
  "startLat": 59.3293,
  "startLng": 18.0686,
  "endLat": 59.3350,
  "endLng": 18.0750
}
```

**Algorithm:**
- Ray casting for point-in-polygon
- Line segment intersection for path crossing
- Checks both endpoints and edges

---

## Water Areas

### Overview

Water areas define regions where naval units can operate. Naval units can only be created and moved within these areas.

### Water Area Properties

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |
| coordinates | number[][] | Polygon coordinates |
| createdAt | string | Creation timestamp |

### Creating Water Areas

```javascript
// POST /api/water-areas
{
  "name": "Lake Vänern",
  "coordinates": [
    [59.3200, 18.0800],
    [59.3300, 18.0800],
    [59.3300, 18.1000],
    [59.3200, 18.1000]
  ]
}
```

### Point-in-Water Check

```javascript
// POST /api/water-areas/check-point
{ "lat": 59.3250, "lng": 18.0900 }
```

### Usage

**Naval Unit Creation:**
- Position must be in water area
- Returns error if not

**Naval Unit Movement:**
- Both start and end must be in water
- Returns error if either is not

---

## Waypoints

### Overview

Waypoints are reference points that can be used for missions, navigation, and organization.

### Waypoint Types

| Type | Description | Coordinates Source |
|------|-------------|-------------------|
| hub | Reference to hub | From hub location |
| drone | Reference to drone | From drone location |
| ground-unit | Reference to ground unit | From unit location |
| naval-unit | Reference to naval unit | From unit location |
| coordinates | Static coordinates | Provided directly |

### Creating Waypoints

**Entity-based:**
```javascript
// POST /api/waypoints
{
  "name": "Base Checkpoint",
  "type": "hub",
  "entityId": "hub-1"
}
```

**Coordinate-based:**
```javascript
// POST /api/waypoints
{
  "name": "Target Point",
  "type": "coordinates",
  "lat": 59.3293,
  "lng": 18.0686
}
```

### Waypoint Usage

**In Missions:**
- Set as mission target
- Used for auto-completion conditions
- Fleet navigates to waypoint

**As References:**
- Quick navigation points
- Mission planning markers
- Coordinate sharing

---

## Real-time Updates

### Overview

All changes are broadcast to connected clients via Server-Sent Events (SSE).

### SSE Connection

```javascript
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'snapshot':
      // Initialize with full state
      break;
    case 'drone:update':
      // Update drone
      break;
    // ... handle other types
  }
});
```

### Event Types

| Type | Description |
|------|-------------|
| snapshot | Initial full state on connect |
| drone:update | Drone position/status changed |
| drone:remove | Drone deleted |
| hub:update | Hub created/updated |
| hub:remove | Hub deleted |
| fleet:update | Fleet changed |
| fleet:remove | Fleet deleted |
| mission:update | Mission changed |
| mission:remove | Mission deleted |
| groundunit:update | Ground unit changed |
| groundunit:remove | Ground unit deleted |
| groundunit:blocked | Ground unit blocked by no-go zone |
| navalunit:update | Naval unit changed |
| navalunit:remove | Naval unit deleted |
| navalunit:blocked | Naval unit blocked by no-go zone |
| road:update | Road created/updated |
| road:remove | Road deleted |
| path:update | Walkable path created/updated |
| path:remove | Path deleted |
| nogozone:update | No-go zone changed |
| nogozone:remove | No-go zone deleted |
| waterarea:update | Water area changed |
| waterarea:remove | Water area deleted |
| waypoint:update | Waypoint created/updated |
| waypoint:remove | Waypoint deleted |
| simulation:blocked | Drone simulation blocked |
| simulation:end | Drone simulation ended |

---

## State Persistence

### Overview

Users can save and load application states. This is useful for preserving configurations and scenarios.

### Saving State

```javascript
// POST /api/states
Authorization: Bearer <token>
{
  "state_data": {
    "drones": [...],
    "hubs": [...],
    // Full application state
  },
  "name": "My Scenario"
}
```

### Loading State

```javascript
// POST /api/states/:id/load
Authorization: Bearer <token>
```

### State Management

```javascript
// GET /api/states - List saved states
// GET /api/states/:id - Get state details
// DELETE /api/states/:id - Delete state
```

---

*Last updated: 2024*