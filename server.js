import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const rooms = new Map();

function generateRoomId() {
  return crypto.randomBytes(4).toString("hex");
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      text: "",
      users: new Map()
    });
  }

  return rooms.get(roomId);
}

function serializeUsers(users) {
  return Array.from(users.values()).map((user) => ({
    id: user.id,
    name: user.name,
    color: user.color,
    cursor: user.cursor
  }));
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/rooms/new", (_req, res) => {
  res.json({ roomId: generateRoomId() });
});

app.get("/room/:roomId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, user }) => {
    if (!roomId || !user?.name || !user?.color) {
      socket.emit("server-error", { message: "Missing room or user details." });
      return;
    }

    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;

    room.users.set(socket.id, {
      id: socket.id,
      name: user.name,
      color: user.color,
      cursor: { line: 1, column: 1 }
    });

    socket.emit("initial-state", {
      roomId,
      text: room.text,
      users: serializeUsers(room.users)
    });

    socket.to(roomId).emit("presence-update", {
      users: serializeUsers(room.users)
    });
  });

  socket.on("edit-code", ({ roomId, text }) => {
    const room = rooms.get(roomId);

    if (!room || typeof text !== "string") {
      return;
    }

    room.text = text;
    socket.to(roomId).emit("remote-code-update", { text });
  });

  socket.on("cursor-move", ({ roomId, cursor }) => {
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);

    if (!room || !user || !cursor) {
      return;
    }

    user.cursor = {
      line: Number(cursor.line) || 1,
      column: Number(cursor.column) || 1
    };

    io.to(roomId).emit("presence-update", {
      users: serializeUsers(room.users)
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;

    if (!room) {
      return;
    }

    room.users.delete(socket.id);

    if (room.users.size === 0 && room.text.length === 0) {
      rooms.delete(roomId);
      return;
    }

    io.to(roomId).emit("presence-update", {
      users: serializeUsers(room.users)
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Real-time collaboration tool running on http://${HOST}:${PORT}`);
});
