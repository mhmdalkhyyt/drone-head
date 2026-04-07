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

# Create data directory
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

When `DEVELOPMENT_MODE=true`:
- Authentication is bypassed
- Any request to `/api/auth/me` returns a mock user
- Useful for local development and testing

## Database Schema

### SQLite Tables

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
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
  navalUnits: {},    // id → naval unit
  roads: {},         // id → road
  paths: {},         // id → walkable path
  noGoZones: {},     // id → no-go zone
  waterAreas: {},    // id → water area
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

1. **In-Memory Data**: Operational data lost on restart
2. **Single User**: No multi-user collaboration
3. **SQLite**: Not suitable for high-concurrency
4. **SSE**: Single connection per client
5. **No Build Step**: Frontend not minified/optimized

## Performance Considerations

### Bottlenecks

1. **SSE Broadcasting**: All clients receive all updates
2. **In-Memory Queries**: O(n) for filtered operations
3. **SQLite**: Single writer

### Optimizations

1. Use `Map` for O(1) lookups
2. Batch broadcasts where possible
3. Limit SSE clients if needed
4. Consider Redis for scaling

## Security Considerations

### Current Implementation

- JWT authentication (optional in development)
- Bcrypt password hashing
- CORS enabled

### Recommendations for Production

1. Set `DEVELOPMENT_MODE=false`
2. Use strong `JWT_SECRET`
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
├── server.js              # Main application (2500+ lines)
├── package.json           # Dependencies
├── Dockerfile             # Container config
└── data/
    └── data.db            # SQLite database

frontend/
├── index.html             # Main dashboard
├── app.js                 # Main application (3200+ lines)
├── style.css              # Styles
├── auth.js                # Authentication
├── auth.css               # Auth styles
├── profile.html           # Profile page
├── profile.js             # Profile logic
├── profile.css            # Profile styles
└── login/
    ├── login.html         # Login page
    ├── login.js           # Login logic
    └── login.css          # Login styles
```

---

*Created: 2024*
*Last Updated: 2024*