# Active Context - Drone Head

## Current Focus

This document tracks the current state of development, recent changes, and next steps for the Drone Head project.

## Recent Changes

### Frontend Initialization Fix (2026-04-07)
- **Issue**: Frontend was not connecting to backend - live badge not showing, units couldn't be placed
- **Root Cause**: The `initializeApp()` function was defined but never called - no DOMContentLoaded listener or direct invocation
- **Fix**: Added initialization call at end of `app.js`:
  ```javascript
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
  ```
- **Impact**: App now properly initializes, SSE connection establishes, and all functionality works

### Architecture Evolution (Latest - 2026)
- **Persistent Storage**: Migrated from in-memory Maps to full SQLite persistence
- **User Ownership**: All entities now have user-scoped access control
- **Data Access Layer**: Introduced `dataAccess.js` class for clean database operations
- **New Features**:
  - Radio towers with range visualization and effects
  - Areas of Interest (AOIs) for custom polygon marking
  - EW Signal Areas for electronic warfare simulation
  - Enhanced ground unit system with radio tower support

### Completed Features
- ✅ Real-time drone tracking with SSE
- ✅ Hub and fleet management
- ✅ Mission system with auto-assignment
- ✅ Ground units with A* pathfinding
- ✅ Naval units with water area restrictions
- ✅ No-go zone enforcement
- ✅ User authentication (JWT)
- ✅ **Full data persistence** (all entities in SQLite)
- ✅ **User-scoped multi-user support**
- ✅ Radio towers with range/effects
- ✅ Areas of Interest (AOIs)
- ✅ EW Signal Areas

## Current Work

### ✅ Backend Running (Resolved 2026-04)

The Docker container (`drone-head-drone-head-1`) is **running** and healthy.

```bash
docker compose ps
# NAME                      STATUS         PORTS
# drone-head-drone-head-1   Up             0.0.0.0:3000->3000/tcp
```

Server logs confirm: `✅ Drone API running at http://localhost:3000` in development mode. The previous exit with code 137 was caused by an external SIGKILL (manual stop), not an OOM condition — system memory was ample (~11 GB free).

## Next Steps

### Priority Tasks
1. **Enhanced Radio Effect System**
   - Implement actual radio effect mechanics
   - Add effect stacking and prioritization
   - Visual effect indicators on map

2. **Advanced Mission Planning**
   - Add waypoint sequences for complex missions
   - Implement mission templates
   - Add mission preview before execution

3. **Analytics & Reporting**
   - Historical tracking of unit movements
   - Mission success/failure statistics
   - Battery usage analytics
   - Radio coverage analytics

4. **Testing & Quality**
   - Add unit tests for backend logic
   - Add integration tests for API endpoints
   - Set up CI/CD pipeline

### Future Enhancements
- Mobile responsive improvements
- Offline mode support
- Import/export scenarios
- Advanced map layers
- Unit formation control
- Weather effects simulation

## Active Decisions

### Architecture Decisions
- **Persistent SQLite Storage**: All operational data now persisted
  - Benefit: Data survives server restarts
  - Trade-off: Slightly more complex queries
  
- **User Ownership Model**: Every entity has `user_id`
  - Benefit: True multi-user isolation
  - Trade-off: All queries must include user context

- **Data Access Layer**: Centralized database operations
  - Benefit: Clean separation, easier maintenance
  - Trade-off: Additional abstraction layer

### Technology Choices
- **SSE over WebSockets**: Chosen for simplicity
  - Trade-off: Unidirectional only
  - Decision: Sufficient for server-to-client updates

## Important Information

### Key File Locations
- **Backend**: `backend/server.js` (~1,764 lines)
- **Data Access**: `backend/dataAccess.js` (~687 lines)
- **Frontend**: `frontend/app.js` (~4,192 lines)
- **Auth Client**: `frontend/auth-client.js` (~234 lines)
- **Documentation**: `docs/` directory
- **Memory Bank**: `memory-bank/` directory

### Critical Patterns
1. **Entity Creation**: All entities created via DAL with user context
2. **Real-time Updates**: SSE at `/api/events` with user-scoped broadcasting
3. **Pathfinding**: A* on road graph for ground units
4. **Broadcasting**: `broadcastToUser(userId, data)` for targeted updates
5. **Radio Tower**: Ground units with `is_radio_tower=1` flag

### Known Issues
- Radio effect system not fully implemented
- No rate limiting on API endpoints
- Limited error handling in frontend
- No automated tests

## Learnings

### What Works Well
- SSE provides reliable real-time updates
- SQLite persistence ensures data durability
- User ownership model provides clean isolation
- A* pathfinding correctly respects constraints
- Data access layer simplifies database operations

### What Could Be Better
- Large app.js file (~4,200 lines) is hard to navigate
- Radio effect system needs completion
- No automated testing coverage
- Frontend state could be more structured

### Patterns to Repeat
- Data access layer pattern for clean DB operations
- User-scoped queries for multi-user safety
- Consistent broadcasting pattern per user
- Radio tower as specialized ground unit

## Risks & Considerations

### Technical Risks
1. **File Size**: Large monolithic files are hard to maintain
2. **Scaling**: Single process limits concurrent users
3. **Radio Effects**: Not fully implemented, may need redesign

### Mitigations
1. Consider modularizing codebase
2. Plan for horizontal scaling with Redis/PostgreSQL
3. Complete radio effect system design

## Team Notes

- Project is stable and functional
- Data persistence ensures reliability
- Multi-user support working correctly
- Ready for production deployment with testing
- Consider completing radio effect system before major releases

---

*Created: 2024*
*Last Updated: 2026-04*