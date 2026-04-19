import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer } from "node:http";
import Redis from "ioredis";
import { Server } from "socket.io";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from "y-protocols/awareness.js";
import * as Y from "yjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ROOM_TTL_SECONDS = Number(process.env.ROOM_TTL_SECONDS) || 1800;
const ROOM_STATE_KEY_PREFIX = "rtc:room:";
const rooms = new Map();

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    })
  : null;

if (redis) {
  redis.on("error", (error) => {
    console.error("Redis unavailable, continuing with in-memory persistence only.", error.message);
  });
}

function generateRoomId() {
  return crypto.randomBytes(4).toString("hex");
}

function encodeBase64(uint8Array) {
  return Buffer.from(uint8Array).toString("base64");
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function getRoomRedisKey(roomId) {
  return `${ROOM_STATE_KEY_PREFIX}${roomId}`;
}

async function connectRedis() {
  if (!redis) {
    return false;
  }

  try {
    await redis.connect();
  } catch (error) {
    if (error.message !== "Redis is already connecting/connected") {
      console.error("Failed to connect to Redis.", error.message);
      return false;
    }
  }

  return true;
}

async function loadPersistedRoom(roomId) {
  if (!(await connectRedis())) {
    return null;
  }

  try {
    const payload = await redis.get(getRoomRedisKey(roomId));

    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(payload);
    const doc = new Y.Doc();

    if (parsed.documentUpdate) {
      Y.applyUpdate(doc, decodeBase64(parsed.documentUpdate));
    }

    return doc;
  } catch (error) {
    console.error("Failed to load persisted room state.", error.message);
    return null;
  }
}

async function persistRoom(roomId, room) {
  if (!(await connectRedis())) {
    return;
  }

  try {
    const payload = JSON.stringify({
      documentUpdate: encodeBase64(Y.encodeStateAsUpdate(room.doc)),
      savedAt: Date.now()
    });

    await redis.set(getRoomRedisKey(roomId), payload, "EX", ROOM_TTL_SECONDS);
  } catch (error) {
    console.error("Failed to persist room state.", error.message);
  }
}

function queueRoomPersistence(roomId, room) {
  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
  }

  room.persistTimer = setTimeout(() => {
    room.persistTimer = null;
    void persistRoom(roomId, room);
  }, 250);
}

function createEmptyRoom() {
  const doc = new Y.Doc();

  return {
    doc,
    awareness: new Awareness(doc),
    sockets: new Set(),
    cleanupTimer: null,
    persistTimer: null
  };
}

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    const existingRoom = rooms.get(roomId);

    if (existingRoom.cleanupTimer) {
      clearTimeout(existingRoom.cleanupTimer);
      existingRoom.cleanupTimer = null;
    }

    return existingRoom;
  }

  const room = createEmptyRoom();
  const persistedDoc = await loadPersistedRoom(roomId);

  if (persistedDoc) {
    Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(persistedDoc));
  }

  const roomMeta = room.doc.getMap("meta");

  if (!roomMeta.get("language")) {
    roomMeta.set("language", "javascript");
  }

  rooms.set(roomId, room);
  return room;
}

function scheduleRoomCleanup(roomId, room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
  }

  room.cleanupTimer = setTimeout(() => {
    rooms.delete(roomId);
  }, ROOM_TTL_SECONDS * 1000);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/rooms/new", (_req, res) => {
  res.json({ roomId: generateRoomId() });
});

app.get("/room/:roomId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-room", async ({ roomId, user, clientId }) => {
    if (!roomId || !user?.name || !user?.color || !user?.colorLight || !Number.isInteger(clientId)) {
      socket.emit("server-error", { message: "Missing room, identity, or CRDT client details." });
      return;
    }

    const room = await getOrCreateRoom(roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.clientId = clientId;
    room.sockets.add(socket.id);

    const awarenessClientIds = Array.from(room.awareness.getStates().keys());

    socket.emit("initial-state", {
      roomId,
      documentUpdate: encodeBase64(Y.encodeStateAsUpdate(room.doc)),
      awarenessUpdate: awarenessClientIds.length > 0
        ? encodeBase64(encodeAwarenessUpdate(room.awareness, awarenessClientIds))
        : null
    });
  });

  socket.on("y-update", ({ roomId, update }) => {
    const room = rooms.get(roomId);

    if (!room || typeof update !== "string") {
      return;
    }

    Y.applyUpdate(room.doc, decodeBase64(update), socket.id);
    queueRoomPersistence(roomId, room);
    socket.to(roomId).emit("y-update", { update });
  });

  socket.on("awareness-update", ({ roomId, update }) => {
    const room = rooms.get(roomId);

    if (!room || typeof update !== "string") {
      return;
    }

    applyAwarenessUpdate(room.awareness, decodeBase64(update), socket.id);
    socket.to(roomId).emit("awareness-update", { update });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const clientId = socket.data.clientId;
    const room = roomId ? rooms.get(roomId) : undefined;

    if (!room) {
      return;
    }

    room.sockets.delete(socket.id);

    if (Number.isInteger(clientId) && room.awareness.getStates().has(clientId)) {
      removeAwarenessStates(room.awareness, [clientId], socket.id);
      socket.to(roomId).emit("awareness-remove", { clientIds: [clientId] });
    }

    if (room.sockets.size === 0) {
      void persistRoom(roomId, room);
      scheduleRoomCleanup(roomId, room);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Real-time collaboration tool running on http://${HOST}:${PORT}`);
});
