-- Migration: Add user ownership to all entity tables
-- This migration transforms the monolithic data model to a user-scoped model

-- Add user_id column to drones table
ALTER TABLE drones ADD COLUMN user_id INTEGER;
ALTER TABLE drones ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_drones_user_id ON drones(user_id);

-- Add user_id column to hubs table
ALTER TABLE hubs ADD COLUMN user_id INTEGER;
ALTER TABLE hubs ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_hubs_user_id ON hubs(user_id);

-- Add user_id column to fleets table
ALTER TABLE fleets ADD COLUMN user_id INTEGER;
ALTER TABLE fleets ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_fleets_user_id ON fleets(user_id);

-- Add user_id column to missions table
ALTER TABLE missions ADD COLUMN user_id INTEGER;
ALTER TABLE missions ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE missions ADD COLUMN started_at TEXT;
ALTER TABLE missions ADD COLUMN completed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_missions_user_id ON missions(user_id);

-- Add user_id column to ground_units table
ALTER TABLE ground_units ADD COLUMN user_id INTEGER;
ALTER TABLE ground_units ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_ground_units_user_id ON ground_units(user_id);

-- Add user_id column to naval_units table
ALTER TABLE naval_units ADD COLUMN user_id INTEGER;
ALTER TABLE naval_units ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_naval_units_user_id ON naval_units(user_id);

-- Add user_id column to roads table
ALTER TABLE roads ADD COLUMN user_id INTEGER;
ALTER TABLE roads ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_roads_user_id ON roads(user_id);

-- Add user_id column to walkable_paths table
ALTER TABLE walkable_paths ADD COLUMN user_id INTEGER;
ALTER TABLE walkable_paths ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_walkable_paths_user_id ON walkable_paths(user_id);

-- Add user_id column to no_go_zones table
ALTER TABLE no_go_zones ADD COLUMN user_id INTEGER;
ALTER TABLE no_go_zones ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_no_go_zones_user_id ON no_go_zones(user_id);

-- Add user_id column to water_areas table
ALTER TABLE water_areas ADD COLUMN user_id INTEGER;
ALTER TABLE water_areas ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_water_areas_user_id ON water_areas(user_id);

-- Add user_id column to waypoints table
ALTER TABLE waypoints ADD COLUMN user_id INTEGER;
ALTER TABLE waypoints ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);

-- Create table for shared infrastructure (visible to all users)
CREATE TABLE IF NOT EXISTS shared_infrastructure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'road', 'path', 'no_go_zone', 'water_area'
    entity_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, entity_id)
);

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO migrations (name) VALUES ('001_add_user_ownership');