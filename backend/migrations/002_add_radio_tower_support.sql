-- Migration: Add radio tower support to ground units
-- This migration adds radio tower capabilities to ground units

-- Add radio tower columns to ground_units table
ALTER TABLE ground_units ADD COLUMN is_radio_tower INTEGER DEFAULT 0;
ALTER TABLE ground_units ADD COLUMN radio_range_meters REAL DEFAULT 500;
ALTER TABLE ground_units ADD COLUMN radio_effects TEXT DEFAULT '{"drones":{"speedBoost":1.2,"batteryEfficiency":1.1},"ground":{"speedBoost":1.15,"accuracyBoost":1.2},"naval":{"speedBoost":1.1,"commsRangeBoost":1.3},"radio":{"rangeExtension":1.5,"powerBoost":1.2}}';
ALTER TABLE ground_units ADD COLUMN radio_active INTEGER DEFAULT 1;

-- Create index for radio towers for efficient querying
CREATE INDEX IF NOT EXISTS idx_ground_units_radio_towers ON ground_units(user_id, is_radio_tower);