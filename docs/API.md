# 📡 API Reference

Complete API reference for the Drone Head backend server.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Development Mode

When `DEVELOPMENT_MODE` is set to `true` or `develop`, authentication is bypassed.

---

## Table of Contents

- [Authentication](#authentication)
- [State Management](#state-management)
- [Drone Operations](#drone-operations)
- [Hub Operations](#hub-operations)
- [Fleet Operations](#fleet-operations)
- [Mission Operations](#mission-operations)
- [Ground Unit Operations](#ground-unit-operations)
- [Naval Unit Operations](#naval-unit-operations)
- [Road & Path Operations](#road--path-operations)
- [Zone & Area Operations](#zone--area-operations)
- [Waypoint Operations](#waypoint-operations)
- [Real-time Events](#real-time-events)

---

## Authentication

### Register User

```http
POST /api/auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:** `201 Created`
```json
{
  "message": "User created successfully",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "string"
  }
}
```

**Errors:**
- `400` - Username/password required, username < 3 chars, password < 6 chars
- `409` - Username already exists

---

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:** `200 OK`
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "string"
  }
}
```

**Errors:**
- `400` - Credentials required
- `401` - Invalid credentials

---

### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "username": "string"
  }
}
```

---

### Get User Profile

```http
GET /api/auth/me/profile
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "username": "string",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "profile": {
    "id": 1,
    "display_name": "string",
    "email": "string@example.com",
    "preferences": {},
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Update Profile

```http
PUT /api/auth/me/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "display_name": "string",
  "email": "string@example.com",
  "preferences": {}
}
```

**Response:** `200 OK`
```json
{
  "message": "Profile updated successfully",
  "profile": { ... }
}
```

---

### Change Password

```http
PUT /api/auth/me/password
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "current_password": "string",
  "new_password": "string"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password changed successfully"
}
```

**Errors:**
- `401` - Current password incorrect
- `400` - Password < 6 chars

---

### Delete Account

```http
DELETE /api/auth/user
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Account deleted successfully"
}
```

---

### List Users (Admin)

```http
GET /api/auth/users
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "users": [
    {
      "id": 1,
      "username": "string",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Delete User (Admin)

```http
DELETE /api/auth/users/:id
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "User deleted successfully"
}
```

---

## State Management

### Save State

```http
POST /api/states
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "state_data": {},
  "name": "My Saved State"
}
```

**Response:** `201 Created`
```json
{
  "message": "State saved successfully",
  "state": {
    "id": 1,
    "name": "My Saved State"
  }
}
```

---

### List States

```http
GET /api/states
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "states": [
    {
      "id": 1,
      "name": "My Saved State",
      "saved_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Get State

```http
GET /api/states/:id
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "state": {
    "id": 1,
    "name": "My Saved State",
    "saved_at": "2024-01-01T00:00:00.000Z",
    "state_data": {}
  }
}
```

---

### Load State

```http
POST /api/states/:id/load
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "State loaded successfully",
  "state_data": {}
}
```

---

### Delete State

```http
DELETE /api/states/:id
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "State deleted successfully"
}
```

---

## Drone Operations

### List All Drones

```http
GET /api/drones
```

**Response:** `200 OK`
```json
[
  {
    "id": "drone-1",
    "name": "Alpha-1",
    "lat": 59.3293,
    "lng": 18.0686,
    "altitude": 150,
    "speed": 18,
    "status": "active",
    "battery": 75,
    "hubId": "hub-1",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Get Drone

```http
GET /api/drones/:id
```

**Response:** `200 OK` - Drone object

---

### Get Drone with Relations

```http
GET /api/drones/:id/with-relations
```

**Response:** `200 OK`
```json
{
  "id": "drone-1",
  "name": "Alpha-1",
  "lat": 59.3293,
  "lng": 18.0686,
  "altitude": 150,
  "speed": 18,
  "status": "active",
  "battery": 75,
  "hubId": "hub-1",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "hub": {
    "id": "hub-1",
    "name": "Base Alpha",
    "lat": 59.3293,
    "lng": 18.0686
  },
  "fleet": {
    "id": "fleet-1",
    "name": "Fleet Alpha",
    "hubId": "hub-1",
    "status": "idle"
  }
}
```

---

### Get Unassigned Drones

```http
GET /api/drones/unassigned
```

**Response:** `200 OK` - Array of drones without hubId

---

### Update Drone Location

```http
POST /api/drones/:id/location
Content-Type: application/json
```

**Request Body:**
```json
{
  "lat": 59.3293,
  "lng": 18.0686,
  "altitude": 150,
  "speed": 18,
  "status": "active",
  "battery": 75,
  "name": "Alpha-1",
  "hubId": "hub-1"
}
```

**Response:** `200 OK` - Updated drone object

**Notes:**
- Only provided fields are updated
- Missing fields keep existing values or use defaults

---

### Assign Drone to Hub

```http
POST /api/drones/:id/assign-hub
Content-Type: application/json
```

**Request Body:**
```json
{
  "hubId": "hub-1"
}
```

**Response:** `200 OK` - Updated drone object

**Notes:**
- Drone is automatically added to a fleet via round-robin
- If drone is in a fleet of a different hub, unassign first

---

### Unassign Drone from Hub

```http
DELETE /api/drones/:id/assign-hub
```

**Response:** `200 OK` - Updated drone object

**Notes:**
- Removes drone from any fleet

---

### Start Drone Simulation

```http
POST /api/drones/:id/simulate
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetLat": 59.3350,
  "targetLng": 18.0750,
  "speed": 20
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "simulation": {
    "droneId": "drone-1",
    "target": {
      "lat": 59.3350,
      "lng": 18.0750
    },
    "speed": 20
  }
}
```

**Notes:**
- Drone moves towards target at specified speed
- Simulation stops if drone enters no-go zone
- Updates broadcast every 500ms

---

### Stop Drone Simulation

```http
DELETE /api/drones/:id/simulate
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Delete Drone

```http
DELETE /api/drones/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

## Hub Operations

### List All Hubs

```http
GET /api/hubs
```

**Response:** `200 OK`
```json
[
  {
    "id": "hub-1",
    "name": "Base Alpha",
    "lat": 59.3293,
    "lng": 18.0686,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create Hub

```http
POST /api/hubs
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Base Alpha",
  "lat": 59.3293,
  "lng": 18.0686
}
```

**Response:** `201 Created` - Created hub object

---

### Get Hub

```http
GET /api/hubs/:id
```

**Response:** `200 OK` - Hub object

---

### Update Hub

```http
PATCH /api/hubs/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Base Name"
}
```

**Response:** `200 OK` - Updated hub object

---

### Delete Hub

```http
DELETE /api/hubs/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Notes:**
- Deletes all fleets and missions in the hub
- Unassigns all drones from the hub

---

### Get Drones in Hub

```http
GET /api/hubs/:hubId/drones
```

**Response:** `200 OK` - Array of drones

---

### Get Ground Units in Hub

```http
GET /api/hubs/:hubId/ground-units
```

**Response:** `200 OK` - Array of ground units

---

### Get Naval Units in Hub

```http
GET /api/hubs/:hubId/naval-units
```

**Response:** `200 OK` - Array of naval units

---

### Get Waypoints for Hub

```http
GET /api/hubs/:hubId/waypoints
```

**Response:** `200 OK` - Array of waypoints

---

## Fleet Operations

### List Fleets for Hub

```http
GET /api/hubs/:hubId/fleets
```

**Response:** `200 OK`
```json
[
  {
    "id": "fleet-1",
    "hubId": "hub-1",
    "name": "Fleet Alpha",
    "droneIds": ["drone-1", "drone-2"],
    "status": "idle",
    "currentMissionId": null,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create Fleet

```http
POST /api/hubs/:hubId/fleets
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Fleet Alpha"
}
```

**Response:** `201 Created` - Created fleet object

---

### Delete Fleet

```http
DELETE /api/hubs/:hubId/fleets/:fleetId
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Add Drone to Fleet

```http
POST /api/hubs/:hubId/fleets/:fleetId/drones
Content-Type: application/json
```

**Request Body:**
```json
{
  "droneId": "drone-1"
}
```

**Response:** `200 OK` - Updated fleet object

**Notes:**
- Drone is auto-assigned to hub if not already assigned
- Returns error if drone belongs to different hub

---

### Remove Drone from Fleet

```http
DELETE /api/hubs/:hubId/fleets/:fleetId/drones/:droneId
```

**Response:** `200 OK` - Updated fleet object

---

## Mission Operations

### List Missions for Hub

```http
GET /api/hubs/:hubId/missions
```

**Response:** `200 OK` - Array of missions sorted by priority

---

### Create Mission

```http
POST /api/hubs/:hubId/missions
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Recon Mission",
  "type": "surveillance",
  "requiredDrones": 2,
  "priority": 10,
  "waypointId": "waypoint-1",
  "endCondition": "arrival",
  "endConditionValue": null
}
```

**Fields:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| title | string | Yes | - | Mission title |
| type | string | No | general | Mission type |
| requiredDrones | number | No | 1 | Minimum drones needed |
| priority | number | No | 100 | Lower = higher priority |
| waypointId | string | No | null | Target waypoint |
| endCondition | string | No | manual | Auto-complete condition |

**End Conditions:**
- `manual` - Manual completion only
- `arrival` - Complete when all drones reach waypoint
- `drone_reached` - Complete when any drone reaches waypoint
- `time_elapsed` - Complete after endConditionValue seconds
- `fleet_idle` - Complete when fleet returns to idle

**Response:** `201 Created` - Created mission object

---

### Delete Mission

```http
DELETE /api/hubs/:hubId/missions/:missionId
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Notes:**
- Frees assigned fleet if active

---

### Complete Mission

```http
POST /api/hubs/:hubId/missions/:missionId/complete
```

**Response:** `200 OK` - Updated mission object

**Notes:**
- Frees assigned fleet
- Sets mission status to 'done'

---

## Ground Unit Operations

### List All Ground Units

```http
GET /api/ground-units
```

**Response:** `200 OK`
```json
[
  {
    "id": "ground-1",
    "name": "Scout Team",
    "type": "humans",
    "lat": 59.3293,
    "lng": 18.0686,
    "speed": 5,
    "status": "idle",
    "battery": 100,
    "hubId": "hub-1",
    "onRoad": true,
    "currentPath": [],
    "pathIndex": 0,
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create Ground Unit

```http
POST /api/ground-units
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Scout Team",
  "type": "humans",
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": "hub-1",
  "speed": 5,
  "battery": 100
}
```

**Unit Types:**
| Type | Description | Default Speed |
|------|-------------|---------------|
| humans | Infantry | 5 km/h |
| ifv | Infantry Fighting Vehicle | 60 km/h |
| tank | Tank | 40 km/h |
| truck | Truck | 70 km/h |

**Response:** `201 Created` - Created ground unit object

---

### Get Ground Unit

```http
GET /api/ground-units/:id
```

**Response:** `200 OK` - Ground unit object

---

### Update Ground Unit Location

```http
POST /api/ground-units/:id/location
Content-Type: application/json
```

**Request Body:**
```json
{
  "lat": 59.3293,
  "lng": 18.0686,
  "speed": 5,
  "status": "idle",
  "battery": 100,
  "name": "Scout Team",
  "hubId": "hub-1"
}
```

**Response:** `200 OK` - Updated ground unit object

---

### Move Ground Unit (with Pathfinding)

```http
POST /api/ground-units/:id/move
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetLat": 59.3350,
  "targetLng": 18.0750
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "path": [[59.3293, 18.0686], [...], [59.3350, 18.0750]],
  "mode": "road"
}
```

**Modes:**
- `road` - Path found on road network
- `direct` - Direct movement (humans only, off-road)

**Errors:**
- `400` - No valid path found (non-human units must use roads)
- `400` - Destination in no-go zone

**Notes:**
- Uses A* algorithm on road network
- Humans can move off-road directly
- Other units require road connectivity

---

### Stop Ground Unit Movement

```http
DELETE /api/ground-units/:id/move
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Delete Ground Unit

```http
DELETE /api/ground-units/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Check Path Validity

```http
POST /api/ground-units/check-path
Content-Type: application/json
```

**Request Body:**
```json
{
  "startLat": 59.3293,
  "startLng": 18.0686,
  "endLat": 59.3350,
  "endLng": 18.0750,
  "unitType": "humans"
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "path": [[59.3293, 18.0686], [59.3350, 18.0750]],
  "mode": "road"
}
```

---

## Naval Unit Operations

### List All Naval Units

```http
GET /api/naval-units
```

**Response:** `200 OK`
```json
[
  {
    "id": "naval-1",
    "name": "Patrol Boat",
    "type": "fast-boat",
    "lat": 59.3200,
    "lng": 18.0800,
    "speed": 80,
    "status": "idle",
    "battery": 100,
    "hubId": "hub-1",
    "currentPath": [],
    "pathIndex": 0,
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create Naval Unit

```http
POST /api/naval-units
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Patrol Boat",
  "type": "fast-boat",
  "lat": 59.3200,
  "lng": 18.0800,
  "hubId": "hub-1",
  "speed": 80,
  "battery": 100
}
```

**Unit Types:**
| Type | Description | Default Speed |
|------|-------------|---------------|
| fast-boat | Quick reconnaissance vessel | 80 km/h |
| battleship | Heavily armed warship | 45 km/h |
| aircraft-carrier | Mobile airbase | 55 km/h |

**Response:** `201 Created` - Created naval unit object

**Errors:**
- `400` - Position not on water area

---

### Get Naval Unit

```http
GET /api/naval-units/:id
```

**Response:** `200 OK` - Naval unit object

---

### Update Naval Unit Location

```http
POST /api/naval-units/:id/location
Content-Type: application/json
```

**Request Body:**
```json
{
  "lat": 59.3200,
  "lng": 18.0800,
  "speed": 80,
  "status": "idle",
  "battery": 100,
  "name": "Patrol Boat",
  "hubId": "hub-1"
}
```

**Response:** `200 OK` - Updated naval unit object

---

### Move Naval Unit

```http
POST /api/naval-units/:id/move
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetLat": 59.3300,
  "targetLng": 18.0900
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "path": [[59.3200, 18.0800], [59.3300, 18.0900]],
  "mode": "water"
}
```

**Errors:**
- `400` - Start or end position not on water
- `400` - Destination in no-go zone

**Notes:**
- Direct movement on water (no pathfinding)
- Both start and end must be in water areas

---

### Stop Naval Unit Movement

```http
DELETE /api/naval-units/:id/move
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Delete Naval Unit

```http
DELETE /api/naval-units/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Check Naval Unit Path

```http
POST /api/naval-units/check-path
Content-Type: application/json
```

**Request Body:**
```json
{
  "startLat": 59.3200,
  "startLng": 18.0800,
  "endLat": 59.3300,
  "endLng": 18.0900
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "path": [[59.3200, 18.0800], [59.3300, 18.0900]],
  "mode": "water"
}
```

---

## Road & Path Operations

### List All Roads

```http
GET /api/roads
```

**Response:** `200 OK`
```json
[
  {
    "id": "road-1",
    "name": "Main Street",
    "type": "street",
    "coordinates": [[59.3293, 18.0686], [59.3295, 18.0690]],
    "speedLimit": 50,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create Road

```http
POST /api/roads
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Main Street",
  "type": "street",
  "coordinates": [[59.3293, 18.0686], [59.3295, 18.0690]],
  "speedLimit": 50
}
```

**Road Types:**
| Type | Description | Default Speed |
|------|-------------|---------------|
| highway | Highway | 100 km/h |
| street | Street | 50 km/h |
| residential | Residential road | 30 km/h |
| avenue | Avenue | 60 km/h |
| footpath | Footpath | 10 km/h |
| sidewalk | Sidewalk | 5 km/h |
| trail | Trail | 15 km/h |

**Response:** `201 Created` - Created road object

---

### Update Road

```http
PATCH /api/roads/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "type": "avenue",
  "coordinates": [[59.3293, 18.0686], [59.3300, 18.0700]],
  "speedLimit": 60
}
```

**Response:** `200 OK` - Updated road object

---

### Delete Road

```http
DELETE /api/roads/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### List All Walkable Paths

```http
GET /api/walkable-paths
```

**Response:** `200 OK` - Array of paths

---

### Create Walkable Path

```http
POST /api/walkable-paths
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Park Trail",
  "type": "trail",
  "coordinates": [[59.3293, 18.0686], [59.3295, 18.0690]]
}
```

**Path Types:**
- `footpath`
- `sidewalk`
- `trail`
- `bike-path`

**Response:** `201 Created` - Created path object

---

### Update Walkable Path

```http
PATCH /api/walkable-paths/:id
Content-Type: application/json
```

**Response:** `200 OK` - Updated path object

---

### Delete Walkable Path

```http
DELETE /api/walkable-paths/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

## Zone & Area Operations

### List All No-Go Zones

```http
GET /api/no-go-zones
```

**Response:** `200 OK`
```json
[
  {
    "id": "nogo-1",
    "name": "Restricted Area",
    "coordinates": [[59.3300, 18.0700], [59.3350, 18.0700], [59.3350, 18.0800], [59.3300, 18.0800]],
    "ruleset": "FORBIDDEN: Drones are not allowed to enter this area.",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### Create No-Go Zone

```http
POST /api/no-go-zones
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Restricted Area",
  "coordinates": [[59.3300, 18.0700], [59.3350, 18.0700], [59.3350, 18.0800], [59.3300, 18.0800]],
  "ruleset": "FORBIDDEN: Drones are not allowed."
}
```

**Notes:**
- Minimum 3 coordinates required (polygon)
- Coordinates in [lat, lng] format

**Response:** `201 Created` - Created no-go zone object

---

### Update No-Go Zone

```http
PATCH /api/no-go-zones/:id
Content-Type: application/json
```

**Response:** `200 OK` - Updated no-go zone object

---

### Delete No-Go Zone

```http
DELETE /api/no-go-zones/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Check Flight Path Against No-Go Zones

```http
POST /api/no-go-zones/check-path
Content-Type: application/json
```

**Request Body:**
```json
{
  "startLat": 59.3293,
  "startLng": 18.0686,
  "endLat": 59.3350,
  "endLng": 18.0750
}
```

**Response:** `200 OK`
```json
{
  "blocked": true,
  "zone": { ... }
}
```

or
```json
{
  "blocked": false
}
```

---

### List All Water Areas

```http
GET /api/water-areas
```

**Response:** `200 OK` - Array of water areas

---

### Create Water Area

```http
POST /api/water-areas
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Lake Vänern",
  "coordinates": [[59.3200, 18.0800], [59.3300, 18.0800], [59.3300, 18.1000], [59.3200, 18.1000]]
}
```

**Response:** `201 Created` - Created water area object

---

### Update Water Area

```http
PATCH /api/water-areas/:id
Content-Type: application/json
```

**Response:** `200 OK` - Updated water area object

---

### Delete Water Area

```http
DELETE /api/water-areas/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Check if Point is in Water

```http
POST /api/water-areas/check-point
Content-Type: application/json
```

**Request Body:**
```json
{
  "lat": 59.3250,
  "lng": 18.0900
}
```

**Response:** `200 OK`
```json
{
  "inWater": true,
  "area": { ... }
}
```

or
```json
{
  "inWater": false
}
```

---

## Waypoint Operations

### List All Waypoints

```http
GET /api/waypoints
```

**Response:** `200 OK` - Array of waypoints

---

### Create Waypoint

```http
POST /api/waypoints
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Checkpoint Alpha",
  "type": "coordinates",
  "lat": 59.3293,
  "lng": 18.0686,
  "hubId": "hub-1"
}
```

**Waypoint Types:**
| Type | Description | entityId Required |
|------|-------------|-------------------|
| hub | Reference to hub | Yes |
| drone | Reference to drone | Yes |
| ground-unit | Reference to ground unit | Yes |
| naval-unit | Reference to naval unit | Yes |
| coordinates | Static coordinates | No (use lat/lng) |

**For entity-based waypoints:**
- Coordinates are automatically retrieved from the entity
- Waypoint updates when entity moves (if using entity type)

**Response:** `201 Created` - Created waypoint object

---

### Update Waypoint

```http
PATCH /api/waypoints/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "lat": 59.3300,
  "lng": 18.0700
}
```

**Response:** `200 OK` - Updated waypoint object

---

### Delete Waypoint

```http
DELETE /api/waypoints/:id
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Notes:**
- Unbinds from any missions using this waypoint

---

## Real-time Events

### Server-Sent Events Stream

```http
GET /api/events
```

**Content-Type:** `text/event-stream`

**Connection:** Persistent

**Description:**
Establishes a Server-Sent Events connection for real-time updates.

### Initial Snapshot

On connection, receives a full snapshot of all data:

```
data: {
  "type": "snapshot",
  "drones": [...],
  "hubs": [...],
  "fleets": [...],
  "missions": [...],
  "waypoints": [...],
  "noGoZones": [...],
  "groundUnits": [...],
  "roads": [...],
  "paths": [...],
  "navalUnits": [...],
  "waterAreas": [...]
}
```

### Update Events

Subsequent events for changes:

```
data: {"type": "drone:update", "drone": {...}}
data: {"type": "drone:remove", "id": "drone-1"}
data: {"type": "hub:update", "hub": {...}}
data: {"type": "hub:remove", "id": "hub-1"}
data: {"type": "fleet:update", "fleet": {...}}
data: {"type": "fleet:remove", "id": "fleet-1"}
data: {"type": "mission:update", "mission": {...}}
data: {"type": "mission:remove", "id": "mission-1"}
data: {"type": "groundunit:update", "unit": {...}}
data: {"type": "groundunit:remove", "id": "ground-1"}
data: {"type": "groundunit:blocked", "unitId": "ground-1", "zone": {...}}
data: {"type": "navalunit:update", "unit": {...}}
data: {"type": "navalunit:remove", "id": "naval-1"}
data: {"type": "navalunit:blocked", "unitId": "naval-1", "zone": {...}}
data: {"type": "road:update", "road": {...}}
data: {"type": "road:remove", "id": "road-1"}
data: {"type": "path:update", "path": {...}}
data: {"type": "path:remove", "id": "path-1"}
data: {"type": "nogozone:update", "zone": {...}}
data: {"type": "nogozone:remove", "id": "nogo-1"}
data: {"type": "waterarea:update", "area": {...}}
data: {"type": "waterarea:remove", "id": "water-1"}
data: {"type": "waypoint:update", "waypoint": {...}}
data: {"type": "waypoint:remove", "id": "waypoint-1"}
data: {"type": "simulation:blocked", "droneId": "drone-1", "zone": {...}, "reason": "path"}
data: {"type": "simulation:end", "droneId": "drone-1"}
```

### Frontend Usage

```javascript
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'snapshot':
      // Initialize state
      break;
    case 'drone:update':
      // Update drone in state
      break;
    // ... handle other types
  }
});
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not authenticated) |
| 403 | Forbidden (invalid token) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 500 | Internal Server Error |

---

*Last updated: 2024*