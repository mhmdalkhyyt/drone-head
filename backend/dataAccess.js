/**
 * Data Access Layer for Drone Head
 * Provides user-scoped database operations for all entities
 */

const Database = require('better-sqlite3');
const path = require('path');

class DataAccessLayer {
  constructor(db) {
    this.db = db;
  }

  // ─── Helper Methods ─────────────────────────────────────────────────────────

  /**
   * Get entities for a specific user
   */
  getUserEntities(table, userId, fields = '*') {
    return this.db.prepare(
      `SELECT ${fields} FROM ${table} WHERE user_id = ?`
    ).all(userId);
  }

  /**
   * Get a single entity by ID and user
   */
  getUserEntity(table, userId, id, fields = '*') {
    return this.db.prepare(
      `SELECT ${fields} FROM ${table} WHERE user_id = ? AND id = ?`
    ).get(userId, id);
  }

  /**
   * Get a single entity by ID only (admin/system access)
   */
  getEntity(table, id, fields = '*') {
    return this.db.prepare(
      `SELECT ${fields} FROM ${table} WHERE id = ?`
    ).get(id);
  }

  /**
   * Insert a new entity for a user
   */
  insertEntity(table, userId, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const stmt = this.db.prepare(
      `INSERT INTO ${table} (user_id, ${columns.join(', ')}) VALUES (?, ${placeholders})`
    );
    
    return stmt.run(userId, ...values);
  }

  /**
   * Update an entity for a user
   */
  updateEntity(table, userId, id, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const stmt = this.db.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`
    );
    
    return stmt.run(...values, userId, id);
  }

  /**
   * Delete an entity for a user
   */
  deleteEntity(table, userId, id) {
    const result = this.db.prepare(
      `DELETE FROM ${table} WHERE user_id = ? AND id = ?`
    ).run(userId, id);
    
    return result.changes > 0;
  }

  // ─── Drone Operations ───────────────────────────────────────────────────────

  getDrones(userId) {
    return this.getUserEntities('drones', userId);
  }

  getDrone(userId, id) {
    return this.getUserEntity('drones', userId, id);
  }

  createDrone(userId, { name, lat, lng, altitude = 0, speed = 0, status = 'active', battery = 100, hubId = null }) {
    const result = this.insertEntity('drones', userId, {
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      altitude: parseFloat(altitude),
      speed: parseFloat(speed),
      status,
      battery: parseFloat(battery),
      hub_id: hubId
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      altitude: parseFloat(altitude),
      speed: parseFloat(speed),
      status,
      battery: parseFloat(battery),
      hubId,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  updateDrone(userId, id, { lat, lng, altitude, speed, status, battery, name, hubId }) {
    const updates = {};
    if (lat !== undefined) updates.lat = parseFloat(lat);
    if (lng !== undefined) updates.lng = parseFloat(lng);
    if (altitude !== undefined) updates.altitude = parseFloat(altitude);
    if (speed !== undefined) updates.speed = parseFloat(speed);
    if (status !== undefined) updates.status = status;
    if (battery !== undefined) updates.battery = parseFloat(battery);
    if (name !== undefined) updates.name = name;
    if (hubId !== undefined) updates.hub_id = hubId;
    
    this.updateEntity('drones', userId, id, updates);
    return this.getDrone(userId, id);
  }

  deleteDrone(userId, id) {
    return this.deleteEntity('drones', userId, id);
  }

  // ─── Hub Operations ─────────────────────────────────────────────────────────

  getHubs(userId) {
    return this.getUserEntities('hubs', userId);
  }

  getHub(userId, id) {
    return this.getUserEntity('hubs', userId, id);
  }

  createHub(userId, { name, lat, lng }) {
    const result = this.insertEntity('hubs', userId, {
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateHub(userId, id, { name }) {
    this.updateEntity('hubs', userId, id, { name });
    return this.getHub(userId, id);
  }

  deleteHub(userId, id) {
    // Cascade delete related fleets and missions
    this.db.prepare('DELETE FROM fleets WHERE user_id = ? AND hub_id = ?').run(userId, id);
    this.db.prepare('DELETE FROM missions WHERE user_id = ? AND hub_id = ?').run(userId, id);
    this.db.prepare('DELETE FROM drones WHERE user_id = ? AND hub_id = ?').run(userId, id);
    
    return this.deleteEntity('hubs', userId, id);
  }

  // ─── Fleet Operations ───────────────────────────────────────────────────────

  getFleets(userId, hubId = null) {
    if (hubId) {
      return this.db.prepare(
        'SELECT * FROM fleets WHERE user_id = ? AND hub_id = ?'
      ).all(userId, hubId);
    }
    return this.getUserEntities('fleets', userId);
  }

  getFleet(userId, id) {
    return this.getUserEntity('fleets', userId, id);
  }

  createFleet(userId, { hubId, name }) {
    const result = this.insertEntity('fleets', userId, {
      hub_id: hubId,
      name,
      drone_ids: '[]',
      status: 'idle',
      current_mission_id: null
    });
    
    return {
      id: result.lastInsertRowid,
      hubId,
      name,
      droneIds: [],
      status: 'idle',
      currentMissionId: null,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateFleet(userId, id, { name, droneIds, status, currentMissionId }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (droneIds !== undefined) updates.drone_ids = JSON.stringify(droneIds);
    if (status !== undefined) updates.status = status;
    if (currentMissionId !== undefined) updates.current_mission_id = currentMissionId;
    
    this.updateEntity('fleets', userId, id, updates);
    return this.getFleet(userId, id);
  }

  deleteFleet(userId, id) {
    return this.deleteEntity('fleets', userId, id);
  }

  // ─── Mission Operations ─────────────────────────────────────────────────────

  getMissions(userId, hubId = null) {
    if (hubId) {
      return this.db.prepare(
        'SELECT * FROM missions WHERE user_id = ? AND hub_id = ? ORDER BY priority, created_at'
      ).all(userId, hubId);
    }
    return this.getUserEntities('missions', userId);
  }

  getMission(userId, id) {
    return this.getUserEntity('missions', userId, id);
  }

  createMission(userId, { hubId, title, type = 'general', requiredDrones = 1, priority = 100, waypointId = null, endCondition = 'manual', endConditionValue = null }) {
    const result = this.insertEntity('missions', userId, {
      hub_id: hubId,
      title,
      type,
      required_drones: requiredDrones,
      priority,
      status: 'queued',
      assigned_fleet_id: null,
      waypoint_id: waypointId,
      end_condition: endCondition,
      end_condition_value: endConditionValue
    });
    
    return {
      id: result.lastInsertRowid,
      hubId,
      title,
      type,
      requiredDrones,
      priority,
      status: 'queued',
      assignedFleetId: null,
      waypointId,
      endCondition,
      endConditionValue,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateMission(userId, id, { title, type, requiredDrones, priority, status, assignedFleetId, waypointId, endCondition, endConditionValue }) {
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (type !== undefined) updates.type = type;
    if (requiredDrones !== undefined) updates.required_drones = requiredDrones;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (assignedFleetId !== undefined) updates.assigned_fleet_id = assignedFleetId;
    if (waypointId !== undefined) updates.waypoint_id = waypointId;
    if (endCondition !== undefined) updates.end_condition = endCondition;
    if (endConditionValue !== undefined) updates.end_condition_value = endConditionValue;
    
    this.updateEntity('missions', userId, id, updates);
    return this.getMission(userId, id);
  }

  deleteMission(userId, id) {
    return this.deleteEntity('missions', userId, id);
  }

  // ─── Ground Unit Operations ─────────────────────────────────────────────────

  getGroundUnits(userId, hubId = null) {
    if (hubId) {
      return this.db.prepare(
        'SELECT * FROM ground_units WHERE user_id = ? AND hub_id = ?'
      ).all(userId, hubId);
    }
    return this.getUserEntities('ground_units', userId);
  }

  getGroundUnit(userId, id) {
    return this.getUserEntity('ground_units', userId, id);
  }

  createGroundUnit(userId, { name, type = 'truck', lat, lng, hubId = null, speed = 70, battery = 100 }) {
    const unitName = name !== undefined && name !== null ? String(name) : 'Unknown';
    const unitType = type !== undefined ? type : 'truck';
    const unitLat = lat !== undefined ? parseFloat(lat) : 0;
    const unitLng = lng !== undefined ? parseFloat(lng) : 0;
    const unitSpeed = speed !== undefined ? parseFloat(speed) : 70;
    const unitBattery = battery !== undefined ? parseFloat(battery) : 100;
    const result = this.insertEntity('ground_units', userId, {
      name: unitName,
      type: unitType,
      lat: unitLat,
      lng: unitLng,
      hub_id: hubId !== undefined && hubId !== null ? hubId : null,
      speed: unitSpeed,
      battery: unitBattery,
      status: 'idle',
      on_road: 0,
      current_path: '[]',
      path_index: 0
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      type,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed: parseFloat(speed),
      status: 'idle',
      battery: parseFloat(battery),
      hubId,
      onRoad: false,
      currentPath: [],
      pathIndex: 0,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  updateGroundUnit(userId, id, { lat, lng, speed, status, battery, name, hubId, onRoad, currentPath, pathIndex }) {
    const updates = {};
    if (lat !== undefined) updates.lat = parseFloat(lat);
    if (lng !== undefined) updates.lng = parseFloat(lng);
    if (speed !== undefined) updates.speed = parseFloat(speed);
    if (status !== undefined) updates.status = status;
    if (battery !== undefined) updates.battery = parseFloat(battery);
    if (name !== undefined) updates.name = name;
    if (hubId !== undefined) updates.hub_id = hubId;
    if (onRoad !== undefined) updates.on_road = onRoad;
    if (currentPath !== undefined) updates.current_path = JSON.stringify(currentPath);
    if (pathIndex !== undefined) updates.path_index = pathIndex;
    
    this.updateEntity('ground_units', userId, id, updates);
    return this.getGroundUnit(userId, id);
  }

  deleteGroundUnit(userId, id) {
    return this.deleteEntity('ground_units', userId, id);
  }

  // ─── Radio Tower Operations ─────────────────────────────────────────────────

  getRadioTowers(userId) {
    return this.db.prepare(
      'SELECT * FROM ground_units WHERE user_id = ? AND is_radio_tower = 1'
    ).all(userId);
  }

  getRadioTower(userId, id) {
    return this.db.prepare(
      'SELECT * FROM ground_units WHERE user_id = ? AND id = ? AND is_radio_tower = 1'
    ).get(userId, id);
  }

  updateRadioTower(userId, id, { radioRangeMeters, radioEffects, radioActive }) {
    const updates = {};
    if (radioRangeMeters !== undefined) updates.radio_range_meters = parseFloat(radioRangeMeters);
    if (radioEffects !== undefined) updates.radio_effects = typeof radioEffects === 'string' ? radioEffects : JSON.stringify(radioEffects);
    if (radioActive !== undefined) updates.radio_active = radioActive ? 1 : 0;
    
    this.updateEntity('ground_units', userId, id, updates);
    return this.getGroundUnit(userId, id);
  }

  toggleRadioTower(userId, id) {
    const tower = this.getGroundUnit(userId, id);
    if (!tower || !tower.is_radio_tower) {
      return null;
    }
    const newActive = tower.on_road ? 0 : 1; // Using on_road field as temp storage for radio_active toggle
    this.updateEntity('ground_units', userId, id, { radio_active: newActive });
    return this.getGroundUnit(userId, id);
  }

  // ─── Naval Unit Operations ──────────────────────────────────────────────────

  getNavalUnits(userId, hubId = null) {
    if (hubId) {
      return this.db.prepare(
        'SELECT * FROM naval_units WHERE user_id = ? AND hub_id = ?'
      ).all(userId, hubId);
    }
    return this.getUserEntities('naval_units', userId);
  }

  getNavalUnit(userId, id) {
    return this.getUserEntity('naval_units', userId, id);
  }

  createNavalUnit(userId, { name, type = 'fast-boat', lat, lng, hubId = null, speed = 80, battery = 100 }) {
    const result = this.insertEntity('naval_units', userId, {
      name,
      type,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      hub_id: hubId,
      speed: parseFloat(speed),
      battery: parseFloat(battery),
      status: 'idle',
      current_path: '[]',
      path_index: 0
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      type,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      speed: parseFloat(speed),
      status: 'idle',
      battery: parseFloat(battery),
      hubId,
      currentPath: [],
      pathIndex: 0,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  updateNavalUnit(userId, id, { lat, lng, speed, status, battery, name, hubId, currentPath, pathIndex }) {
    const updates = {};
    if (lat !== undefined) updates.lat = parseFloat(lat);
    if (lng !== undefined) updates.lng = parseFloat(lng);
    if (speed !== undefined) updates.speed = parseFloat(speed);
    if (status !== undefined) updates.status = status;
    if (battery !== undefined) updates.battery = parseFloat(battery);
    if (name !== undefined) updates.name = name;
    if (hubId !== undefined) updates.hub_id = hubId;
    if (currentPath !== undefined) updates.current_path = JSON.stringify(currentPath);
    if (pathIndex !== undefined) updates.path_index = pathIndex;
    
    this.updateEntity('naval_units', userId, id, updates);
    return this.getNavalUnit(userId, id);
  }

  deleteNavalUnit(userId, id) {
    return this.deleteEntity('naval_units', userId, id);
  }

  // ─── Road Operations ────────────────────────────────────────────────────────

  getRoads(userId) {
    return this.getUserEntities('roads', userId);
  }

  getRoad(userId, id) {
    return this.getUserEntity('roads', userId, id);
  }

  createRoad(userId, { name, type = 'street', coordinates, speedLimit = 50 }) {
    const result = this.insertEntity('roads', userId, {
      name,
      type,
      coordinates: JSON.stringify(coordinates),
      speed_limit: parseFloat(speedLimit)
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      type,
      coordinates,
      speedLimit: parseFloat(speedLimit),
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateRoad(userId, id, { name, type, coordinates, speedLimit }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (coordinates !== undefined) updates.coordinates = JSON.stringify(coordinates);
    if (speedLimit !== undefined) updates.speed_limit = parseFloat(speedLimit);
    
    this.updateEntity('roads', userId, id, updates);
    return this.getRoad(userId, id);
  }

  deleteRoad(userId, id) {
    return this.deleteEntity('roads', userId, id);
  }

  // ─── Walkable Path Operations ───────────────────────────────────────────────

  getWalkablePaths(userId) {
    return this.getUserEntities('walkable_paths', userId);
  }

  getWalkablePath(userId, id) {
    return this.getUserEntity('walkable_paths', userId, id);
  }

  createWalkablePath(userId, { name, type = 'footpath', coordinates }) {
    const result = this.insertEntity('walkable_paths', userId, {
      name,
      type,
      coordinates: JSON.stringify(coordinates)
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      type,
      coordinates,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateWalkablePath(userId, id, { name, type, coordinates }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (coordinates !== undefined) updates.coordinates = JSON.stringify(coordinates);
    
    this.updateEntity('walkable_paths', userId, id, updates);
    return this.getWalkablePath(userId, id);
  }

  deleteWalkablePath(userId, id) {
    return this.deleteEntity('walkable_paths', userId, id);
  }

  // ─── No-Go Zone Operations ──────────────────────────────────────────────────

  getNoGoZones(userId) {
    return this.getUserEntities('no_go_zones', userId);
  }

  getNoGoZone(userId, id) {
    return this.getUserEntity('no_go_zones', userId, id);
  }

  createNoGoZone(userId, { name, coordinates, ruleset = 'FORBIDDEN: Drones are not allowed to enter this area.' }) {
    const result = this.insertEntity('no_go_zones', userId, {
      name,
      coordinates: JSON.stringify(coordinates),
      ruleset
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      coordinates,
      ruleset,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateNoGoZone(userId, id, { name, coordinates, ruleset }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (coordinates !== undefined) updates.coordinates = JSON.stringify(coordinates);
    if (ruleset !== undefined) updates.ruleset = ruleset;
    
    this.updateEntity('no_go_zones', userId, id, updates);
    return this.getNoGoZone(userId, id);
  }

  deleteNoGoZone(userId, id) {
    return this.deleteEntity('no_go_zones', userId, id);
  }

  // ─── Water Area Operations ──────────────────────────────────────────────────

  getWaterAreas(userId) {
    return this.getUserEntities('water_areas', userId);
  }

  getWaterArea(userId, id) {
    return this.getUserEntity('water_areas', userId, id);
  }

  createWaterArea(userId, { name, coordinates }) {
    const result = this.insertEntity('water_areas', userId, {
      name,
      coordinates: JSON.stringify(coordinates)
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      coordinates,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateWaterArea(userId, id, { name, coordinates }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (coordinates !== undefined) updates.coordinates = JSON.stringify(coordinates);
    
    this.updateEntity('water_areas', userId, id, updates);
    return this.getWaterArea(userId, id);
  }

  deleteWaterArea(userId, id) {
    return this.deleteEntity('water_areas', userId, id);
  }

  // ─── Waypoint Operations ────────────────────────────────────────────────────

  getWaypoints(userId, hubId = null) {
    if (hubId) {
      return this.db.prepare(
        'SELECT * FROM waypoints WHERE user_id = ? AND hub_id = ?'
      ).all(userId, hubId);
    }
    return this.getUserEntities('waypoints', userId);
  }

  getWaypoint(userId, id) {
    return this.getUserEntity('waypoints', userId, id);
  }

  createWaypoint(userId, { name, type, entityId = null, lat, lng, hubId = null }) {
    const result = this.insertEntity('waypoints', userId, {
      name,
      type,
      entity_id: entityId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      hub_id: hubId
    });
    
    return {
      id: result.lastInsertRowid,
      name,
      type,
      entityId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      hubId,
      userId,
      createdAt: new Date().toISOString()
    };
  }

  updateWaypoint(userId, id, { name, lat, lng }) {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (lat !== undefined) updates.lat = parseFloat(lat);
    if (lng !== undefined) updates.lng = parseFloat(lng);
    
    this.updateEntity('waypoints', userId, id, updates);
    return this.getWaypoint(userId, id);
  }

  deleteWaypoint(userId, id) {
    return this.deleteEntity('waypoints', userId, id);
  }
}

module.exports = DataAccessLayer;