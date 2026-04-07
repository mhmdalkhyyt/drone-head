# 🗄️ Database Schema

This document describes the SQLite database schema used by the Drone Head application. All tables include user-scoped access control via `user_id` foreign keys.

## Table of Contents

- [Overview](#overview)
- [User Tables](#user-tables)
- [Entity Tables](#entity-tables)
- [Infrastructure Tables](#infrastructure-tables)
- [Indexes](#indexes)
- [Migrations](#migrations)

---

## Overview

The database uses SQLite with the following characteristics:
- **User-Scoped**: All entity tables include `user_id` for data isolation
- **Foreign Keys**: Cascade deletes ensure data integrity
- **JSON Fields**: Complex data stored as JSON strings
- **Timestamps**: Automatic `created_at` and `updated_at` fields

### Connection String
```
Database: backend/data/data.db
Driver: better-sqlite3
```

---

## User Tables

### `users`
Core user account information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique user ID |
| `username` | TEXT | UNIQUE NOT NULL | Login username |
| `password_hash` | TEXT | NOT NULL | Bcrypt hashed password |
| `role` | TEXT | DEFAULT 'user' | User role (user/admin) |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Account creation date |

### `user_profiles`
Extended user profile information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique profile ID |
| `user_id` | INTEGER | UNIQUE NOT NULL, FK → users.id | Reference to user |
| `display_name` | TEXT | - | Display name |
| `email` | TEXT | - | Email address |
| `preferences` | TEXT | - | JSON user preferences |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Profile creation date |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Last update date |

### `user_states`
Saved application states for users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique state ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Reference to user |
| `state_data` | TEXT | NOT NULL | JSON serialized state |
| `name` | TEXT | DEFAULT 'Saved State' | State name |
| `saved_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Save timestamp |

---

## Entity Tables

### `drones`
Drone unit tracking and management.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique drone ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Drone name |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `altitude` | REAL | DEFAULT 0 | Altitude in meters |
| `speed` | REAL | DEFAULT 0 | Current speed |
| `status` | TEXT | DEFAULT 'active' | active/idle/warning |
| `battery` | REAL | DEFAULT 100 | Battery percentage |
| `hub_id` | INTEGER | - | Assigned hub |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Last update |

### `hubs`
Base locations for organizing units.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique hub ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Hub name |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `fleets`
Groups of drones assigned to hubs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique fleet ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `hub_id` | INTEGER | NOT NULL, FK → hubs.id | Parent hub |
| `name` | TEXT | NOT NULL | Fleet name |
| `drone_ids` | TEXT | DEFAULT '[]' | JSON array of drone IDs |
| `status` | TEXT | DEFAULT 'idle' | idle/on-mission |
| `current_mission_id` | INTEGER | - | Active mission |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `missions`
Mission definitions and tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique mission ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `hub_id` | INTEGER | NOT NULL, FK → hubs.id | Parent hub |
| `title` | TEXT | NOT NULL | Mission title |
| `type` | TEXT | DEFAULT 'general' | Mission type |
| `required_drones` | INTEGER | DEFAULT 1 | Minimum drones needed |
| `priority` | INTEGER | DEFAULT 100 | Queue priority (lower = higher) |
| `status` | TEXT | DEFAULT 'queued' | queued/active/done |
| `assigned_fleet_id` | INTEGER | - | Assigned fleet |
| `waypoint_id` | INTEGER | - | Target waypoint |
| `end_condition` | TEXT | DEFAULT 'manual' | Completion condition |
| `end_condition_value` | TEXT | - | Condition parameter |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `started_at` | TEXT | - | Start timestamp |
| `completed_at` | TEXT | - | Completion timestamp |

### `ground_units`
Ground unit entities (includes radio towers).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique unit ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Unit name |
| `type` | TEXT | DEFAULT 'truck' | humans/ifv/tank/truck |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `speed` | REAL | DEFAULT 70 | Current speed |
| `status` | TEXT | DEFAULT 'idle' | idle/moving |
| `battery` | REAL | DEFAULT 100 | Battery percentage |
| `hub_id` | INTEGER | - | Assigned hub |
| `on_road` | INTEGER | DEFAULT 0 | On road flag |
| `current_path` | TEXT | DEFAULT '[]' | JSON path coordinates |
| `path_index` | INTEGER | DEFAULT 0 | Current path position |
| `is_radio_tower` | INTEGER | DEFAULT 0 | Radio tower flag |
| `radio_range_meters` | REAL | - | Radio coverage range |
| `radio_effects` | TEXT | - | JSON radio effects |
| `radio_active` | INTEGER | DEFAULT 0 | Radio on/off |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Last update |

### `naval_units`
Naval unit entities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique unit ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Unit name |
| `type` | TEXT | DEFAULT 'fast-boat' | fast-boat/battleship/aircraft-carrier |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `speed` | REAL | DEFAULT 80 | Current speed |
| `status` | TEXT | DEFAULT 'idle' | idle/moving |
| `battery` | REAL | DEFAULT 100 | Battery percentage |
| `hub_id` | INTEGER | - | Assigned hub |
| `current_path` | TEXT | DEFAULT '[]' | JSON path coordinates |
| `path_index` | INTEGER | DEFAULT 0 | Current path position |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Last update |

---

## Infrastructure Tables

### `roads`
Road network definition.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique road ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Road name |
| `type` | TEXT | DEFAULT 'street' | street/highway/footpath |
| `coordinates` | TEXT | NOT NULL | JSON array of [lat,lng] |
| `speed_limit` | REAL | DEFAULT 50 | Speed limit |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `walkable_paths`
Footpaths for human units.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique path ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Path name |
| `type` | TEXT | DEFAULT 'footpath' | Path type |
| `coordinates` | TEXT | NOT NULL | JSON array of [lat,lng] |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `no_go_zones`
Restricted areas.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique zone ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Zone name |
| `coordinates` | TEXT | NOT NULL | JSON polygon coordinates |
| `ruleset` | TEXT | DEFAULT 'FORBIDDEN: ...' | Access rules |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `water_areas`
Water zones for naval units.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique area ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Area name |
| `coordinates` | TEXT | NOT NULL | JSON polygon coordinates |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

### `waypoints`
Navigation waypoints.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique waypoint ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id | Owner |
| `name` | TEXT | NOT NULL | Waypoint name |
| `type` | TEXT | NOT NULL | hub/drone/ground-unit/naval-unit/coordinates |
| `entity_id` | INTEGER | - | Linked entity ID |
| `lat` | REAL | NOT NULL | Latitude |
| `lng` | REAL | NOT NULL | Longitude |
| `hub_id` | INTEGER | - | Associated hub |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation date |

---

## Indexes

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_user_profiles_user_id` | user_profiles | user_id | Fast user profile lookup |
| `idx_user_states_user_id` | user_states | user_id | Fast state lookup |
| `idx_drones_user_id` | drones | user_id | User-scoped drone queries |
| `idx_hubs_user_id` | hubs | user_id | User-scoped hub queries |
| `idx_fleets_user_id` | fleets | user_id | User-scoped fleet queries |
| `idx_missions_user_id` | missions | user_id | User-scoped mission queries |
| `idx_ground_units_user_id` | ground_units | user_id | User-scoped ground unit queries |
| `idx_roads_user_id` | roads | user_id | User-scoped road queries |
| `idx_walkable_paths_user_id` | walkable_paths | user_id | User-scoped path queries |
| `idx_no_go_zones_user_id` | no_go_zones | user_id | User-scoped zone queries |
| `idx_naval_units_user_id` | naval_units | user_id | User-scoped naval unit queries |
| `idx_water_areas_user_id` | water_areas | user_id | User-scoped water area queries |
| `idx_waypoints_user_id` | waypoints | user_id | User-scoped waypoint queries |

---

## Migrations

### `migrations` Table
Tracks applied database migrations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Migration ID |
| `name` | TEXT | UNIQUE NOT NULL | Migration name |
| `applied_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Application date |

### Migration Files Location
```
backend/migrations/
├── 001_add_user_ownership.sql
├── 002_add_radio_tower_support.sql
└── ...
```

---

## Data Access Patterns

### User-Scoped Queries (Always Include user_id)
```sql
-- Get all drones for a user
SELECT * FROM drones WHERE user_id = ?;

-- Get single entity by ID and user
SELECT * FROM drones WHERE user_id = ? AND id = ?;

-- Create new entity
INSERT INTO drones (user_id, name, lat, lng) VALUES (?, ?, ?, ?);

-- Update entity
UPDATE drones SET lat = ?, lng = ?, updated_at = CURRENT_TIMESTAMP
WHERE user_id = ? AND id = ?;

-- Delete entity
DELETE FROM drones WHERE user_id = ? AND id = ?;
```

### Joins Across Tables
```sql
-- Get missions with hub info
SELECT m.*, h.name as hub_name
FROM missions m
JOIN hubs h ON m.hub_id = h.id
WHERE m.user_id = ?;

-- Get fleets with drone count
SELECT f.*, COUNT(d.id) as drone_count
FROM fleets f
LEFT JOIN drones d ON f.id = d.hub_id
WHERE f.user_id = ?
GROUP BY f.id;
```

---

*Last updated: 2026-04*