/* ═══════════════════════════════════════════════════════════════
   Drone Command Center — frontend app (RTS Style)
   With User Authentication
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '/api';

// ─── Authentication Check ─────────────────────────────────────────────────────
async function checkAuthentication() {
  const isAuthenticated = await AuthClient.verifyToken();
  
  if (!isAuthenticated) {
    window.location.href = '/login/login.html';
    return false;
  }
  
  return true;
}

// Wrap app initialization with auth check
async function initApp() {
  const authenticated = await checkAuthentication();
  if (!authenticated) {
    return; // Will redirect in checkAuthentication
  }
  
  // Continue with normal app initialization
  console.log('✅ User authenticated:', AuthClient.getDisplayName());
  
  // Establish SSE connection after authentication is confirmed
  connect();
}

/* ── State ───────────────────────────────────────────────────── */
const state = {
  drones:   {},   // id → drone
  markers:  {},   // id → Leaflet marker (drones)
  selected: null, // selected drone id
  
  hubs:          {},  // id → hub
  hubMarkers:    {},  // id → Leaflet marker (hubs)
  fleets:        {},  // id → fleet
  missions:      {},  // id → mission
  
  // Ground units
  groundUnits:    {},     // id → ground unit
  groundMarkers:  {},     // id → Leaflet marker (ground units)
  groundPathLayers: {},   // id → Leaflet layer group for path visualization
  
  // Radio towers
  radioTowers:        {},     // id → radio tower
  radioRangeLayers:   {},     // id → Leaflet circle for radio range
  radioTowerMarkers:  {},     // id → Leaflet marker for radio tower
  
  // Radio effects
  activeRadioEffects: {},   // unitId → { towerId, effects }
  
  // Roads and paths
  roads:      {},   // id → road
  roadLayers: {},   // id → Leaflet polyline
  paths:      {},   // id → walkable path
  pathLayers: {},   // id → Leaflet polyline
  
  activeHubId:   null, // hub whose panel is open
  focusedHubId:  null, // currently focused hub (for map highlight)
  placingHub:    false, // hub placement mode active?
  placingGroundUnit: false, // ground unit placement mode
  movingGroundUnit: null, // ground unit being moved
  
  // Simulation state
  simulatingDrone: null, // drone id being simulated
  simFlightPath:   null, // Leaflet polyline for flight path
  simPathLayer:    null, // Leaflet path layer group
  
  // RTS state
  selectedAction: null, // currently selected action from bottom panel
  dragPreview: null, // drag preview marker
  
  // Areas of Interest (AOI) state
  aois: {}, // id → aoi object
  aoiPolygons: {}, // id → Leaflet polygon
  selectedAoiId: null, // selected AOI id
  drawingAoi: false, // drawing mode active?
  drawingPoints: [], // array of [lat, lng] for current drawing
  drawingPolygon: null, // Leaflet polygon for drawing preview
  drawingMarkers: [], // Leaflet markers for drawing points
  
  // No-Go Zone drawing mode
  drawingNoGoZone: false, // no-go zone drawing mode active?
  
  // EW Signal Area drawing mode (box/rectangle)
  drawingEwArea: false, // EW area drawing mode active?
  ewAreaFirstCorner: null, // first corner [lat, lng]
  ewAreaPreviewLayer: null, // Leaflet rectangle for preview
  
  // AOI Highlight mode
  highlightingAoi: false, // highlight mode active?
  highlightColor: '#00d9ff', // current highlight color
  highlightedAoiId: null, // currently highlighted AOI id
  
  // Backend sync for no-go zones
  noGoZones: {}, // id → no-go zone object (synced with backend)
  
  // Ground unit selection
  selectedGroundUnit: null, // selected ground unit id
  
  // Naval units
  navalUnits:       {},     // id → naval unit
  navalMarkers:     {},     // id → Leaflet marker (naval units)
  navalPathLayers:  {},     // id → Leaflet layer group for path visualization
  
  // Water areas
  waterAreas:    {}, // id → water area
  waterLayers:   {}, // id → Leaflet polygon
  
  // Toggle for showing roads/paths
  showRoads: false,
  showPaths: false,
  
  // Road highlight state
  highlightingRoad: false, // road highlight mode active?
  highlightedRoadId: null, // currently highlighted road id
  highlightedRoadOriginalStyle: null, // store original style for restoration
  
  // Naval unit placement mode
  placingNavalUnit: false, // naval unit placement mode
  selectedNavalUnitType: 'fast-boat', // current naval unit type for spawning
  movingNavalUnit: null, // naval unit being moved
};

/* ── Map setup ───────────────────────────────────────────────── */
const map = L.map('map', { zoomControl: true }).setView([59.3293, 18.0686], 13);

// Prevent browser's default context menu on the map canvas
map.getContainer().addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Tile layer URLs for each theme
const THEME_TILES = {
  dark:     'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  midnight: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  desert:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
};

// Store current tile layer reference
let currentTileLayer = null;

// Initialize with default dark theme tiles
function setMapTileLayer(url) {
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
  }
  currentTileLayer = L.tileLayer(url, {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  }).addTo(map);
}

setMapTileLayer(THEME_TILES.dark);

/* ── Icon factories ──────────────────────────────────────────── */
function droneIcon(status) {
  return L.divIcon({
    className: '',
    html: `<div class="drone-marker drone-marker--${status}">🚁</div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -20],
  });
}

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

function groundUnitIcon(unitType, status, isRadioTower = false) {
  const icons = {
    humans: '👤',
    ifv:    '🛡️',
    tank:   '🪖',
    truck:  '🚚',
    'radio-tower': '📡'
  };
  const icon = icons[unitType] || (isRadioTower ? '📡' : '🚚');
  const statusClass = status === 'moving' ? 'moving' : status === 'warning' ? 'warning' : 'idle';
  const radioClass = isRadioTower ? ' radio-tower' : '';
  return L.divIcon({
    className: '',
    html: `<div class="ground-unit-marker ground-unit-marker--${statusClass}${radioClass}">${icon}</div>`,
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
    popupAnchor:[0, -18],
  });
}

function radioTowerIcon(active = true) {
  return L.divIcon({
    className: '',
    html: `<div class="radio-tower-marker ${active ? 'radio-tower--active' : 'radio-tower--inactive'}">📡</div>`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    popupAnchor:[0, -20],
  });
}

function navalUnitIcon(unitType, status) {
  const icons = {
    'fast-boat': '🚤',
    'battleship': '🚢',
    'aircraft-carrier': '🛥️'
  };
  const icon = icons[unitType] || '🚤';
  const statusClass = status === 'moving' ? 'moving' : status === 'warning' ? 'warning' : 'idle';
  return L.divIcon({
    className: '',
    html: `<div class="naval-unit-marker naval-unit-marker--${statusClass}">${icon}</div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -20],
  });
}

/* ── Popup content generators ────────────────────────────────── */
function popupContent(d) {
  const battClass = d.battery > 50 ? 'high' : d.battery > 20 ? 'medium' : 'low';
  const fleet = Object.values(state.fleets).find(f => f.droneIds.includes(d.id));
  const hub = d.hubId ? state.hubs[d.hubId] : null;
  
  let assignments = '';
  if (fleet) assignments += `<br>🚚 Fleet: <b>${fleet.name}</b>`;
  if (hub) assignments += `<br>🏠 Hub: <b>${hub.name}</b>`;
  if (!fleet && !hub) assignments = `<br><small style="color:#889">Unassigned</small>`;
  
  const isSimulating = state.simulatingDrone === d.id;
  
  return `
    <strong>${d.name}</strong> <small style="color:#8890b5">${d.id}</small><br>
    📍 ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}<br>
    🏔️ Alt: <b>${d.altitude} m</b> &nbsp; 💨 Speed: <b>${d.speed} km/h</b><br>
    🔋 Battery: <b style="color:var(--${battClass === 'high' ? 'green' : battClass === 'medium' ? 'yellow' : 'red'})">${d.battery}%</b><br>
    🕒 ${new Date(d.updatedAt).toLocaleTimeString()}${assignments}<br>
    <hr style="margin:8px 0;border:none;border-top:1px solid #ddd"><br>
    <button class="btn-xs btn-xs--primary" onclick="event.stopPropagation(); enterSimulationMode('${d.id}');">🛫 Simulate Flight</button>
    ${isSimulating ? '<br><small style="color:#0f0">● Simulating...</small>' : ''}
  `;
}

function groundUnitPopupContent(unit) {
  const onRoadBadge = unit.onRoad ? '<span style="color:#0f0">● On Road</span>' : '<span style="color:#888">● Off Road</span>';
  
  return `
    <strong>${unit.name}</strong> <small style="color:#8890b5">${unit.id}</small><br>
    📍 ${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}<br>
    🚗 Type: <b>${unit.type}</b> &nbsp; ${onRoadBadge}<br>
    💨 Speed: <b>${unit.speed} km/h</b><br>
    🔋 Battery: <b>${unit.battery}%</b><br>
    📊 Status: <b>${unit.status}</b><br>
    🕒 ${new Date(unit.updatedAt).toLocaleTimeString()}<br>
    <hr style="margin:8px 0;border:none;border-top:1px solid #ddd"><br>
    <button class="btn-xs btn-xs--primary" onclick="event.stopPropagation(); enterGroundUnitMoveMode('${unit.id}');">🎯 Move</button>
    ${unit.status === 'moving' ? '<br><small style="color:#0f0">● Moving...</small>' : ''}
  `;
}

/* ── Marker management ───────────────────────────────────────── */
function upsertMarker(d) {
  if (state.markers[d.id]) {
    state.markers[d.id]
      .setLatLng([d.lat, d.lng])
      .setIcon(droneIcon(d.status))
      .setPopupContent(popupContent(d));
  } else {
    const marker = L.marker([d.lat, d.lng], { icon: droneIcon(d.status) })
      .addTo(map).bindPopup(popupContent(d));
    marker.on('click', () => selectDrone(d.id));
    addContextMenuToDroneMarker(marker, d);
    state.markers[d.id] = marker;
  }
}

function removeMarker(id) {
  if (state.markers[id]) {
    map.removeLayer(state.markers[id]);
    delete state.markers[id];
  }
}

function upsertGroundUnitMarker(unit) {
  if (state.groundMarkers[unit.id]) {
    state.groundMarkers[unit.id]
      .setLatLng([unit.lat, unit.lng])
      .setIcon(groundUnitIcon(unit.type, unit.status))
      .setPopupContent(groundUnitPopupContent(unit));
  } else {
    const marker = L.marker([unit.lat, unit.lng], { icon: groundUnitIcon(unit.type, unit.status) })
      .addTo(map).bindPopup(groundUnitPopupContent(unit));
    marker.on('click', () => selectGroundUnit(unit.id));
    addContextMenuToGroundUnitMarker(marker, unit);
    state.groundMarkers[unit.id] = marker;
  }
}

function removeGroundUnitMarker(id) {
  if (state.groundMarkers[id]) {
    map.removeLayer(state.groundMarkers[id]);
    delete state.groundMarkers[id];
  }
  if (state.groundPathLayers[id]) {
    map.removeLayer(state.groundPathLayers[id]);
    delete state.groundPathLayers[id];
  }
}

// ─── Radio Tower Functions ─────────────────────────────────────────────

function upsertRadioTowerMarker(tower) {
  const isActive = tower.radioActive !== 0;
  
  if (state.radioTowerMarkers[tower.id]) {
    state.radioTowerMarkers[tower.id]
      .setLatLng([tower.lat, tower.lng])
      .setIcon(radioTowerIcon(isActive))
      .setPopupContent(radioTowerPopupContent(tower));
  } else {
    const marker = L.marker([tower.lat, tower.lng], { icon: radioTowerIcon(isActive) })
      .addTo(map).bindPopup(radioTowerPopupContent(tower));
    marker.on('click', () => selectRadioTower(tower.id));
    state.radioTowerMarkers[tower.id] = marker;
  }
  
  // Update radio range circle
  upsertRadioRangeCircle(tower);
}

function removeRadioTowerMarker(id) {
  if (state.radioTowerMarkers[id]) {
    map.removeLayer(state.radioTowerMarkers[id]);
    delete state.radioTowerMarkers[id];
  }
  if (state.radioRangeLayers[id]) {
    map.removeLayer(state.radioRangeLayers[id]);
    delete state.radioRangeLayers[id];
  }
}

function upsertRadioRangeCircle(tower) {
  const rangeMeters = tower.radioRangeMeters || 500;
  const isActive = tower.radioActive !== 0;
  
  if (state.radioRangeLayers[tower.id]) {
    state.radioRangeLayers[tower.id].setLatLngs([tower.lat, tower.lng]);
    state.radioRangeLayers[tower.id].setRadius(rangeMeters);
    state.radioRangeLayers[tower.id].setStyle({
      color: isActive ? '#00ff88' : '#666666',
      fillColor: isActive ? 'rgba(0, 255, 136, 0.15)' : 'rgba(100, 100, 100, 0.1)',
      fillOpacity: isActive ? 0.15 : 0.1,
      weight: isActive ? 2 : 1,
      dashArray: isActive ? '10, 10' : '5, 5'
    });
  } else {
    const circle = L.circle([tower.lat, tower.lng], {
      radius: rangeMeters,
      color: isActive ? '#00ff88' : '#666666',
      fillColor: isActive ? 'rgba(0, 255, 136, 0.15)' : 'rgba(100, 100, 100, 0.1)',
      fillOpacity: isActive ? 0.15 : 0.1,
      weight: isActive ? 2 : 1,
      dashArray: isActive ? '10, 10' : '5, 5'
    }).addTo(map);
    
    circle.bindTooltip(`${tower.name} - ${rangeMeters}m range`, { permanent: false });
    state.radioRangeLayers[tower.id] = circle;
  }
}

function radioTowerPopupContent(tower) {
  const isActive = tower.radioActive !== 0;
  const range = tower.radioRangeMeters || 500;
  const effects = tower.radioEffects || {
    drones: { speedBoost: 1.2, batteryEfficiency: 1.1 },
    ground: { speedBoost: 1.15, accuracyBoost: 1.2 },
    naval: { speedBoost: 1.1, commsRangeBoost: 1.3 },
    radio: { rangeExtension: 1.5, powerBoost: 1.2 }
  };
  
  return `
    <strong>${tower.name}</strong> <small style="color:#8890b5">${tower.id}</small><br>
    📡 Radio Tower<br>
    📍 ${tower.lat.toFixed(5)}, ${tower.lng.toFixed(5)}<br>
    📶 Range: <b>${range}m</b><br>
    🟢 Status: <b>${isActive ? 'Active' : 'Inactive'}</b><br>
    <hr style="margin:8px 0;border:none;border-top:1px solid #ddd"><br>
    <button class="btn-xs btn-xs--primary" onclick="event.stopPropagation(); toggleRadioTower('${tower.id}');">
      ${isActive ? '⏸ Deactivate' : '▶ Activate'}
    </button>
    <button class="btn-xs btn-xs--secondary" onclick="event.stopPropagation(); configureRadioTower('${tower.id}');">
      ⚙️ Configure
    </button>
    <br><br>
    <small><b>Effects:</b><br>
    🚁 Drones: +${Math.round((effects.drones?.speedBoost || 1.2) * 100 - 100)}% speed<br>
    🚗 Ground: +${Math.round((effects.ground?.speedBoost || 1.15) * 100 - 100)}% speed<br>
    🚤 Naval: +${Math.round((effects.naval?.speedBoost || 1.1) * 100 - 100)}% speed<br>
    📡 Radio: +${Math.round((effects.radio?.rangeExtension || 1.5) * 100 - 100)}% range</small>
  `;
}

function selectRadioTower(id) {
  state.selectedRadioTower = id;
  const tower = state.radioTowers[id];
  if (tower) {
    map.flyTo([tower.lat, tower.lng], 16, { duration: 1 });
    state.radioTowerMarkers[id]?.openPopup();
  }
  renderRadioTowerPanel();
}

function toggleRadioTower(towerId) {
  fetch(`${API_BASE}/radio-towers/${towerId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(res => {
    if (res.ok) {
      showFeedback('Radio tower toggled', 'success');
    }
  });
}

function configureRadioTower(towerId) {
  const tower = state.radioTowers[towerId];
  if (!tower) return;
  
  const newRange = prompt('Enter radio range in meters (default 500):', tower.radioRangeMeters || 500);
  if (newRange !== null) {
    const range = parseInt(newRange) || 500;
    fetch(`${API_BASE}/radio-towers/${towerId}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radioRangeMeters: range })
    }).then(res => {
      if (res.ok) {
        showFeedback(`Radio range set to ${range}m`, 'success');
      }
    });
  }
}

function renderRadioTowerPanel() {
  // This could be expanded to show a dedicated panel for radio tower settings
  const tower = state.radioTowers[state.selectedRadioTower];
  if (tower) {
    console.log('Selected radio tower:', tower);
  }
}

function upsertNavalUnitMarker(unit) {
  if (state.navalMarkers[unit.id]) {
    state.navalMarkers[unit.id]
      .setLatLng([unit.lat, unit.lng])
      .setIcon(navalUnitIcon(unit.type, unit.status))
      .setPopupContent(navalUnitPopupContent(unit));
  } else {
    const marker = L.marker([unit.lat, unit.lng], { icon: navalUnitIcon(unit.type, unit.status) })
      .addTo(map).bindPopup(navalUnitPopupContent(unit));
    marker.on('click', () => selectNavalUnit(unit.id));
    addContextMenuToNavalUnitMarker(marker, unit);
    state.navalMarkers[unit.id] = marker;
  }
}

function removeNavalUnitMarker(id) {
  if (state.navalMarkers[id]) {
    map.removeLayer(state.navalMarkers[id]);
    delete state.navalMarkers[id];
  }
  if (state.navalPathLayers[id]) {
    map.removeLayer(state.navalPathLayers[id]);
    delete state.navalPathLayers[id];
  }
}

function navalUnitPopupContent(unit) {
  const typeInfo = getNavalUnitTypeInfo(unit.type);
  
  return `
    <strong>${unit.name}</strong> <small style="color:#8890b5">${unit.id}</small><br>
    📍 ${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}<br>
    🚤 Type: <b>${typeInfo.name}</b><br>
    💨 Speed: <b>${unit.speed} km/h</b><br>
    🔋 Battery: <b>${unit.battery}%</b><br>
    📊 Status: <b>${unit.status}</b><br>
    🕒 ${new Date(unit.updatedAt).toLocaleTimeString()}<br>
    <hr style="margin:8px 0;border:none;border-top:1px solid #ddd"><br>
    <button class="btn-xs btn-xs--primary" onclick="event.stopPropagation(); enterNavalUnitMoveMode('${unit.id}');">🎯 Move</button>
    ${unit.status === 'moving' ? '<br><small style="color:#0f0">● Moving...</small>' : ''}
  `;
}

function getNavalUnitTypeInfo(type) {
  const types = {
    'fast-boat': { name: 'Fast Boat', icon: '🚤', description: 'Quick reconnaissance vessel' },
    'battleship': { name: 'Battleship', icon: '🚢', description: 'Heavily armed warship' },
    'aircraft-carrier': { name: 'Aircraft Carrier', icon: '🛥️', description: 'Mobile airbase' }
  };
  return types[type] || { name: 'Naval Unit', icon: '🚤', description: 'Water vessel' };
}

function upsertWaterAreaLayer(area) {
  if (state.waterLayers[area.id]) {
    state.waterLayers[area.id].setLatLngs(area.coordinates);
  } else {
    const polygon = L.polygon(area.coordinates, {
      color: '#0088cc',
      fillColor: 'rgba(0, 136, 204, 0.2)',
      fillOpacity: 0.2,
      weight: 2,
      dashArray: '5, 5'
    }).addTo(map);
    polygon.bindTooltip(area.name || 'Water Area', { permanent: false });
    state.waterLayers[area.id] = polygon;
  }
}

function drawNavalUnitPath(unitId, path) {
  if (state.navalPathLayers[unitId]) {
    map.removeLayer(state.navalPathLayers[unitId]);
  }
  if (!path || path.length === 0) return;
  
  const layerGroup = L.layerGroup().addTo(map);
  L.polyline(path, { color: '#0088cc', weight: 3, opacity: 0.7 }).addTo(layerGroup);
  
  path.forEach((waypoint, index) => {
    L.circleMarker(waypoint, {
      radius: index === path.length - 1 ? 8 : 4,
      color: index === path.length - 1 ? '#0088cc' : '#006699',
      fillColor: index === path.length - 1 ? '#0088cc' : '#006699',
      fillOpacity: index === path.length - 1 ? 0.8 : 0.5
    }).addTo(layerGroup);
  });
  
  state.navalPathLayers[unitId] = layerGroup;
}

function clearNavalUnitPath(unitId) {
  if (state.navalPathLayers[unitId]) {
    map.removeLayer(state.navalPathLayers[unitId]);
    delete state.navalPathLayers[unitId];
  }
}

function upsertHubMarker(hub) {
  const isFocused = state.focusedHubId === hub.id;
  
  if (state.hubMarkers[hub.id]) {
    state.hubMarkers[hub.id]
      .setLatLng([hub.lat, hub.lng])
      .setIcon(hubIcon(hub));
    const markerEl = state.hubMarkers[hub.id].getElement();
    if (markerEl) markerEl.classList.toggle('hub-marker-focused', isFocused);
  } else {
    const marker = L.marker([hub.lat, hub.lng], { icon: hubIcon(hub), zIndexOffset: 500 })
      .addTo(map).bindTooltip(hub.name, { permanent: true, direction: 'bottom', className: 'hub-tooltip' });
    marker.on('click', () => focusHub(hub.id));
    addContextMenuToHubMarker(marker, hub);
    state.hubMarkers[hub.id] = marker;
    if (isFocused) {
      const markerEl = marker.getElement();
      if (markerEl) markerEl.classList.add('hub-marker-focused');
    }
  }
  state.hubMarkers[hub.id].setTooltipContent(hub.name);
}

function removeHubMarker(id) {
  if (state.hubMarkers[id]) {
    map.removeLayer(state.hubMarkers[id]);
    delete state.hubMarkers[id];
  }
}

/* ── Road and path rendering ─────────────────────────────────── */
function renderRoads() {
  Object.values(state.roadLayers).forEach(layer => map.removeLayer(layer));
  state.roadLayers = {};
  
  Object.values(state.roads).forEach(road => {
    const color = { highway: '#ffcc00', street: '#ffffff', residential: '#cccccc', avenue: '#ffcc00' }[road.type] || '#ffffff';
    const weight = { highway: 6, street: 4, residential: 3, avenue: 5 }[road.type] || 4;
    
    const polyline = L.polyline(road.coordinates, { color, weight, opacity: 0.8 }).addTo(map);
    polyline.bindTooltip(`${road.name} (${road.type})`, { permanent: false });
    state.roadLayers[road.id] = polyline;
  });
}

function renderPaths() {
  Object.values(state.pathLayers).forEach(layer => map.removeLayer(layer));
  state.pathLayers = {};
  
  Object.values(state.paths).forEach(aPath => {
    const color = { footpath: '#90ee90', sidewalk: '#87ceeb', trail: '#8b4513', 'bike-path': '#00ced1' }[aPath.type] || '#90ee90';
    
    const polyline = L.polyline(aPath.coordinates, { color, weight: 2, opacity: 0.6, dashArray: '5, 5' }).addTo(map);
    polyline.bindTooltip(`${aPath.name} (${aPath.type})`, { permanent: false });
    state.pathLayers[aPath.id] = polyline;
  });
}

function drawGroundUnitPath(unitId, path) {
  if (state.groundPathLayers[unitId]) {
    map.removeLayer(state.groundPathLayers[unitId]);
  }
  if (!path || path.length === 0) return;
  
  const layerGroup = L.layerGroup().addTo(map);
  L.polyline(path, { color: '#00ff00', weight: 3, opacity: 0.7 }).addTo(layerGroup);
  
  path.forEach((waypoint, index) => {
    L.circleMarker(waypoint, {
      radius: index === path.length - 1 ? 8 : 4,
      color: index === path.length - 1 ? '#00ff00' : '#00aa00',
      fillColor: index === path.length - 1 ? '#00ff00' : '#00aa00',
      fillOpacity: index === path.length - 1 ? 0.8 : 0.5
    }).addTo(layerGroup);
  });
  
  state.groundPathLayers[unitId] = layerGroup;
}

function clearGroundUnitPath(unitId) {
  if (state.groundPathLayers[unitId]) {
    map.removeLayer(state.groundPathLayers[unitId]);
    delete state.groundPathLayers[unitId];
  }
}

/* ── Drone marker and popup handlers ─────────────────────────── */
function addContextMenuToDroneMarker(marker, drone) {
  marker.on('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    showEntityContextMenu(drone, 'drone', e.latlng);
  });
}

function addContextMenuToHubMarker(marker, hub) {
  marker.on('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    showEntityContextMenu(hub, 'hub', e.latlng);
  });
}

/* ── Ground & Naval unit context menus ────────────────────────── */
function addContextMenuToGroundUnitMarker(marker, unit) {
  marker.on('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    showEntityContextMenu(unit, 'ground-unit', e.latlng);
  });
}

function addContextMenuToNavalUnitMarker(marker, unit) {
  marker.on('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    showEntityContextMenu(unit, 'naval-unit', e.latlng);
  });
}

/* ── Ground unit handlers ────────────────────────────────────── */
function selectGroundUnit(id) {
  state.selectedGroundUnit = id;
  const unit = state.groundUnits[id];
  if (unit) {
    map.flyTo([unit.lat, unit.lng], 15, { duration: 1 });
    state.groundMarkers[id]?.openPopup();
  }
  renderGroundUnitList();
  renderGroundUnitSelectionPanel();
}

function enterGroundUnitMoveMode(unitId) {
  const unit = state.groundUnits[unitId];
  if (!unit) return;
  
  state.movingGroundUnit = unitId;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = `🎯 Click on map to set destination for ${unit.name} — <button id="btn-cancel-place" class="btn-xs">Cancel</button>`;
  placeBanner.classList.remove('hidden');
}

function exitGroundUnitMoveMode() {
  state.movingGroundUnit = null;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
}

async function moveGroundUnit(unitId, targetLat, targetLng) {
  const res = await fetch(`${API_BASE}/ground-units/${unitId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLat, targetLng }),
  });
  
  if (res.ok) {
    const result = await res.json();
    if (result.path) {
      drawGroundUnitPath(unitId, result.path);
      showFeedback(`Unit moving via ${result.mode} path`, 'success');
    }
  } else {
    const error = await res.json();
    showFeedback(error.error || 'Failed to move unit', 'warning');
  }
  
  exitGroundUnitMoveMode();
}

/* ── Ground unit sidebar ─────────────────────────────────────── */
function groundUnitCardHTML(unit) {
  const typeIcons = { humans: '👤', ifv: '🛡️', tank: '🪖', truck: '🚚' };
  const icon = typeIcons[unit.type] || '🚚';
  const onRoadClass = unit.onRoad ? 'on-road' : 'off-road';
  
  return `
    <div class="card-header">
      <span class="card-name">
        <span class="status-dot status-dot--${unit.status}"></span>${unit.name}
      </span>
      <span class="card-id">${unit.id}</span>
      <button class="btn-delete-unit" data-id="${unit.id}" title="Delete unit">🗑</button>
    </div>
    <div class="card-stats">
      <div class="stat">Type <span>${unit.type}</span></div>
      <div class="stat">Speed <span>${unit.speed} km/h</span></div>
      <div class="stat">Lat <span>${unit.lat.toFixed(4)}</span></div>
      <div class="stat">Lng <span>${unit.lng.toFixed(4)}</span></div>
    </div>
    <div class="card-assignment">
      <span class="road-status ${onRoadClass}">${icon} ${unit.onRoad ? 'On Road' : 'Off Road'}</span>
    </div>
    <div class="battery-bar">
      <div class="battery-fill battery-fill--${unit.battery > 50 ? 'high' : unit.battery > 20 ? 'medium' : 'low'}" style="width:${unit.battery}%"></div>
    </div>
  `;
}

function renderGroundUnitList() {
  const list = document.getElementById('ground-unit-list');
  if (!list) return;
  
  const ids = Object.keys(state.groundUnits);
  [...list.children].forEach(li => { if (!state.groundUnits[li.dataset.id]) li.remove(); });
  
  ids.forEach(id => {
    const unit = state.groundUnits[id];
    let li = list.querySelector(`[data-id="${id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'drone-card ground-unit-card';
      li.dataset.id = id;
      li.addEventListener('click', () => selectGroundUnit(id));
      list.appendChild(li);
    }
    li.innerHTML = groundUnitCardHTML(unit);
    li.classList.toggle('selected', id === state.selectedGroundUnit);
  });
}

function renderGroundUnitSelectionPanel() {
  const emptyEl = document.getElementById('ground-selection-empty');
  const contentEl = document.getElementById('ground-selection-content');
  
  if (!state.selectedGroundUnit || !state.groundUnits[state.selectedGroundUnit]) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    return;
  }
  
  const unit = state.groundUnits[state.selectedGroundUnit];
  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');
  
  document.getElementById('ground-selection-name').textContent = unit.name;
  document.getElementById('ground-selection-id').textContent = unit.id;
  document.getElementById('ground-selection-type').textContent = unit.type;
  document.getElementById('ground-selection-speed').textContent = unit.speed + ' km/h';
  document.getElementById('ground-selection-status').textContent = unit.status;
  document.getElementById('ground-selection-road').textContent = unit.onRoad ? 'On Road' : 'Off Road';
}

/* ── Hub management ──────────────────────────────────────────── */
function focusHub(hubId) {
  state.focusedHubId = hubId;
  const hub = state.hubs[hubId];
  if (!hub) return;
  
  map.flyTo([hub.lat, hub.lng], 15, { duration: 1 });
  Object.values(state.hubs).forEach(h => upsertHubMarker(h));
  renderHubList();
  openHubPanel(hubId);
}

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
    li.className = 'hub-card';
    li.dataset.id = hub.id;
    
    const hubFleets = Object.values(state.fleets).filter(f => f.hubId === hub.id);
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
    li.classList.toggle('focused', hub.id === state.focusedHubId);
    li.addEventListener('click', () => focusHub(hub.id));
    list.appendChild(li);
  });
}

/* ── HUD Stats ───────────────────────────────────────────────── */
function updateHUDStats() {
  document.getElementById('stat-drones').textContent = Object.values(state.drones).length;
  document.getElementById('stat-hubs').textContent = Object.values(state.hubs).length;
  document.getElementById('stat-missions').textContent = Object.values(state.missions).length;
  
  const drones = Object.values(state.drones);
  if (drones.length > 0) {
    const avgBattery = Math.round(drones.reduce((sum, d) => sum + d.battery, 0) / drones.length);
    document.getElementById('stat-battery').textContent = avgBattery + '%';
  }
}

/* ── Drone sidebar ───────────────────────────────────────────── */
function cardHTML(d) {
  const battClass = d.battery > 50 ? 'high' : d.battery > 20 ? 'medium' : 'low';
  const fleet = Object.values(state.fleets).find(f => f.droneIds.includes(d.id));
  const hub = d.hubId ? state.hubs[d.hubId] : null;
  
  let assignmentHTML = '';
  if (fleet) assignmentHTML = `<div class="card-assignment"><span class="assignment-label">Fleet:</span> ${fleet.name}</div>`;
  if (hub) assignmentHTML += `<div class="card-assignment"><span class="assignment-label">Hub:</span> ${hub.name}</div>`;
  if (!fleet && !hub) assignmentHTML = `<div class="card-assignment card-assignment--unassigned"><small>Unassigned</small></div>`;
  
  return `
    <div class="card-header">
      <span class="card-name"><span class="status-dot status-dot--${d.status}"></span>${d.name}</span>
      <span class="card-id">${d.id}</span>
      <button class="btn-delete-unit" data-id="${d.id}" title="Delete drone">🗑</button>
    </div>
    <div class="card-stats">
      <div class="stat">Alt <span>${d.altitude} m</span></div>
      <div class="stat">Speed <span>${d.speed} km/h</span></div>
      <div class="stat">Lat <span>${d.lat.toFixed(4)}</span></div>
      <div class="stat">Lng <span>${d.lng.toFixed(4)}</span></div>
    </div>
    ${assignmentHTML}
    <div class="battery-bar">
      <div class="battery-fill battery-fill--${battClass}" style="width:${d.battery}%"></div>
    </div>
  `;
}

function renderSidebar() {
  const list = document.getElementById('drone-list');
  const ids = Object.keys(state.drones);
  [...list.children].forEach(li => { if (!state.drones[li.dataset.id]) li.remove(); });
  ids.forEach(id => {
    const d = state.drones[id];
    let li = list.querySelector(`[data-id="${id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'drone-card';
      li.dataset.id = id;
      li.addEventListener('click', () => selectDrone(id));
      list.appendChild(li);
    }
    li.innerHTML = cardHTML(d);
    li.classList.toggle('selected', id === state.selected);
  });
}

function selectDrone(id) {
  state.selected = id;
  const d = state.drones[id];
  if (d) {
    map.flyTo([d.lat, d.lng], 15, { duration: 1 });
    state.markers[id]?.openPopup();
  }
  renderSidebar();
  renderSelectionPanel();
}

function renderSelectionPanel() {
  const emptyEl = document.getElementById('selection-empty');
  const contentEl = document.getElementById('selection-content');
  
  if (!state.selected || !state.drones[state.selected]) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  
  const d = state.drones[state.selected];
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  
  document.getElementById('selection-name').textContent = d.name;
  document.getElementById('selection-id').textContent = d.id;
  document.getElementById('selection-battery').textContent = d.battery + '%';
  document.getElementById('selection-altitude').textContent = d.altitude + 'm';
  document.getElementById('selection-speed').textContent = d.speed + ' km/h';
  document.getElementById('selection-status').textContent = d.status;
}

/* ── Hub Panel ───────────────────────────────────────────────── */
const hubPanel = document.getElementById('hub-panel');
const hubPanelTitle = document.getElementById('hub-panel-title');

function openHubPanel(hubId) {
  state.activeHubId = hubId;
  const hub = state.hubs[hubId];
  if (!hub) return;
  
  hubPanelTitle.textContent = hub.name;
  hubPanel.classList.remove('hidden');
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
  renderDroneList(hubId);
  loadWaypointsForHub(hubId);
  renderSidebar();
}

function switchTab(name) {
  document.querySelectorAll('.hub-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.hub-tab-content').forEach(el => el.classList.toggle('active', el.id === `tab-${name}`));
}

document.querySelectorAll('.hub-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('hub-panel-close').addEventListener('click', closeHubPanel);

/* ── AoI Panel ───────────────────────────────────────────────── */
const aoiPanel = document.getElementById('aoi-panel');
const aoiPanelTitle = document.getElementById('aoi-panel-title');

function openAoiPanel(aoiId) {
  state.activeAoiId = aoiId;
  const aoi = state.aois[aoiId];
  if (!aoi) return;
  
  aoiPanelTitle.textContent = aoi.name;
  aoiPanel.classList.remove('hidden');
  renderAoiPanel(aoiId);
}

function closeAoiPanel() {
  aoiPanel.classList.add('hidden');
  state.activeAoiId = null;
}

function renderAoiPanel(aoiId) {
  const aoi = state.aois[aoiId];
  if (!aoi) { closeAoiPanel(); return; }
  
  aoiPanelTitle.textContent = aoi.name;
  
  // Details tab
  document.getElementById('aoi-info-id').textContent = aoi.id;
  document.getElementById('aoi-info-name').value = aoi.name;
  
  // Type
  let typeLabel = 'Area of Interest';
  if (aoi.isNoGoZone) typeLabel = '⛔ No-Go Zone';
  else if (aoi.isTarget) typeLabel = '🎯 Target Area';
  else if (aoi.isEwSignalArea) typeLabel = '📡 EW Signal Area';
  document.getElementById('aoi-info-type').textContent = typeLabel;
  
  // Coordinates
  const coordsText = aoi.coordinates.map(([lat, lng]) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`).join('\n');
  document.getElementById('aoi-info-coords').textContent = coordsText;
  
  // Points count
  document.getElementById('aoi-info-points').textContent = aoi.coordinates.length + ' points';
  
  // Area size
  const size = calculateAoiSize(aoi.coordinates);
  document.getElementById('aoi-info-size').textContent = size > 0 ? `${size.toFixed(2)} km²` : '—';
  
  // Center
  const center = getPolygonCenter(aoi.coordinates);
  if (center) {
    document.getElementById('aoi-info-center').textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  }
  
  // Target location (if applicable)
  const targetRow = document.getElementById('aoi-info-target-row');
  if (aoi.isTarget && aoi.targetLocation) {
    targetRow.classList.remove('hidden');
    document.getElementById('aoi-info-target').textContent = `${aoi.targetLocation.lat.toFixed(4)}, ${aoi.targetLocation.lng.toFixed(4)}`;
  } else {
    targetRow.classList.add('hidden');
  }
  
  // Ruleset tab
  document.getElementById('aoi-ruleset-editor').value = aoi.ruleset || '';
}

function switchAoiTab(name) {
  document.querySelectorAll('.hub-tab').forEach(btn => {
    if (btn.closest('#aoi-panel')) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    }
  });
  document.querySelectorAll('.hub-tab-content').forEach(el => {
    if (el.closest('#aoi-panel')) {
      el.classList.toggle('active', el.id === `tab-aoi-${name}`);
    }
  });
}

document.getElementById('aoi-panel-close').addEventListener('click', closeAoiPanel);

/* ── AoI Panel Event Handlers ────────────────────────────────── */
// Rename AoI
document.getElementById('btn-rename-aoi').addEventListener('click', () => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const newName = document.getElementById('aoi-info-name').value.trim();
  if (!newName) {
    showFeedback('Please enter a name', 'warning');
    return;
  }
  
  const aoi = state.aois[aoiId];
  if (aoi) {
    aoi.name = newName;
    saveAoIs();
    renderAoiPanel(aoiId);
    renderAoiList();
    
    // Update polygon tooltip
    const polygon = state.aoiPolygons[aoiId];
    if (polygon) {
      const isNoGo = aoi.isNoGoZone;
      const isTarget = aoi.isTarget;
      const isEwSignal = aoi.isEwSignalArea;
      let tooltipText = aoi.name;
      if (isEwSignal) tooltipText = '📡 ' + aoi.name;
      else if (isTarget) tooltipText = '🎯 ' + aoi.name;
      else if (isNoGo) tooltipText = '⛔ ' + aoi.name;
      polygon.setTooltipContent(tooltipText);
    }
    
    showFeedback('Area renamed!', 'success');
  }
});

// Delete AoI from panel
document.getElementById('btn-delete-aoi').addEventListener('click', () => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const aoi = state.aois[aoiId];
  if (aoi && confirm(`Delete "${aoi.name}"?`)) {
    deleteAoi(aoiId);
    closeAoiPanel();
  }
});

// Center on map
document.getElementById('btn-center-aoi-map').addEventListener('click', () => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const polygon = state.aoiPolygons[aoiId];
  if (polygon) {
    const bounds = L.latLngBounds(polygon.getLatLngs());
    map.flyToBounds(bounds, { padding: [50, 50] });
    showFeedback('Centered on area', 'success');
  }
});

// Save ruleset
document.getElementById('btn-save-aoi-ruleset').addEventListener('click', () => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const aoi = state.aois[aoiId];
  if (aoi) {
    const ruleset = document.getElementById('aoi-ruleset-editor').value;
    aoi.ruleset = ruleset;
    saveAoIs();
    renderAoiPanel(aoiId);
    showFeedback('Ruleset saved!', 'success');
  }
});

// Export ruleset
document.getElementById('btn-export-aoi-ruleset').addEventListener('click', () => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const aoi = state.aois[aoiId];
  if (aoi && aoi.ruleset) {
    const blob = new Blob([aoi.ruleset], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aoi.name.replace(/\s+/g, '_')}_ruleset.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('Ruleset exported!', 'success');
  } else {
    showFeedback('No ruleset to export', 'warning');
  }
});

// Import ruleset
document.getElementById('btn-import-aoi-ruleset').addEventListener('click', () => {
  document.getElementById('aoi-ruleset-import-file').click();
});

// Handle ruleset import file
document.getElementById('aoi-ruleset-import-file').addEventListener('change', (e) => {
  const aoiId = state.activeAoiId;
  if (!aoiId) return;
  
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const aoi = state.aois[aoiId];
    if (aoi) {
      aoi.ruleset = event.target.result;
      saveAoIs();
      renderAoiPanel(aoiId);
      showFeedback('Ruleset imported!', 'success');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// AoI tab switching
document.querySelectorAll('#aoi-panel .hub-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll('#aoi-panel .hub-tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('#aoi-panel .hub-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-aoi-${tabName}`));
  });
});

/* ── Fleet and Mission rendering ─────────────────────────────── */
function renderDroneAssignment(container, hubId) {
  const hubDrones = Object.values(state.drones).filter(d => d.hubId === hubId);
  const unassignedDrones = Object.values(state.drones).filter(d => !d.hubId);
  
  const assignedSection = document.createElement('div');
  assignedSection.className = 'drone-section';
  assignedSection.innerHTML = '<h4>🏠 Assigned to this hub</h4>';
  const assignedContainer = document.createElement('div');
  assignedContainer.className = 'drone-section-container';
  
  if (!hubDrones.length) {
    assignedContainer.innerHTML = '<p class="empty-hint">No drones assigned yet.</p>';
  } else {
    hubDrones.forEach(drone => {
      const fleet = Object.values(state.fleets).find(f => f.droneIds.includes(drone.id));
      const card = document.createElement('div');
      card.className = 'drone-assignment-card';
      card.dataset.id = drone.id;
      
      const fleetInfo = fleet ? `<span class="drone-fleet-tag">${fleet.name}</span>` : '<span class="drone-fleet-tag drone-fleet-tag--none">No fleet</span>';
      
      card.innerHTML = `
        <div class="drone-assignment-header">
          <span class="drone-assignment-name">${drone.name}</span>
          ${fleetInfo}
        </div>
        <div class="drone-assignment-stats">
          <span>🔋 ${drone.battery}%</span>
          <span>📍 ${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}</span>
          <span class="status-dot status-dot--${drone.status}"></span>
        </div>
        <button class="btn-xs btn-xs--danger drone-unassign" data-id="${drone.id}" title="Unassign from hub">Unassign</button>
      `;
      assignedContainer.appendChild(card);
    });
  }
  assignedSection.appendChild(assignedContainer);
  container.appendChild(assignedSection);
  
  const unassignedSection = document.createElement('div');
  unassignedSection.className = 'drone-section';
  unassignedSection.innerHTML = '<h4>📡 Available to assign</h4>';
  const unassignedContainer = document.createElement('div');
  unassignedContainer.className = 'drone-section-container';
  
  if (!unassignedDrones.length) {
    unassignedContainer.innerHTML = '<p class="empty-hint">All drones are assigned.</p>';
  } else {
    unassignedDrones.forEach(drone => {
      const card = document.createElement('div');
      card.className = 'drone-assignment-card drone-assignment-card--available';
      card.dataset.id = drone.id;
      
      card.innerHTML = `
        <div class="drone-assignment-header">
          <span class="drone-assignment-name">${drone.name}</span>
          <span class="drone-assignment-id">${drone.id}</span>
        </div>
        <div class="drone-assignment-stats">
          <span>🔋 ${drone.battery}%</span>
          <span>📍 ${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}</span>
          <span class="status-dot status-dot--${drone.status}"></span>
        </div>
        <button class="btn-xs btn-xs--primary drone-assign" data-id="${drone.id}" title="Assign to this hub">Assign</button>
      `;
      unassignedContainer.appendChild(card);
    });
  }
  unassignedSection.appendChild(unassignedContainer);
  container.appendChild(unassignedSection);
  
  container.querySelectorAll('.drone-unassign').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Unassign this drone from the hub?')) return;
      await unassignDroneFromHub(btn.dataset.id);
    });
  });
  container.querySelectorAll('.drone-assign').forEach(btn => {
    btn.addEventListener('click', async () => {
      await assignDroneToHub(btn.dataset.id, hubId);
    });
  });
}

function renderFleetList(hubId) {
  const container = document.getElementById('hub-fleet-list');
  if (!container) return;
  
  const hubFleets = Object.values(state.fleets).filter(f => f.hubId === hubId);
  
  // Clear existing content
  container.innerHTML = '';
  
  // Create fleet list section
  const section = document.createElement('div');
  section.className = 'fleet-section';
  
  const header = document.createElement('div');
  header.className = 'fleet-section-header';
  header.innerHTML = `
    <h4>🚢 Fleets</h4>
    <button class="btn-sm btn-sm--primary" id="btn-create-fleet">Create Fleet</button>
  `;
  section.appendChild(header);
  
  const listContainer = document.createElement('div');
  listContainer.className = 'fleet-list';
  
  if (!hubFleets.length) {
    listContainer.innerHTML = '<p class="empty-hint">No fleets yet. Create one to group drones.</p>';
  } else {
    hubFleets.forEach(fleet => {
      const droneCount = fleet.droneIds?.length || 0;
      const card = document.createElement('div');
      card.className = `fleet-card fleet-card--${fleet.status || 'idle'}`;
      card.dataset.id = fleet.id;
      
      card.innerHTML = `
        <div class="fleet-card-header">
          <span class="fleet-card-name">${fleet.name}</span>
          <span class="fleet-card-id">${fleet.id}</span>
        </div>
        <div class="fleet-card-stats">
          <span>🚁 ${droneCount} drone${droneCount !== 1 ? 's' : ''}</span>
          <span class="fleet-status">Status: ${fleet.status || 'idle'}</span>
          ${fleet.currentMissionId ? `<span>📋 Mission: ${fleet.currentMissionId}</span>` : ''}
        </div>
        <div class="fleet-card-actions">
          <button class="btn-xs btn-xs--danger fleet-delete" data-id="${fleet.id}" title="Delete fleet">Delete</button>
        </div>
      `;
      listContainer.appendChild(card);
    });
  }
  
  section.appendChild(listContainer);
  container.appendChild(section);
  
  // Create Fleet button handler
  const createBtn = document.getElementById('btn-create-fleet');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const name = prompt('Enter fleet name:');
      if (name?.trim()) {
        createFleet(hubId, name.trim());
      }
    });
  }
  
  // Delete fleet handlers
  container.querySelectorAll('.fleet-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fleetId = btn.dataset.id;
      if (confirm('Delete this fleet? Drones will remain assigned to the hub.')) {
        await deleteFleet(hubId, fleetId);
      }
    });
  });
}

/* ── Mission List Rendering ──────────────────────────────────── */
function renderMissionList(hubId) {
  const container = document.getElementById('mission-list');
  if (!container) return;
  
  const hubMissions = Object.values(state.missions).filter(m => m.hubId === hubId);
  
  container.innerHTML = '';
  
  if (!hubMissions.length) {
    container.innerHTML = '<li class="mission-list__empty">No missions queued. Click "+ Add Mission" to create one.</li>';
    return;
  }
  
  // Sort by priority (lower number = higher priority) and status (queued first, then active)
  const sortedMissions = [...hubMissions].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return a.priority - b.priority;
  });
  
  sortedMissions.forEach(mission => {
    const li = document.createElement('li');
    li.className = `mission-list__item mission-list__item--${mission.status}`;
    li.dataset.id = mission.id;
    
    const statusLabel = {
      'queued': '🟡 Queued',
      'active': '🟢 Active',
      'done': '⚪ Completed'
    }[mission.status] || 'Queued';
    
    const priorityLabel = mission.priority <= 10 ? '🔴 High' : mission.priority <= 50 ? '🟡 Medium' : '🟢 Low';
    
    const waypointInfo = mission.waypointId ? `<span class="mission-waypoint">📍 ${mission.waypointId}</span>` : '';
    
    li.innerHTML = `
      <div class="mission-list__header">
        <span class="mission-list__title">${mission.title}</span>
        <span class="mission-list__status">${statusLabel}</span>
      </div>
      <div class="mission-list__meta">
        <span class="mission-list__type">${mission.type}</span>
        <span class="mission-list__priority">${priorityLabel}</span>
        <span class="mission-list__drones">${mission.requiredDrones || 1} drone(s)</span>
        ${waypointInfo}
      </div>
      <div class="mission-list__actions">
        ${mission.status !== 'done' ? `<button class="btn-xs btn-xs--success mission-done" data-id="${mission.id}" title="Mark as done">✓ Done</button>` : ''}
        <button class="btn-xs btn-xs--danger mission-delete" data-id="${mission.id}" title="Delete mission">🗑 Delete</button>
      </div>
    `;
    
    container.appendChild(li);
  });
  
  // Bind event handlers
  container.querySelectorAll('.mission-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      const missionId = btn.dataset.id;
      await completeMission(hubId, missionId);
    });
  });
  
  container.querySelectorAll('.mission-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const missionId = btn.dataset.id;
      if (confirm('Delete this mission?')) {
        await deleteMission(hubId, missionId);
      }
    });
  });
}

/* ── Drone List Rendering for Hub ────────────────────────────── */
function renderDroneList(hubId) {
  const container = document.getElementById('drone-list-hub');
  if (!container) return;
  
  const hubDrones = Object.values(state.drones).filter(d => d.hubId === hubId);
  const unassignedDrones = Object.values(state.drones).filter(d => !d.hubId);
  
  container.innerHTML = '';
  
  // Assigned drones section
  const assignedSection = document.createElement('div');
  assignedSection.className = 'drone-list-section';
  assignedSection.innerHTML = '<h4 class="drone-list-section__title">🏠 Drones Assigned to This Hub</h4>';
  
  if (!hubDrones.length) {
    assignedSection.innerHTML += '<p class="drone-list-empty">No drones assigned to this hub yet.</p>';
  } else {
    const assignedList = document.createElement('div');
    assignedList.className = 'drone-list-container';
    
    hubDrones.forEach(drone => {
      const fleet = Object.values(state.fleets).find(f => f.droneIds?.includes(drone.id));
      const card = document.createElement('div');
      card.className = 'drone-list-card';
      card.dataset.id = drone.id;
      
      const battClass = drone.battery > 50 ? 'high' : drone.battery > 20 ? 'medium' : 'low';
      const fleetInfo = fleet ? `<span class="drone-list-fleet-tag">${fleet.name}</span>` : '<span class="drone-list-fleet-tag drone-list-fleet-tag--none">No fleet</span>';
      
      card.innerHTML = `
        <div class="drone-list-header">
          <span class="drone-list-name">${drone.name}</span>
          <span class="drone-list-id">${drone.id}</span>
          ${fleetInfo}
        </div>
        <div class="drone-list-stats">
          <span>🔋 ${drone.battery}%</span>
          <span>📍 ${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}</span>
          <span class="status-dot status-dot--${drone.status}"></span>
        </div>
        <div class="drone-list-battery">
          <div class="battery-bar battery-bar--${battClass}">
            <div class="battery-fill" style="width:${drone.battery}%"></div>
          </div>
        </div>
        <button class="btn-xs btn-xs--danger drone-unassign-from-hub" data-id="${drone.id}" title="Unassign from hub">Unassign</button>
      `;
      
      assignedList.appendChild(card);
    });
    
    assignedSection.appendChild(assignedList);
  }
  
  container.appendChild(assignedSection);
  
  // Unassigned drones section
  const unassignedSection = document.createElement('div');
  unassignedSection.className = 'drone-list-section';
  unassignedSection.innerHTML = '<h4 class="drone-list-section__title">📡 Available Drones (Unassigned)</h4>';
  
  if (!unassignedDrones.length) {
    unassignedSection.innerHTML += '<p class="drone-list-empty">All drones are assigned to hubs.</p>';
  } else {
    const unassignedList = document.createElement('div');
    unassignedList.className = 'drone-list-container';
    
    unassignedDrones.forEach(drone => {
      const card = document.createElement('div');
      card.className = 'drone-list-card drone-list-card--available';
      card.dataset.id = drone.id;
      
      const battClass = drone.battery > 50 ? 'high' : drone.battery > 20 ? 'medium' : 'low';
      
      card.innerHTML = `
        <div class="drone-list-header">
          <span class="drone-list-name">${drone.name}</span>
          <span class="drone-list-id">${drone.id}</span>
        </div>
        <div class="drone-list-stats">
          <span>🔋 ${drone.battery}%</span>
          <span>📍 ${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}</span>
          <span class="status-dot status-dot--${drone.status}"></span>
        </div>
        <div class="drone-list-battery">
          <div class="battery-bar battery-bar--${battClass}">
            <div class="battery-fill" style="width:${drone.battery}%"></div>
          </div>
        </div>
        <button class="btn-xs btn-xs--primary drone-assign-to-hub" data-id="${drone.id}" title="Assign to this hub">Assign to Hub</button>
      `;
      
      unassignedList.appendChild(card);
    });
    
    unassignedSection.appendChild(unassignedList);
  }
  
  container.appendChild(unassignedSection);
  
  // Bind event handlers
  container.querySelectorAll('.drone-unassign-from-hub').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Unassign this drone from the hub?')) return;
      await unassignDroneFromHub(btn.dataset.id);
    });
  });
  
  container.querySelectorAll('.drone-assign-to-hub').forEach(btn => {
    btn.addEventListener('click', async () => {
      await assignDroneToHub(btn.dataset.id, hubId);
    });
  });
}

/* ── Info Tab Rendering ──────────────────────────────────────── */
function renderInfoTab(hubId) {
  const hub = state.hubs[hubId];
  if (!hub) return;
  
  document.getElementById('info-hub-id').textContent = hub.id;
  document.getElementById('info-hub-name').value = hub.name;
  document.getElementById('info-hub-coords').textContent = `${hub.lat.toFixed(6)}, ${hub.lng.toFixed(6)}`;
  document.getElementById('info-hub-created').textContent = new Date(hub.createdAt).toLocaleString();
}

/* ── API Calls ───────────────────────────────────────────────── */
async function createHub(lat, lng) {
  const name = `Hub #${Object.keys(state.hubs).length + 1}`;
  const res = await fetch(`${API_BASE}/hubs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, lat, lng }),
  });
  return res.ok ? res.json() : null;
}

async function renameHub(hubId, name) {
  await fetch(`${API_BASE}/hubs/${hubId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

async function deleteHub(hubId) {
  await fetch(`${API_BASE}/hubs/${hubId}`, { method: 'DELETE' });
}

async function createFleet(hubId, name) {
  const res = await fetch(`${API_BASE}/hubs/${hubId}/fleets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.ok ? res.json() : null;
}

async function deleteFleet(hubId, fleetId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}`, { method: 'DELETE' });
}

async function addDroneToFleet(hubId, fleetId, droneId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}/drones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ droneId }),
  });
}

async function removeDroneFromFleet(hubId, fleetId, droneId) {
  await fetch(`${API_BASE}/hubs/${hubId}/fleets/${fleetId}/drones/${droneId}`, { method: 'DELETE' });
}

async function createMission(hubId, title, type, requiredDrones, priority, waypointId = null, endCondition = 'manual', endConditionValue = null) {
  const res = await fetch(`${API_BASE}/hubs/${hubId}/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, type, requiredDrones, priority, waypointId, endCondition, endConditionValue }),
  });
  return res.ok ? res.json() : null;
}

// Load waypoints for a specific hub (for mission creation dropdown)
async function loadWaypointsForHub(hubId) {
  const res = await fetch(`${API_BASE}/hubs/${hubId}/waypoints`);
  if (!res.ok) return [];
  
  const waypoints = await res.json();
  const dropdown = document.getElementById('mf-waypoint');
  if (!dropdown) return waypoints;
  
  // Keep the default option
  dropdown.innerHTML = '<option value="">— No waypoint —</option>';
  
  waypoints.forEach(wp => {
    const option = document.createElement('option');
    option.value = wp.id;
    
    // Format waypoint label based on type
    let label = wp.name;
    if (wp.type === 'hub') label = `🏠 ${wp.name}`;
    else if (wp.type === 'drone') label = `🚁 ${wp.name}`;
    else if (wp.type === 'ground-unit') label = `🚗 ${wp.name}`;
    else if (wp.type === 'naval-unit') label = `🚤 ${wp.name}`;
    else label = `📍 ${wp.name}`;
    
    option.textContent = label;
    dropdown.appendChild(option);
  });
  
  return waypoints;
}

async function deleteMission(hubId, missionId) {
  await fetch(`${API_BASE}/hubs/${hubId}/missions/${missionId}`, { method: 'DELETE' });
}

async function completeMission(hubId, missionId) {
  await fetch(`${API_BASE}/hubs/${hubId}/missions/${missionId}/complete`, { method: 'POST' });
}

async function assignDroneToHub(droneId, hubId) {
  const res = await fetch(`${API_BASE}/drones/${droneId}/assign-hub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hubId }),
  });
  return res.ok ? res.json() : null;
}

async function unassignDroneFromHub(droneId) {
  await fetch(`${API_BASE}/drones/${droneId}/assign-hub`, { method: 'DELETE' });
}

async function spawnDrone(lat, lng) {
  const droneCount = Object.keys(state.drones).length + 1;
  const name = `Drone ${droneCount}`;
  
  const res = await fetch(`${API_BASE}/drones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, lat, lng, altitude: 100, speed: 0, battery: 100, status: 'idle' }),
  });
  return res.ok ? res.json() : null;
}

async function spawnDroneAtLocation(lat, lng) {
  const droneCount = Object.keys(state.drones).length + 1;
  const name = `Drone ${droneCount}`;
  
  const res = await fetch(`${API_BASE}/drones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, lat, lng, altitude: 100, speed: 0, battery: 100, status: 'idle' }),
  });
  
  if (res.ok) {
    showFeedback('Drone spawned at location!', 'success');
    return await res.json();
  }
  return null;
}

async function spawnGroundUnit(lat, lng, type = 'truck') {
  const unitCount = Object.keys(state.groundUnits).length + 1;
  const id = `ground-${unitCount}`;
  const name = `Unit ${unitCount}`;
  
  const res = await fetch(`${API_BASE}/ground-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, lat, lng, battery: 100, status: 'idle' }),
  });
  return res.ok ? res.json() : null;
}

async function spawnRadioTower(lat, lng, name = null, ewRadius = 500) {
  const unitCount = Object.keys(state.groundUnits).length + 1;
  const id = `ground-${unitCount}`;
  const towerName = name || `Radio Tower ${unitCount}`;
  
  const res = await fetch(`${API_BASE}/ground-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: towerName, 
      type: 'radio-tower', 
      lat, 
      lng, 
      battery: 100, 
      status: 'idle',
      isRadioTower: true,
      radioRangeMeters: ewRadius,
      radioEffects: {
        drones: { speedBoost: 1.2, batteryEfficiency: 1.1 },
        ground: { speedBoost: 1.15, accuracyBoost: 1.2 },
        naval: { speedBoost: 1.1, commsRangeBoost: 1.3 },
        radio: { rangeExtension: 1.5, powerBoost: 1.2 }
      },
      radioActive: true
    }),
  });
  return res.ok ? res.json() : null;
}

async function startSimulation(droneId, targetLat, targetLng, speed = 20) {
  const res = await fetch(`${API_BASE}/drones/${droneId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLat, targetLng, speed }),
  });
  return res.ok ? res.json() : null;
}

async function stopSimulation(droneId) {
  const res = await fetch(`${API_BASE}/drones/${droneId}/simulate`, { method: 'DELETE' });
  return res.ok ? res.json() : null;
}

async function spawnNavalUnit(lat, lng, type = 'fast-boat') {
  const unitCount = Object.keys(state.navalUnits).length + 1;
  const id = `naval-${unitCount}`;
  const name = `Naval Unit ${unitCount}`;
  
  const res = await fetch(`${API_BASE}/naval-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, lat, lng, battery: 100, status: 'idle' }),
  });
  return res.ok ? res.json() : null;
}

async function moveNavalUnit(unitId, targetLat, targetLng) {
  const res = await fetch(`${API_BASE}/naval-units/${unitId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLat, targetLng }),
  });
  
  if (res.ok) {
    const result = await res.json();
    if (result.path) {
      drawNavalUnitPath(unitId, result.path);
      showFeedback(`Unit moving via ${result.mode} path`, 'success');
    }
  } else {
    const error = await res.json();
    showFeedback(error.error || 'Failed to move unit', 'warning');
  }
}

function selectNavalUnit(id) {
  state.selectedNavalUnit = id;
  const unit = state.navalUnits[id];
  if (unit) {
    map.flyTo([unit.lat, unit.lng], 15, { duration: 1 });
    state.navalMarkers[id]?.openPopup();
  }
  renderNavalUnitList();
  renderNavalUnitSelectionPanel();
}

function enterNavalUnitMoveMode(unitId) {
  const unit = state.navalUnits[unitId];
  if (!unit) return;
  
  state.movingNavalUnit = unitId;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = `🚤 Click on water to set destination for ${unit.name} — <button id="btn-cancel-place" class="btn-xs">Cancel</button>`;
  placeBanner.classList.remove('hidden');
}

function exitNavalUnitMoveMode() {
  state.movingNavalUnit = null;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
}

function navalUnitCardHTML(unit) {
  const typeInfo = getNavalUnitTypeInfo(unit.type);
  
  return `
    <div class="card-header">
      <span class="card-name">
        <span class="status-dot status-dot--${unit.status}"></span>${unit.name}
      </span>
      <span class="card-id">${unit.id}</span>
      <button class="btn-delete-unit" data-id="${unit.id}" title="Delete unit">🗑</button>
    </div>
    <div class="card-stats">
      <div class="stat">Type <span>${typeInfo.name}</span></div>
      <div class="stat">Speed <span>${unit.speed} km/h</span></div>
      <div class="stat">Lat <span>${unit.lat.toFixed(4)}</span></div>
      <div class="stat">Lng <span>${unit.lng.toFixed(4)}</span></div>
    </div>
    <div class="card-assignment">
      <span class="road-status on-water">🚤 On Water</span>
    </div>
    <div class="battery-bar">
      <div class="battery-fill battery-fill--${unit.battery > 50 ? 'high' : unit.battery > 20 ? 'medium' : 'low'}" style="width:${unit.battery}%"></div>
    </div>
  `;
}

function renderNavalUnitList() {
  const list = document.getElementById('naval-unit-list');
  if (!list) return;
  
  const ids = Object.keys(state.navalUnits);
  [...list.children].forEach(li => { if (!state.navalUnits[li.dataset.id]) li.remove(); });
  
  ids.forEach(id => {
    const unit = state.navalUnits[id];
    let li = list.querySelector(`[data-id="${id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'drone-card naval-unit-card';
      li.dataset.id = id;
      li.addEventListener('click', () => selectNavalUnit(id));
      list.appendChild(li);
    }
    li.innerHTML = navalUnitCardHTML(unit);
    li.classList.toggle('selected', id === state.selectedNavalUnit);
  });
}

function renderNavalUnitSelectionPanel() {
  const emptyEl = document.getElementById('naval-selection-empty');
  const contentEl = document.getElementById('naval-selection-content');
  
  if (!state.selectedNavalUnit || !state.navalUnits[state.selectedNavalUnit]) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    return;
  }
  
  const unit = state.navalUnits[state.selectedNavalUnit];
  const typeInfo = getNavalUnitTypeInfo(unit.type);
  
  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');
  
  document.getElementById('naval-selection-name').textContent = unit.name;
  document.getElementById('naval-selection-id').textContent = unit.id;
  document.getElementById('naval-selection-type').textContent = typeInfo.name;
  document.getElementById('naval-selection-speed').textContent = unit.speed + ' km/h';
  document.getElementById('naval-selection-status').textContent = unit.status;
}

/* ── Drone Flight Simulation ─────────────────────────────────── */
function enterSimulationMode(droneId) {
  const drone = state.drones[droneId];
  if (!drone) return;
  
  state.simulatingDrone = droneId;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = `🎯 Click on map to set destination for ${drone.name} — <button id="btn-cancel-place" class="btn-xs">Cancel</button>`;
  placeBanner.classList.remove('hidden');
  
  if (!state.simPathLayer) {
    state.simPathLayer = L.layerGroup().addTo(map);
  }
}

function exitSimulationMode() {
  state.simulatingDrone = null;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
  
  if (state.simPathLayer) {
    state.simPathLayer.clearLayers();
  }
  state.simFlightPath = null;
}

function updateFlightPath(startLat, startLng, endLat, endLng) {
  if (state.simPathLayer) {
    state.simPathLayer.clearLayers();
  }
  
  const path = L.polyline([[startLat, startLng], [endLat, endLng]], {
    color: '#00ff00', weight: 3, dashArray: '10, 10', opacity: 0.7
  }).addTo(state.simPathLayer);
  
  L.circleMarker([endLat, endLng], {
    radius: 8, color: '#00ff00', fillColor: '#00ff00', fillOpacity: 0.3
  }).addTo(state.simPathLayer);
  
  state.simFlightPath = path;
}

/* ── Placement Modes ─────────────────────────────────────────── */
function enterPlacingMode() {
  state.placingHub = true;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = '📍 Click anywhere on the map to place a hub — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
  placeBanner.classList.remove('hidden');
  document.getElementById('btn-place-hub').classList.add('btn-icon--active');
}

function exitPlacingMode() {
  state.placingHub = false;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
  document.getElementById('btn-place-hub').classList.remove('btn-icon--active');
}

document.getElementById('btn-place-hub').addEventListener('click', () => {
  if (state.placingHub) exitPlacingMode();
  else enterPlacingMode();
});


function enterPlacingGroundUnitMode() {
  state.placingGroundUnit = true;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = '🚗 Click anywhere to spawn a ground unit — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
  placeBanner.classList.remove('hidden');
}

function exitPlacingGroundUnitMode() {
  state.placingGroundUnit = false;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
}

function enterPlacingNavalUnitMode() {
  state.placingNavalUnit = true;
  map.getContainer().style.cursor = 'crosshair';
  placeBanner.innerHTML = '🚤 Click on water to spawn a naval unit — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
  placeBanner.classList.remove('hidden');
}

function exitPlacingNavalUnitMode() {
  state.placingNavalUnit = false;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
}

/* ── RTS Panel Bindings ──────────────────────────────────────── */
const ACTION_ICONS = {
  'spawn-drone': { icon: '🚁', label: 'Spawn Drone' },
  'place-hub': { icon: '🏠', label: 'Place Hub' },
  'spawn-ground': { icon: '🚗', label: 'Spawn Ground Unit' },
  'spawn-radio': { icon: '📡', label: 'Spawn Radio Tower' },
  'set-waypoint': { icon: '🎯', label: 'Set Waypoint' },
  'surveillance': { icon: '👁', label: 'Surveillance' },
  'return-base': { icon: '🔄', label: 'Return to Base' },
  'emergency': { icon: '⚠️', label: 'Emergency Landing' },
  'draw-area': { icon: '🔷', label: 'Draw Area' },
  'no-go-zone': { icon: '⛔', label: 'No-Go Zone' },
  'show-roads': { icon: '🛣️', label: 'Show Roads' },
  'show-paths': { icon: '🥾', label: 'Show Paths' },
  'highlight-road': { icon: '🎨', label: 'Highlight Road' },
};

function selectAction(action) {
  document.querySelectorAll('.action-icon').forEach(icon => icon.classList.remove('active'));
  
  if (state.selectedAction === action) {
    state.selectedAction = null;
    map.getContainer().style.cursor = '';
    if (placeBanner) placeBanner.classList.add('hidden');
  } else {
    if (action === 'no-go-zone') {
      enterNoGoZoneDrawingMode();
      return;
    }
    if (action === 'show-roads') {
      state.showRoads = !state.showRoads;
      if (state.showRoads) renderRoads();
      else {
        Object.values(state.roadLayers).forEach(l => map.removeLayer(l));
        state.roadLayers = {};
      }
      return;
    }
    if (action === 'show-paths') {
      state.showPaths = !state.showPaths;
      if (state.showPaths) renderPaths();
      else {
        Object.values(state.pathLayers).forEach(l => map.removeLayer(l));
        state.pathLayers = {};
      }
      return;
    }
    if (action === 'highlight-road') {
      enterRoadHighlightMode();
      return;
    }
    
    state.selectedAction = action;
    const actionEl = document.querySelector(`.action-icon[data-action="${action}"]`);
    if (actionEl) actionEl.classList.add('active');
    
    const actionInfo = ACTION_ICONS[action];
    if (placeBanner) {
      placeBanner.innerHTML = `${actionInfo.icon} ${actionInfo.label} — Click on map — <button id="btn-cancel-place" class="btn-xs">Cancel</button>`;
      placeBanner.classList.remove('hidden');
    }
    map.getContainer().style.cursor = 'crosshair';
  }
}

function cancelAllModes() {
  if (state.placingHub) exitPlacingMode();
  if (state.placingGroundUnit) exitPlacingGroundUnitMode();
  if (state.placingNavalUnit) exitPlacingNavalUnitMode();
  if (state.simulatingDrone) exitSimulationMode();
  if (state.movingGroundUnit) exitGroundUnitMoveMode();
  if (state.movingNavalUnit) exitNavalUnitMoveMode();
  if (state.drawingAoi) exitDrawingMode();
  if (state.selectedAction) selectAction(state.selectedAction);
  if (state.highlightingAoi) exitHighlightMode();
  if (state.highlightingRoad) exitRoadHighlightMode();
}

/* ── AOI Highlight Mode ──────────────────────────────────────── */
function enterHighlightMode() {
  state.highlightingAoi = true;
  showFeedback('Highlight mode: Select an area to highlight', 'info');
}

function exitHighlightMode() {
  state.highlightingAoi = false;
  state.highlightedAoiId = null;
  showFeedback('Highlight mode cancelled', 'info');
}

function applyHighlightToAoi(aoiId) {
  const aoi = state.aois[aoiId];
  if (!aoi) return;
  
  if (state.highlightedAoiId && state.highlightedAoiId !== aoiId) {
    const prevPolygon = state.aoiPolygons[state.highlightedAoiId];
    if (prevPolygon) {
      prevPolygon.setStyle({
        color: aoi.isNoGoZone ? '#ff0000' : '#ff6b35',
        fillColor: aoi.isNoGoZone ? 'rgba(255, 0, 0, 0.25)' : 'rgba(255, 107, 53, 0.2)',
        fillOpacity: aoi.isNoGoZone ? 0.25 : 0.2,
        weight: aoi.isNoGoZone ? 3 : 2,
        dashArray: aoi.isNoGoZone ? '10, 5' : '5, 5'
      });
    }
  }
  
  const polygon = state.aoiPolygons[aoiId];
  if (polygon) {
    polygon.setStyle({
      color: state.highlightColor,
      fillColor: hexToRgba(state.highlightColor, 0.3),
      fillOpacity: 0.3,
      weight: 4,
      dashArray: null
    });
    const el = polygon.getElement();
    if (el) {
      el.style.filter = `drop-shadow(0 0 8px ${state.highlightColor})`;
      el.style.stroke = state.highlightColor;
    }
  }
  
  state.highlightedAoiId = aoiId;
  state.highlightingAoi = false;
  showFeedback(`"${aoi.name}" highlighted in ${state.highlightColor}`, 'success');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function removeHighlight() {
  if (state.highlightedAoiId) {
    const polygon = state.aoiPolygons[state.highlightedAoiId];
    const aoi = state.aois[state.highlightedAoiId];
    if (polygon) {
      polygon.setStyle({
        color: aoi.isNoGoZone ? '#ff0000' : '#ff6b35',
        fillColor: aoi.isNoGoZone ? 'rgba(255, 0, 0, 0.25)' : 'rgba(255, 107, 53, 0.2)',
        fillOpacity: aoi.isNoGoZone ? 0.25 : 0.2,
        weight: aoi.isNoGoZone ? 3 : 2,
        dashArray: aoi.isNoGoZone ? '10, 5' : '5, 5'
      });
      const el = polygon.getElement();
      if (el) {
        el.style.filter = '';
        el.style.stroke = '';
      }
    }
    state.highlightedAoiId = null;
    showFeedback('Highlight removed', 'info');
  }
}

/* ── Road Highlight Mode ─────────────────────────────────────── */
function enterRoadHighlightMode() {
  state.highlightingRoad = true;
  showFeedback('Road highlight mode: Click on a road to highlight it', 'info');
}

function exitRoadHighlightMode() {
  removeRoadHighlight();
  state.highlightingRoad = false;
  showFeedback('Road highlight mode cancelled', 'info');
}

function highlightRoad(roadId) {
  const road = state.roads[roadId];
  if (!road) return;
  
  // Remove highlight from previously highlighted road
  if (state.highlightedRoadId && state.highlightedRoadId !== roadId) {
    removeRoadHighlight();
  }
  
  const layer = state.roadLayers[roadId];
  if (!layer) {
    showFeedback('Road layer not found. Make sure roads are visible.', 'warning');
    return;
  }
  
  // Store original style if not already stored
  if (!state.highlightedRoadOriginalStyle) {
    state.highlightedRoadOriginalStyle = {
      color: layer.options.color,
      weight: layer.options.weight,
      opacity: layer.options.opacity
    };
  }
  
  // Apply highlight style
  layer.setStyle({
    color: state.highlightColor,
    weight: 8,
    opacity: 1
  });
  
  // Add glow effect using SVG filter
  const el = layer.getElement();
  if (el) {
    el.style.filter = `drop-shadow(0 0 10px ${state.highlightColor}) drop-shadow(0 0 20px ${state.highlightColor})`;
  }
  
  state.highlightedRoadId = roadId;
  state.highlightingRoad = false;
  showFeedback(`"${road.name}" highlighted in ${state.highlightColor}`, 'success');
}

function removeRoadHighlight() {
  if (state.highlightedRoadId) {
    const layer = state.roadLayers[state.highlightedRoadId];
    const road = state.roads[state.highlightedRoadId];
    
    if (layer && state.highlightedRoadOriginalStyle) {
      layer.setStyle({
        color: state.highlightedRoadOriginalStyle.color,
        weight: state.highlightedRoadOriginalStyle.weight,
        opacity: state.highlightedRoadOriginalStyle.opacity
      });
      
      const el = layer.getElement();
      if (el) {
        el.style.filter = '';
      }
    }
    
    state.highlightedRoadId = null;
    state.highlightedRoadOriginalStyle = null;
    showFeedback('Road highlight removed', 'info');
  }
}

/* ── Feedback Notifications ──────────────────────────────────── */
function showFeedback(message, type = 'info') {
  const feedback = document.createElement('div');
  feedback.className = 'feedback-notification';
  feedback.style.cssText = `
    position: fixed; top: calc(var(--hud-h) + 20px); left: 50%;
    transform: translateX(-50%); z-index: 10000;
    padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 0.9rem;
    animation: feedback-fade 2s ease forwards;
  `;
  
  if (type === 'success') feedback.style.background = 'linear-gradient(135deg, #00ff88, #00cc6a)';
  else if (type === 'warning') feedback.style.background = 'linear-gradient(135deg, #ffcc00, #ffaa00)';
  else feedback.style.background = 'linear-gradient(135deg, #00d9ff, #00a8cc)';
  feedback.style.color = '#000';
  
  feedback.textContent = message;
  document.body.appendChild(feedback);
  setTimeout(() => feedback.remove(), 2000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes feedback-fade {
    0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    10% { opacity: 1; transform: translateX(-50%) translateY(0); }
    90% { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
  }
`;
document.head.appendChild(style);

/* ── SSE Connection ──────────────────────────────────────────── */
const badge = document.getElementById('connection-badge');

function applyUpdate(d) {
  state.drones[d.id] = d;
  upsertMarker(d);
  renderSidebar();
  updateHUDStats();
  renderSelectionPanel();
  
  const marker = state.markers[d.id];
  if (marker && marker.isPopupOpen()) {
    marker.setPopupContent(popupContent(d));
    marker.openPopup();
  }
}

function applyRemove(id) {
  delete state.drones[id];
  removeMarker(id);
  if (state.selected === id) state.selected = null;
  renderSidebar();
  updateHUDStats();
  renderSelectionPanel();
}

function applyHubUpdate(hub) {
  state.hubs[hub.id] = hub;
  upsertHubMarker(hub);
  renderHubList();
  updateHUDStats();
  if (state.activeHubId === hub.id) renderHubPanel();
}

function applyHubRemove(id) {
  delete state.hubs[id];
  removeHubMarker(id);
  renderHubList();
  updateHUDStats();
  if (state.activeHubId === id) closeHubPanel();
}

function applyFleetUpdate(fleet) {
  state.fleets[fleet.id] = fleet;
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
  updateHUDStats();
  if (state.activeHubId === mission.hubId) renderHubPanel();
}

function applyMissionRemove(id) {
  const m = state.missions[id];
  delete state.missions[id];
  updateHUDStats();
  if (m) {
    renderHubList();
    if (state.activeHubId === m.hubId) renderHubPanel();
  }
}

// Ground unit handlers
function applyGroundUnitUpdate(unit) {
  state.groundUnits[unit.id] = unit;
  upsertGroundUnitMarker(unit);
  renderGroundUnitList();
  renderGroundUnitSelectionPanel();
}

function applyGroundUnitRemove(id) {
  delete state.groundUnits[id];
  removeGroundUnitMarker(id);
  if (state.selectedGroundUnit === id) state.selectedGroundUnit = null;
  renderGroundUnitList();
  renderGroundUnitSelectionPanel();
}

// Radio tower handlers
function applyRadioTowerUpdate(tower) {
  state.radioTowers[tower.id] = tower;
  upsertRadioTowerMarker(tower);
}

// Road and path handlers
function applyRoadUpdate(road) {
  state.roads[road.id] = road;
  renderRoads();
}

function applyRoadRemove(id) {
  delete state.roads[id];
  renderRoads();
}

function applyPathUpdate(aPath) {
  state.paths[aPath.id] = aPath;
  renderPaths();
}

function applyPathRemove(id) {
  delete state.paths[id];
  renderPaths();
}

// Naval unit handlers
function applyNavalUnitUpdate(unit) {
  state.navalUnits[unit.id] = unit;
  upsertNavalUnitMarker(unit);
  renderNavalUnitList();
  renderNavalUnitSelectionPanel();
}

function applyNavalUnitRemove(id) {
  delete state.navalUnits[id];
  removeNavalUnitMarker(id);
  if (state.selectedNavalUnit === id) state.selectedNavalUnit = null;
  renderNavalUnitList();
  renderNavalUnitSelectionPanel();
}

function applyWaterAreaUpdate(area) {
  state.waterAreas[area.id] = area;
  upsertWaterAreaLayer(area);
}

function applyWaterAreaRemove(id) {
  delete state.waterAreas[id];
  if (state.waterLayers[id]) {
    map.removeLayer(state.waterLayers[id]);
    delete state.waterLayers[id];
  }
}

// Global reference to SSE connection for debugging and management
let eventSource = null;

function connect() {
  badge.textContent = 'Connecting…';
  badge.className = 'badge badge--connecting';
  
  // Construct SSE URL with token at connection time (not at module load)
  const token = AuthClient.token;
  if (!token) {
    console.error('[SSE] No authentication token available');
    badge.textContent = '✕ Auth Required';
    badge.className = 'badge badge--error';
    setTimeout(connect, 5000);
    return;
  }
  
  // Verify token is still valid by checking with server
  fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => {
    if (!res.ok) {
      console.error('[SSE] Token validation failed, status:', res.status);
      badge.textContent = '✕ Auth Failed';
      badge.className = 'badge badge--error';
      // Clear invalid token and redirect to login
      AuthClient.logout();
      setTimeout(() => {
        window.location.href = '/login/login.html';
      }, 2000);
      return false;
    }
    return true;
  })
  .then(valid => {
    if (!valid) return;
    
    const sseUrl = `${API_BASE}/events?token=${token}`;
    console.log('[SSE] Connecting to:', sseUrl);
    
    // Close any existing connection first
    if (eventSource) {
      eventSource.close();
    }
    
    eventSource = new EventSource(sseUrl);
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (badge.classList.contains('badge--connecting')) {
        console.error('[SSE] Connection timeout after 10 seconds');
        badge.textContent = '✕ Timeout';
        badge.className = 'badge badge--error';
        eventSource.close();
        setTimeout(connect, 5000);
      }
    }, 10000);
    
    eventSource.onopen = () => {
      console.log('[SSE] Connection opened successfully');
      clearTimeout(connectionTimeout);
      badge.textContent = '● Live';
      badge.className = 'badge badge--live';
    };
    
    eventSource.onmessage = e => {
      const msg = JSON.parse(e.data);
      
      switch (msg.type) {
        case 'snapshot':
          console.log('[SSE] Received snapshot with', msg.drones?.length || 0, 'drones');
          msg.drones?.forEach(applyUpdate);
          msg.hubs?.forEach(applyHubUpdate);
          msg.fleets?.forEach(applyFleetUpdate);
          msg.missions?.forEach(applyMissionUpdate);
          msg.groundUnits?.forEach(applyGroundUnitUpdate);
          msg.roads?.forEach(applyRoadUpdate);
          msg.paths?.forEach(applyPathUpdate);
          msg.navalUnits?.forEach(applyNavalUnitUpdate);
          msg.waterAreas?.forEach(applyWaterAreaUpdate);
          if (msg.noGoZones) msg.noGoZones.forEach(applyNoGoZoneUpdate);
          updateHUDStats();
          break;
        case 'update': applyUpdate(msg.drone); break;
        case 'navalunit:update': applyNavalUnitUpdate(msg.unit); break;
        case 'navalunit:remove': applyNavalUnitRemove(msg.id); break;
        case 'waterarea:update': applyWaterAreaUpdate(msg.area); break;
        case 'waterarea:remove': applyWaterAreaRemove(msg.id); break;
        case 'remove': applyRemove(msg.id); break;
        case 'hub:update': applyHubUpdate(msg.hub); break;
        case 'hub:remove': applyHubRemove(msg.id); break;
        case 'fleet:update': applyFleetUpdate(msg.fleet); break;
        case 'fleet:remove': applyFleetRemove(msg.id); break;
        case 'mission:update': applyMissionUpdate(msg.mission); break;
        case 'mission:remove': applyMissionRemove(msg.id); break;
        case 'groundunit:update': applyGroundUnitUpdate(msg.unit); break;
        case 'groundunit:remove': applyGroundUnitRemove(msg.id); break;
        case 'road:update': applyRoadUpdate(msg.road); break;
        case 'road:remove': applyRoadRemove(msg.id); break;
        case 'path:update': applyPathUpdate(msg.path); break;
        case 'path:remove': applyPathRemove(msg.id); break;
        case 'nogozone:update': applyNoGoZoneUpdate(msg.zone); break;
        case 'nogozone:remove': applyNoGoZoneRemove(msg.id); break;
        case 'radio:update': applyRadioTowerUpdate(msg.tower); break;
        case 'simulation:blocked': handleSimulationBlocked(msg); break;
        case 'mission:notification': handleMissionNotification(msg); break;
      }
    };
    
    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      badge.textContent = '✕ Offline';
      badge.className = 'badge badge--error';
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      setTimeout(connect, 5000);
    };
  })
  .catch(err => {
    console.error('[SSE] Token validation error:', err);
    badge.textContent = '✕ Error';
    badge.className = 'badge badge--error';
    setTimeout(connect, 5000);
  });
}

/* ── Entity Context Menu ─────────────────────────────────────── */
const entityContextMenu = document.getElementById('entity-context-menu');
const entityContextTitle = document.getElementById('entity-context-title');
const entityContextInfo = document.getElementById('entity-context-info');
const entityContextClose = document.getElementById('entity-context-close');

let currentEntity = null;
let currentEntityType = null;
let currentEntityLatLng = null;

function hideEntityContextMenu() {
  if (entityContextMenu) entityContextMenu.classList.add('hidden');
  currentEntity = null;
  currentEntityType = null;
  currentEntityLatLng = null;
}

async function spawnDroneAtContextMenu() {
  if (!currentEntityLatLng) return;
  
  const drone = await spawnDroneAtLocation(currentEntityLatLng.lat, currentEntityLatLng.lng);
  if (drone) {
    hideEntityContextMenu();
  }
}

function showEntityContextMenu(entity, type, latlng) {
  if (!entityContextMenu) return;
  
  currentEntity = entity;
  currentEntityType = type;
  currentEntityLatLng = latlng;
  
  if (type === 'drone') {
    entityContextTitle.textContent = `🚁 ${entity.name || 'Drone'}`;
  } else if (type === 'hub') {
    entityContextTitle.textContent = `🏠 ${entity.name || 'Hub'}`;
  } else if (type === 'ground-unit') {
    entityContextTitle.textContent = `🚗 ${entity.name || 'Ground Unit'}`;
  } else if (type === 'naval-unit') {
    entityContextTitle.textContent = `🚤 ${entity.name || 'Naval Unit'}`;
  }
  
  let infoHTML = '';
  if (type === 'drone') {
    infoHTML = `
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">ID:</span>
        <span class="entity-context-info-value">${entity.id}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Position:</span>
        <span class="entity-context-info-value">${entity.lat.toFixed(4)}, ${entity.lng.toFixed(4)}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Battery:</span>
        <span class="entity-context-info-value">${entity.battery}%</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Status:</span>
        <span class="entity-context-info-value">${entity.status}</span>
      </div>
    `;
  } else if (type === 'hub') {
    const hubFleets = Object.values(state.fleets).filter(f => f.hubId === entity.id);
    infoHTML = `
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">ID:</span>
        <span class="entity-context-info-value">${entity.id}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Position:</span>
        <span class="entity-context-info-value">${entity.lat.toFixed(4)}, ${entity.lng.toFixed(4)}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Fleets:</span>
        <span class="entity-context-info-value">${hubFleets.length}</span>
      </div>
    `;
  } else if (type === 'ground-unit') {
    infoHTML = `
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">ID:</span>
        <span class="entity-context-info-value">${entity.id}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Position:</span>
        <span class="entity-context-info-value">${entity.lat.toFixed(4)}, ${entity.lng.toFixed(4)}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Type:</span>
        <span class="entity-context-info-value">${entity.type}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Status:</span>
        <span class="entity-context-info-value">${entity.status}</span>
      </div>
    `;
  } else if (type === 'naval-unit') {
    const typeInfo = getNavalUnitTypeInfo(entity.type);
    infoHTML = `
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">ID:</span>
        <span class="entity-context-info-value">${entity.id}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Position:</span>
        <span class="entity-context-info-value">${entity.lat.toFixed(4)}, ${entity.lng.toFixed(4)}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Type:</span>
        <span class="entity-context-info-value">${typeInfo.name}</span>
      </div>
      <div class="entity-context-info-row">
        <span class="entity-context-info-label">Status:</span>
        <span class="entity-context-info-value">${entity.status}</span>
      </div>
    `;
  }
  
  entityContextInfo.innerHTML = infoHTML;
  
  // Convert LatLng to container (pixel) coordinates for proper positioning
  const point = map.latLngToContainerPoint(latlng);
  entityContextMenu.style.left = `${point.x}px`;
  entityContextMenu.style.top = `${point.y}px`;
  entityContextMenu.classList.remove('hidden');
}

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
  }
}

/* ── Mission Toast Notifications ───────────────────────────────── */
function showMissionToast(mission, priority = 'medium') {
  const container = document.getElementById('mission-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `mission-toast mission-toast--${priority}`;
  toast.dataset.missionId = mission.id;
  toast.dataset.hubId = mission.hubId;
  
  // Icon based on mission type
  const typeIcons = {
    'general': '📋',
    'surveillance': '👁',
    'delivery': '📦',
    'search': '🔍',
    'inspection': '🔎'
  };
  const icon = typeIcons[mission.type] || '📋';
  
  // Priority labels
  const priorityLabels = {
    'high': '🔴 HIGH PRIORITY',
    'medium': '🟡 MEDIUM PRIORITY',
    'low': '🟢 LOW PRIORITY'
  };
  
  toast.innerHTML = `
    <span class="mission-toast-icon">${icon}</span>
    <span class="mission-toast-content">
      <strong>${mission.title}</strong>
      <br><small>${mission.type.charAt(0).toUpperCase() + mission.type.slice(1)} mission assigned</small>
    </span>
    <div class="mission-toast-actions">
      <button class="mission-toast-action mission-toast-action--act" title="Act upon this mission">
        ⚡ Act upon
      </button>
      <button class="mission-toast-close" title="Close">✕</button>
    </div>
    <div class="mission-toast-progress"></div>
  `;
  
  // "Act upon" button handler
  const actBtn = toast.querySelector('.mission-toast-action--act');
  actBtn.addEventListener('click', () => {
    acknowledgeMissionToast(toast, mission);
  });
  
  // Close button handler
  const closeBtn = toast.querySelector('.mission-toast-close');
  closeBtn.addEventListener('click', () => {
    closeMissionToast(toast);
  });
  
  container.appendChild(toast);
  
  // Auto-dismiss after 5 seconds (unless high priority)
  if (priority !== 'high') {
    setTimeout(() => {
      if (toast.parentNode) closeMissionToast(toast);
    }, 5000);
  }
}

// Handle mission acknowledgment (Act upon button)
function acknowledgeMissionToast(toast, mission) {
  // Close the toast
  closeMissionToast(toast);
  
  // Switch to the hub's panel
  if (mission.hubId && state.hubs[mission.hubId]) {
    state.activeHubId = mission.hubId;
    
    // Switch to missions tab
    const missionsTabBtn = document.querySelector('.tab-btn[data-tab="missions"]');
    if (missionsTabBtn) {
      missionsTabBtn.click();
    }
    
    // Re-render the hub panel to show missions
    renderHubPanel();
    
    // Show feedback
    showFeedback(`Opening mission: ${mission.title}`, 'success');
  } else {
    showFeedback('Mission hub not found', 'warning');
  }
}

function closeMissionToast(toast) {
  if (toast.classList.contains('closing')) return;
  
  toast.classList.add('closing');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

// Handle mission notification SSE events
function handleMissionNotification(msg) {
  const { mission, priority } = msg;
  if (mission) {
    showMissionToast(mission, priority || 'medium');
  }
}

function copyEntityInfo() {
  if (!currentEntity || !currentEntityType) return;
  
  let textToCopy = '';
  if (currentEntityType === 'drone') {
    textToCopy = `Drone: ${currentEntity.name} (${currentEntity.id})\nPosition: ${currentEntity.lat.toFixed(6)}, ${currentEntity.lng.toFixed(6)}\nBattery: ${currentEntity.battery}%\nStatus: ${currentEntity.status}`;
  } else if (currentEntityType === 'hub') {
    textToCopy = `Hub: ${currentEntity.name} (${currentEntity.id})\nPosition: ${currentEntity.lat.toFixed(6)}, ${currentEntity.lng.toFixed(6)}`;
  } else if (currentEntityType === 'ground-unit') {
    textToCopy = `Ground Unit: ${currentEntity.name} (${currentEntity.id})\nPosition: ${currentEntity.lat.toFixed(6)}, ${currentEntity.lng.toFixed(6)}\nType: ${currentEntity.type}\nStatus: ${currentEntity.status}`;
  } else if (currentEntityType === 'naval-unit') {
    textToCopy = `Naval Unit: ${currentEntity.name} (${currentEntity.id})\nPosition: ${currentEntity.lat.toFixed(6)}, ${currentEntity.lng.toFixed(6)}\nType: ${currentEntity.type}\nStatus: ${currentEntity.status}`;
  }
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('Copied to clipboard!');
    hideEntityContextMenu();
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy to clipboard');
  });
}

function deleteEntity() {
  if (!currentEntity || !currentEntityType) return;
  
  const typeLabels = { 'drone': 'drone', 'hub': 'hub', 'ground-unit': 'ground unit', 'naval-unit': 'naval unit' };
  const label = typeLabels[currentEntityType] || 'entity';
  const confirmMsg = `Delete ${label} "${currentEntity.name}"?`;
  
  if (confirm(confirmMsg)) {
    const endpoints = {
      'drone': `${API_BASE}/drones/${currentEntity.id}`,
      'hub': `${API_BASE}/hubs/${currentEntity.id}`,
      'ground-unit': `${API_BASE}/ground-units/${currentEntity.id}`,
      'naval-unit': `${API_BASE}/naval-units/${currentEntity.id}`
    };
    const url = endpoints[currentEntityType];
    if (url) {
      fetch(url, { method: 'DELETE' })
        .then(res => { if (res.ok) { showToast(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted`); hideEntityContextMenu(); } });
    }
  }
}

function showEntityInfo() {
  if (!currentEntity || !currentEntityType) return;
  if (currentEntityType === 'drone') {
    state.markers[currentEntity.id]?.openPopup();
  } else if (currentEntityType === 'hub') {
    openHubPanel(currentEntity.id);
  }
  hideEntityContextMenu();
}

if (entityContextMenu) {
  entityContextClose.addEventListener('click', hideEntityContextMenu);
  
  entityContextMenu.querySelectorAll('.context-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'spawn-drone') spawnDroneAtContextMenu();
      else if (action === 'info') showEntityInfo();
      else if (action === 'copy') copyEntityInfo();
      else if (action === 'delete') deleteEntity();
    });
  });
}

document.addEventListener('click', (e) => {
  if (entityContextMenu && !entityContextMenu.contains(e.target)) hideEntityContextMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && entityContextMenu && !entityContextMenu.classList.contains('hidden')) {
    hideEntityContextMenu();
  }
});

/* ── Map Interactions ────────────────────────────────────────── */
const placeBanner = document.getElementById('place-banner');

document.getElementById('btn-cancel-place').addEventListener('click', () => {
  cancelAllModes();
});

map.off('click');
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  
  // Check if click was on an AOI polygon - if so, skip map click handling
  // The polygon's click handler will handle the selection
  if (e.target && e.target instanceof L.Polygon) {
    return;
  }
  
  if (state.drawingEwArea) {
    completeEwAreaDrawing(lat, lng);
    return;
  }
  
  if (state.drawingAoi) {
    addDrawingPoint(lat, lng);
    return;
  }
  
  if (state.placingHub) {
    const hub = await createHub(lat, lng);
    if (hub) {
      map.flyTo([lat, lng], 14, { duration: 0.8 });
      showFeedback('Hub created!', 'success');
    }
    exitPlacingMode();
    return;
  }
  
  if (state.placingGroundUnit) {
    const unit = await spawnGroundUnit(lat, lng, 'truck');
    if (unit) {
      map.flyTo([lat, lng], 15, { duration: 0.8 });
      showFeedback('Ground unit spawned!', 'success');
    }
    exitPlacingGroundUnitMode();
    return;
  }
  
  if (state.movingGroundUnit) {
    await moveGroundUnit(state.movingGroundUnit, lat, lng);
    return;
  }
  
  if (state.placingNavalUnit) {
    const unit = await spawnNavalUnit(lat, lng, state.selectedNavalUnitType);
    if (unit) {
      map.flyTo([lat, lng], 15, { duration: 0.8 });
      showFeedback('Naval unit spawned!', 'success');
    }
    exitPlacingNavalUnitMode();
    return;
  }
  
  if (state.movingNavalUnit) {
    await moveNavalUnit(state.movingNavalUnit, lat, lng);
    exitNavalUnitMoveMode();
    return;
  }
  
  if (state.selectedAction) {
    const action = state.selectedAction;
    
    switch (action) {
      case 'spawn-drone':
        const drone = await spawnDrone(lat, lng);
        if (drone) showFeedback('Drone spawned!', 'success');
        selectAction(action);
        break;
      case 'spawn-ground':
        const unit = await spawnGroundUnit(lat, lng, 'truck');
        if (unit) showFeedback('Ground unit spawned!', 'success');
        selectAction(action);
        break;
      case 'spawn-radio':
        const ewRadiusInput = prompt('Enter EW radius in meters (default 500):', '500');
        const ewRadius = parseInt(ewRadiusInput) || 500;
        const radioTower = await spawnRadioTower(lat, lng, null, ewRadius);
        if (radioTower) showFeedback(`Radio Tower spawned with ${ewRadius}m EW radius!`, 'success');
        selectAction(action);
        break;
      case 'set-waypoint':
        if (state.selected && state.drones[state.selected]) {
          const d = state.drones[state.selected];
          updateFlightPath(d.lat, d.lng, lat, lng);
          await startSimulation(state.selected, lat, lng, 30);
          showFeedback(`Waypoint set for ${d.name}`, 'success');
        }
        selectAction(action);
        break;
      case 'surveillance':
        if (state.selected && state.drones[state.selected]) {
          const d = state.drones[state.selected];
          updateFlightPath(d.lat, d.lng, lat, lng);
          await startSimulation(state.selected, lat, lng, 15);
          showFeedback(`${d.name} heading to surveillance point`, 'success');
        }
        selectAction(action);
        break;
      case 'return-base':
        if (state.selected && state.drones[state.selected]) {
          const d = state.drones[state.selected];
          let nearestHub = null;
          let minDist = Infinity;
          Object.values(state.hubs).forEach(h => {
            const dist = Math.sqrt(Math.pow(h.lat - d.lat, 2) + Math.pow(h.lng - d.lng, 2));
            if (dist < minDist) { minDist = dist; nearestHub = h; }
          });
          if (nearestHub) {
            updateFlightPath(d.lat, d.lng, nearestHub.lat, nearestHub.lng);
            await startSimulation(state.selected, nearestHub.lat, nearestHub.lng, 40);
            showFeedback(`${d.name} returning to ${nearestHub.name}`, 'success');
          }
        }
        selectAction(action);
        break;
    }
    return;
  }
  
  if (state.simulatingDrone) {
    const drone = state.drones[state.simulatingDrone];
    if (drone) {
      updateFlightPath(drone.lat, drone.lng, lat, lng);
      await startSimulation(state.simulatingDrone, lat, lng, 30);
      exitSimulationMode();
    }
    return;
  }
  
  // Road highlight mode - check if click is on a road
  if (state.highlightingRoad) {
    // Find the nearest road by checking all road layers
    let closestRoadId = null;
    let closestDist = Infinity;
    const clickLatLng = L.latLng(lat, lng);
    
    Object.entries(state.roadLayers).forEach(([roadId, layer]) => {
      const latlngs = layer.getLatLngs();
      // Flatten nested arrays (polylines can have nested arrays)
      const flatLatLngs = Array.isArray(latlngs[0][0]) ? latlngs.flat(1) : latlngs;
      
      for (const point of flatLatLngs) {
        const pointLatLng = L.latLng(point);
        const dist = clickLatLng.distanceTo(pointLatLng);
        // Check if within 20 pixels (approx 0.0002 degrees at this zoom)
        if (dist < 0.0002 && dist < closestDist) {
          closestDist = dist;
          closestRoadId = roadId;
        }
      }
    });
    
    if (closestRoadId) {
      highlightRoad(closestRoadId);
    } else {
      showFeedback('No road found nearby', 'warning');
    }
    return;
  }
});

map.on('dblclick', (e) => {
  if (state.drawingAoi) {
    e.stopPropagation();
    completeDrawing();
  }
});

map.on('mousemove', (e) => {
  if (state.drawingEwArea && state.ewAreaFirstCorner) {
    updateEwAreaPreview(e.latlng.lat, e.latlng.lng);
  }
  
  if (state.selectedAction) {
    const actionInfo = ACTION_ICONS[state.selectedAction];
    const preview = document.getElementById('drag-preview');
    preview.classList.remove('hidden');
    preview.querySelector('.drag-preview__icon').textContent = actionInfo.icon;
    
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    preview.style.left = (e.containerPoint.x + rect.left - 24) + 'px';
    preview.style.top = (e.containerPoint.y + rect.top - 24) + 'px';
  } else {
    document.getElementById('drag-preview').classList.add('hidden');
  }
});

/* ── AOI & Rulesets ──────────────────────────────────────────── */
const AOI_STORAGE_KEY = 'drone-head-aois';

// Open ruleset modal for editing
function openRulesetModal(aoi) {
  const modal = document.getElementById('ruleset-modal');
  const modalTitle = document.getElementById('ruleset-modal-title');
  const modalAreaName = document.getElementById('ruleset-area-name');
  const modalEditor = document.getElementById('ruleset-editor');
  
  if (!modal || !modalEditor) return;
  
  modalAreaName.textContent = aoi.name;
  modalEditor.value = aoi.ruleset || '';
  modal.classList.remove('hidden');
  
  // Store reference to current AOI being edited
  modal.dataset.editingAoiId = aoi.id;
}

// Close ruleset modal
function closeRulesetModal() {
  const modal = document.getElementById('ruleset-modal');
  if (modal) modal.classList.add('hidden');
}

// Save ruleset from modal
function saveRulesetFromModal() {
  const modal = document.getElementById('ruleset-modal');
  const modalEditor = document.getElementById('ruleset-editor');
  
  if (!modal || !modalEditor) return;
  
  const aoiId = modal.dataset.editingAoiId;
  const aoi = state.aois[aoiId];
  
  if (aoi) {
    aoi.ruleset = modalEditor.value;
    saveAoIs();
    renderAoiList();
    
    // Update selection panel if this AOI is selected
    if (state.currentEwSelection && state.currentEwSelection.id === aoiId) {
      state.currentEwSelection.ruleset = modalEditor.value;
      document.getElementById('ew-selection-ruleset').textContent = modalEditor.value || 'No ruleset defined';
    }
    
    showFeedback('Ruleset saved!', 'success');
    closeRulesetModal();
  }
}

// Export ruleset to file
function exportRuleset() {
  const modalEditor = document.getElementById('ruleset-editor');
  if (!modalEditor) return;
  
  const text = modalEditor.value;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ruleset.txt';
  a.click();
  URL.revokeObjectURL(url);
  showFeedback('Ruleset exported!', 'success');
}

// Import ruleset from file
function importRuleset() {
  const input = document.getElementById('ruleset-import-file');
  if (!input) return;
  
  input.click();
}

// Handle file import
function handleRulesetImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const modalEditor = document.getElementById('ruleset-editor');
    if (modalEditor) {
      modalEditor.value = e.target.result;
      showFeedback('Ruleset imported!', 'success');
    }
  };
  reader.readAsText(file);
  
  // Reset input
  event.target.value = '';
}

// Setup ruleset modal event listeners
function setupRulesetModalListeners() {
  const modal = document.getElementById('ruleset-modal');
  const modalClose = document.getElementById('ruleset-modal-close');
  const rulesetSave = document.getElementById('ruleset-save');
  const rulesetExport = document.getElementById('ruleset-export');
  const rulesetImport = document.getElementById('ruleset-import');
  const rulesetImportFile = document.getElementById('ruleset-import-file');
  
  if (modalClose) {
    modalClose.addEventListener('click', closeRulesetModal);
  }
  
  if (rulesetSave) {
    rulesetSave.addEventListener('click', saveRulesetFromModal);
  }
  
  if (rulesetExport) {
    rulesetExport.addEventListener('click', exportRuleset);
  }
  
  if (rulesetImport) {
    rulesetImport.addEventListener('click', importRuleset);
  }
  
  if (rulesetImportFile) {
    rulesetImportFile.addEventListener('change', handleRulesetImport);
  }
  
  // Close on overlay click
  if (modal) {
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeRulesetModal);
    }
  }
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeRulesetModal();
    }
  });
}


function loadAoIs() {
  try {
    const data = localStorage.getItem(AOI_STORAGE_KEY);
    if (data) {
      state.aois = JSON.parse(data);
      renderAoIPolygons();
      renderAoiList();
    }
  } catch (e) {
    console.error('Failed to load AOIs:', e);
  }
}

function saveAoIs() {
  try {
    localStorage.setItem(AOI_STORAGE_KEY, JSON.stringify(state.aois));
  } catch (e) {
    console.error('Failed to save AOIs:', e);
  }
}

function generateAoiId() {
  return 'aoi-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function enterDrawingMode() {
  state.drawingAoi = true;
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
  
  map.getContainer().style.cursor = 'crosshair';
  if (placeBanner) {
    placeBanner.innerHTML = '🔷 Click on map to draw area — Double-click to finish — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
    placeBanner.classList.remove('hidden');
  }
  
  state.drawingLayer = L.layerGroup().addTo(map);
  showFeedback('Drawing mode: Click points on map', 'info');
}

function exitDrawingMode() {
  state.drawingAoi = false;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
  
  if (state.drawingLayer) {
    map.removeLayer(state.drawingLayer);
    state.drawingLayer = null;
  }
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
}

function addDrawingPoint(lat, lng) {
  state.drawingPoints.push([lat, lng]);
  
  const marker = L.circleMarker([lat, lng], {
    radius: 5, color: '#00d9ff', fillColor: '#00d9ff', fillOpacity: 0.8
  }).addTo(state.drawingLayer);
  state.drawingMarkers.push(marker);
  
  if (state.drawingPolygon) {
    state.drawingPolygon.setLatLngs(state.drawingPoints);
  } else {
    state.drawingPolygon = L.polygon(state.drawingPoints, {
      color: '#00d9ff', fillColor: 'rgba(0, 217, 255, 0.15)',
      fillOpacity: 0.15, weight: 2, dashArray: '8, 4'
    }).addTo(state.drawingLayer);
  }
}

function completeDrawing() {
  if (state.drawingPoints.length < 3) {
    showFeedback('Need at least 3 points to create an area', 'warning');
    exitDrawingMode();
    return;
  }
  
  const name = prompt('Enter name for this Area of Interest:', 'Area ' + (Object.keys(state.aois).length + 1));
  if (!name) { exitDrawingMode(); return; }
  
  const aoiId = generateAoiId();
  const aoi = {
    id: aoiId, name, coordinates: state.drawingPoints,
    ruleset: '', createdAt: new Date().toISOString()
  };
  
  state.aois[aoiId] = aoi;
  
  if (state.drawingLayer) {
    map.removeLayer(state.drawingLayer);
    state.drawingLayer = null;
  }
  
  const polygon = L.polygon(state.drawingPoints, {
    color: '#ff6b35', fillColor: 'rgba(255, 107, 53, 0.2)',
    fillOpacity: 0.2, weight: 2, dashArray: '5, 5'
  }).addTo(map);
  
  polygon.on('click', (e) => { e.stopPropagation(); selectAoi(aoiId); });
  polygon.bindTooltip(name, { permanent: true, direction: 'center' });
  state.aoiPolygons[aoiId] = polygon;
  
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
  exitDrawingMode();
  
  saveAoIs();
  renderAoiList();
  showFeedback(`Area "${name}" created!`, 'success');
}

function renderAoIPolygons() {
  Object.values(state.aoiPolygons).forEach(polygon => map.removeLayer(polygon));
  state.aoiPolygons = {};
  
  Object.values(state.aois).forEach(aoi => {
    const isNoGo = aoi.isNoGoZone;
    const isTarget = aoi.isTarget;
    const isEwSignal = aoi.isEwSignalArea;
    
    let color, fillColor, fillOpacity, weight, dashArray, tooltipText;
    
    if (isEwSignal) {
      color = '#9d4edd'; fillColor = 'rgba(157, 78, 221, 0.2)';
      fillOpacity = 0.2; weight = 2; dashArray = '5, 5';
      tooltipText = '📡 ' + aoi.name;
    } else if (isTarget) {
      color = '#00ff00'; fillColor = 'rgba(0, 255, 0, 0.2)';
      fillOpacity = 0.2; weight = 2; dashArray = '5, 5';
      tooltipText = '🎯 ' + aoi.name;
    } else if (isNoGo) {
      color = '#ff0000'; fillColor = 'rgba(255, 0, 0, 0.25)';
      fillOpacity = 0.25; weight = 3; dashArray = '10, 5';
      tooltipText = '⛔ ' + aoi.name;
    } else {
      color = '#ff6b35'; fillColor = 'rgba(255, 107, 53, 0.2)';
      fillOpacity = 0.2; weight = 2; dashArray = '5, 5';
      tooltipText = aoi.name;
    }
    
    const polygon = L.polygon(aoi.coordinates, {
      color, fillColor, fillOpacity, weight, dashArray
    }).addTo(map);
    
    polygon.on('click', (e) => { e.stopPropagation(); selectAoi(aoi.id); });
    polygon.bindTooltip(tooltipText, { permanent: true, direction: 'center' });
    state.aoiPolygons[aoi.id] = polygon;
    
    if (isTarget && aoi.targetLocation) {
      const centerMarker = L.circleMarker([aoi.targetLocation.lat, aoi.targetLocation.lng], {
        radius: 6, color: '#00ff00', fillColor: '#00ff00', fillOpacity: 0.8
      }).addTo(map);
      centerMarker.bindTooltip('🎯 ' + aoi.name, { permanent: false, direction: 'top' });
      polygon.targetMarker = centerMarker;
    }
  });
}

function renderAoiList() {
  const list = document.getElementById('aoi-list');
  const aois = Object.values(state.aois);
  list.innerHTML = '';
  
  if (!aois.length) {
    list.innerHTML = '<li class="empty-hint">No areas yet. Click "🔷 Draw" to create one.</li>';
    return;
  }
  
  aois.forEach(aoi => {
    const li = document.createElement('li');
    li.className = 'aoi-card';
    li.dataset.id = aoi.id;
    li.classList.toggle('selected', aoi.id === state.selectedAoiId);
    if (aoi.isNoGoZone) li.classList.add('aoi-card--no-go');
    if (aoi.isTarget) li.classList.add('aoi-card--target');
    if (aoi.isEwSignalArea) li.classList.add('aoi-card--ew-signal');
    
    const icon = aoi.isEwSignalArea ? '📡' : aoi.isTarget ? '🎯' : aoi.isNoGoZone ? '⛔' : '🔷';
    const metaText = aoi.isTarget
      ? `📍 ${aoi.targetLocation.lat.toFixed(4)}, ${aoi.targetLocation.lng.toFixed(4)}`
      : `${aoi.coordinates.length} points`;
    
    li.innerHTML = `
      <div class="aoi-card__row">
        <span class="aoi-card__icon">${icon}</span>
        <span class="aoi-card__name">${aoi.name}</span>
        ${aoi.isNoGoZone ? '<span class="aoi-card__badge">NO-GO</span>' : ''}
        ${aoi.isTarget ? '<span class="aoi-card__badge aoi-card__badge--target">TARGET</span>' : ''}
        ${aoi.isEwSignalArea ? '<span class="aoi-card__badge aoi-card__badge--ew-signal">EW SIGNAL</span>' : ''}
      </div>
      <div class="aoi-card__meta"><span>${metaText}</span></div>
      <div class="aoi-card__actions">
        <button class="btn-xs aoi-delete" data-id="${aoi.id}" title="Delete">🗑</button>
      </div>
    `;
    
    li.addEventListener('click', (e) => {
      if (!e.target.classList.contains('aoi-delete')) selectAoi(aoi.id);
    });
    
    const deleteBtn = li.querySelector('.aoi-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteAoi(aoi.id); });
    
    list.appendChild(li);
  });
}

function selectAoi(aoiId) {
  state.selectedAoiId = aoiId;
  
  Object.values(state.aoiPolygons).forEach(polygon => {
    const el = polygon.getElement();
    if (el) { el.classList.remove('aoi-polygon-selected'); el.style.stroke = '#ff6b35'; }
  });
  
  const polygon = state.aoiPolygons[aoiId];
  if (polygon) {
    const el = polygon.getElement();
    if (el) { el.classList.add('aoi-polygon-selected'); el.style.stroke = '#fff'; }
    const bounds = L.latLngBounds(polygon.getLatLngs());
    map.flyToBounds(bounds, { padding: [50, 50] });
  }
  
  // Open the AoI panel on the right side
  openAoiPanel(aoiId);
  
  renderAoiList();
}

// Alias for calculateAreaSize
function calculateAoiSize(coordinates) {
  return calculateAreaSize(coordinates);
}

// Calculate area size in square kilometers
function calculateAreaSize(coordinates) {
  if (!coordinates || coordinates.length < 4) return 0;
  
  // Simple approximation using bounding box
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  coordinates.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  
  // Approximate distance (1 degree ≈ 111 km)
  const latDiff = (maxLat - minLat) * 111;
  const lngDiff = (maxLng - minLng) * 111 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  
  return latDiff * lngDiff;
}

// Get center point of polygon
function getPolygonCenter(coordinates) {
  if (!coordinates || coordinates.length === 0) return null;
  
  let sumLat = 0, sumLng = 0;
  coordinates.forEach(([lat, lng]) => {
    sumLat += lat;
    sumLng += lng;
  });
  
  return {
    lat: sumLat / coordinates.length,
    lng: sumLng / coordinates.length
  };
}

// Show EW Signal Area selection panel
function showEwSelectionPanel(aoi) {
  // Hide all other selection panels
  document.getElementById('selection-empty').classList.add('hidden');
  document.getElementById('selection-content').classList.add('hidden');
  document.getElementById('ground-selection-empty').classList.add('hidden');
  document.getElementById('ground-selection-content').classList.add('hidden');
  document.getElementById('naval-selection-empty').classList.add('hidden');
  document.getElementById('naval-selection-content').classList.add('hidden');
  document.getElementById('ew-selection-empty').classList.remove('hidden');
  document.getElementById('ew-selection-content').classList.remove('hidden');
  
  // Update panel content
  document.getElementById('ew-selection-name').textContent = aoi.name;
  document.getElementById('ew-selection-id').textContent = aoi.id;
  
  // Calculate and display center coordinates
  const center = getPolygonCenter(aoi.coordinates);
  if (center) {
    document.getElementById('ew-selection-center').textContent = 
      `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  }
  
  // Calculate and display area size
  const size = calculateAreaSize(aoi.coordinates);
  document.getElementById('ew-selection-size').textContent = 
    size > 0 ? `${size.toFixed(2)} km²` : '—';
  
  // Signal strength (placeholder - could be calculated or stored)
  document.getElementById('ew-selection-signal').textContent = 
    aoi.signalStrength || 'Unknown';
  
  // Ruleset
  document.getElementById('ew-selection-ruleset').textContent = 
    aoi.ruleset || 'No ruleset defined';
  
  // Created date
  document.getElementById('ew-selection-created').textContent = 
    aoi.createdAt ? new Date(aoi.createdAt).toLocaleString() : '—';
  
  // Store reference to current EW selection
  state.currentEwSelection = aoi;
}

// Hide all selection panels
function hideAllSelectionPanels() {
  document.getElementById('selection-empty').classList.add('hidden');
  document.getElementById('selection-content').classList.add('hidden');
  document.getElementById('ground-selection-empty').classList.add('hidden');
  document.getElementById('ground-selection-content').classList.add('hidden');
  document.getElementById('naval-selection-empty').classList.add('hidden');
  document.getElementById('naval-selection-content').classList.add('hidden');
  document.getElementById('ew-selection-empty').classList.add('hidden');
  document.getElementById('ew-selection-content').classList.add('hidden');
}

function deleteAoi(aoiId) {
  if (!confirm('Delete this Area of Interest?')) return;
  
  if (state.aoiPolygons[aoiId]) {
    map.removeLayer(state.aoiPolygons[aoiId]);
    delete state.aoiPolygons[aoiId];
  }
  delete state.aois[aoiId];
  if (state.selectedAoiId === aoiId) state.selectedAoiId = null;
  
  saveAoIs();
  renderAoiList();
  showFeedback('Area deleted', 'info');
}

/* ── No-Go Zone Feature ──────────────────────────────────────── */
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function isPointInNoGoZone(lat, lng) {
  for (const aoi of Object.values(state.aois)) {
    if (aoi.isNoGoZone && isPointInPolygon([lat, lng], aoi.coordinates)) return aoi;
  }
  return null;
}

function lineIntersectsPolygon(p1, p2, polygon) {
  if (isPointInPolygon(p1, polygon) || isPointInPolygon(p2, polygon)) return true;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (lineSegmentsIntersect(p1, p2, polygon[j], polygon[i])) return true;
  }
  return false;
}

function lineSegmentsIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3, [x4, y4] = p4;
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

function doesPathIntersectNoGoZone(startLat, startLng, endLat, endLng) {
  for (const aoi of Object.values(state.aois)) {
    if (aoi.isNoGoZone && lineIntersectsPolygon([startLat, startLng], [endLat, endLng], aoi.coordinates)) {
      return aoi;
    }
  }
  return null;
}

function enterNoGoZoneDrawingMode() {
  state.drawingNoGoZone = true;
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
  
  map.getContainer().style.cursor = 'crosshair';
  if (placeBanner) {
    placeBanner.innerHTML = '⛔ Click on map to draw no-go zone — Double-click to finish — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
    placeBanner.classList.remove('hidden');
  }
  
  state.drawingLayer = L.layerGroup().addTo(map);
  showFeedback('No-go zone mode: Click points on map', 'warning');
}

function exitNoGoZoneDrawingMode() {
  state.drawingNoGoZone = false;
  state.drawingAoi = false;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
  
  if (state.drawingLayer) {
    map.removeLayer(state.drawingLayer);
    state.drawingLayer = null;
  }
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
}

function addNoGoZonePoint(lat, lng) {
  state.drawingPoints.push([lat, lng]);
  
  const marker = L.circleMarker([lat, lng], {
    radius: 5, color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.8
  }).addTo(state.drawingLayer);
  state.drawingMarkers.push(marker);
  
  if (state.drawingPolygon) {
    state.drawingPolygon.setLatLngs(state.drawingPoints);
  } else {
    state.drawingPolygon = L.polygon(state.drawingPoints, {
      color: '#ff4444', fillColor: 'rgba(255, 68, 68, 0.2)',
      fillOpacity: 0.2, weight: 2, dashArray: '8, 4'
    }).addTo(state.drawingLayer);
  }
}

function completeNoGoZoneDrawing() {
  if (state.drawingPoints.length < 3) {
    showFeedback('Need at least 3 points to create a no-go zone', 'warning');
    exitNoGoZoneDrawingMode();
    return;
  }
  
  const name = prompt('Enter name for this No-Go Zone:', 'No-Go Zone ' + (Object.keys(state.aois).length + 1));
  if (!name) { exitNoGoZoneDrawingMode(); return; }
  
  const aoiId = generateAoiId();
  const aoi = {
    id: aoiId, name, coordinates: state.drawingPoints,
    ruleset: 'FORBIDDEN: Drones are not allowed to enter this area.',
    isNoGoZone: true, createdAt: new Date().toISOString()
  };
  
  state.aois[aoiId] = aoi;
  
  if (state.drawingLayer) {
    map.removeLayer(state.drawingLayer);
    state.drawingLayer = null;
  }
  
  const polygon = L.polygon(state.drawingPoints, {
    color: '#ff0000', fillColor: 'rgba(255, 0, 0, 0.25)',
    fillOpacity: 0.25, weight: 3, dashArray: '10, 5'
  }).addTo(map);
  
  polygon.on('click', (e) => { e.stopPropagation(); selectAoi(aoiId); });
  polygon.bindTooltip('⛔ ' + name, { permanent: true, direction: 'center' });
  state.aoiPolygons[aoiId] = polygon;
  
  state.drawingPoints = [];
  state.drawingPolygon = null;
  state.drawingMarkers = [];
  exitNoGoZoneDrawingMode();
  
  saveAoIs();
  renderAoiList();
  showFeedback(`No-go zone "${name}" created!`, 'warning');
}

document.getElementById('btn-draw-area').addEventListener('click', enterDrawingMode);

/* ── EW Signal Area Feature (Box/Rectangle) ──────────────────── */
function enterEwAreaDrawingMode() {
  state.drawingEwArea = true;
  state.ewAreaFirstCorner = null;
  state.ewAreaPreviewLayer = null;
  
  map.getContainer().style.cursor = 'crosshair';
  if (placeBanner) {
    placeBanner.innerHTML = '📡 Click first corner of EW Signal Area box — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
    placeBanner.classList.remove('hidden');
  }
  
  showFeedback('EW Signal Area mode: Click first corner, then second corner', 'info');
}

function exitEwAreaDrawingMode() {
  state.drawingEwArea = false;
  state.ewAreaFirstCorner = null;
  map.getContainer().style.cursor = '';
  if (placeBanner) placeBanner.classList.add('hidden');
  
  if (state.ewAreaPreviewLayer) {
    map.removeLayer(state.ewAreaPreviewLayer);
    state.ewAreaPreviewLayer = null;
  }
}

function updateEwAreaPreview(lat, lng) {
  if (!state.ewAreaFirstCorner) return;
  
  if (state.ewAreaPreviewLayer) {
    map.removeLayer(state.ewAreaPreviewLayer);
  }
  
  // Create rectangle from two corners
  const corners = [state.ewAreaFirstCorner, [lat, lng]];
  state.ewAreaPreviewLayer = L.rectangle(corners, {
    color: '#9d4edd',
    fillColor: 'rgba(157, 78, 221, 0.2)',
    fillOpacity: 0.2,
    weight: 2,
    dashArray: '8, 4'
  }).addTo(map);
}

function completeEwAreaDrawing(lat, lng) {
  if (!state.ewAreaFirstCorner) {
    state.ewAreaFirstCorner = [lat, lng];
    if (placeBanner) {
      placeBanner.innerHTML = '📡 Click second corner to complete box — <button id="btn-cancel-place" class="btn-xs">Cancel</button>';
    }
    showFeedback('First corner set. Click second corner.', 'info');
    return;
  }
  
  // Calculate rectangle corners from two points
  const [lat1, lng1] = state.ewAreaFirstCorner;
  const lat2 = lat;
  const lng2 = lng;
  
  // Create polygon coordinates for the rectangle
  const coordinates = [
    [lat1, lng1],
    [lat1, lng2],
    [lat2, lng2],
    [lat2, lng1]
  ];
  
  const name = prompt('Enter name for this EW Signal Area:', 'EW Signal Area ' + (Object.keys(state.aois).length + 1));
  if (!name) { exitEwAreaDrawingMode(); return; }
  
  const aoiId = generateAoiId();
  const aoi = {
    id: aoiId,
    name,
    coordinates,
    ruleset: 'WARNING: Electronic warfare signals detected in this area',
    isEwSignalArea: true,
    createdAt: new Date().toISOString()
  };
  
  state.aois[aoiId] = aoi;
  
  if (state.ewAreaPreviewLayer) {
    map.removeLayer(state.ewAreaPreviewLayer);
    state.ewAreaPreviewLayer = null;
  }
  
  const polygon = L.polygon(coordinates, {
    color: '#9d4edd',
    fillColor: 'rgba(157, 78, 221, 0.2)',
    fillOpacity: 0.2,
    weight: 2,
    dashArray: '5, 5'
  }).addTo(map);
  
  polygon.on('click', (e) => { e.stopPropagation(); selectAoi(aoiId); });
  polygon.bindTooltip('📡 ' + name, { permanent: true, direction: 'center' });
  state.aoiPolygons[aoiId] = polygon;
  
  state.ewAreaFirstCorner = null;
  exitEwAreaDrawingMode();
  
  saveAoIs();
  renderAoiList();
  showFeedback(`EW Signal Area "${name}" created!`, 'success');
}

document.getElementById('btn-draw-ew-area').addEventListener('click', enterEwAreaDrawingMode);

/* ── No-Go Zone Backend Sync ─────────────────────────────────── */
function applyNoGoZoneUpdate(zone) {
  if (state.aois[zone.id]) {
    const aoi = state.aois[zone.id];
    aoi.name = zone.name;
    aoi.coordinates = zone.coordinates;
    aoi.ruleset = zone.ruleset;
    aoi.isNoGoZone = true;
    
    const polygon = state.aoiPolygons[zone.id];
    if (polygon) {
      polygon.setLatLngs(zone.coordinates);
      polygon.setStyle({ color: '#ff0000', fillColor: 'rgba(255, 0, 0, 0.25)', fillOpacity: 0.25, weight: 3, dashArray: '10, 5' });
      polygon.setTooltipContent('⛔ ' + zone.name);
    }
  } else {
    state.aois[zone.id] = {
      id: zone.id, name: zone.name, coordinates: zone.coordinates,
      ruleset: zone.ruleset, isNoGoZone: true, createdAt: zone.createdAt
    };
    
    const polygon = L.polygon(zone.coordinates, {
      color: '#ff0000', fillColor: 'rgba(255, 0, 0, 0.25)',
      fillOpacity: 0.25, weight: 3, dashArray: '10, 5'
    }).addTo(map);
    
    polygon.on('click', (e) => { e.stopPropagation(); selectAoi(zone.id); });
    polygon.bindTooltip('⛔ ' + zone.name, { permanent: true, direction: 'center' });
    state.aoiPolygons[zone.id] = polygon;
  }
  
  saveAoIs();
  renderAoiList();
}

function applyNoGoZoneRemove(id) {
  delete state.aois[id];
  if (state.aoiPolygons[id]) {
    map.removeLayer(state.aoiPolygons[id]);
    delete state.aoiPolygons[id];
  }
  if (state.selectedAoiId === id) state.selectedAoiId = null;
  saveAoIs();
  renderAoiList();
}

function handleSimulationBlocked(msg) {
  const { droneId, zone, reason } = msg;
  const drone = state.drones[droneId];
  
  if (drone) {
    let message = `⛔ ${drone.name} stopped - `;
    message += reason === 'destination' ? `destination is in no-go zone: ${zone.name}` : `would enter no-go zone: ${zone.name}`;
    showFeedback(message, 'warning');
  }
  
  if (state.simulatingDrone === droneId) exitSimulationMode();
}

/* ── Options Panel ───────────────────────────────────────────── */
const optionsPanel = document.getElementById('options-panel');
const optionsToggle = document.getElementById('options-toggle');
const optionsDropdown = document.getElementById('options-dropdown');

optionsToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  optionsDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!optionsPanel.contains(e.target)) optionsDropdown.classList.add('hidden');
});

document.getElementById('btn-zoom-in')?.addEventListener('click', () => map.zoomIn());
document.getElementById('btn-zoom-out')?.addEventListener('click', () => map.zoomOut());

const themeSelect = document.getElementById('theme-select');
themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value));

function applyTheme(theme) {
  const root = document.documentElement;
  const themes = {
    dark: { '--bg': '#0a0c10', '--surface': '#141822', '--surface2': '#1e2430', '--surface3': '#262d3d', '--border': '#2d3550', '--text': '#e8eaf6', '--text-muted': '#6b7290' },
    light: { '--bg': '#f0f2f5', '--surface': '#ffffff', '--surface2': '#f8f9fa', '--surface3': '#e9ecef', '--border': '#dee2e6', '--text': '#212529', '--text-muted': '#6c757d' },
    midnight: { '--bg': '#0d1117', '--surface': '#161b22', '--surface2': '#21262d', '--surface3': '#30363d', '--border': '#30363d', '--text': '#c9d1d9', '--text-muted': '#8b949e' },
    desert: { '--bg': '#1a1814', '--surface': '#26231f', '--surface2': '#322e28', '--surface3': '#3d3730', '--border': '#4a4238', '--text': '#e8dcc8', '--text-muted': '#8b7d6b' }
  };
  
  if (themes[theme]) {
    Object.entries(themes[theme]).forEach(([key, value]) => root.style.setProperty(key, value));
  }
  
  if (THEME_TILES[theme]) setMapTileLayer(THEME_TILES[theme]);
}

/* ── Fleet/Mission Form Bindings ─────────────────────────────── */
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

// Mission form handlers
document.getElementById('btn-add-mission').addEventListener('click', () => {
  document.getElementById('mission-form').classList.toggle('hidden');
  document.getElementById('mf-title').focus();
});
document.getElementById('btn-cancel-mission').addEventListener('click', () => {
  document.getElementById('mission-form').classList.add('hidden');
  document.getElementById('mf-title').value = '';
  document.getElementById('mf-waypoint').value = '';
  document.getElementById('mf-end-condition').value = 'manual';
  document.getElementById('mf-end-condition-value').value = '60';
  document.getElementById('mf-time-condition-row').classList.add('hidden');
});

// End condition change handler - show/hide time input
document.getElementById('mf-end-condition').addEventListener('change', (e) => {
  const timeRow = document.getElementById('mf-time-condition-row');
  if (e.target.value === 'time_elapsed') {
    timeRow.classList.remove('hidden');
  } else {
    timeRow.classList.add('hidden');
  }
});

// Create waypoint button handler
document.getElementById('btn-create-waypoint').addEventListener('click', async () => {
  if (!state.activeHubId) {
    showFeedback('Please select a hub first', 'warning');
    return;
  }
  const name = prompt('Enter waypoint name:');
  if (!name) return;
  
  // Create waypoint at current map center
  const center = map.getCenter();
  const res = await fetch(`${API_BASE}/waypoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      type: 'coordinates',
      lat: center.lat,
      lng: center.lng,
      hubId: state.activeHubId
    })
  });
  
  if (res.ok) {
    showFeedback('Waypoint created!', 'success');
    // Refresh waypoint dropdown
    await loadWaypointsForHub(state.activeHubId);
  } else {
    showFeedback('Failed to create waypoint', 'error');
  }
});

document.getElementById('mission-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = document.getElementById('mf-title').value.trim();
  const type = document.getElementById('mf-type').value;
  const drones = parseInt(document.getElementById('mf-drones').value) || 1;
  const priority = parseInt(document.getElementById('mf-priority').value) || 100;
  const waypointId = document.getElementById('mf-waypoint').value || null;
  const endCondition = document.getElementById('mf-end-condition').value;
  const endConditionValue = endCondition === 'time_elapsed' 
    ? parseInt(document.getElementById('mf-end-condition-value').value) || 60 
    : null;
    
  if (!title || !state.activeHubId) return;
  
  await createMission(state.activeHubId, title, type, drones, priority, waypointId, endCondition, endConditionValue);
  document.getElementById('mf-title').value = '';
  document.getElementById('mf-waypoint').value = '';
  document.getElementById('mf-end-condition').value = 'manual';
  document.getElementById('mf-time-condition-row').classList.add('hidden');
  document.getElementById('mission-form').classList.add('hidden');
});

document.getElementById('btn-rename-hub').addEventListener('click', async () => {
  const name = document.getElementById('info-hub-name').value.trim();
  if (!name || !state.activeHubId) return;
  await renameHub(state.activeHubId, name);
});

document.getElementById('btn-delete-hub').addEventListener('click', async () => {
  if (!state.activeHubId) return;
  const hub = state.hubs[state.activeHubId];
  if (!confirm(`Delete hub "${hub?.name}"? This will also delete all its fleets and missions.`)) return;
  await deleteHub(state.activeHubId);
  closeHubPanel();
});

/* ── Selection Panel Actions ─────────────────────────────────── */
document.querySelectorAll('.selection-action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.selected) return;
    const action = btn.dataset.action;
    if (action === 'view') selectDrone(state.selected);
    else if (action === 'move' || action === 'patrol') enterSimulationMode(state.selected);
  });
});

/* ── EW Selection Panel Buttons ───────────────────────────────── */
const btnEditEwRuleset = document.getElementById('btn-edit-ew-ruleset');
const btnCenterEwMap = document.getElementById('btn-center-ew-map');

if (btnEditEwRuleset) {
  btnEditEwRuleset.addEventListener('click', () => {
    if (!state.currentEwSelection) {
      showFeedback('No EW Signal Area selected', 'warning');
      return;
    }
    openRulesetModal(state.currentEwSelection);
  });
}

if (btnCenterEwMap) {
  btnCenterEwMap.addEventListener('click', () => {
    if (!state.currentEwSelection) {
      showFeedback('No EW Signal Area selected', 'warning');
      return;
    }
    const aoi = state.currentEwSelection;
    const polygon = state.aoiPolygons[aoi.id];
    if (polygon) {
      const bounds = L.latLngBounds(polygon.getLatLngs());
      map.flyToBounds(bounds, { padding: [50, 50] });
      showFeedback(`Centered on "${aoi.name}"`, 'success');
    }
  });
}

/* ── Color Picker & Highlight ────────────────────────────────── */
const highlightColorPicker = document.getElementById('highlight-color-picker');
const highlightColorPreview = document.getElementById('highlight-color-preview');

if (highlightColorPicker) {
  highlightColorPicker.addEventListener('input', (e) => {
    state.highlightColor = e.target.value;
    if (highlightColorPreview) highlightColorPreview.style.backgroundColor = state.highlightColor;
  });
}

const btnHighlightZone = document.getElementById('btn-highlight-zone');
if (btnHighlightZone) {
  btnHighlightZone.addEventListener('click', () => {
    if (!state.selectedAoiId) { showFeedback('Please select an area first by clicking on it', 'warning'); return; }
    applyHighlightToAoi(state.selectedAoiId);
  });
}

const btnCancelHighlight = document.getElementById('btn-cancel-highlight');
if (btnCancelHighlight) {
  btnCancelHighlight.addEventListener('click', () => removeHighlight());
}

/* ── Keyboard Shortcuts ──────────────────────────────────────── */
document.querySelectorAll('.action-icon').forEach(icon => {
  icon.addEventListener('click', () => selectAction(icon.dataset.action));
});

document.addEventListener('keydown', (e) => {
  const key = e.key;
  if (key >= '1' && key <= '9') {
    const actions = Object.keys(ACTION_ICONS);
    const action = actions[parseInt(key) - 1];
    if (action) selectAction(action);
  }
  if (key === 'Escape') cancelAllModes();
});

/* ── Cookie Settings Integration ───────────────────────────────── */
const btnCookieSettings = document.getElementById('btn-cookie-settings');
if (btnCookieSettings) {
  btnCookieSettings.addEventListener('click', () => {
    if (typeof cookieManager !== 'undefined') {
      cookieManager.showSettings();
    }
  });
}

/* ── Delete Button Event Handlers ───────────────────────────────── */
function setupDeleteButtonHandlers() {
  // Ground unit delete buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-unit')) {
      e.stopPropagation();
      const unitId = e.target.dataset.id;
      
      // Determine unit type based on which list contains this button
      if (state.groundUnits[unitId]) {
        if (confirm(`Delete ground unit "${state.groundUnits[unitId].name}"?`)) {
          fetch(`${API_BASE}/ground-units/${unitId}`, { method: 'DELETE' })
            .then(res => {
              if (res.ok) {
                showFeedback('Ground unit deleted', 'success');
              }
            });
        }
      } else if (state.navalUnits[unitId]) {
        if (confirm(`Delete naval unit "${state.navalUnits[unitId].name}"?`)) {
          fetch(`${API_BASE}/naval-units/${unitId}`, { method: 'DELETE' })
            .then(res => {
              if (res.ok) {
                showFeedback('Naval unit deleted', 'success');
              }
            });
        }
      } else if (state.drones[unitId]) {
        if (confirm(`Delete drone "${state.drones[unitId].name}"?`)) {
          fetch(`${API_BASE}/drones/${unitId}`, { method: 'DELETE' })
            .then(res => {
              if (res.ok) {
                showFeedback('Drone deleted', 'success');
              }
            });
        }
      }
    }
  });
}

/* ── Situation Room ──────────────────────────────────────────── */
function toggleSituationRoom() {
  const panel = document.getElementById('situation-room-panel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

function closeSituationRoom() {
  const panel = document.getElementById('situation-room-panel');
  if (panel) {
    panel.classList.add('hidden');
  }
}

function updateSituationRoom() {
  // Fleet count
  const fleetCount = Object.keys(state.fleets).length;
  const fleetEl = document.getElementById('situation-fleet-count');
  if (fleetEl && fleetEl.textContent !== String(fleetCount)) {
    fleetEl.textContent = fleetCount;
    fleetEl.classList.add('pulse');
    setTimeout(() => fleetEl.classList.remove('pulse'), 300);
  }

  // Active units (drones with status "active" + moving ground/naval units)
  const activeDrones = Object.values(state.drones).filter(d => d.status === 'active').length;
  const activeGround = Object.values(state.groundUnits).filter(u => u.status === 'moving').length;
  const activeNaval = Object.values(state.navalUnits).filter(u => u.status === 'moving').length;
  const activeUnits = activeDrones + activeGround + activeNaval;
  const activeEl = document.getElementById('situation-active-units');
  if (activeEl && activeEl.textContent !== String(activeUnits)) {
    activeEl.textContent = activeUnits;
    activeEl.classList.add('pulse');
    setTimeout(() => activeEl.classList.remove('pulse'), 300);
  }

  // Ground units count
  const groundCount = Object.keys(state.groundUnits).length;
  const groundEl = document.getElementById('situation-ground-units');
  if (groundEl && groundEl.textContent !== String(groundCount)) {
    groundEl.textContent = groundCount;
    groundEl.classList.add('pulse');
    setTimeout(() => groundEl.classList.remove('pulse'), 300);
  }

  // Naval units count
  const navalCount = Object.keys(state.navalUnits).length;
  const navalEl = document.getElementById('situation-naval-units');
  if (navalEl && navalEl.textContent !== String(navalCount)) {
    navalEl.textContent = navalCount;
    navalEl.classList.add('pulse');
    setTimeout(() => navalEl.classList.remove('pulse'), 300);
  }

  // Total hubs
  const hubCount = Object.keys(state.hubs).length;
  const hubEl = document.getElementById('situation-hubs');
  if (hubEl && hubEl.textContent !== String(hubCount)) {
    hubEl.textContent = hubCount;
    hubEl.classList.add('pulse');
    setTimeout(() => hubEl.classList.remove('pulse'), 300);
  }

  // Active missions
  const activeMissions = Object.values(state.missions).filter(m => m.status === 'active').length;
  const missionsEl = document.getElementById('situation-active-missions');
  if (missionsEl && missionsEl.textContent !== String(activeMissions)) {
    missionsEl.textContent = activeMissions;
    missionsEl.classList.add('pulse');
    setTimeout(() => missionsEl.classList.remove('pulse'), 300);
  }
}

/* ── Event Listeners for Situation Room ──────────────────────── */
const btnSituationRoom = document.getElementById('btn-situation-room');
if (btnSituationRoom) {
  btnSituationRoom.addEventListener('click', toggleSituationRoom);
}

const btnCloseSituationRoom = document.getElementById('btn-close-situation-room');
if (btnCloseSituationRoom) {
  btnCloseSituationRoom.addEventListener('click', closeSituationRoom);
}

/* ── Real-time Updates Interval ──────────────────────────────── */
// Update Situation Room every 500ms for smooth real-time display
setInterval(updateSituationRoom, 500);

/* ── Map Context Menu (right-click on empty map) ─────────────── */
const mapContextMenu = document.getElementById('map-context-menu');
const mapContextTitle = document.getElementById('map-context-title');
const mapContextCoords = document.getElementById('map-context-coords');
const mapContextClose = document.getElementById('map-context-close');

let mapContextLatLng = null;

function hideMapContextMenu() {
  if (mapContextMenu) mapContextMenu.classList.add('hidden');
  mapContextLatLng = null;
}

function showMapContextMenu(latlng, containerPoint) {
  if (!mapContextMenu) return;
  
  // Hide entity context menu if open
  hideEntityContextMenu();
  
  mapContextLatLng = latlng;
  mapContextTitle.textContent = '📍 Map Actions';
  mapContextCoords.innerHTML = `<span class="coords-icon">📍</span> <span class="coords-value">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</span>`;
  
  // Position the menu at the click point
  let left = containerPoint.x;
  let top = containerPoint.y;
  
  // Ensure menu stays within viewport
  const menuWidth = 240;
  const menuHeight = 350;
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
  if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 10;
  if (left < 0) left = 10;
  if (top < 0) top = 10;
  
  mapContextMenu.style.left = `${left}px`;
  mapContextMenu.style.top = `${top}px`;
  mapContextMenu.classList.remove('hidden');
}

// Map right-click handler
map.on('contextmenu', (e) => {
  e.originalEvent.preventDefault();
  const containerPoint = map.latLngToContainerPoint(e.latlng);
  showMapContextMenu(e.latlng, containerPoint);
});

// ─── Submenu Functions ────────────────────────────────────────────────────────

/**
 * Hide all unit type submenus
 */
function hideAllSubmenus() {
  document.querySelectorAll('.context-submenu').forEach(submenu => {
    submenu.classList.add('hidden');
  });
}

/**
 * Position and show a specific submenu next to the context menu
 * @param {string} submenuId - The ID of the submenu to show
 * @param {HTMLElement} parentElement - The parent menu item element
 */
function showSubmenu(submenuId, parentElement) {
  hideAllSubmenus();
  const submenu = document.getElementById(submenuId);
  if (submenu && parentElement) {
    // Get the context menu position
    const contextMenu = mapContextMenu;
    const contextMenuRect = contextMenu.getBoundingClientRect();
    const parentRect = parentElement.getBoundingClientRect();
    
    // Position submenu to the right of the context menu, aligned with the parent item
    const submenuLeft = contextMenuRect.right + 4; // 4px gap
    const submenuTop = parentRect.top;
    
    // Check if submenu would go off screen
    const submenuWidth = 180;
    const submenuHeight = submenu.offsetHeight || 100;
    
    let finalLeft = submenuLeft;
    let finalTop = submenuTop;
    
    // Adjust if submenu would go off right edge
    if (finalLeft + submenuWidth > window.innerWidth) {
      finalLeft = contextMenuRect.left - submenuWidth - 4;
    }
    
    // Adjust if submenu would go off bottom edge
    if (finalTop + submenuHeight > window.innerHeight) {
      finalTop = window.innerHeight - submenuHeight - 10;
    }
    
    submenu.style.left = `${finalLeft}px`;
    submenu.style.top = `${finalTop}px`;
    submenu.classList.remove('hidden');
  }
}

/**
 * Spawn a unit based on submenu selection
 * @param {string} unitType - The type of unit to spawn
 * @param {string} category - The category (air-units, ground-units, naval-units)
 */
async function spawnUnitFromSubmenu(unitType, category) {
  if (!mapContextLatLng) return null;
  const { lat, lng } = mapContextLatLng;
  
  try {
    switch (category) {
      case 'air-units':
        const drone = await spawnDroneAtLocation(lat, lng);
        if (drone) {
          showFeedback('Drone spawned!', 'success');
        }
        return drone;
      
      case 'ground-units':
        const gUnit = await spawnGroundUnit(lat, lng, unitType);
        if (gUnit) {
          showFeedback(`Ground unit (${unitType}) spawned!`, 'success');
        }
        return gUnit;
      
      case 'naval-units':
        const nUnit = await spawnNavalUnit(lat, lng, unitType);
        if (nUnit) {
          showFeedback(`Naval unit (${unitType}) spawned!`, 'success');
        }
        return nUnit;
      
      default:
        return null;
    }
  } catch (error) {
    console.error('Error spawning unit:', error);
    showFeedback('Failed to spawn unit', 'error');
    return null;
  }
}

// Map context menu close button
if (mapContextClose) {
  mapContextClose.addEventListener('click', () => {
    hideAllSubmenus();
    hideMapContextMenu();
  });
}

// Setup submenu hover handlers for parent menu items
if (mapContextMenu) {
  // Handle hover over submenu parent items
  mapContextMenu.querySelectorAll('.context-option--has-submenu').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      const action = btn.dataset.mapAction;
      if (action) {
        showSubmenu(`submenu-${action}`, btn);
      }
    });
    
    // Prevent click from triggering on parent items
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  });
  
  // Setup submenu item click handlers
  document.querySelectorAll('.context-submenu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const unitType = item.dataset.unitType;
      const submenu = item.closest('.context-submenu');
      const category = submenu?.id.replace('submenu-', '');
      
      if (category && unitType) {
        await spawnUnitFromSubmenu(unitType, category);
      }
      
      hideAllSubmenus();
      hideMapContextMenu();
    });
  });
  
  // Setup regular context menu action handlers (non-submenu items)
  mapContextMenu.querySelectorAll('.context-option[data-map-action]:not(.context-option--has-submenu)').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!mapContextLatLng) return;
      const action = btn.dataset.mapAction;
      const { lat, lng } = mapContextLatLng;
      
      switch (action) {
        case 'place-hub':
          const hub = await createHub(lat, lng);
          if (hub) showFeedback('Hub placed!', 'success');
          break;
        case 'draw-area':
          enterDrawingMode();
          break;
        case 'copy-coords':
          const coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          navigator.clipboard.writeText(coordText).then(() => {
            showToast('Coordinates copied!');
          }).catch(() => {
            showToast('Failed to copy coordinates');
          });
          break;
      }
      hideAllSubmenus();
      hideMapContextMenu();
    });
  });
}

// Close map context menu and submenus on click elsewhere
document.addEventListener('click', (e) => {
  if (mapContextMenu && !mapContextMenu.contains(e.target)) {
    hideAllSubmenus();
    hideMapContextMenu();
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (mapContextMenu && !mapContextMenu.classList.contains('hidden')) {
      hideAllSubmenus();
      hideMapContextMenu();
    }
  }
});

// ─── Improved Submenu Hover Handling ───────────────────────────────────────────
// Add a small delay before hiding submenus to allow smooth mouse transition
let submenuHideTimeout = null;
const SUBMENU_HIDE_DELAY = 150; // ms delay to allow mouse to cross gap

if (mapContextMenu) {
  // Helper function to hide submenus with delay
  function scheduleSubmenuHide() {
    if (submenuHideTimeout) clearTimeout(submenuHideTimeout);
    submenuHideTimeout = setTimeout(() => {
      // Double-check: only hide if mouse is not over context menu or any submenu
      if (
        !mapContextMenu.matches(':hover') && 
        !document.querySelector('.context-submenu:hover')
      ) {
        hideAllSubmenus();
      }
    }, SUBMENU_HIDE_DELAY);
  }
  
  // Helper function to cancel hide
  function cancelSubmenuHide() {
    if (submenuHideTimeout) {
      clearTimeout(submenuHideTimeout);
      submenuHideTimeout = null;
    }
  }
  
  // Context menu hover handlers
  mapContextMenu.addEventListener('mouseenter', cancelSubmenuHide);
  
  mapContextMenu.addEventListener('mouseleave', (e) => {
    // Only schedule hide if we're not moving to a submenu
    if (!e.relatedTarget || !e.relatedTarget.closest('.context-submenu')) {
      scheduleSubmenuHide();
    }
  });
  
  // Submenu hover handlers - keep open when hovering
  document.querySelectorAll('.context-submenu').forEach(submenu => {
    submenu.addEventListener('mouseenter', () => {
      cancelSubmenuHide();
      submenu.classList.remove('hidden');
    });
    
    submenu.addEventListener('mouseleave', () => {
      // Schedule hide when leaving submenu
      scheduleSubmenuHide();
    });
  });
  
  // Also handle hover on parent menu items with submenus
  mapContextMenu.querySelectorAll('.context-option--has-submenu').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      cancelSubmenuHide();
    });
    
    btn.addEventListener('mouseleave', () => {
      // Don't hide immediately - user might be moving to submenu
    });
  });
}

/* ── Initialization ──────────────────────────────────────────── */
loadAoIs();
setupDeleteButtonHandlers();
setupRulesetModalListeners();

/* ── Sidebar Toggle (Z-key) ──────────────────────────────────── */
let isSidebarCollapsed = false;

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  
  isSidebarCollapsed = !isSidebarCollapsed;
  
  if (isSidebarCollapsed) {
    sidebar.classList.add('sidebar--collapsed');
    toggleBtn.classList.add('btn-sidebar-toggle--collapsed');
    toggleBtn.querySelector('.btn-sidebar-toggle__icon').textContent = '▶';
  } else {
    sidebar.classList.remove('sidebar--collapsed');
    toggleBtn.classList.remove('btn-sidebar-toggle--collapsed');
    toggleBtn.querySelector('.btn-sidebar-toggle__icon').textContent = '◀';
  }
}

// Z-key toggle handler
document.addEventListener('keydown', (e) => {
  // Only trigger on Z key, not when typing in inputs
  if (e.key === 'z' || e.key === 'Z') {
    const activeElement = document.activeElement;
    const isInput = activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable;
    
    if (!isInput) {
      e.preventDefault();
      toggleSidebar();
    }
  }
});

// Click handler for toggle button
const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener('click', toggleSidebar);
}

/* ── Collapsible Sections ────────────────────────────────────── */
function toggleSection(sectionHeaderId, sectionContentId) {
  const header = document.getElementById(sectionHeaderId);
  const content = document.getElementById(sectionContentId);
  
  if (!header || !content) return;
  
  header.classList.toggle('section-title--collapsed');
  content.classList.toggle('section-content--collapsed');
}

// Setup collapsible section headers
function setupCollapsibleSections() {
  // Mission Hubs section
  const hubsHeader = document.getElementById('hubs-section-header');
  if (hubsHeader) {
    hubsHeader.addEventListener('click', (e) => {
      // Prevent toggle when clicking on buttons
      if (e.target.closest('.btn-icon')) return;
      toggleSection('hubs-section-header', 'hub-list');
    });
  }
  
  // Areas of Interest section
  const aoiHeader = document.getElementById('aoi-section-header');
  if (aoiHeader) {
    aoiHeader.addEventListener('click', (e) => {
      // Prevent toggle when clicking on buttons
      if (e.target.closest('.btn-icon')) return;
      toggleSection('aoi-section-header', 'aoi-list');
    });
  }
}

// Auto-collapse empty sections
function autoCollapseEmptySections() {
  const hubList = document.getElementById('hub-list');
  const aoiList = document.getElementById('aoi-list');
  
  // Collapse Mission Hubs if empty
  if (hubList && hubList.children.length === 0) {
    hubList.classList.add('section-content--collapsed');
    const hubsHeader = document.getElementById('hubs-section-header');
    if (hubsHeader) hubsHeader.classList.add('section-title--collapsed');
  }
  
  // Collapse Areas of Interest if empty
  if (aoiList && aoiList.children.length === 0) {
    aoiList.classList.add('section-content--collapsed');
    const aoiHeader = document.getElementById('aoi-section-header');
    if (aoiHeader) aoiHeader.classList.add('section-title--collapsed');
  }
}

// Initialize collapsible sections
setupCollapsibleSections();
autoCollapseEmptySections();

/* ── Focus Mode (Space-bar to hide overlays) ─────────────────── */
let isFocusModeActive = false;

function toggleFocusMode(visible) {
  const body = document.body;
  if (visible) {
    body.classList.remove('focus-mode');
  } else {
    body.classList.add('focus-mode');
  }
}

document.addEventListener('keydown', (e) => {
  // Only trigger on space-bar, not when typing in inputs
  if (e.code === 'Space' && !isFocusModeActive) {
    // Check if focus is on an input/textarea element
    const activeElement = document.activeElement;
    const isInput = activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable;
    
    if (!isInput) {
      e.preventDefault(); // Prevent page scrolling
      isFocusModeActive = true;
      toggleFocusMode(false);
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && isFocusModeActive) {
    isFocusModeActive = false;
    toggleFocusMode(true);
  }
});

/* ── Search Bar Functionality ─────────────────────────────────── */
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.ok) {
      throw new Error('Geocoding service unavailable');
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return null;
    }
    
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function centerMapOnLocation(lat, lng, address) {
  map.flyTo([lat, lng], 14, {
    duration: 1.5
  });
  
  // Show a temporary marker
  const marker = L.marker([lat, lng]).addTo(map);
  marker.bindPopup(`<strong>${address || 'Selected Location'}</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
  
  // Remove marker after 5 seconds
  setTimeout(() => {
    map.removeLayer(marker);
  }, 5000);
}

function showSearchFeedback(message, isError = false) {
  // Create or update toast notification
  let toast = document.getElementById('search-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'search-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  const toastMessage = document.getElementById('toast-message');
  if (toastMessage) {
    toastMessage.textContent = message;
  }
  
  toast.classList.remove('hidden');
  if (isError) {
    toast.style.background = 'linear-gradient(135deg, rgba(255, 68, 68, 0.95), rgba(255, 100, 100, 0.95))';
  } else {
    toast.style.background = 'linear-gradient(135deg, var(--green), #00cc6a)';
  }
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Initialize search bar event listener
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const address = searchInput.value.trim();
      
      if (!address) {
        showSearchFeedback('Please enter an address', true);
        return;
      }
      
      // Disable input during search
      searchInput.disabled = true;
      searchInput.placeholder = 'Searching...';
      
      const result = await geocodeAddress(address);
      
      if (result) {
        centerMapOnLocation(result.lat, result.lng, result.display_name);
        showSearchFeedback(`Centered on: ${result.display_name.split(',')[0]}`);
        searchInput.value = '';
      } else {
        showSearchFeedback('Address not found. Please try again.', true);
      }
      
      // Re-enable input
      searchInput.disabled = false;
      searchInput.placeholder = 'Search address...';
      searchInput.focus();
    }
  });
}

/* ── App Initialization ─────────────────────────────────────────── */
// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
