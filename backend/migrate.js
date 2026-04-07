/**
 * Database Migration Runner for Drone Head
 * Applies user ownership schema changes to existing database
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'data.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

console.log('🔄 Drone Head Database Migration');
console.log('================================');
console.log(`Database: ${DB_PATH}`);
console.log('');

// Check if migrations table exists
let migrationsExist = false;
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get();
  migrationsExist = !!table;
} catch (e) {
  console.log('⚠️  migrations table does not exist yet');
}

if (!migrationsExist) {
  console.log('📦 Creating migrations table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Migrations table created');
}

// Read and execute migration files
const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`📁 Found ${migrationFiles.length} migration file(s)`);
console.log('');

for (const file of migrationFiles) {
  const migrationName = file.replace('.sql', '');
  
  // Check if already applied
  const existing = db.prepare('SELECT id FROM migrations WHERE name = ?').get(migrationName);
  
  if (existing) {
    console.log(`⏭️  Skipping ${file} (already applied)`);
    continue;
  }
  
  console.log(`🔄 Applying ${file}...`);
  
  try {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    // Execute migration
    db.exec(sql);
    
    // Record migration
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);
    
    console.log(`✅ ${file} applied successfully`);
  } catch (error) {
    console.error(`❌ Error applying ${file}:`);
    console.error(error.message);
    process.exit(1);
  }
  
  console.log('');
}

// Create entity tables if they don't exist (for new installations)
console.log('📦 Ensuring entity tables exist...');
db.exec(`
  -- Drones table with user ownership
  CREATE TABLE IF NOT EXISTS drones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    altitude REAL DEFAULT 0,
    speed REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_drones_user_id ON drones(user_id);

  -- Hubs table with user ownership
  CREATE TABLE IF NOT EXISTS hubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_hubs_user_id ON hubs(user_id);

  -- Fleets table with user ownership
  CREATE TABLE IF NOT EXISTS fleets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hub_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    drone_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'idle',
    current_mission_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_fleets_user_id ON fleets(user_id);

  -- Missions table with user ownership
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hub_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    required_drones INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 100,
    status TEXT DEFAULT 'queued',
    assigned_fleet_id INTEGER,
    waypoint_id INTEGER,
    end_condition TEXT DEFAULT 'manual',
    end_condition_value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_missions_user_id ON missions(user_id);

  -- Ground units table with user ownership
  CREATE TABLE IF NOT EXISTS ground_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'truck',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed REAL DEFAULT 70,
    status TEXT DEFAULT 'idle',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    on_road INTEGER DEFAULT 0,
    current_path TEXT DEFAULT '[]',
    path_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ground_units_user_id ON ground_units(user_id);

  -- Roads table with user ownership
  CREATE TABLE IF NOT EXISTS roads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'street',
    coordinates TEXT NOT NULL,
    speed_limit REAL DEFAULT 50,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_roads_user_id ON roads(user_id);

  -- Walkable paths table with user ownership
  CREATE TABLE IF NOT EXISTS walkable_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'footpath',
    coordinates TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_walkable_paths_user_id ON walkable_paths(user_id);

  -- No-go zones table with user ownership
  CREATE TABLE IF NOT EXISTS no_go_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    coordinates TEXT NOT NULL,
    ruleset TEXT DEFAULT 'FORBIDDEN: Drones are not allowed to enter this area.',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_no_go_zones_user_id ON no_go_zones(user_id);

  -- Naval units table with user ownership
  CREATE TABLE IF NOT EXISTS naval_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'fast-boat',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed REAL DEFAULT 80,
    status TEXT DEFAULT 'idle',
    battery REAL DEFAULT 100,
    hub_id INTEGER,
    current_path TEXT DEFAULT '[]',
    path_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_naval_units_user_id ON naval_units(user_id);

  -- Water areas table with user ownership
  CREATE TABLE IF NOT EXISTS water_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    coordinates TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_water_areas_user_id ON water_areas(user_id);

  -- Waypoints table with user ownership
  CREATE TABLE IF NOT EXISTS waypoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id INTEGER,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    hub_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);
`);
console.log('✅ Entity tables ensured');
console.log('');

// Summary
const migrationCount = db.prepare('SELECT COUNT(*) as count FROM migrations').get();
console.log('📊 Migration Summary');
console.log('====================');
console.log(`Total migrations applied: ${migrationCount.count}`);
console.log('');
console.log('✅ Migration completed successfully!');
console.log('');
console.log('🚀 You can now start the server with: npm start');

db.close();