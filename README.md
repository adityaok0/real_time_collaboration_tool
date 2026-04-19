# RealTimeCollaborationTool

RealTimeCollaborationTool is a room-based collaborative code editor for sharing a live editing session with other users through a simple URL. It combines a CodeMirror editing experience with Yjs CRDT synchronization over Socket.IO so concurrent edits merge cleanly instead of overwriting each other.

## What It Does

- Creates shareable collaboration rooms with unique URLs
- Syncs code changes in real time across connected users
- Shows live presence, including remote cursors and selections
- Supports syntax highlighting for JavaScript, Python, and C++
- Includes dark and light themes
- Keeps room state around temporarily so refreshes and short disconnects do not immediately wipe the document

## How It Works

The frontend uses CodeMirror 6 as the editor and Yjs as the shared document model. Socket.IO carries Yjs document updates and awareness updates between clients, while the Node.js and Express server manages room membership and temporary room state. Redis can be enabled as an optional backing store for ephemeral persistence across server restarts.

## Tech Stack

- Frontend: vanilla browser app bundled with `esbuild`
- Editor: CodeMirror 6
- Real-time sync: Yjs CRDTs over Socket.IO
- Backend: Node.js + Express
- Optional persistence: Redis via `ioredis`

## Running Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`, create a room, and open the same room URL in another tab or browser window to test collaborative editing.

## Production Start

```bash
npm start
```

## Optional Redis Persistence

By default, room state is retained in memory for a limited time. To persist that temporary room state across server restarts, provide `REDIS_URL`:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev
```

You can also tune the room retention window with `ROOM_TTL_SECONDS`.

## Current Features

- CRDT-based concurrent editing
- Shareable room URLs
- Presence sidebar with active collaborators
- Remote cursor and selection awareness
- Language switcher
- Theme toggle
- Temporary room persistence

## Project Structure

```text
.
├── public/         # Static assets and built browser bundle
├── scripts/        # Build helpers
├── src/            # Frontend source
├── server.js       # Express + Socket.IO server
└── package.json
```

## Future Improvements

- Add user-provided display names instead of generated identities
- Add durable persistence for saved projects and room history
- Add authentication and private room controls
- Add richer language support and editor tooling
- Add automated tests for reconnect and multi-user browser flows
