# 🚁 Drone Tracker

A simple real-time drone location tracking app with a Node.js/Express backend and a vanilla HTML/CSS/JS frontend using Leaflet.js.

---

## Project Structure

```
drone-head/
├── backend/
│   ├── package.json
│   └── server.js        ← Express REST API + SSE
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js           ← Leaflet map + SSE client
```

---

## Getting Started

### 1. Install & run the backend

```bash
cd backend
npm install
npm start
```

The API will be available at **http://localhost:3001**

### 2. Open the frontend

Open `frontend/index.html` directly in your browser, or serve it with any static server:

```bash
npx serve frontend
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drones` | List all drones |
| GET | `/api/drones/:id` | Get single drone |
| POST | `/api/drones/:id/location` | Create or update a drone |
| DELETE | `/api/drones/:id` | Remove a drone |
| GET | `/api/events` | SSE stream of live updates |

### POST body example

```json
{
  "name":     "Echo",
  "lat":      59.3293,
  "lng":      18.0686,
  "altitude": 150,
  "speed":    18,
  "battery":  75,
  "status":   "active"
}
```

---

## Features

- 🗺️ **Dark map** (Leaflet + CartoDB Dark Matter tiles)
- 📡 **Real-time updates** via Server-Sent Events (SSE)
- 🚁 **Simulated movement** — active drones drift every 2 s
- 🔋 **Battery indicator** with colour-coded bar
- ➕ **Add / update drones** from the sidebar form
- 📌 **Click a drone card or marker** to fly the map to it
