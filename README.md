# RealTimeCollaborationTool
A real time collaboration editor tool

## Current MVP

This repository now includes an initial runnable version of the project:

- Room-based collaborative text editor
- Real-time sync between connected browser tabs using Socket.IO
- Presence sidebar with active users
- Shareable room URLs
- Lightweight cursor position updates shown per user

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`, create or reuse a room, and test syncing in two tabs.

## Road Map

🛠️ The Tech Stack
To make this performant and modern, I recommend:
•	Frontend: React or Next.js (for the UI).
•	Editor Engine: Monaco Editor (the engine behind VS Code) or CodeMirror.
•	Real-Time Engine: Socket.io (for the communication layer).
•	Backend: Node.js with Express.
•	State Sync (The "Pro" Move): Yjs or Automerge. These handle "Conflict-free Replicated Data Types" (CRDTs), which prevent users' text from jumping around when they type at the same time.
🚀 Phase 1: The Basic Sync (The "Hello World")
Before worrying about complex code, just get text syncing between two tabs.
	1.	Set up a basic Express server with Socket.io.
	2.	On the frontend, create a text area.
	3.	The Logic: Whenever a user types, emit an edit-code event with the full text. The server broadcasts this to all other connected clients.
	4.	The Goal: If I type "Hello" in Tab A, "Hello" should appear in Tab B.
🏗️ Phase 2: Rooms and Identity
You don't want everyone on the internet editing the same document.
•	Unique Rooms: Use socket.join(roomId). Generate a random ID (like [my-app.com/room/abc-123](https://my-app.com/room/abc-123)) so friends can join the same space.
•	User Cursors: This is the "wow" factor. Assign each user a random color and display their name above a "virtual cursor" where they are currently clicking.
•	Sidebar: List the "Users Online" in the current room.
🧠 Phase 3: Solving the "Collision" Problem
If User A and User B type at the exact same millisecond, simple Socket.io emissions will cause the text to flicker or overwrite.
•	Integrate Yjs. It handles the heavy lifting of merging changes so that no matter how fast people type, the final document looks the same for everyone.
🎨 Phase 4:
•	Syntax Highlighting: Since you're using Monaco or CodeMirror, let users select a language (JavaScript, Python, C++) from a dropdown.
•	Themes: Add a Dark Mode/Light Mode toggle.
•	Ephemeral Persistence: Use Redis to temporarily save the code so that if a user refreshes the page, their work doesn't immediately vanish.
