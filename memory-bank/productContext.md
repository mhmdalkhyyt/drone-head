# Product Context - Drone Head

## Why This Project Exists

Drone Head was created to provide a comprehensive, real-time command and control interface for managing heterogeneous unit fleets in tactical scenarios. The system addresses the need for:

1. **Unified Management**: A single interface for air, ground, and naval units
2. **Real-time Situational Awareness**: Live position tracking and status monitoring
3. **Automated Mission Assignment**: Reduce manual coordination overhead
4. **Geographic Intelligence**: Enforce operational constraints automatically

## Problems Solved

### Before Drone Head
- Manual tracking of unit positions via separate systems
- No centralized view of fleet status
- Complex manual coordination for mission assignment
- Risk of units entering restricted areas
- No historical state preservation

### After Drone Head
- Single dashboard for all unit types
- Real-time position updates via SSE
- Automatic fleet-to-mission assignment
- Enforced geographic constraints
- Save/load application states

## How It Should Work

### User Experience Goals

1. **Immediate Situational Awareness**
   - Map shows all units at a glance
   - Color-coded status indicators
   - Battery levels clearly visible

2. **Intuitive Unit Management**
   - Click to select, right-click for actions
   - Drag-and-drop placement (where applicable)
   - Clear visual feedback for all operations

3. **Efficient Mission Planning**
   - Priority-based mission queue
   - Visual mission status
   - Automatic fleet assignment

4. **Reliable Operations**
   - Units respect constraints automatically
   - Clear warnings when operations blocked
   - Smooth real-time updates

## User Stories

### Commander
- "As a commander, I want to see all my units on a map so I can assess the situation."
- "As a commander, I want to create missions and have them automatically assigned so I can focus on strategy."
- "As a commander, I want to know when units are low on battery so I can plan replacements."

### Operator
- "As an operator, I want to place units on the map easily so I can set up scenarios quickly."
- "As an operator, I want to simulate unit movement so I can plan operations."
- "As an operator, I want to define no-go zones so units don't enter restricted areas."

### Analyst
- "As an analyst, I want to save and load states so I can compare different scenarios."
- "As an analyst, I want to define road networks so ground units follow realistic paths."

## Product Boundaries

### In Scope
- Real-time unit tracking and management
- Mission creation and assignment
- Geographic constraint enforcement
- Unit simulation and movement
- State persistence (user data)

### Out of Scope
- Actual hardware control (simulation only)
- Multi-user collaboration (single-user focused)
- Historical analytics (future enhancement)
- Mobile app (web-based only)

## Success Metrics

1. **Usability**: Users can create and manage units without documentation
2. **Performance**: Real-time updates under 1 second latency
3. **Reliability**: No data loss during normal operation
4. **Constraint Enforcement**: 100% of no-go zone violations prevented

## Competitive Advantages

1. **Simplicity**: Vanilla JS frontend, no build process required
2. **Transparency**: In-memory data model, easy to understand and debug
3. **Flexibility**: Easy to add new unit types and features
4. **Portability**: Docker deployment, runs anywhere

---

*Created: 2024*
*Last Updated: 2024*