const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── In-memory stores ─────────────────────────────────────────────────────────
const drones   = new Map();   // id → drone
const hubs     = new Map();   // id → hub
const fleets   = new Map();   // id → fleet   { id, hubId, name, droneIds[], status }
const missions = new Map();   // id → mission  { id, hubId, title, type, requiredDrones, priority, status, assignedFleetId }

let hubSeq     = 1;
let fleetSeq   = 1;
let missionSeq = 1;

// SSE clients
const sseClients = new Set();

// ─── Seed initial drones ──────────────────────────────────────────────────────
const initialDrones = [
  { id: 'drone-1', name: 'Alpha',   lat: 59.3293, lng: 18.0686, altitude: 120, speed: 15, status: 'active',  battery: 87  },
  { id: 'drone-2', name: 'Bravo',   lat: 59.3350, lng: 18.0800, altitude: 80,  speed: 22, status: 'active',  battery: 62  },
  { id: 'drone-3', name: 'Charlie', lat: 59.3200, lng: 18.0550, altitude: 0,   speed: 0,  status: 'idle',    battery: 100 },
];
initialDrones.forEach(d => drones.set(d.id, { ...d, updatedAt: new Date().toISOString() }));

// ─── Broadcast helpers ────────────────────────────────────────────────────────
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

function broadcastHub(hub)         { broadcast({ type: 'hub:update',     hub }); }
function broadcastHubRemove(id)    { broadcast({ type: 'hub:remove',     id  }); }
function broadcastFleet(fleet)     { broadcast({ type: 'fleet:update',   fleet }); }
function broadcastFleetRemove(id)  { broadcast({ type: 'fleet:remove',   id  }); }
function broadcastMission(mission) { broadcast({ type: 'mission:update', mission }); }
function broadcastMissionRemove(id){ broadcast({ type: 'mission:remove', id  }); }

// ─── Utility: get missions for a hub sorted by priority then insertion ────────
function hubMissionQueue(hubId) {
  return [...missions.values()]
    .filter(m => m.hubId === hubId)
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
}

// ─── Drone routes ─────────────────────────────────────────────────────────────

app.get('/api/drones', (_req, res) => res.json([...drones.values()]));

app.get('/api/drones/:id', (req, res) => {
  const drone = drones.get(req.params.id);
  if (!drone) return res.status(404).json({ error: 'Drone not found' });
  res.json(drone);
});

app.post('/api/drones/:id/location', (req, res) => {
  const { id } = req.params;
  const { lat, lng, altitude, speed, status, battery, name } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).json({ error: 'lat and lng are required' });

  const existing = drones.get(id) || { id };
  const updated = {
    ...existing,
    id,
    name:      name      ?? existing.name      ?? id,
    lat:       parseFloat(lat),
    lng:       parseFloat(lng),
    altitude:  altitude  !== undefined ? parseFloat(altitude)  : (existing.altitude  ?? 0),
    speed:     speed     !== undefined ? parseFloat(speed)     : (existing.speed     ?? 0),
    status:    status    ?? existing.status    ?? 'active',
    battery:   battery   !== undefined ? parseFloat(battery)   : (existing.battery   ?? 100),
    updatedAt: new Date().toISOString(),
  };
  drones.set(id, updated);
  broadcast({ type: 'update', drone: updated });
  res.json(updated);
});

app.delete('/api/drones/:id', (req, res) => {
  const { id } = req.params;
  if (!drones.has(id)) return res.status(404).json({ error: 'Drone not found' });
  drones.delete(id);
  broadcast({ type: 'remove', id });
  res.json({ success: true });
});

// ─── Hub routes ───────────────────────────────────────────────────────────────

app.get('/api/hubs', (_req, res) => res.json([...hubs.values()]));

app.post('/api/hubs', (req, res) => {
  const { name, lat, lng } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).json({ error: 'lat and lng are required' });

  const id  = `hub-${hubSeq++}`;
  const hub = { id, name: name || `Hub ${id}`, lat: parseFloat(lat), lng: parseFloat(lng), createdAt: new Date().toISOString() };
  hubs.set(id, hub);
  broadcastHub(hub);
  res.status(201).json(hub);
});

app.get('/api/hubs/:id', (req, res) => {
  const hub = hubs.get(req.params.id);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  res.json(hub);
});

app.patch('/api/hubs/:id', (req, res) => {
  const hub = hubs.get(req.params.id);
  if (!hub) return res.status(404).json({ error: 'Hub not found' });
  const { name } = req.body;
  if (name) hub.name = name;
  broadcastHub(hub);
  res.json(hub);
});

app.delete('/api/hubs/:id', (req, res) => {
  const { id } = req.params;
  if (!hubs.has(id)) return res.status(404).json({ error: 'Hub not found' });
  hubs.delete(id);
  // Remove child fleets + missions
  [...fleets.values()].filter(f => f.hubId === id).forEach(f => { fleets.delete(f.id); broadcastFleetRemove(f.id); });
  [...missions.values()].filter(m => m.hubId === id).forEach(m => { missions.delete(m.id); broadcastMissionRemove(m.id); });
  broadcastHubRemove(id);
  res.json({ success: true });
});

// ─── Fleet routes ─────────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/fleets', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json([...fleets.values()].filter(f => f.hubId === hubId));
});

app.post('/api/hubs/:hubId/fleets', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  const { name } = req.body;
  const id    = `fleet-${fleetSeq++}`;
  const fleet = { id, hubId, name: name || `Fleet ${id}`, droneIds: [], status: 'idle', currentMissionId: null, createdAt: new Date().toISOString() };
  fleets.set(id, fleet);
  broadcastFleet(fleet);
  res.status(201).json(fleet);
});

app.delete('/api/hubs/:hubId/fleets/:fleetId', (req, res) => {
  const { hubId, fleetId } = req.params;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  fleets.delete(fleetId);
  broadcastFleetRemove(fleetId);
  res.json({ success: true });
});

// Add drone to fleet
app.post('/api/hubs/:hubId/fleets/:fleetId/drones', (req, res) => {
  const { hubId, fleetId } = req.params;
  const { droneId } = req.body;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  if (!drones.has(droneId)) return res.status(404).json({ error: 'Drone not found' });
  if (!fleet.droneIds.includes(droneId)) {
    fleet.droneIds.push(droneId);
    broadcastFleet(fleet);
  }
  res.json(fleet);
});

// Remove drone from fleet
app.delete('/api/hubs/:hubId/fleets/:fleetId/drones/:droneId', (req, res) => {
  const { hubId, fleetId, droneId } = req.params;
  const fleet = fleets.get(fleetId);
  if (!fleet || fleet.hubId !== hubId) return res.status(404).json({ error: 'Fleet not found' });
  fleet.droneIds = fleet.droneIds.filter(id => id !== droneId);
  broadcastFleet(fleet);
  res.json(fleet);
});

// ─── Mission routes ───────────────────────────────────────────────────────────

app.get('/api/hubs/:hubId/missions', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  res.json(hubMissionQueue(hubId));
});

app.post('/api/hubs/:hubId/missions', (req, res) => {
  const { hubId } = req.params;
  if (!hubs.has(hubId)) return res.status(404).json({ error: 'Hub not found' });
  const { title, type, requiredDrones, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const id      = `mission-${missionSeq++}`;
  const mission = {
    id,
    hubId,
    title,
    type:           type           || 'general',
    requiredDrones: requiredDrones !== undefined ? parseInt(requiredDrones) : 1,
    priority:       priority       !== undefined ? parseInt(priority)       : 100,
    status:         'queued',
    assignedFleetId: null,
    createdAt:      new Date().toISOString(),
  };
  missions.set(id, mission);
  broadcastMission(mission);
  res.status(201).json(mission);
});

app.delete('/api/hubs/:hubId/missions/:missionId', (req, res) => {
  const { hubId, missionId } = req.params;
  const mission = missions.get(missionId);
  if (!mission || mission.hubId !== hubId) return res.status(404).json({ error: 'Mission not found' });
  // Free assigned fleet if active
  if (mission.assignedFleetId) {
    const fleet = fleets.get(mission.assignedFleetId);
    if (fleet) { fleet.status = 'idle'; fleet.currentMissionId = null; broadcastFleet(fleet); }
  }
  missions.delete(missionId);
  broadcastMissionRemove(missionId);
  res.json({ success: true });
});

// Mark mission complete (manual or future auto)
app.post('/api/hubs/:hubId/missions/:missionId/complete', (req, res) => {
  const { hubId, missionId } = req.params;
  const mission = missions.get(missionId);
  if (!mission || mission.hubId !== hubId) return res.status(404).json({ error: 'Mission not found' });
  if (mission.assignedFleetId) {
    const fleet = fleets.get(mission.assignedFleetId);
    if (fleet) { fleet.status = 'idle'; fleet.currentMissionId = null; broadcastFleet(fleet); }
  }
  mission.status = 'done';
  mission.completedAt = new Date().toISOString();
  broadcastMission(mission);
  res.json(mission);
});

// ─── SSE ──────────────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Send full snapshot
  res.write(`data: ${JSON.stringify({
    type:     'snapshot',
    drones:   [...drones.values()],
    hubs:     [...hubs.values()],
    fleets:   [...fleets.values()],
    missions: [...missions.values()],
  })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ─── Simulate drone movement ──────────────────────────────────────────────────
setInterval(() => {
  drones.forEach((drone, id) => {
    if (drone.status !== 'active') return;
    const updated = {
      ...drone,
      lat:       +(drone.lat + (Math.random() - 0.5) * 0.001).toFixed(6),
      lng:       +(drone.lng + (Math.random() - 0.5) * 0.001).toFixed(6),
      altitude:  +(Math.max(0, drone.altitude + (Math.random() - 0.5) * 5)).toFixed(1),
      speed:     +(Math.max(0, drone.speed    + (Math.random() - 0.5) * 3)).toFixed(1),
      battery:   +(Math.max(0, drone.battery  - Math.random() * 0.2)).toFixed(1),
      updatedAt: new Date().toISOString(),
    };
    drones.set(id, updated);
    broadcast({ type: 'update', drone: updated });
  });
}, 2000);

// ─── Idle fleet → mission scheduler ──────────────────────────────────────────
setInterval(() => {
  hubs.forEach(hub => {
    const queue = hubMissionQueue(hub.id).filter(m => m.status === 'queued');
    if (!queue.length) return;

    const idleFleets = [...fleets.values()].filter(f => f.hubId === hub.id && f.status === 'idle' && f.droneIds.length > 0);
    if (!idleFleets.length) return;

    const topMission = queue[0];

    const capable = idleFleets.find(f => f.droneIds.length >= topMission.requiredDrones);
    if (!capable) return;

    // Assign
    capable.status          = 'on-mission';
    capable.currentMissionId = topMission.id;
    topMission.status        = 'active';
    topMission.assignedFleetId = capable.id;
    topMission.startedAt     = new Date().toISOString();

    broadcastFleet(capable);
    broadcastMission(topMission);

    console.log(`[Scheduler] Fleet "${capable.name}" assigned to mission "${topMission.title}" at hub "${hub.name}"`);
  });
}, 3000);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Drone API running at http://localhost:${PORT}`);
  console.log(`   Hub endpoints: GET/POST /api/hubs  |  DELETE /api/hubs/:id`);
  console.log(`   Fleet endpoints: GET/POST /api/hubs/:hubId/fleets`);
  console.log(`   Mission endpoints: GET/POST /api/hubs/:hubId/missions`);
  console.log(`   SSE: GET /api/events`);
});
