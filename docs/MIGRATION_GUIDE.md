# User-Scoped Architecture Migration Guide

## Overview

This document describes the transformation of Drone Head from a monolithic, shared-state application to a user-scoped, multi-tenant architecture with proper authentication and access control.

## What Changed

### Before (Monolithic)
- All drones, hubs, fleets, missions, and other entities were stored in global in-memory Maps
- All users shared the same data - no isolation
- Authentication was optional (bypassed in development mode)
- Data was lost on server restart
- SSE broadcasts went to all connected clients

### After (User-Scoped)
- All entities are stored in SQLite with `user_id` foreign key
- Each user sees and manages only their own entities
- Authentication is required for all API endpoints (except login/register)
- Data persists across server restarts
- SSE broadcasts are user-specific

## Migration Steps

### 1. Run Database Migration

Before starting the server for the first time with the new code:

```bash
cd backend
npm install
npm run migrate
```

This will:
- Create the `migrations` tracking table
- Apply the `001_add_user_ownership.sql` migration
- Create all entity tables with user ownership

### 2. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 3. Create a User Account

Use the login page at `/login/login.html` to:
- Register a new account
- Login with your credentials

The JWT token will be stored in localStorage and used for all subsequent requests.

## API Changes

### All Endpoints Now Require Authentication

Every API endpoint (except `/api/auth/register` and `/api/auth/login`) now requires a valid JWT token:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN'
}
```

### Frontend Auto-Handling

The `auth-client.js` module automatically:
- Attaches the auth token to all requests
- Handles 401/403 errors by redirecting to login
- Validates tokens on page load

### Entity Ownership

All entities are now scoped to the authenticated user:

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /api/drones` | All drones | User's drones only |
| `POST /api/drones` | Shared IDs | User-scoped creation |
| `DELETE /api/drones/:id` | Any drone | Only user's drones |

## New Files Added

```
backend/
├── dataAccess.js          # Data access layer with user-scoped queries
├── migrate.js             # Migration runner script
├── migrations/
│   └── 001_add_user_ownership.sql  # Schema migration
└── server.js              # New user-scoped server (replaced old)

frontend/
└── auth-client.js         # Authentication client module
```

## Files Modified

- `backend/server.js` - Complete rewrite with user-scoped endpoints
- `backend/package.json` - Added migrate script, version bump to 2.0.0
- `frontend/app.js` - Added authentication check on initialization
- `frontend/index.html` - Added auth-client.js script tag

## Development Mode

In development mode (`DEVELOPMENT_MODE=develop`), authentication is bypassed and the server acts as if the user is `dev-user` with admin privileges. This is useful for local development.

```bash
DEVELOPMENT_MODE=develop npm start
```

## Security Features

1. **JWT Authentication**: All requests require valid JWT tokens
2. **User Isolation**: Users cannot access other users' data
3. **Password Hashing**: Passwords are hashed with bcrypt
4. **Token Expiration**: Tokens expire after 24 hours
5. **403 Responses**: Unauthorized access attempts return 403 Forbidden

## Rollback

If you need to rollback to the old monolithic version:

1. Restore the old server.js:
   ```bash
   mv backend/server.js backend/server-new.js
   mv backend/server-old.js backend/server.js
   ```

2. Revert frontend changes:
   - Remove `auth-client.js` script from `index.html`
   - Remove auth check code from `app.js`

3. Restart the server

## Troubleshooting

### "Access token required" Error
- Make sure you're logged in at `/login/login.html`
- Check that the token is stored in localStorage
- Try logging out and back in

### "Entity not found" Error
- The entity may belong to a different user
- Check that you're using the correct authentication token

### Migration Failed
- Check that the `backend/data` directory exists
- Ensure the database file is not locked
- Check for existing migrations in the database

## Next Steps

Future enhancements could include:
- Team/organization support
- Role-based access control (admin, user, viewer)
- Shared entities between users
- Real-time collaboration features