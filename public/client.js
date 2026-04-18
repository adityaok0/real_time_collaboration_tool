const socket = io();
const editor = document.getElementById("editor");
const usersList = document.getElementById("users-list");
const onlineCount = document.getElementById("online-count");
const roomLink = document.getElementById("room-link");
const identityCard = document.getElementById("identity-card");
const newRoomButton = document.getElementById("new-room-button");

const COLORS = [
  "#b85c38",
  "#2e6f95",
  "#4b8f29",
  "#8c3d88",
  "#d17b0f",
  "#3a7d6f"
];

const NAMES = [
  "Curious Falcon",
  "Silent Tern",
  "Rapid Maple",
  "Calm River",
  "Bright Orbit",
  "Amber Cedar"
];

let suppressEmit = false;
let currentRoomId = getRoomIdFromPath();
const currentUser = loadUser();

renderIdentity(currentUser);

if (!currentRoomId) {
  createRoom();
} else {
  joinRoom(currentRoomId);
}

editor.addEventListener("input", () => {
  if (suppressEmit) {
    return;
  }

  socket.emit("edit-code", {
    roomId: currentRoomId,
    text: editor.value
  });
});

["click", "keyup", "select"].forEach((eventName) => {
  editor.addEventListener(eventName, emitCursorPosition);
});

newRoomButton.addEventListener("click", () => {
  createRoom(true);
});

socket.on("initial-state", ({ roomId, text, users }) => {
  currentRoomId = roomId;
  editor.value = text;
  updateUsers(users);
  updateRoomLink(roomId);
  emitCursorPosition();
});

socket.on("remote-code-update", ({ text }) => {
  suppressEmit = true;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  editor.value = text;
  editor.setSelectionRange(selectionStart, selectionEnd);
  suppressEmit = false;
});

socket.on("presence-update", ({ users }) => {
  updateUsers(users);
});

socket.on("server-error", ({ message }) => {
  roomLink.textContent = message;
});

async function createRoom(navigate = false) {
  const response = await fetch("/api/rooms/new");
  const { roomId } = await response.json();
  const nextPath = `/room/${roomId}`;

  if (navigate) {
    window.location.href = nextPath;
    return;
  }

  window.history.replaceState({}, "", nextPath);
  joinRoom(roomId);
}

function joinRoom(roomId) {
  updateRoomLink(roomId);
  socket.emit("join-room", {
    roomId,
    user: currentUser
  });
}

function updateRoomLink(roomId) {
  roomLink.innerHTML = `
    <span class="muted">Share this link:</span><br />
    <a href="/room/${roomId}">${window.location.origin}/room/${roomId}</a>
  `;
}

function updateUsers(users) {
  onlineCount.textContent = String(users.length);
  usersList.innerHTML = "";

  users.forEach((user) => {
    const item = document.createElement("li");
    item.className = "user-card";
    item.innerHTML = `
      <span class="user-avatar" style="background:${user.color}"></span>
      <div class="user-meta">
        <span class="user-name">${escapeHtml(user.name)}</span>
        <span class="user-cursor">Cursor: line ${user.cursor.line}, column ${user.cursor.column}</span>
      </div>
    `;
    usersList.appendChild(item);
  });
}

function renderIdentity(user) {
  identityCard.innerHTML = `
    <div class="user-card">
      <span class="user-avatar" style="background:${user.color}"></span>
      <div class="user-meta">
        <span class="user-name">${escapeHtml(user.name)}</span>
        <span class="user-cursor">Your edits sync instantly in this room.</span>
      </div>
    </div>
  `;
}

function emitCursorPosition() {
  if (!currentRoomId) {
    return;
  }

  const cursorIndex = editor.selectionStart ?? 0;
  const contentBeforeCursor = editor.value.slice(0, cursorIndex);
  const lines = contentBeforeCursor.split("\n");
  const cursor = {
    line: lines.length,
    column: lines.at(-1).length + 1
  };

  socket.emit("cursor-move", {
    roomId: currentRoomId,
    cursor
  });
}

function getRoomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([a-z0-9-]+)$/i);
  return match ? match[1] : "";
}

function loadUser() {
  const cached = window.sessionStorage.getItem("rtc-user");

  if (cached) {
    return JSON.parse(cached);
  }

  const user = {
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
  };

  window.sessionStorage.setItem("rtc-user", JSON.stringify(user));
  return user;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
