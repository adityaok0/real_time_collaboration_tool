import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness.js";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { cpp } from "@codemirror/lang-cpp";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { basicSetup } from "codemirror";

const socket = io();

const editorElement = document.getElementById("editor");
const usersList = document.getElementById("users-list");
const onlineCount = document.getElementById("online-count");
const roomLink = document.getElementById("room-link");
const identityCard = document.getElementById("identity-card");
const newRoomButton = document.getElementById("new-room-button");
const languageSelect = document.getElementById("language-select");
const themeToggle = document.getElementById("theme-toggle");
const statusPill = document.getElementById("status-pill");

const COLORS = [
  { color: "#b85c38", colorLight: "#b85c3833" },
  { color: "#2e6f95", colorLight: "#2e6f9533" },
  { color: "#4b8f29", colorLight: "#4b8f2933" },
  { color: "#8c3d88", colorLight: "#8c3d8833" },
  { color: "#d17b0f", colorLight: "#d17b0f33" },
  { color: "#3a7d6f", colorLight: "#3a7d6f33" }
];

const NAMES = [
  "Curious Falcon",
  "Silent Tern",
  "Rapid Maple",
  "Calm River",
  "Bright Orbit",
  "Amber Cedar"
];

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();

const ydoc = new Y.Doc();
const awareness = new Awareness(ydoc);
const ytext = ydoc.getText("codemirror");
const ymeta = ydoc.getMap("meta");
const undoManager = new Y.UndoManager(ytext);
const currentUser = loadUser();

let currentRoomId = getRoomIdFromPath();
let editorView = null;
let theme = loadTheme();
let connected = false;
let needsRejoin = false;

renderIdentity(currentUser);
applyTheme(theme);
awareness.setLocalStateField("user", currentUser);

ydoc.on("update", (update, origin) => {
  if (!currentRoomId || origin === "socket") {
    return;
  }

  socket.emit("y-update", {
    roomId: currentRoomId,
    update: encodeBase64(update)
  });
});

awareness.on("update", ({ added, updated, removed }, origin) => {
  renderUsers();

  if (!currentRoomId || origin === "socket") {
    return;
  }

  const changedClients = [...added, ...updated, ...removed];

  socket.emit("awareness-update", {
    roomId: currentRoomId,
    update: encodeBase64(encodeAwarenessUpdate(awareness, changedClients))
  });
});

ymeta.observe(() => {
  const language = getCurrentLanguage();
  languageSelect.value = language;

  if (editorView) {
    editorView.dispatch({
      effects: languageCompartment.reconfigure(getLanguageExtension(language))
    });
  }
});

socket.on("connect", () => {
  connected = true;

  if (needsRejoin && currentRoomId) {
    needsRejoin = false;
    joinRoom(currentRoomId);
    return;
  }

  setStatus("Connected");
});

socket.on("disconnect", () => {
  connected = false;
  needsRejoin = Boolean(currentRoomId);
  setStatus("Reconnecting...");
});

socket.on("initial-state", ({ roomId, documentUpdate, awarenessUpdate }) => {
  currentRoomId = roomId;

  if (documentUpdate) {
    Y.applyUpdate(ydoc, decodeBase64(documentUpdate), "socket");
  }

  if (awarenessUpdate) {
    applyAwarenessUpdate(awareness, decodeBase64(awarenessUpdate), "socket");
  }

  if (!ymeta.get("language")) {
    ymeta.set("language", "javascript");
  }

  if (!editorView) {
    initializeEditor();
  }

  updateRoomLink(roomId);
  languageSelect.value = getCurrentLanguage();
  renderUsers();
  broadcastLocalAwareness();
  setStatus(connected ? "Synced" : "Connecting...");
});

socket.on("y-update", ({ update }) => {
  Y.applyUpdate(ydoc, decodeBase64(update), "socket");
  setStatus("Synced");
});

socket.on("awareness-update", ({ update }) => {
  applyAwarenessUpdate(awareness, decodeBase64(update), "socket");
});

socket.on("awareness-remove", ({ clientIds }) => {
  removeAwarenessStates(awareness, clientIds, "socket");
  renderUsers();
});

socket.on("server-error", ({ message }) => {
  roomLink.textContent = message;
  setStatus("Error");
});

newRoomButton.addEventListener("click", () => {
  createRoom(true);
});

languageSelect.addEventListener("change", (event) => {
  ymeta.set("language", event.target.value);
});

themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  persistTheme(theme);
  applyTheme(theme);

  if (editorView) {
    editorView.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension(theme))
    });
  }
});

if (!currentRoomId) {
  createRoom();
} else {
  joinRoom(currentRoomId);
}

function initializeEditor() {
  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      languageCompartment.of(getLanguageExtension(getCurrentLanguage())),
      themeCompartment.of(getThemeExtension(theme)),
      yCollab(ytext, awareness, { undoManager }),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          renderUsers();
        }
      })
    ]
  });

  editorView = new EditorView({
    state,
    parent: editorElement
  });
}

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
  currentRoomId = roomId;
  updateRoomLink(roomId);
  setStatus("Connecting...");

  socket.emit("join-room", {
    roomId,
    clientId: ydoc.clientID,
    user: currentUser
  });
}

function updateRoomLink(roomId) {
  roomLink.innerHTML = `
    <span class="muted">Share this link:</span><br />
    <a href="/room/${roomId}">${window.location.origin}/room/${roomId}</a>
  `;
}

function renderUsers() {
  const users = Array.from(awareness.getStates().entries())
    .map(([clientId, state]) => ({
      clientId,
      user: state?.user,
      cursor: state?.cursor ?? null
    }))
    .filter((entry) => entry.user);

  onlineCount.textContent = String(users.length);
  usersList.innerHTML = "";

  users.forEach(({ clientId, user, cursor }) => {
    const item = document.createElement("li");
    const location = describeCursor(cursor);
    const suffix = clientId === ydoc.clientID ? " (you)" : "";

    item.className = "user-card";
    item.innerHTML = `
      <span class="user-avatar" style="background:${user.color}"></span>
      <div class="user-meta">
        <span class="user-name">${escapeHtml(user.name)}${suffix}</span>
        <span class="user-cursor">${escapeHtml(location)}</span>
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
        <span class="user-cursor">CRDT cursor and selection syncing enabled.</span>
      </div>
    </div>
  `;
}

function describeCursor(cursor) {
  if (!cursor || !editorView) {
    return "Cursor not active";
  }

  const position = Math.max(cursor.anchor ?? 0, cursor.head ?? 0);
  const clampedPosition = Math.min(position, editorView.state.doc.length);
  const line = editorView.state.doc.lineAt(clampedPosition);

  return `Cursor: line ${line.number}, column ${clampedPosition - line.from + 1}`;
}

function getCurrentLanguage() {
  return ymeta.get("language") || "javascript";
}

function getLanguageExtension(language) {
  switch (language) {
    case "python":
      return python();
    case "cpp":
      return cpp();
    case "javascript":
    default:
      return javascript();
  }
}

function getThemeExtension(currentTheme) {
  if (currentTheme === "dark") {
    return [oneDark];
  }

  return [
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.theme(
      {
        "&": {
          backgroundColor: "#fffdf9",
          color: "#24190f"
        },
        ".cm-gutters": {
          backgroundColor: "#fff6ea",
          color: "#7a654e",
          border: "none"
        },
        ".cm-activeLineGutter, .cm-activeLine": {
          backgroundColor: "rgba(184, 92, 56, 0.08)"
        },
        ".cm-selectionBackground": {
          backgroundColor: "rgba(46, 111, 149, 0.18) !important"
        }
      },
      { dark: false }
    )
  ];
}

function broadcastLocalAwareness() {
  const state = awareness.getLocalState();

  if (!state || !currentRoomId) {
    return;
  }

  socket.emit("awareness-update", {
    roomId: currentRoomId,
    update: encodeBase64(encodeAwarenessUpdate(awareness, [ydoc.clientID]))
  });
}

function loadUser() {
  const cached = window.sessionStorage.getItem("rtc-user");

  if (cached) {
    return JSON.parse(cached);
  }

  const palette = COLORS[Math.floor(Math.random() * COLORS.length)];
  const user = {
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: palette.color,
    colorLight: palette.colorLight
  };

  window.sessionStorage.setItem("rtc-user", JSON.stringify(user));
  return user;
}

function loadTheme() {
  return window.localStorage.getItem("rtc-theme") || "light";
}

function persistTheme(nextTheme) {
  window.localStorage.setItem("rtc-theme", nextTheme);
}

function applyTheme(nextTheme) {
  document.documentElement.dataset.theme = nextTheme;
  themeToggle.textContent = nextTheme === "dark" ? "Use light theme" : "Use dark theme";
}

function setStatus(message) {
  statusPill.textContent = message;
}

function getRoomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([a-z0-9-]+)$/i);
  return match ? match[1] : "";
}

function encodeBase64(uint8Array) {
  let binary = "";

  uint8Array.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return window.btoa(binary);
}

function decodeBase64(value) {
  return Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
