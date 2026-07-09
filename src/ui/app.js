"use strict";

// ============================================================================
// Вспомогательные функции
// ============================================================================

function normalizeHexColor(value) {
  const v = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#21b8ff";
}
function shadeHexColor(hex, amount) {
  const raw = normalizeHexColor(hex).slice(1);
  const num = parseInt(raw, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 255) + amount;
  let b = (num & 255) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + (b | (g << 8) | (r << 16)).toString(16).padStart(6, "0");
}
function applyNexusAccent(color) {
  const accent = normalizeHexColor(color);
  const root = document.documentElement;
  root.style.setProperty("--nexus-accent", accent);
  root.style.setProperty("--nexus-accent-2", shadeHexColor(accent, 42));
  root.style.setProperty("--nexus-accent-3", shadeHexColor(accent, -42));
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent2", shadeHexColor(accent, 42));
  root.style.setProperty("--accent3", shadeHexColor(accent, -42));
}

function forceOpenSetup() {
  if (!setupOverlay) return;
  setupOverlay.hidden = false;
  document.body.classList.add("setup-required");
  if (setupName) setTimeout(() => setupName.focus(), 60);
}

function updateSetupLock() {
  if (!setupOverlay) return;
  const required = Boolean(state && (state.setupRequired || !(state.profiles || []).length));
  setupOverlay.hidden = !required;
  document.body.classList.toggle("setup-required", required);
  if (required && setupName) setTimeout(() => setupName.focus(), 60);
}

// ============================================================================
// DOM refs
// ============================================================================

const tabsEl = document.getElementById("tabs");
const newTabBtn = document.getElementById("new-tab");
const backBtn = document.getElementById("back");
const forwardBtn = document.getElementById("forward");
const reloadBtn = document.getElementById("reload");
const homeBtn = document.getElementById("home");
const bookmarkBtn = document.getElementById("bookmark");
const pinBtn = document.getElementById("pin");
const privateBtn = document.getElementById("private");
const downloadsBtn = document.getElementById("downloads");
const downloadsWrap = document.getElementById("downloads-wrap");
const profilesBtn = document.getElementById("profiles");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const settingsBtn = document.getElementById("settings");
const browserMenuBtn = document.getElementById("browser-menu");

const setupOverlay = document.getElementById("setup-overlay");
const setupName = document.getElementById("setup-name");
const setupFile = document.getElementById("setup-file");
const setupCreate = document.getElementById("setup-create");
const setupError = document.getElementById("setup-error");
const avatarGrid = document.getElementById("avatar-grid");
let selectedAvatar = "wolf";
let selectedCustomAvatar = "";

const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address");
const webArea = document.getElementById("web-area");
const securityPill = document.getElementById("security-pill");
const loadingDot = document.getElementById("loading-dot");
const downloadsPopover = document.getElementById("downloads-popover");

// Кастомное меню
const nexusMenu = document.getElementById("nexus-menu");

// Find-in-page
const findBar = document.getElementById("find-bar");
const findInput = document.getElementById("find-input");
const findStatus = document.getElementById("find-status");
const findPrevBtn = document.getElementById("find-prev");
const findNextBtn = document.getElementById("find-next");
const findCloseBtn = document.getElementById("find-close");

// Zoom indicator
const zoomIndicator = document.getElementById("zoom-indicator");
const zoomValue = document.getElementById("zoom-value");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");

let state = {
  activeTabId: null,
  tabs: [],
  theme: "dark",
  settings: {},
  downloads: [],
  profiles: [],
  activeProfileId: null,
  activeBookmarked: false,
  activePinned: false,
  activePrivate: false,
  activeZoom: 1.0,
  canReopenClosed: false,
  setupRequired: false
};
let windowMaximized = false;
const tabNodes = new Map();
let boundsTimer = null;

function api() { return window.nexus || window.nova; }

// ============================================================================
// Тab rendering
// ============================================================================

function makeTabNode(tab) {
  const el = document.createElement("div");
  el.className = "tab tab-enter";
  el.dataset.id = tab.id;

  const favicon = document.createElement("div");
  favicon.className = "tab-favicon";

  const title = document.createElement("div");
  title.className = "tab-title";

  const close = document.createElement("button");
  close.className = "tab-close";
  close.title = "Закрыть вкладку";
  close.textContent = "×";

  el.appendChild(favicon);
  el.appendChild(title);
  el.appendChild(close);

  el.addEventListener("click", () => api().activateTab(tab.id));
  el.addEventListener("mousedown", (event) => {
    if (event.button === 1) { event.preventDefault(); api().closeTab(tab.id); }
  });

  close.addEventListener("click", (event) => {
    event.stopPropagation();
    api().closeTab(tab.id);
  });

  setTimeout(() => el.classList.remove("tab-enter"), 280);
  return el;
}

function updateTabNode(el, tab) {
  el.classList.toggle("active", tab.id === state.activeTabId);
  el.classList.toggle("loading", Boolean(tab.loading));
  el.classList.toggle("pinned", Boolean(tab.pinned));
  el.classList.toggle("private", Boolean(tab.privateMode));

  const favicon = el.querySelector(".tab-favicon");
  const title = el.querySelector(".tab-title");

  const nextTitle = tab.pinned ? "" : (tab.title || "Новая вкладка");
  if (title.textContent !== nextTitle) title.textContent = nextTitle;

  const oldFavicon = favicon.dataset.src || "";
  const newFavicon = tab.privateMode ? "" : (tab.favicon || "");
  if (
    oldFavicon !== newFavicon ||
    favicon.dataset.loading !== String(Boolean(tab.loading)) ||
    favicon.dataset.private !== String(Boolean(tab.privateMode)) ||
    favicon.dataset.pinned !== String(Boolean(tab.pinned))
  ) {
    favicon.dataset.src = newFavicon;
    favicon.dataset.loading = String(Boolean(tab.loading));
    favicon.dataset.private = String(Boolean(tab.privateMode));
    favicon.dataset.pinned = String(Boolean(tab.pinned));
    favicon.innerHTML = "";

    if (tab.privateMode) favicon.textContent = "◐";
    else if (newFavicon) {
      const img = document.createElement("img");
      img.src = newFavicon;
      img.alt = "";
      favicon.appendChild(img);
    } else {
      favicon.textContent = tab.loading ? "•" : "✦";
    }
  }
}

function renderTabs() {
  const alive = new Set(state.tabs.map(tab => String(tab.id)));
  for (const [id, node] of tabNodes.entries()) {
    if (!alive.has(String(id))) {
      node.classList.add("tab-leave");
      tabNodes.delete(id);
      setTimeout(() => node.remove(), 160);
    }
  }
  for (let i = 0; i < state.tabs.length; i++) {
    const tab = state.tabs[i];
    let node = tabNodes.get(tab.id);
    if (!node) { node = makeTabNode(tab); tabNodes.set(tab.id, node); }
    updateTabNode(node, tab);
    if (tabsEl.children[i] !== node) tabsEl.insertBefore(node, tabsEl.children[i] || null);
  }
}

function activeTab() { return state.tabs.find(t => t.id === state.activeTabId) || null; }


// ============================================================================
// Avatar / profile / toolbar
// ============================================================================

function avatarHTML(profile) {
  if (!profile) return "?";
  if (profile.customAvatar) return `<img src="${profile.customAvatar}" alt="">`;
  const map = {
    wolf: `<img src="../assets/nexus-user-logo.png" alt="">`,
    dog: "🐶", cat: "🐱", robot: "🤖", fox: "🦊", space: "🌌",
    custom: profile.customAvatar ? `<img src="${profile.customAvatar}" alt="">` : "?"
  };
  return map[profile.avatar] || (profile.name ? profile.name.slice(0, 1).toUpperCase() : "?");
}

function renderProfileChip() {
  if (!profilesBtn || !profileAvatar || !profileName) return;
  const profiles = state.profiles || [];
  const active = profiles.find(p => p.id === state.activeProfileId) || profiles[0] || null;
  profilesBtn.classList.toggle("no-profile", !active);
  profileAvatar.innerHTML = avatarHTML(active);
  profileName.textContent = active ? active.name : "Создать";
  profilesBtn.title = active ? `Профиль: ${active.name}` : "Создать профиль";
}

function renderToolbar() {
  const tab = activeTab();
  const url = tab ? (tab.url || "") : "";

  if (document.activeElement !== addressInput && addressInput.value !== url) {
    addressInput.value = url;
  }

  backBtn.disabled = !tab || !tab.canGoBack;
  forwardBtn.disabled = !tab || !tab.canGoForward;
  loadingDot.classList.toggle("active", Boolean(tab && tab.loading));

  securityPill.classList.remove("warn", "private");
  const lower = url.toLowerCase();
  if (state.activePrivate) { securityPill.textContent = "PRIVATE"; securityPill.classList.add("private"); }
  else if (!url) securityPill.textContent = "NEXUS";
  else if (lower.startsWith("https://")) securityPill.textContent = "HTTPS";
  else if (lower.startsWith("http://")) { securityPill.textContent = "HTTP"; securityPill.classList.add("warn"); }
  else if (lower.startsWith("nexus://")) securityPill.textContent = "NEXUS";
  else securityPill.textContent = "PAGE";

  bookmarkBtn.classList.toggle("active", Boolean(state.activeBookmarked));
  bookmarkBtn.title = state.activeBookmarked ? "Убрать из закладок" : "Добавить в закладки";
  bookmarkBtn.disabled = Boolean(state.activePrivate);

  pinBtn.classList.toggle("active", Boolean(state.activePinned));
  privateBtn.classList.toggle("active", Boolean(state.activePrivate));
  privateBtn.disabled = Boolean(state.tabs && state.tabs.some(t => t.privateMode) && !state.activePrivate);

  // Zoom indicator
  const zoom = state.activeZoom || 1.0;
  const pct = Math.round(zoom * 100);
  if (Math.abs(zoom - 1.0) > 0.01) {
    zoomIndicator.hidden = false;
    zoomValue.textContent = pct + "%";
  } else {
    zoomIndicator.hidden = true;
  }

  document.body.dataset.theme = state.theme || "dark";
  applyNexusAccent(state.settings && state.settings.accentColor);
}

// ============================================================================
// Downloads popover
// ============================================================================

function escapeHTML(value) { return String(value || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m])); }
function formatBytes(value) {
  let n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function downloadStatus(item) {
  const received = Number(item.receivedBytes || 0);
  const total = Number(item.totalBytes || 0);
  const pct = total ? Math.max(0, Math.min(100, Math.round(received / total * 100))) : null;
  if (item.state === "progressing") {
    const parts = ["Загрузка"];
    if (pct !== null) parts.push(`${pct}%`);
    if (total) parts.push(`${formatBytes(received)} / ${formatBytes(total)}`);
    else if (received) parts.push(formatBytes(received));
    return parts.join(" · ");
  }
  if (item.state === "completed") return `Готово · ${formatBytes(received || total)}`;
  if (item.state === "cancelled") return "Отменено";
  if (item.state === "interrupted") return "Прервано";
  return item.state || "Готово";
}
function canCancelDownload(item) { return item && item.state === "progressing" && item.canCancel !== false; }
function renderDownloadsPopover() {
  if (!downloadsPopover) return;
  const items = state.downloads || [];
  const hasDownloads = items.length > 0;
  if (downloadsWrap) downloadsWrap.classList.toggle("downloads-hidden", !hasDownloads);
  if (!hasDownloads) { downloadsPopover.innerHTML = ""; return; }

  let html = `<div class="download-head">Загрузки</div>`;
  html += items.map(item => {
    const id = escapeHTML(item.id || "");
    const savePath = encodeURIComponent(item.savePath || "");
    const cancel = canCancelDownload(item) ? `<button class="download-cancel" data-download-cancel="${id}" title="Отменить загрузку">Отменить</button>` : "";
    return `<div class="download-row" data-download-open="${savePath}"><div class="download-icon"><svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/></svg></div><div class="download-info"><div class="download-title">${escapeHTML(item.filename || "Файл")}</div><div class="download-meta">${escapeHTML(downloadStatus(item))}</div></div>${cancel}</div>`;
  }).join("");
  html += `<div class="download-actions"><button data-open-downloads>Все загрузки</button><button data-clear-downloads>Очистить</button></div>`;
  downloadsPopover.innerHTML = html;
}

function renderAll() {
  renderTabs();
  renderToolbar();
  renderProfileChip();
  renderDownloadsPopover();
  updateSetupLock();
  requestBoundsSoon();
}

function requestBoundsSoon() { clearTimeout(boundsTimer); boundsTimer = setTimeout(requestBounds, 25); }
function requestBounds() {
  const rect = webArea.getBoundingClientRect();
  api().setBounds({ x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
}

// ============================================================================
// Кастомное Nexus-меню с blur-фоном
// ============================================================================

function menuAnchorPayload(point) {
  const rect = browserMenuBtn.getBoundingClientRect();
  const payload = {
    anchor: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    },
    viewport: { width: window.innerWidth, height: window.innerHeight }
  };
  if (point) payload.point = { x: point.x, y: point.y };
  return payload;
}

function showNexusMenu(point) {
  const bridge = api();
  if (bridge && bridge.showCustomMenu) {
    if (nexusMenu) hideNexusMenu();
    bridge.showCustomMenu(menuAnchorPayload(point));
    return;
  }

  if (!nexusMenu) return;
  const rect = browserMenuBtn.getBoundingClientRect();
  nexusMenu.style.display = "block";
  nexusMenu.classList.add("open");
  const menuRect = nexusMenu.getBoundingClientRect();
  let left = rect.right - menuRect.width;
  let top = rect.bottom + 6;
  if (left < 8) left = 8;
  if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
  nexusMenu.style.left = left + "px";
  nexusMenu.style.top = top + "px";
}

function hideNexusMenu() {
  if (!nexusMenu) return;
  nexusMenu.classList.remove("open");
  setTimeout(() => { 
    if (!nexusMenu.classList.contains("open")) {
      nexusMenu.style.display = "none";
    }
  }, 150);
}

function handleMenuAction(action) {
  hideNexusMenu();
  switch (action) {
    case "new-tab": api().newTab(); break;
    case "new-private": api().newPrivateTab(); break;
    case "reopen-closed": api().reopenClosedTab && api().reopenClosedTab(); break;
    case "history": api().openHistory(); break;
    case "bookmarks": api().openBookmarks(); break;
    case "downloads": api().openDownloads(); break;
    case "profiles": api().openProfiles(); break;
    case "find": openFindBar(); break;
    case "print": api().print && api().print(); break;
    case "save-page": api().savePage && api().savePage(); break;
    case "zoom-in": api().zoomIn && api().zoomIn(); break;
    case "zoom-out": api().zoomOut && api().zoomOut(); break;
    case "zoom-reset": api().zoomReset && api().zoomReset(); break;
    case "settings": api().openSettings(); break;
    case "search-settings": api().openSearchSettings && api().openSearchSettings(); break;
    case "copy-url":
      const tab = activeTab();
      if (tab && tab.url) navigator.clipboard && navigator.clipboard.writeText(tab.url);
      break;
  }
}

if (nexusMenu) {
  nexusMenu.addEventListener("click", (e) => {
    const item = e.target.closest(".nexus-menu-item");
    if (!item) return;
    const action = item.dataset.action;
    if (action) handleMenuAction(action);
  });
}

// ============================================================================
// Find-in-page
// ============================================================================

function openFindBar() {
  if (!findBar) return;
  findBar.hidden = false;
  findBar.classList.add("open");
  setTimeout(() => findInput && findInput.focus(), 30);
  api().openFind && api().openFind();
}
function closeFindBar() {
  if (!findBar) return;
  findBar.classList.remove("open");
  setTimeout(() => { if (!findBar.classList.contains("open")) findBar.hidden = true; }, 120);
  if (findInput) findInput.value = "";
  if (findStatus) findStatus.textContent = "";
  api().closeFind && api().closeFind();
}

if (findInput) {
  findInput.addEventListener("input", () => {
    api().findQuery && api().findQuery(findInput.value);
  });
  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) api().findPrev && api().findPrev(findInput.value);
      else api().findNext && api().findNext(findInput.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFindBar();
    }
  });
}
if (findNextBtn) findNextBtn.addEventListener("click", () => api().findNext && api().findNext(findInput.value));
if (findPrevBtn) findPrevBtn.addEventListener("click", () => api().findPrev && api().findPrev(findInput.value));
if (findCloseBtn) findCloseBtn.addEventListener("click", closeFindBar);

// ============================================================================
// Blur-эффект при клике ЛКМ отключён для UI
// ============================================================================

// ============================================================================
// Event listeners
// ============================================================================

newTabBtn.addEventListener("click", () => api().newTab());
backBtn.addEventListener("click", () => api().back());
forwardBtn.addEventListener("click", () => api().forward());
reloadBtn.addEventListener("click", () => api().reload());
homeBtn.addEventListener("click", () => api().home());
bookmarkBtn.addEventListener("click", () => api().toggleBookmark());
pinBtn.addEventListener("click", () => api().togglePin());
privateBtn.addEventListener("click", () => api().newPrivateTab());
downloadsBtn.addEventListener("click", () => api().openDownloads());
profilesBtn.addEventListener("click", () => {
  const hasProfile = Boolean((state.profiles || []).length);
  if (state.setupRequired || !hasProfile) { forceOpenSetup(); return; }
  api().openProfiles && api().openProfiles();
});
settingsBtn.addEventListener("click", () => api().openSettings());

if (downloadsPopover) {
  downloadsPopover.addEventListener("click", (event) => {
    const cancel = event.target.closest("[data-download-cancel]");
    if (cancel) {
      event.preventDefault(); event.stopPropagation();
      api().cancelDownload && api().cancelDownload(cancel.dataset.downloadCancel || "");
      return;
    }
    if (event.target.closest("[data-open-downloads]")) { event.preventDefault(); api().openDownloads(); return; }
    if (event.target.closest("[data-clear-downloads]")) { event.preventDefault(); api().clearDownloads(); return; }
    const open = event.target.closest("[data-download-open]");
    if (open) {
      event.preventDefault();
      const filePath = decodeURIComponent(open.dataset.downloadOpen || "");
      if (filePath) api().openDownload(filePath);
    }
  });
}

browserMenuBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  showNexusMenu();
});

browserMenuBtn.addEventListener("auxclick", (event) => {
  if (event.button !== 1 && event.button !== 2) return;
  event.preventDefault();
  event.stopPropagation();
  showNexusMenu();
});

browserMenuBtn.addEventListener("mousedown", (event) => {
  if (event.button !== 1) return;
  event.preventDefault();
  event.stopPropagation();
  showNexusMenu();
});

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  api().navigate(addressInput.value);
  addressInput.blur();
});
addressInput.addEventListener("focus", () => addressInput.select());

window.addEventListener("resize", requestBoundsSoon);
window.addEventListener("click", (e) => {
  // Закрыть меню по клику вне его
  if (nexusMenu && nexusMenu.classList.contains("open")) {
    if (!nexusMenu.contains(e.target) && e.target !== browserMenuBtn && !browserMenuBtn.contains(e.target)) {
      hideNexusMenu();
    }
  }
  const bridge = api();
  if (bridge && bridge.closeMenu && !browserMenuBtn.contains(e.target)) bridge.closeMenu();
});

// ============================================================================
// Горячие клавиши
// ============================================================================

window.addEventListener("keydown", (event) => {
  const ctrl = event.ctrlKey || event.metaKey;
  const shift = event.shiftKey;
  const key = event.key.toLowerCase();

  if (event.key === "Escape") {
    hideNexusMenu();
    if (findBar && !findBar.hidden) closeFindBar();
  }

  if (ctrl && shift && key === "n") { event.preventDefault(); api().newPrivateTab(); return; }
  if (ctrl && shift && key === "t") { event.preventDefault(); api().reopenClosedTab && api().reopenClosedTab(); return; }
  if (ctrl && key === "t") { event.preventDefault(); api().newTab(); return; }
  if (ctrl && key === "w") { event.preventDefault(); if (state.activeTabId) api().closeTab(state.activeTabId); return; }
  if (ctrl && key === "h") { event.preventDefault(); api().openBookmarks(); return; }
  if (ctrl && key === "d") { event.preventDefault(); api().toggleBookmark(); return; }
  if (ctrl && key === "j") { event.preventDefault(); api().openDownloads(); return; }
  if (ctrl && key === "f") { event.preventDefault(); openFindBar(); return; }
  if (ctrl && key === "p") { event.preventDefault(); api().print && api().print(); return; }
  if (ctrl && key === "s") { event.preventDefault(); api().savePage && api().savePage(); return; }
  if (ctrl && key === "r") { event.preventDefault(); api().reload(); return; }
  if (ctrl && key === "l") { event.preventDefault(); addressInput.focus(); addressInput.select(); return; }

  // Zoom
  if (ctrl && (event.key === "+" || event.key === "=")) { event.preventDefault(); api().zoomIn && api().zoomIn(); return; }
  if (ctrl && event.key === "-") { event.preventDefault(); api().zoomOut && api().zoomOut(); return; }
  if (ctrl && event.key === "0") { event.preventDefault(); api().zoomReset && api().zoomReset(); return; }

  // Tab cycling: Ctrl+Tab, Ctrl+Shift+Tab
  if (ctrl && event.key === "Tab") {
    event.preventDefault();
    api().cycleTab && api().cycleTab(shift ? "back" : "forward");
    return;
  }

  // Ctrl+1..9 → переключение вкладок по индексу
  if (ctrl && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    api().activateTabByIndex && api().activateTabByIndex(Number(event.key) - 1);
    return;
  }

  // Alt+F → меню
  if (event.altKey && key === "f") { event.preventDefault(); showNexusMenu(); return; }

  // Alt+Left/Right → back/forward
  if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); api().back(); return; }
  if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); api().forward(); return; }
});

document.addEventListener("contextmenu", (event) => {
  const target = event.target;
  if (target.closest("#top-chrome") || target.closest("#nexus-menu")) {
    event.preventDefault();
    event.stopPropagation();
    showNexusMenu({ x: event.clientX, y: event.clientY });
  }
});

document.addEventListener("auxclick", (event) => {
  const target = event.target;
  if (event.button === 1 && target.closest("#top-chrome") && !target.closest(".tab")) {
    event.preventDefault();
    event.stopPropagation();
  }
});

document.getElementById("minimize").addEventListener("click", () => api().minimize());
document.getElementById("maximize").addEventListener("click", () => api().maximizeToggle());
document.getElementById("close-window").addEventListener("click", () => api().closeWindow());

// Zoom indicator buttons
if (zoomInBtn) zoomInBtn.addEventListener("click", () => api().zoomIn && api().zoomIn());
if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => api().zoomOut && api().zoomOut());
if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => api().zoomReset && api().zoomReset());

// ============================================================================
// State updates
// ============================================================================

api().onTabsState((payload) => { state = payload; renderAll(); });
api().onWindowState((payload) => {
  windowMaximized = Boolean(payload.maximized || payload.fullscreen);
  document.getElementById("maximize").textContent = windowMaximized ? "❐" : "□";
});

api().getTabs().then((payload) => {
  state = payload;
  renderAll();
  setTimeout(requestBounds, 50);
  setTimeout(requestBounds, 250);
});

// ============================================================================
// Setup overlay (первый запуск)
// ============================================================================

if (avatarGrid) {
  avatarGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".avatar-option");
    if (!button) return;
    selectedAvatar = button.dataset.avatar || "wolf";
    selectedCustomAvatar = "";
    document.querySelectorAll(".avatar-option").forEach((item) => item.classList.toggle("active", item === button));
    if (setupFile) setupFile.value = "";
  });
}

if (setupFile) {
  setupFile.addEventListener("change", () => {
    const file = setupFile.files && setupFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      selectedCustomAvatar = String(reader.result || "");
      selectedAvatar = "custom";
      document.querySelectorAll(".avatar-option").forEach((item) => item.classList.remove("active"));
    };
    reader.readAsDataURL(file);
  });
}

if (setupCreate) {
  setupCreate.addEventListener("click", async () => {
    const name = (setupName && setupName.value || "").trim();
    if (!name) { setupError.textContent = "Введи имя пользователя."; return; }
    setupError.textContent = "";
    setupCreate.disabled = true;
    try {
      const nextState = await api().createInitialProfile({
        name,
        avatar: selectedAvatar,
        customAvatar: selectedCustomAvatar
      });
      if (nextState) { state = nextState; renderAll(); }
      if (setupOverlay) setupOverlay.hidden = true;
      document.body.classList.remove("setup-required");
    } catch (error) {
      setupError.textContent = error.message || String(error);
    } finally {
      setupCreate.disabled = false;
    }
  });
}
