# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (run from `backend/server/`)
```
npm run server   # start with nodemon (auto-reload)
node mongodbtest.js  # standalone MongoDB connectivity diagnostic
```

### Frontend (run from `frontend/`)
```
npm start    # dev server on port 8096
npm run build
npm test     # React Testing Library / Jest
```

## Required environment setup

`backend/server/.env`:
```
DB_URL=mongodb+srv://<user>:<pass>@cluster0.<id>.mongodb.net/<dbname>
ACCESS_TOKEN_SECRET=<random secret>
```

`frontend/.env` (already committed):
```
PORT=8096
REACT_APP_BACKEND_SERVER_URI=http://localhost:8081
```

## Architecture

**Two independent apps** — no monorepo tooling, no shared code. Run and install dependencies separately in each folder.

### Auth flow
1. Register (`POST /user/signup`) — validates via zod, bcrypt-hashes password, saves to MongoDB
2. Login (`POST /user/login`) — validates, compares bcrypt hash, returns a JWT signed with `ACCESS_TOKEN_SECRET` (1-minute expiry)
3. Frontend stores the JWT in `localStorage` as `accessToken`
4. `frontend/src/utilities/decodeJwt.js` decodes the token client-side (no verification) to read `id`, `email`, `username` — this is the only way user identity is passed to React components
5. `UserContext` in `App.js` provides decoded user info globally; individual pages also call `getUserInfo()` directly

The JWT payload includes the hashed password — this is a known quirk of the codebase.

### Backend structure
- `server.js` — Express entry point, mounts all routers under `/user`
- `routes/` — one file per endpoint; each file exports an Express router
- `models/userModel.js` — Mongoose schema (`users` collection: username, email, password, date)
- `models/userValidator.js` — zod schemas for signup and login validation
- `utilities/generateToken.js` — JWT creation helper
- `config/db.config.js` — Mongoose connection (called once at startup)

### Frontend structure
- `App.js` — router root, `UserContext.Provider`, navbar wrapper
- `components/pages/` — one file per route; pages read from `UserContext` or call `getUserInfo()` directly
- `components/navbar.js` — React Bootstrap navbar; always visible regardless of auth state
- Frontend makes API calls with `axios` using `process.env.REACT_APP_BACKEND_SERVER_URI` as the base URL
