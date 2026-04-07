# Technical Context - Drone Head

## Technologies Used

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 16+ | JavaScript runtime |
| Express.js | 4.x | Web framework |
| better-sqlite3 | 9.x | SQLite database |
| bcrypt | 5.x | Password hashing |
| jsonwebtoken | 9.x | JWT authentication |
| cors | 2.x | CORS middleware |
| nodemon | 3.x | Development auto-restart |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| HTML5 | - | Markup |
| CSS3 | - | Styling |
| JavaScript (ES6+) | - | Application logic |
| Leaflet.js | 1.x | Interactive maps |
| Fetch API | - | HTTP requests |
| EventSource API | - | SSE client |

### Deployment

| Technology | Purpose |
|------------|---------|
| Docker | Containerization |
| Docker Compose | Multi-container orchestration |
| Nginx | Reverse proxy (optional) |

## Development Setup

### Prerequisites

```bash
# Node.js 16+
node --version  # v16.0.0 or higher

# npm
npm --version   # 7.0.0 or higher

# Docker (optional)
docker --version

# Docker Compose (optional)
docker-compose --version
```

### Installation

```bash
# Clone repository
git clone https://github.com/mhmdalkhyyt/drone-head.git
cd drone-head

# Install backend dependencies
cd backend
npm install

# Create data directory (if needed)
mkdir -p data
```

### Running the Application

```bash
# Development mode (with auto-restart)
cd backend
npm run dev

# Production mode
npm start

# With Docker
docker-compose up -d
```

## Environment Configuration

### Environment Variables

```bash
# Required for production
JWT_SECRET=your-secure-secret-key-min-32-characters

# Optional
PORT=3000
NODE_ENV=production
DATA_DIR=backend/data
DB_PATH=backend/data/data.db
DEVELOPMENT_MODE=false
```

### Development Mode

When `DEVELOPMENT_MODE=true` or `DEVELOPMENT_MODE=develop`:
- Authentication is bypassed
- Any request to `/api/auth/me` returns a mock user
- Useful for local development and testing

## Database Schema

### SQLite Tables

All tables include `user_id` for user-scoped data access:

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- User Profiles
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  preferences TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User States
CREATE TABLE user_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  state_data TEXT NOT NULL,
  name TEXT DEFAULT 'Saved State',
  saved_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Drones
CREATE TABLE drones (
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

-- Hubs
CREATE TABLE hubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fleets
CREATE TABLE fleets (
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

-- Missions
CREATE TABLE missions (
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

-- Ground Units (includes Radio Towers)
CREATE TABLE ground_units (
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
  is_radio_tower INTEGER DEFAULT 0,
  radio_range_meters REAL,
  radio_effects TEXT,
  radio_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Roads
CREATE TABLE roads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'street',
  coordinates TEXT NOT NULL,
  speed_limit REAL DEFAULT 50,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Walkable Paths
CREATE TABLE walkable_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'footpath',
  coordinates TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- No-Go Zones
CREATE TABLE no_go_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  coordinates TEXT NOT NULL,
  ruleset TEXT DEFAULT 'FORBIDDEN: Drones are not allowed to enter this area.',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Naval Units
CREATE TABLE naval_units (
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

-- Water Areas
CREATE TABLE water_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  coordinates TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Waypoints
CREATE TABLE waypoints (
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

-- Migrations
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## API Structure

### Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

### Authentication

```javascript
// Include token in requests
headers: {
  'Authorization': 'Bearer <token>'
}
```

### Common Response Formats

**Success:**
```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "Error message"
}
```

## Frontend Architecture

### State Management

```javascript
const state = {
  drones: {},        // id → drone
  hubs: {},          // id → hub
  fleets: {},        // id → fleet
  missions: {},      // id → mission
  groundUnits: {},   // id → ground unit
  radioTowers: {},   // id → radio tower
  navalUnits: {},    // id → naval unit
  roads: {},         // id → road
  paths: {},         // id → walkable path
  noGoZones: {},     // id → no-go zone
  waterAreas: {},    // id → water area
  aois: {},          // id → area of interest
  ewAreas: {},       // id → EW signal area
  selected: null,    // selected entity ID
  // ... etc
};
```

### Map Integration

```javascript
// Initialize map
const map = L.map('map').setView([59.3293, 18.0686], 13);

// Add tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap contributors © CARTO',
  maxZoom: 19,
}).addTo(map);
```

### SSE Connection

```javascript
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'snapshot') {
    // Initialize from snapshot
  } else {
    // Handle specific update type
    handleUpdate(data);
  }
});
```

## Testing

### Manual API Testing

```bash
# Create a drone
curl -X POST http://localhost:3000/api/drones/test/location \
  -H "Content-Type: application/json" \
  -d '{"lat": 59.3293, "lng": 18.0686, "name": "Test Drone"}'

# Create a hub
curl -X POST http://localhost:3000/api/hubs \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Hub", "lat": 59.3293, "lng": 18.0686}'

# List all drones
curl http://localhost:3000/api/drones
```

### Browser Console

```javascript
// Test API from browser
fetch('/api/drones')
  .then(res => res.json())
  .then(console.log);
```

## Debugging

### Backend

```javascript
// Console logging
console.log('[DroneAPI] Creating drone:', data);
console.error('[Auth] Login failed:', error);

// Node.js inspector
node --inspect server.js
```

### Frontend

```javascript
// Browser console
console.log('Drone updated:', drone);

// Network tab
// Check SSE connection at /api/events
// Check API requests and responses
```

## Known Limitations

1. **Single Writer**: SQLite has limited concurrent writes
2. **Single User Sessions**: No real-time collaboration between users
3. **SSE**: Single connection per client per user
4. **No Build Step**: Frontend not minified/optimized
5. **Radio Effects**: Framework exists but not fully implemented

## Performance Considerations

### Bottlenecks

1. **SSE Broadcasting**: All clients for a user receive all updates
2. **Database Queries**: All queries include user_id filter
3. **SQLite**: Single writer

### Optimizations

1. Use indexed queries on user_id
2. Batch broadcasts where possible
3. Limit SSE clients if needed
4. Consider Redis + PostgreSQL for scaling

## Security Considerations

### Current Implementation

- JWT authentication
- Bcrypt password hashing
- CORS enabled
- User-scoped data access (every query includes user_id)

### Recommendations for Production

1. Set `DEVELOPMENT_MODE=false`
2. Use strong `JWT_SECRET` (32+ characters)
3. Enable HTTPS
4. Implement rate limiting
5. Add input validation
6. Configure CORS for specific origins

## External Dependencies

### Map Tiles

- **Provider**: CartoDB
- **Layer**: Dark Matter
- **URL**: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Attribution**: Required

### Leaflet.js

- **CDN**: Available via CDN or npm
- **License**: BSD 2-Clause

## File Locations

```
backend/
├── server.js              # Main application (~1,764 lines)
├── dataAccess.js          # Data access layer (~687 lines)
├── package.json           # Dependencies
├── Dockerfile             # Container config
└── data/
    └── data.db            # SQLite database

frontend/
├── index.html             # Main dashboard
├── app.js                 # Main application (~4,192 lines)
├── style.css              # Styles
├── auth-client.js         # Authentication module (~234 lines)
├── auth.css               # Auth styles
├── profile.html           # Profile page
├── profile.js             # Profile logic
├── profile.css            # Profile styles
├── cookie-policy.js       # Cookie policy
├── cookie-policy.css      # Cookie policy styles
└── login/
    ├── login.html         # Login page
    ├── login.js           # Login logic
    └── login.css          # Login styles
```

---

*Created: 2024*
*Last Updated: 2026-04*