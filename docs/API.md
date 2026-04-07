# 📡 API Reference

Complete API reference for the Drone Head application. All endpoints require authentication except where noted.

## Table of Contents

- [Base URL](#base-url)
- [Authentication](#authentication)
- [Response Formats](#response-formats)
- [Endpoints](#endpoints)
  - [Authentication](#authentication-endpoints)
  - [Drones](#drones)
  - [Hubs](#hubs)
  - [Fleets](#fleets)
  - [Missions](#missions)
  - [Ground Units](#ground-units)
  - [Radio Towers](#radio-towers)
  - [Naval Units](#naval-units)
  - [Roads](#roads)
  - [Walkable Paths](#walkable-paths)
  - [No-Go Zones](#no-go-zones)
  - [Water Areas](#water-areas)
  - [Waypoints](#waypoints)
  - [Real-time Events](#real-time-events)

---

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

All endpoints (except `/api/auth/*`) require a valid JWT token.

### Authorization Header
```
Authorization: Bearer <token>
```

### Token Obtention
Tokens are returned from login/register endpoints and stored in localStorage.

---

## Response Formats

### Success Response
```json
{
  "id": 123,
  "name": "Example",
  ...
}
```

### Error Response
```json
{
  "error": "Error message"
}
```

### Common HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |

---

## Authentication Endpoints

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

Response:
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "string",
    "isAdmin": false
  }
}
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

Response: Same as register

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

Response:
```json
{
  "user": {
    "id": 1,
    "username": "string",
    "isAdmin": false
  }
}
```

### Get Profile
```http
GET /api/auth/me/profile
Authorization: Bearer <token>
```

### Update Profile
```http
PUT /api/auth/me/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "string",
  "email": "string"
}
```

### Change Password
```http
PUT /api/auth/me/password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "string",
  "newPassword": "string"
}
```

### Delete User Account
```http
DELETE /api/auth/user
Authorization: Bearer <token>
```

---

## Drones

### List All Drones
```http
GET /api/drones
Authorization: Bearer <token>
```

Response:
```json
[
  {
    "id": 1,
    "name": "Drone-1",
    "lat": 59.3293,
    "lng": 18.0686,
    "altitude": 100,
    "speed": 50,
    "status": "active",
    "battery": 85,
    "hubId": 1,
    "userId": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Get Drone by ID
```http
GET /api/drones/:id
Authorization: Bearer <token>
```

### Create/Update Drone Location
```http
POST /api/drones/:id/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "lat": 59.3293,
  "lng": 18.0686,
  "name": "Optional Name",
  "altitude": 100,
  "speed": 50,
  "status": "active",
  "battery": 85
}
```

### Assign Drone to Hub
```http
POST /api/drones/:id/assign-hub
Authorization: Bearer <token>
Content-Type: application/json

{
  "hubId": 1
}
```

### Remove Drone from Hub
```http
DELETE /api/drones/:id/assign-hub
Authorization: Bearer <token>
```

### Start Drone Simulation
```http
POST /api/drones/:id/simulate
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetLat": 59.3300,
  "targetLng": 18.0700,
  "speed": 50
}
```

### Stop Drone Simulation
```http
DELETE /api/drones/:id/simulate
Authorization: Bearer <token>
```

### Delete Drone
```http
DELETE /api/drones/:id
Authorization: Bearer <token>
```

---

## Hubs

### List All Hubs
```http
GET /api/hubs
Authorization: Bearer <token>
```

### Create Hub
```http
POST /api/hubs
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Base Alpha",
  "lat": 59.3293,
  "lng": 18.0686
}
```

### Update Hub
```http
PATCH /api/hubs/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Base Bravo"
}
```

### Delete Hub
```http
DELETE /api/hubs/:id
Authorization: Bearer <token>
```

---

## Fleets

### List Fleets for Hub
```http
GET /api/hubs/:hubId/fleets
Authorization: Bearer <token>
```

### Create Fleet
```http
POST /api/hubs/:hubId/fleets
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Fleet Alpha"
}
```

### Delete Fleet
```http
DELETE /api/hubs/:hubId/fleets/:fleetId
Authorization: Bearer <token>
```

---

## Missions

### List Missions for Hub
```http
GET /api/hubs/:hubId/missions
Authorization: Bearer <token>
```

### Create Mission
```http
POST /api/hubs/:hubId/missions
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Reconnaissance Mission",
  "type": "recon",
  "requiredDrones": 2,
  "priority": 50,
  "waypointId": 1,
  "endCondition": "manual",
  "endConditionValue": null
}
```

End Conditions:
- `manual` - Manual completion
- `arrival` - On waypoint arrival
- `drone_reached` - When specific drone reaches
- `time_elapsed` - After duration
- `fleet_idle` - When fleet goes idle

### Delete Mission
```http
DELETE /api/hubs/:hubId/missions/:missionId
Authorization: Bearer <token>
```

### Complete Mission
```http
POST /api/hubs/:hubId/missions/:missionId/complete
Authorization: Bearer <token>
```

---

## Ground Units

### List All Ground Units
```http
GET /api/ground-units
Authorization: Bearer <token>
```

### Create Ground Unit
```http
POST /api/ground-units
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Unit Alpha",
  "type": "humans",
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": 1,
  "speed": 70,
  "battery": 100
}
```

Types: `humans`, `ifv`, `tank`, `truck`

### Update Ground Unit Location
```http
POST /api/ground-units/:id/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "lat": 59.3300,
  "lng": 18.0700
}
```

### Move Ground Unit
```http
POST /api/ground-units/:id/move
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetLat": 59.3300,
  "targetLng": 18.0700
}
```

### Stop Ground Unit Movement
```http
DELETE /api/ground-units/:id/move
Authorization: Bearer <token>
```

### Delete Ground Unit
```http
DELETE /api/ground-units/:id
Authorization: Bearer <token>
```

---

## Radio Towers

Radio towers are ground units with `is_radio_tower` flag set.

### Get Radio Towers
```http
GET /api/ground-units?radioTowers=true
Authorization: Bearer <token>
```

### Update Radio Tower Settings
```http
PATCH /api/ground-units/:id/radio
Authorization: Bearer <token>
Content-Type: application/json

{
  "radioRangeMeters": 5000,
  "radioEffects": {
    "jamming": true,
    "detection": true
  },
  "radioActive": true
}
```

### Toggle Radio Tower
```http
POST /api/ground-units/:id/radio/toggle
Authorization: Bearer <token>
```

---

## Naval Units

### List All Naval Units
```http
GET /api/naval-units
Authorization: Bearer <token>
```

### Create Naval Unit
```http
POST /api/naval-units
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Ship Alpha",
  "type": "fast-boat",
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": 1,
  "speed": 80,
  "battery": 100
}
```

Types: `fast-boat`, `battleship`, `aircraft-carrier`

### Update Naval Unit Location
```http
POST /api/naval-units/:id/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "lat": 59.3300,
  "lng": 18.0700
}
```

### Move Naval Unit
```http
POST /api/naval-units/:id/move
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetLat": 59.3300,
  "targetLng": 18.0700
}
```

### Stop Naval Unit Movement
```http
DELETE /api/naval-units/:id/move
Authorization: Bearer <token>
```

### Delete Naval Unit
```http
DELETE /api/naval-units/:id
Authorization: Bearer <token>
```

---

## Roads

### List All Roads
```http
GET /api/roads
Authorization: Bearer <token>
```

### Create Road
```http
POST /api/roads
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Main Street",
  "type": "street",
  "coordinates": [[59.3293, 18.0686], [59.3300, 18.0700]],
  "speedLimit": 50
}
```

Types: `street`, `highway`, `footpath`

### Update Road
```http
PATCH /api/roads/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name",
  "type": "highway",
  "coordinates": [...],
  "speedLimit": 80
}
```

### Delete Road
```http
DELETE /api/roads/:id
Authorization: Bearer <token>
```

---

## Walkable Paths

### List All Walkable Paths
```http
GET /api/walkable-paths
Authorization: Bearer <token>
```

### Create Walkable Path
```http
POST /api/walkable-paths
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Footpath A",
  "type": "footpath",
  "coordinates": [[59.3293, 18.0686], [59.3300, 18.0700]]
}
```

### Update Walkable Path
```http
PATCH /api/walkable-paths/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name",
  "type": "trail",
  "coordinates": [...]
}
```

### Delete Walkable Path
```http
DELETE /api/walkable-paths/:id
Authorization: Bearer <token>
```

---

## No-Go Zones

### List All No-Go Zones
```http
GET /api/no-go-zones
Authorization: Bearer <token>
```

### Create No-Go Zone
```http
POST /api/no-go-zones
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Restricted Area",
  "coordinates": [[59.3293, 18.0686], [59.3300, 18.0686], [59.3300, 18.0700], [59.3293, 18.0700]],
  "ruleset": "FORBIDDEN: Drones are not allowed to enter this area."
}
```

### Update No-Go Zone
```http
PATCH /api/no-go-zones/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name",
  "coordinates": [...],
  "ruleset": "..."
}
```

### Delete No-Go Zone
```http
DELETE /api/no-go-zones/:id
Authorization: Bearer <token>
```

---

## Water Areas

### List All Water Areas
```http
GET /api/water-areas
Authorization: Bearer <token>
```

### Create Water Area
```http
POST /api/water-areas
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Lake Area",
  "coordinates": [[59.3293, 18.0686], [59.3300, 18.0686], [59.3300, 18.0700], [59.3293, 18.0700]]
}
```

### Update Water Area
```http
PATCH /api/water-areas/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name",
  "coordinates": [...]
}
```

### Delete Water Area
```http
DELETE /api/water-areas/:id
Authorization: Bearer <token>
```

---

## Waypoints

### List All Waypoints
```http
GET /api/waypoints
Authorization: Bearer <token>
```

### Create Waypoint
```http
POST /api/waypoints
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Checkpoint A",
  "type": "coordinates",
  "entityId": null,
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": 1
}
```

Types: `hub`, `drone`, `ground-unit`, `naval-unit`, `coordinates`

### Update Waypoint
```http
PATCH /api/waypoints/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name",
  "lat": 59.3300,
  "lng": 18.0700
}
```

### Delete Waypoint
```http
DELETE /api/waypoints/:id
Authorization: Bearer <token>
```

---

## Real-time Events

### Server-Sent Events Stream
```http
GET /api/events
Authorization: Bearer <token>
```

This endpoint establishes an SSE connection that sends real-time updates.

### Event Types

#### Snapshot (on connect)
```json
{
  "type": "snapshot",
  "drones": [...],
  "hubs": [...],
  "fleets": [...],
  "missions": [...],
  "groundUnits": [...],
  "navalUnits": [...],
  "roads": [...],
  "paths": [...],
  "noGoZones": [...],
  "waterAreas": [...],
  "waypoints": [...]
}
```

#### Update Events
```json
{
  "type": "drone:update",
  "drone": {...}
}

{
  "type": "hub:update",
  "hub": {...}
}

{
  "type": "fleet:update",
  "fleet": {...}
}

{
  "type": "mission:update",
  "mission": {...}
}

{
  "type": "groundunit:update",
  "groundUnit": {...}
}

{
  "type": "navalunit:update",
  "navalUnit": {...}
}
```

#### Remove Events
```json
{
  "type": "drone:remove",
  "id": "1"
}
```

#### Simulation Events
```json
{
  "type": "simulation:blocked",
  "droneId": "1",
  "zone": {...},
  "reason": "path"
}

{
  "type": "simulation:end",
  "droneId": "1"
}
```

---

*Last updated: 2026-04*