# 🚁 Drone Head

A comprehensive real-time location tracking and mission management system for drones, ground units, and naval units. Built with Node.js/Express backend, vanilla HTML/CSS/JS frontend, and SQLite database.

---

## 🌟 Features

### Core Tracking
- 🗺️ **Interactive Map** - Leaflet.js with CartoDB Dark Matter tiles
- 📡 **Real-time Updates** - Server-Sent Events (SSE) for live position tracking
- 🔄 **Simulated Movement** - Active units automatically drift and update positions

### Unit Management
- 🚁 **Drone Fleet Management**
  - Create, update, and track drones
  - Assign drones to hubs and fleets
  - Battery level monitoring with color-coded indicators
  - Altitude and speed tracking

- 🏢 **Hub System**
  - Organize units by base/hub location
  - Hub-based fleet management
  - Coordinate multiple fleets from single hub

- 🎯 **Mission System**
  - Create and manage missions
  - Priority-based mission queue
  - Fleet assignment for missions
  - Mission status tracking

- 🛣️ **Ground Units**
  - Multiple unit types: humans, IFV, tanks, trucks
  - Road network integration
  - Pathfinding with A* algorithm
  - Unit-specific movement rules

- ⚓ **Naval Units**
  - Boat, battleship, and aircraft carrier support
  - Water area definitions
  - Water-based movement tracking

### Advanced Features
- 🚫 **No-Go Zones** - Define restricted areas with polygon boundaries
- 🛣️ **Road Network** - Define roads with type-based access rules
- 🚶 **Walkable Paths** - Footpaths and trails for human units
- 💾 **State Persistence** - Save and load application states
- 🔐 **Authentication** - JWT-based user authentication (optional in development)

---

## 📁 Project Structure

```
drone-head/
├── backend/
│   ├── package.json
│   ├── server.js           # Express API server
│   ├── Dockerfile
│   ├── .dockerignore
│   └── data/
│       └── data.db         # SQLite database
├── frontend/
│   ├── index.html          # Main dashboard
│   ├── style.css
│   ├── app.js              # Map and UI logic
│   ├── auth.js             # Authentication logic
│   ├── auth.css
│   ├── cookie-policy.css
│   ├── cookie-policy.js
│   └── login/
│       ├── login.html
│       ├── login.css
│       ├── login.js
│       └── Gemini_Generated_Image_6bb7w36bb7w36bb7.png
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (better-sqlite3) |
| **Authentication** | JWT, bcrypt |
| **Real-time** | Server-Sent Events (SSE) |
| **Frontend** | Vanilla HTML/CSS/JavaScript |
| **Maps** | Leaflet.js + CartoDB Dark Matter |
| **Deployment** | Docker, Docker Compose |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm
- Docker (optional, for containerized deployment)

### Option 1: Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/mhmdalkhyyt/drone-head.git
   cd drone-head
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Start the backend server**
   ```bash
   npm start
   ```
   The API will be available at **http://localhost:3000**

4. **Open the frontend**
   - Open `frontend/index.html` directly in your browser, or
   - Serve it with any static file server:
   ```bash
   npx serve frontend
   ```

### Option 2: Docker Deployment

1. **Build and start containers**
   ```bash
   docker-compose up -d
   ```

2. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3000

3. **View logs**
   ```bash
   docker-compose logs -f
   ```

4. **Stop containers**
   ```bash
   docker-compose down
   ```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `drone-head-secret-key-change-in-production` | JWT signing secret |
| `DEVELOPMENT_MODE` | `false` | Skip authentication when set to `develop` or `true` |
| `DATA_DIR` | `backend/data` | Database directory |
| `DB_PATH` | `backend/data/data.db` | Database file path |

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| DELETE | `/api/auth/user` | Delete current user account |
| GET | `/api/auth/users` | List all users (admin) |
| DELETE | `/api/auth/users/:id` | Delete user by ID (admin) |

### State Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/states` | Save current state |
| GET | `/api/states` | List saved states |
| GET | `/api/states/:id` | Get state by ID |
| POST | `/api/states/:id/load` | Load state by ID |
| DELETE | `/api/states/:id` | Delete state by ID |

### Drone Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drones` | List all drones |
| GET | `/api/drones/:id` | Get drone by ID |
| GET | `/api/drones/:id/with-relations` | Get drone with hub/fleet info |
| GET | `/api/drones/unassigned` | Get unassigned drones |
| POST | `/api/drones/:id/location` | Update drone location |
| POST | `/api/drones/:id/assign-hub` | Assign drone to hub |
| DELETE | `/api/drones/:id/assign-hub` | Unassign drone from hub |
| DELETE | `/api/drones/:id` | Delete drone |

### Hub Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hubs/:hubId/drones` | Get drones in hub |
| GET | `/api/hubs/:hubId/ground-units` | Get ground units in hub |
| POST | `/api/hubs` | Create hub |
| PUT | `/api/hubs/:id` | Update hub |
| DELETE | `/api/hubs/:id` | Delete hub |

### Fleet Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fleets` | List all fleets |
| POST | `/api/fleets` | Create fleet |
| POST | `/api/fleets/:id/add-drone` | Add drone to fleet |
| POST | `/api/fleets/:id/remove-drone` | Remove drone from fleet |
| PUT | `/api/fleets/:id` | Update fleet |
| DELETE | `/api/fleets/:id` | Delete fleet |

### Mission Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/missions` | List all missions |
| POST | `/api/missions` | Create mission |
| POST | `/api/missions/:id/assign-fleet` | Assign fleet to mission |
| PUT | `/api/missions/:id` | Update mission |
| DELETE | `/api/missions/:id` | Delete mission |

### Ground Unit Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ground-units` | List all ground units |
| GET | `/api/ground-units/:id` | Get ground unit by ID |
| POST | `/api/ground-units` | Create ground unit |
| POST | `/api/ground-units/:id/location` | Update location |
| POST | `/api/ground-units/:id/move` | Move to target (with pathfinding) |
| DELETE | `/api/ground-units/:id` | Delete ground unit |

### Naval Unit Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/naval-units` | List all naval units |
| GET | `/api/naval-units/:id` | Get naval unit by ID |
| POST | `/api/naval-units` | Create naval unit |
| POST | `/api/naval-units/:id/location` | Update location |
| POST | `/api/naval-units/:id/move` | Move to target |
| DELETE | `/api/naval-units/:id` | Delete naval unit |

### Infrastructure Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/roads` | List all roads |
| POST | `/api/roads` | Create road |
| DELETE | `/api/roads/:id` | Delete road |
| GET | `/api/paths` | List all walkable paths |
| POST | `/api/paths` | Create walkable path |
| DELETE | `/api/paths/:id` | Delete path |
| GET | `/api/no-go-zones` | List all no-go zones |
| POST | `/api/no-go-zones` | Create no-go zone |
| DELETE | `/api/no-go-zones/:id` | Delete no-go zone |
| GET | `/api/water-areas` | List all water areas |
| POST | `/api/water-areas` | Create water area |
| DELETE | `/api/water-areas/:id` | Delete water area |

### Real-time Updates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | SSE stream for live updates |

---

## 📝 Request Body Examples

### Create/Update Drone
```json
{
  "name": "Alpha-1",
  "lat": 59.3293,
  "lng": 18.0686,
  "altitude": 150,
  "speed": 18,
  "battery": 75,
  "status": "active",
  "hubId": "hub-1"
}
```

### Create Ground Unit
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

### Move Ground Unit (with pathfinding)
```json
{
  "targetLat": 59.3350,
  "targetLng": 18.0750
}
```

### Create No-Go Zone
```json
{
  "name": "Restricted Area",
  "coordinates": [
    [59.3300, 18.0700],
    [59.3350, 18.0700],
    [59.3350, 18.0800],
    [59.3300, 18.0800]
  ],
  "ruleset": "no-entry"
}
```

---

## 🗺️ Map Features

- **Dark Theme** - CartoDB Dark Matter tiles for low-light operations
- **Unit Markers** - Color-coded icons for different unit types
- **Fleet Visualization** - Grouped unit display
- **Path Display** - Roads, walkable paths, and water areas
- **Zone Boundaries** - No-go zones and water area overlays
- **Interactive Controls** - Zoom, pan, and unit selection

---

## 📜 License

MIT License - feel free to use this project for your own purposes.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.