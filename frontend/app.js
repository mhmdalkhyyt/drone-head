/* ═══════════════════════════════════════════════════════════════
   Drone Tracker — frontend app
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '/api';
const SSE_URL  = `${API_BASE}/events`;

/* ── State ───────────────────────────────────────────────────── */
const state = {
  drones:   {},   // id → drone
  markers:  {},   // id → Leaflet marker (drones)
  selected: null, // selected drone id

  hubs:          {},  // id → hub
  hubMarkers:    {},  // id → Leaflet marker (hubs)
  fleets:        {},  // id → fleet
  missions:      {},  // id → mission

  activeHubId:   null, // hub whose panel is open
  placingHub:    false, // placement mode active?
};

/* ── Map setup ───────────────────────────────────────────────── */
const map = L.map('map', { zoomControl: true }).setView([59.3293, 18.0686], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap contributors © CARTO',
  maxZoom: 19,
}).addTo(map);

/* ── Drone icon factory ──────────────────────────────────────── */
function droneIcon(status) {
  return L.divIcon({
    className: '',
    html: `<div class="drone-marker drone-marker--${status}">🚁</div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -20],
  });
}

/* ── Hub icon factory ────────────────────────────────────────── */
function hubIcon(hub) {
  const fleetList = Object.values(state.fleets).filter(f => f.hubId === hub.id);
  const busy = fleetList.some(f => f.status === 'on-mission');
  const cls  = busy ? 'hub-marker--busy' : 'hub-marker--idle';
  return L.divIcon({
    className: '',
    html: `<div class="hub-marker ${cls}">🏠</div>`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    popupAnchor:[0, -22],
  });
}

/* ── Drone popup ─────────────────────────────────────────────── */
function popupContent(d) {
  const battClass = d.battery > 50 ? 'high' : d.battery > 20 ? 'medium' : 'low';
  return `
    <strong>${d.name}</strong> <small style="color:#8890b5">${d.id}</small><br>
    📍 ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}<br>
    🏔️ Alt: <b>${d.altitude} m</b> &nbsp; 💨 Speed: <b>${d.speed} km/h</b><br>
    🔋 Battery: <b style="color:var(--${battClass === 'high' ? 'green' : battClass === 'medium' ? 'yellow' : 'red'})">${d.battery}%</b><br>
    🕒 ${new Date(d.updatedAt).toLocaleTimeString()}
  `;
}

/* ── Drone marker upsert / remove ────────────────────────────── */
function upsertMarker(d) {
  if (state.markers[d.id]) {
    state.markers[d.id]
      .setLatLng([d.lat, d.lng])
      .setIcon(droneIcon(d.status))
      .setPopupContent(popupContent(d));
  } else {
    const marker = L.marker([d.lat, d.lng], { icon: droneIcon(d.status) })
      .addTo(map)
      .bindPopup(popupContent(d));
    marker.on('click', () => selectDrone(d.id));
    state.markers[d.id] = marker;
  }
}

function removeMarker(id) {
  if (state.markers[id]) {
    map.removeLayer(state.markers[id]);
    delete state.markers[id];
  }
}

/* ── Hub marker upsert / remove ──────────────────────────────── */
function upsertHubMarker(hub) {
  if (state.hubMarkers[hub.id]) {
    state.hubMarkers[hub.id]
      .setLatLng([hub.lat, hub.lng])
      .setIcon(hubIcon(hub));
  } else {
    const marker = L.marker([hub.lat, hub.lng], { icon: hubIcon(hub), zIndexOffset: 500 })
      .addTo(map)
      .bindTooltip(hub.name, { permanent: false, direction: 'top', className: 'hub-tooltip' });
    marker.on('click', () => openHubPanel(hub.id));
    state.hubMarkers[hub.id] = marker;
  }
  // Update tooltip text
  state.hubMarkers[hub.id].setTooltipContent(hub.name);
}

function removeHubMarker(id) {
  if (state.hubMarkers[id]) {
    map.removeLayer(state.hubMarkers[id]);
    delete state.hubMarkers[id];
  }
}

/* ── Sidebar drone card ──────────────────────────────────────── */
function cardHTML(d) {
  const battClass = d.battery > 50 ? 'high' : d.battery > 20 ? 'medium' : 'low';
  return `
    <div class="card-header">
      <span class="card-name">
        <span class="status-dot status-dot--${d.status}"></span>${d.name}
      </span>
      <span class="card-id">${d.id}</span>
    </div>
    <div class="card-stats">
      <div class="stat">Alt <span>${d.altitude} m</span></div>
      <div class="stat">Speed <span>${d.speed} km/h</span></div>
      <div class="stat">Lat <span>${d.lat.toFixed(4)}</span></div>
      <div class="stat">Lng <span>${d.lng.toFixed(4)}</span></div>
    </div>
    <div class="battery-bar">
      <div class="battery-fill battery-fill--${battClass}" style="width:${d.battery}%"></div>
    </div>
  `;
}

/* ── Render drone sidebar ────────────────────────────────────── */
function renderSidebar() {
  const list = document.getElementById('drone-list');
  const ids  = Object.keys(state.drones);
  [...list.children].forEach(li => { if (!state.drones[li.dataset.id]) li.remove(); });
  ids.forEach(id => {
    const d = state.drones[id];
    let li = list.querySelector(`[data-id="${id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className  = 'drone-card';
      li.dataset.id = id;
      li.addEventListener('click', () => selectDrone(id));
      list.appendChild(li);
    }
    li.innerHTML = cardHTML(d);
    li.classList.toggle('selected', id === state.selected);
  });
}

/* ── Select a drone ──────────────────────────────────────────── */
function selectDrone(id) {
  state.selected = id;
  const d = state.drones[id];
  if (d) {
    map.flyTo([d.lat, d.lng], 15, { duration: 1 });
    state.markers[id]?.openPopup();
  }
  renderSidebar();
}

/* ── Render hub list in sidebar ──────────────────────────────── */
function renderHubList() {
  const list = document.getElementById('hub-list');
  const hubs = Object.values(state.hubs);
  list.innerHTML = '';
  if (!hubs.length) {
    list.innerHTML = '<li class="empty-hint">No hubs yet. Click "📍 Place Hub".</li>';
    return;
  }
  hubs.forEach(hub => {
    const li = document.createElement('li');
    li.className  = 'hub-card';
    li.dataset.id = hub.id;

    const hubFleets   = Object.values(state.fleets).filter(f => f.hubId === hub.id);
    const hubMissions = Object.values(state.missions).filter(m => m.hubId === hub.id);
    const active = hubMissions.filter(m => m.status === 'active').length;
    const queued = hubMissions.filter(m => m.status === 'queued').length;

    li.innerHTML = `
      <div class="hub-card__row">
        <span class="hub-card__icon">🏠</span>
        <span class="hub-card__name">${hub.name}</span>
      </div>
      <div class="hub-card__meta">
        <span>${hubFleets.length} fleet${hubFleets.length !== 1 ? 's' : ''}</span>
        <span>${active} active · ${queued} queued</span>
      </div>
    `;
    li.addEventListener('click', () => {
      map.flyTo([hub.lat, hub.lng], 15, { duration: 1 });
      openHubPanel(hub.id);
    });
    list.appendChild(li);
  });
}

/* ══════════════════════════════════════════════════════════════
   HUB PANEL
   ══════════════════════════════════════════════════════════════ */

const hubPanel     = document.getElementById('hub-panel');
const hubPanelTitle = document.getElementById('hub-panel-title');

function openHubPanel(hubId) {
  state.activeHubId = hubId;
  const hub = state.hubs[hubId];
  if (!hub) return;

  hubPanelTitle.textContent = hub.name;
  hubPanel.classList.remove('hidden');

  // Default to fleets tab
  switchTab('fleets');
  renderHubPanel();
}

function closeHubPanel() {
  hubPanel.classList.add('hidden');
  state.activeHubId = null;
}

function renderHubPanel() {
  const hubId = state.activeHubId;
  if (!hubId) return;
  const hub = state.hubs[hubId];
  if (!hub) { closeHubPanel(); return; }

  hubPanelTitle.textContent = hub.name;
  renderFleetList(hubId);
  renderMissionList(hubId);
  renderInfoTab(hubId);
}

/* ── Tab switching ────────────────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll('.hub-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.hub-tab-content').forEach(el => el.classList.toggle('active', el.id === `tab-${name}`));
}

document.querySelectorAll('.hub-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('hub-panel-close').addEventListener('click', closeHubPanel);

/* ── Fleet list renderer ──────────────────────────────────────── */
function renderFleetList(hubId) {
  const container = document.getElementById('fleet-list');
  const fleets    = Object.values(state.fleets).filter(f => f.hubId === hubId);
  container.innerHTML = '';

  if (!fleets.length) {
    container.innerHTML = '<p class="empty-hint">No fleets yet.</p>';
    return;
  }

  fleets.forEach(fleet => {
    const card = document.createElement('div');
    card.className = 'fleet-card';
    card.dataset.id = fleet.id;

    const mission = fleet.currentMissionId ? state.missions[fleet.currentMissionId] : null;
    const statusLabel = fleet.status === 'on-mission'
      ? `<span class="fleet-status fleet-status--busy">On Mission${mission ? ': ' + mission.title : ''}</span>`
      : `<span class="fleet-status fleet-status--idle">Idle</span>`;

    // Build drone chips
    const droneChips = fleet.droneIds.map(did => {
      const d = state.drones[did];
      const label = d ? d.name : did;
      return `<span class="drone-chip" data-fleet="${fleet.id}" data-drone="${did}">${label} <button class="chip-remove" data-fleet="${fleet.id}" data-drone="${did}" title="Remove">×</button></span>`;
    }).join('');

    // Available drones not in this fleet
    const available = Object.values(state.drones).filter(d => !fleet.droneIds.includes(d.id));
    const opts = available.map(d => `<option value="${d.id}">${d.name} (${d.id})</option>`).join('');

    card.innerHTML = `
      <div class="fleet-card__header">
        <span class="fleet-card__name">${fleet.name}</span>
        <div class="fleet-card__actions">
          ${statusLabel}
          <button class="btn-xs fleet-delete" data-id="${fleet.id}" title="Delete fleet">🗑</button>
        </div>
      </div>
      <div class="fleet-card__drones">
        ${droneChips || '<span class="empty-hint">No drones assigned.</span>'}
      </div>
      ${available.length ? `
      <div class="fleet-card__add-drone">
        <select class="drone-select" data-fleet="${fleet.id}">
          <option value="">— add drone —</option>
          ${opts}
        </select>
      </div>` : ''}
    `;
    container.appendChild(card);
  });

  // Bind delete fleet
  container.querySelectorAll('.fleet-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteFleet(hubId, btn.dataset.id));
  });

  // Bind remove drone from fleet
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => removeDroneFromFleet(hubId, btn.dataset.fleet, btn.dataset.drone));
  });

  // Bind add drone select
  container.querySelectorAll('.drone-select').forEach(sel => {
    sel.addEventListener('change', () => {
      if (sel.value) {
        addDroneToFleet(hubId, sel.dataset.fleet, sel.value);
        sel.value = '';
      }
    });
  });
}

/* ── Mission list renderer ────────────────────────────────────── */
const MISSION_TYPE_ICONS = {
  general:      '📋',
  surveillance: '👁',
  delivery:     '📦',
  search:       '🔍',
  inspection:   '🔧',
};

function renderMissionList(hubId) {
  const ol       = document.getElementById('mission-list');
  const missions = Object.values(state.missions)
    .filter(m => m.hubId === hubId)
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  ol.innerHTML = '';

  if (!missions.length) {
    ol.innerHTML = '<li class="empty-hint" style="list-style:none;padding:8px 0">No missions queued.</li>';
    return;
  }

  missions.forEach((m, idx) => {
    const li = document.createElement('li');
    li.className = `mission-item mission-item--${m.status}`;

    const assignedFleet = m.assignedFleetId ? state.fleets[m.assignedFleetId] : null;
    const fleetLabel    = assignedFleet ? ` · ${assignedFleet.name}` : '';
    const icon          = MISSION_TYPE_ICONS[m.type] || '📋';

    li.innerHTML = `
      <div class="mission-item__left">
        <span class="mission-num">${idx + 1}</span>
        <span class="mission-icon">${icon}</span>
        <div class="mission-info">
          <span class="mission-title">${m.title}</span>
          <span class="mission-meta">${m.type} · ${m.requiredDrones} drone${m.requiredDrones !== 1 ? 's' : ''}${fleetLabel}</span>
        </div>
      </div>
      <div class="mission-item__right">
        <span class="mission-badge mission-badge--${m.status}">${m.status}</span>
        ${m.status === 'active' ? `<button class="btn-xs btn-xs--green mission-complete" data-id="${m.id}">✓ Done</button>` : ''}
        ${m.status !== 'active' ? `<button class="btn-xs mission-remove" data-id="${m.id}" title="Remove">🗑</button>` : ''}
      </div>
    `;
    ol.appendChild(li);
  });

  // Bind complete
  ol.querySelectorAll('.mission-complete').forEach(btn => {
    btn.addEventListener('click', () => completeMission(hubId, btn.dataset.id));
  });

  // Bind remove
  ol.querySelectorAll('.mission-remove').forEach(btn => {
    btn.addEventListener('click', () => deleteMission(hubId, btn.dataset.id));
  });
}

/* ── Info tab renderer ────────────────────────────────────────── */
function renderInfoTab(hubId) {
  const hub = state.hubs[hubId];
  if (!hub) return;
  document.getElementById('info-hub-id').textContent      = hub.id;
  document.getElementById('info-hub-name').value          = hub.name;
  document.getElementById('info-hub-coords').textContent  = `${hub.lat.toFixed(5)}, ${hub.lng.toFixed(5)}`;
  document.getElementById('info-hub-created').textContent = new Date(hub.createdAt).toLocaleString();
}

/* ══════════════════════════════════════════════════════════════
   API CALLS
   ══════════════════════════════════════════════════════════════ */

async function createHub(lat, lng) {
  const name = `Hub #${Object.keys(state.hubs).length + 1}`;
  const res  = await fetch(`${API_BASE}/hubs`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, lat, lng }),
  });
  return res.ok ? res.json() : null;
}

async function renameHub(hubId, name) {
  await fetch(`${API_BASE}/hubs/${hubId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name }),
  });
}

async function deleteHub(hubId) {
  await fetch(`${API_BASE}/hubs/${hubId}`, { method: 'DELETE' });
}

async function createFleet(hubId, name) {
  const res = await fetch(`${API_BASE}/hubs/${hubId}/fleets`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name }),
  });
  return res.ok ? res.json() : null;
}

async function deleteFleet(hubId, fleetId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}`, { method: 'DELETE' });
}

async function addDroneToFleet(hubId, fleetId, droneId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}/drones`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ droneId }),
  });
}

async function removeDroneFromFleet(hubId, fleetId, droneId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}/drones/${droneId}`, { method: 'DELETE' });
}

async function createMission(hubId, title, type, requiredDrones, priority) {
  const res = await fetch(`${API_BASE}/hubs/${hubId}/missions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ title, type, requiredDrones, priority }),
  });
  return res.ok ? res.json() : null;
}

async function deleteMission(hubId, missionId) {
  await fetch(`${API_BASE}/hubs/${hubId}/missions/${missionId}`, { method: 'DELETE' });
}

async function completeMission(hubId, missionId) {
  await fetch(`${API_BASE}/hubs/${hubId}/missions/${missionId}/complete`, { method: 'POST' });
}

/* ══════════════════════════════════════════════════════════════
   HUB PLACEMENT MODE
   ══════════════════════════════════════════════════════════════ */

const placeBanner = document.getElementById('place-banner');

function enterPlacingMode() {
  state.placingHub = true;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.classList.remove('hidden');
  document.getElementById('btn-place-hub').classList.add('btn-icon--active');
}

function exitPlacingMode() {
  state.placingHub = false;
  map.getContainer().style.cursor = '';
  placeBanner.classList.add('hidden');
  document.getElementById('btn-place-hub').classList.remove('btn-icon--active');
}

document.getElementById('btn-place-hub').addEventListener('click', () => {
  if (state.placingHub) exitPlacingMode();
  else enterPlacingMode();
});

document.getElementById('btn-cancel-place').addEventListener('click', exitPlacingMode);

map.on('click', async (e) => {
  if (!state.placingHub) return;
  exitPlacingMode();
  const { lat, lng } = e.latlng;
  const hub = await createHub(lat, lng);
  if (hub) {
    map.flyTo([lat, lng], 14, { duration: 0.8 });
    // Panel opens via SSE event
  }
});

/* ══════════════════════════════════════════════════════════════
   PANEL FORM BINDINGS
   ══════════════════════════════════════════════════════════════ */

// ── Add Fleet ──
document.getElementById('btn-add-fleet').addEventListener('click', () => {
  document.getElementById('fleet-form').classList.toggle('hidden');
  document.getElementById('ff-name').focus();
});
document.getElementById('btn-cancel-fleet').addEventListener('click', () => {
  document.getElementById('fleet-form').classList.add('hidden');
  document.getElementById('ff-name').value = '';
});
document.getElementById('fleet-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('ff-name').value.trim();
  if (!name || !state.activeHubId) return;
  await createFleet(state.activeHubId, name);
  document.getElementById('ff-name').value = '';
  document.getElementById('fleet-form').classList.add('hidden');
});

// ── Add Mission ──
document.getElementById('btn-add-mission').addEventListener('click', () => {
  document.getElementById('mission-form').classList.toggle('hidden');
  document.getElementById('mf-title').focus();
});
document.getElementById('btn-cancel-mission').addEventListener('click', () => {
  document.getElementById('mission-form').classList.add('hidden');
  document.getElementById('mf-title').value = '';
});
document.getElementById('mission-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title    = document.getElementById('mf-title').value.trim();
  const type     = document.getElementById('mf-type').value;
  const drones   = parseInt(document.getElementById('mf-drones').value)   || 1;
  const priority = parseInt(document.getElementById('mf-priority').value) || 100;
  if (!title || !state.activeHubId) return;
  await createMission(state.activeHubId, title, type, drones, priority);
  document.getElementById('mf-title').value = '';
  document.getElementById('mission-form').classList.add('hidden');
});

// ── Rename Hub ──
document.getElementById('btn-rename-hub').addEventListener('click', async () => {
  const name = document.getElementById('info-hub-name').value.trim();
  if (!name || !state.activeHubId) return;
  await renameHub(state.activeHubId, name);
});

// ── Delete Hub ──
document.getElementById('btn-delete-hub').addEventListener('click', async () => {
  if (!state.activeHubId) return;
  const hub = state.hubs[state.activeHubId];
  if (!confirm(`Delete hub "${hub?.name}"? This will also delete all its fleets and missions.`)) return;
  await deleteHub(state.activeHubId);
  closeHubPanel();
});

/* ══════════════════════════════════════════════════════════════
   SSE CONNECTION
   ══════════════════════════════════════════════════════════════ */

const badge = document.getElementById('connection-badge');

function applyUpdate(d) {
  state.drones[d.id] = d;
  upsertMarker(d);
  renderSidebar();
}
function applyRemove(id) {
  delete state.drones[id];
  removeMarker(id);
  if (state.selected === id) state.selected = null;
  renderSidebar();
}

function applyHubUpdate(hub) {
  state.hubs[hub.id] = hub;
  upsertHubMarker(hub);
  renderHubList();
  if (state.activeHubId === hub.id) renderHubPanel();
}
function applyHubRemove(id) {
  delete state.hubs[id];
  removeHubMarker(id);
  renderHubList();
  if (state.activeHubId === id) closeHubPanel();
}

function applyFleetUpdate(fleet) {
  state.fleets[fleet.id] = fleet;
  // Refresh hub marker icon (busy state may change)
  const hub = state.hubs[fleet.hubId];
  if (hub) upsertHubMarker(hub);
  renderHubList();
  if (state.activeHubId === fleet.hubId) renderHubPanel();
}
function applyFleetRemove(id) {
  const fleet = state.fleets[id];
  delete state.fleets[id];
  if (fleet) {
    const hub = state.hubs[fleet.hubId];
    if (hub) upsertHubMarker(hub);
    renderHubList();
    if (state.activeHubId === fleet.hubId) renderHubPanel();
  }
}

function applyMissionUpdate(mission) {
  state.missions[mission.id] = mission;
  renderHubList();
  if (state.activeHubId === mission.hubId) renderHubPanel();
}
function applyMissionRemove(id) {
  const m = state.missions[id];
  delete state.missions[id];
  if (m) {
    renderHubList();
    if (state.activeHubId === m.hubId) renderHubPanel();
  }
}

function connect() {
  badge.textContent = 'Connecting…';
  badge.className   = 'badge badge--connecting';

  const es = new EventSource(SSE_URL);

  es.onopen = () => {
    badge.textContent = '● Live';
    badge.className   = 'badge badge--live';
  };

  es.onmessage = e => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'snapshot':
        msg.drones.forEach(applyUpdate);
        msg.hubs.forEach(applyHubUpdate);
        msg.fleets.forEach(applyFleetUpdate);
        msg.missions.forEach(applyMissionUpdate);
        break;
      case 'update':          applyUpdate(msg.drone);        break;
      case 'remove':          applyRemove(msg.id);           break;
      case 'hub:update':      applyHubUpdate(msg.hub);       break;
      case 'hub:remove':      applyHubRemove(msg.id);        break;
      case 'fleet:update':    applyFleetUpdate(msg.fleet);   break;
      case 'fleet:remove':    applyFleetRemove(msg.id);      break;
      case 'mission:update':  applyMissionUpdate(msg.mission); break;
      case 'mission:remove':  applyMissionRemove(msg.id);    break;
    }
  };

  es.onerror = () => {
    badge.textContent = '✕ Offline';
    badge.className   = 'badge badge--error';
    es.close();
    setTimeout(connect, 5000);
  };
}

connect();

/* ── Drone form submission ────────────────────────────────────── */
document.getElementById('drone-form').addEventListener('submit', async e => {
  e.preventDefault();

  const id      = document.getElementById('f-id').value.trim();
  const name    = document.getElementById('f-name').value.trim();
  const lat     = document.getElementById('f-lat').value;
  const lng     = document.getElementById('f-lng').value;
  const alt     = document.getElementById('f-alt').value;
  const speed   = document.getElementById('f-speed').value;
  const battery = document.getElementById('f-battery').value;
  const status  = document.getElementById('f-status').value;

  const body = { lat, lng };
  if (name)    body.name     = name;
  if (alt)     body.altitude = alt;
  if (speed)   body.speed    = speed;
  if (battery) body.battery  = battery;
  body.status = status;

  try {
    const res = await fetch(`${API_BASE}/drones/${id}/location`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.json(); alert(`Error: ${err.error}`); return; }
    e.target.reset();
    document.getElementById('f-status').value = 'active';
  } catch {
    alert('Could not reach the server. Is the backend running?');
  }
});
