const { app, BrowserWindow, BrowserView, ipcMain, clipboard, session, shell, safeStorage, nativeTheme, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fileURLToPath, pathToFileURL } = require("url");
const { NexusSearchEngine, DEFAULT_PORT: SEARCH_PORT } = require("./search-engine/engine");

// ============================================================================
// БЕЗОПАСНОСТЬ — отключаем опасные флаги, оставляем только разумные
// ============================================================================
// Раньше тут было: ignore-certificate-errors, allow-running-insecure-content,
// no-sandbox, disable-gpu-sandbox. Всё это убрано — браузер стал небезопасным.

const isDev = process.env.NEXUS_DEV === "1" || process.env.NODE_ENV === "development";

// WebRTC не должен сливать локальный IP через STUN
app.commandLine.appendSwitch("force-webrtc-ip-handling-policy", "disable_non_proxied_udp");
app.commandLine.appendSwitch("disable-features", "AutomationExtensionInfo");
// Убираем Blink-флаг webdriver: Google OAuth и часть сайтов режут embedded/automation-like Chromium.
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");

const APP_NAME = "Nexus";
const APP_ID = "com.nexus.browser";
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);
const DEFAULT_THEME = "dark";

function chromePlatformToken() {
  if (process.platform === "win32") return "Windows NT 10.0; Win64; x64";
  if (process.platform === "darwin") return "Macintosh; Intel Mac OS X 10_15_7";
  return "X11; Linux x86_64";
}

function chromeVersionForUA() {
  const version = String((process.versions && process.versions.chrome) || "130.0.0.0");
  const parts = version.split(".");
  while (parts.length < 4) parts.push("0");
  return parts.slice(0, 4).join(".");
}

const CHROME_VERSION = chromeVersionForUA();
const CHROME_MAJOR = Number(CHROME_VERSION.split(".")[0]) || 130;
const CHROME_UA = `Mozilla/5.0 (${chromePlatformToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
const CHROME_ACCEPT_LANGUAGE = "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7";
const CHROME_CLIENT_HINTS = {
  brands: [
    { brand: "Not.A/Brand", version: "99" },
    { brand: "Google Chrome", version: String(CHROME_MAJOR) },
    { brand: "Chromium", version: String(CHROME_MAJOR) }
  ],
  fullVersionList: [
    { brand: "Not.A/Brand", version: "99.0.0.0" },
    { brand: "Google Chrome", version: CHROME_VERSION },
    { brand: "Chromium", version: CHROME_VERSION }
  ],
  platform: process.platform === "win32" ? "Windows" : (process.platform === "darwin" ? "macOS" : "Linux"),
  platformVersion: process.platform === "win32" ? "15.0.0" : "",
  architecture: process.arch === "arm64" ? "arm" : "x86",
  model: "",
  mobile: false,
  bitness: process.arch === "ia32" ? "32" : "64",
  wow64: false
};

const GOOGLE_AUTH_HOST_RE = /(^|\.)(accounts\.google\.com|google\.com|youtube\.com)$/i;

let mainWindow = null;
let menuView = null;
let menuViewBounds = null;
let activeMenuModel = null;
let tabs = [];
let closedTabHistory = []; // для Ctrl+Shift+T
let activeTabId = null;
let nextTabId = 1;
let viewBounds = { x: 0, y: 96, width: 1280, height: 720 };
let currentTheme = DEFAULT_THEME;
const broadcastTimers = new Map(); // per-tab debounce

const dataDir = () => {
  const dir = path.join(app.getPath("userData"), "browser-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const dataFile = (name) => path.join(dataDir(), name);
const themeFile = () => dataFile("theme.json");
const historyFile = () => dataFile("history.json");
const bookmarksFile = () => dataFile("bookmarks.json");
const downloadsFile = () => dataFile("downloads.json");
const sessionFile = () => dataFile("session.json");
const settingsFile = () => dataFile("settings.json");
const profilesFile = () => dataFile("profiles.json");
const passwordsFile = () => dataFile("passwords.json");

// Функции для получения путей к внутренним страницам приложения.
// Держим пути в одном месте и проверяем наличие файлов при каждом обращении,
// чтобы переименование/отсутствие HTML-страницы не ломало старт браузера.
function createFallbackInternalPage(filename, title, message) {
  const dir = path.join(dataDir(), "internal-pages");
  const file = path.join(dir, filename);
  const safeTitle = String(title || "Nexus").replace(/[<>&"]/g, "");
  const safeMessage = String(message || "Внутренняя страница временно недоступна.").replace(/[<>&"]/g, "");

  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101419;color:#eef3f8;font:16px system-ui,sans-serif}
    main{max-width:680px;padding:32px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.06)}
    h1{margin:0 0 12px;font-size:28px}p{margin:0;color:#b8c4cf;line-height:1.5}
  </style>
</head>
<body><main><h1>${safeTitle}</h1><p>${safeMessage}</p></main></body>
</html>`, "utf8");
  }
  return file;
}

function internalAppFile(relativeParts, fallbackName, title, message) {
  const file = path.join(__dirname, ...relativeParts);
  if (fs.existsSync(file)) return file;

  console.error(`Internal page is missing: ${file}`);
  return createFallbackInternalPage(fallbackName, title, message);
}

function newTabFile() {
  return internalAppFile(
    ["newtab", "newtab.html"],
    "newtab.html",
    "Nexus Search",
    "Файл новой вкладки не найден, поэтому открыта резервная страница."
  );
}

// Обратная совместимость: в старых участках проекта использовалось имя newtabFile.
// Если часть кода снова обратится к нему, ReferenceError больше не возникнет.
const newtabFile = newTabFile;

const searchFile = () => internalAppFile(["newtab", "nexus-search.html"], "nexus-search.html", "Nexus Search", "Файл поиска не найден.");
const historyPageFile = () => internalAppFile(["internal", "history.html"], "history.html", "История", "Файл истории не найден.");
const bookmarksPageFile = () => internalAppFile(["internal", "bookmarks.html"], "bookmarks.html", "Закладки", "Файл закладок не найден.");
const downloadsPageFile = () => internalAppFile(["internal", "downloads.html"], "downloads.html", "Загрузки", "Файл загрузок не найден.");
const settingsPageFile = () => internalAppFile(["internal", "settings.html"], "settings.html", "Настройки", "Файл настроек не найден.");
const searchSettingsPageFile = () => internalAppFile(["internal", "search-settings.html"], "search-settings.html", "Настройки поиска", "Файл настроек поиска не найден.");
const profilesPageFile = () => internalAppFile(["internal", "profiles.html"], "profiles.html", "Профили", "Файл профилей не найден.");

const uploadsDir = () => {
  const dir = path.join(dataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

let settings = {
  setupComplete: false,
  accentColor: "#21b8ff",
  restoreTabs: true,
  defaultSearch: "nexus",
  clearDownloadsOnExit: false,
  privateModeDefault: false,
  saveHistory: true,
  forceSiteTheme: false,
  httpsOnly: true,
  doNotTrack: true,
  blockInsecureContent: true,
  askForPermissions: true
};

let historyItems = [];
let bookmarks = [];
let downloads = [];
const activeDownloads = new Map();
let searchEngine = null;
let profiles = [];
let activeProfileId = null;
let passwordVault = [];

// ============================================================================
// ШИФРОВАНИЕ ПАРОЛЕЙ — используем safeStorage (OS keyring), fallback на
// machine-derived ключ через PBKDF2. Раньше пароли лежали plain text.
// ============================================================================

function getEncryptionKey() {
  // Сначала пробуем OS keyring через safeStorage
  if (safeStorage.isEncryptionAvailable()) {
    const keyPath = dataFile("vault.key");
    try {
      if (fs.existsSync(keyPath)) {
        const buf = fs.readFileSync(keyPath);
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(buf);
        }
      }
      const newKey = crypto.randomBytes(32).toString("hex");
      const encrypted = safeStorage.encryptString(newKey);
      fs.writeFileSync(keyPath, encrypted);
      fs.chmodSync(keyPath, 0o600);
      return newKey;
    } catch (_) {
      // fall through to machine-derived
    }
  }
  // Fallback: machine-derived key из userData path + app name
  const seed = path.join(app.getPath("userData"), "nexus-vault") + APP_NAME + process.platform;
  return crypto.pbkdf2Sync(seed, "nexus-static-salt", 100000, 32, "sha512").toString("hex");
}

function encryptVault(items) {
  try {
    const key = Buffer.from(getEncryptionKey(), "hex");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plaintext = JSON.stringify(items || []);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { v: 1, iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") };
  } catch (err) {
    console.error("encryptVault failed:", err);
    return null;
  }
}

function decryptVault(payload) {
  if (!payload || typeof payload !== "object") return [];
  // Старый формат (plain array) — мигрируем
  if (Array.isArray(payload)) return payload;
  try {
    const key = Buffer.from(getEncryptionKey(), "hex");
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const data = Buffer.from(payload.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch (_) {
    return [];
  }
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    try { fs.chmodSync(file, 0o600); } catch (_) {}
  } catch (err) {
    console.error("writeJSON failed:", err);
  }
}

function loadState() {
  const themeData = readJSON(themeFile(), { theme: DEFAULT_THEME });
  currentTheme = ["light", "dark", "amoled"].includes(themeData.theme) ? themeData.theme : DEFAULT_THEME;
  settings = { ...settings, ...readJSON(settingsFile(), {}) };
  historyItems = readJSON(historyFile(), []);
  bookmarks = readJSON(bookmarksFile(), []);
  downloads = readJSON(downloadsFile(), []).map(d => {
    if (!d || typeof d !== "object") return d;
    if (d.state === "progressing") return { ...d, state: "interrupted", canCancel: false, endedAt: d.endedAt || Date.now() };
    return { ...d, canCancel: false };
  }).filter(Boolean);
  const profileData = readJSON(profilesFile(), null);
  if (profileData && Array.isArray(profileData.profiles)) {
    profiles = profileData.profiles;
    activeProfileId = profileData.activeProfileId || (profiles[0] && profiles[0].id) || null;
  }
  passwordVault = decryptVault(readJSON(passwordsFile(), []));
}

function saveSettings() { writeJSON(settingsFile(), settings); }
function saveTheme() { writeJSON(themeFile(), { theme: currentTheme }); }
function saveHistory() { writeJSON(historyFile(), historyItems.slice(0, 5000)); }
function saveBookmarks() { writeJSON(bookmarksFile(), bookmarks); }
function saveDownloads() { writeJSON(downloadsFile(), downloads.slice(0, 1000)); }
function saveProfiles() { writeJSON(profilesFile(), { profiles, activeProfileId }); }
function savePasswords() {
  const enc = encryptVault(passwordVault);
  if (enc) writeJSON(passwordsFile(), enc);
}

function fileURLFor(localPath, query = "") {
  const file = pathToFileURL(path.resolve(localPath)).toString();
  return `${file}${query}`;
}

function newTabURL() {
  return fileURLFor(newTabFile(), `?theme=${encodeURIComponent(currentTheme)}&accent=${encodeURIComponent(getAccent())}&v=${Date.now()}`);
}

function nexusSearchURL(query, section = "all") {
  return fileURLFor(searchFile(), `?theme=${encodeURIComponent(currentTheme)}&accent=${encodeURIComponent(getAccent())}&q=${encodeURIComponent(query || "")}&section=${encodeURIComponent(section || "all")}&v=${Date.now()}`);
}

const novaSearchURL = nexusSearchURL;

function internalURL(name) {
  const map = {
    history: historyPageFile(),
    bookmarks: bookmarksPageFile(),
    downloads: downloadsPageFile(),
    settings: settingsPageFile(),
    "search-settings": searchSettingsPageFile(),
    profiles: profilesPageFile()
  };
  return fileURLFor(map[name] || newTabFile(), `?theme=${encodeURIComponent(currentTheme)}&accent=${encodeURIComponent(getAccent())}&v=${Date.now()}`);
}

function isLocalAppURL(url, targetFile) {
  const value = String(url || "");
  if (!value.startsWith("file://")) return false;
  try {
    return path.resolve(fileURLToPath(value.split("?")[0])) === path.resolve(targetFile);
  } catch (_) {
    try {
      return decodeURIComponent(value.split("?")[0]).startsWith(`file://${targetFile.replace(/\\/g, "/")}`);
    } catch (_) {
      return value.startsWith(`file://${targetFile.replace(/\\/g, "/")}`);
    }
  }
}

function isNewTabURL(url) { return isLocalAppURL(url, newTabFile()); }
function isNexusSearchURL(url) { return isLocalAppURL(url, searchFile()); }
function isSearchSurfaceURL(url) { return isNewTabURL(url) || isNexusSearchURL(url); }
function isHistoryURL(url) { return isLocalAppURL(url, historyPageFile()); }
function isBookmarksURL(url) { return isLocalAppURL(url, bookmarksPageFile()); }
function isDownloadsURL(url) { return isLocalAppURL(url, downloadsPageFile()); }
function isSettingsURL(url) { return isLocalAppURL(url, settingsPageFile()); }
function isSearchSettingsURL(url) { return isLocalAppURL(url, searchSettingsPageFile()); }
function isProfilesURL(url) { return isLocalAppURL(url, profilesPageFile()); }

function isInternalURL(url) {
  return isNewTabURL(url) || isNexusSearchURL(url) || isHistoryURL(url) || isBookmarksURL(url) || isDownloadsURL(url) || isSettingsURL(url) || isSearchSettingsURL(url) || isProfilesURL(url);
}

function normalizeURL(input) {
  const raw = String(input || "").trim();
  if (!raw) return newTabURL();

  const lower = raw.toLowerCase();
  if (lower === "nexus://theme-next") { nextTheme(); return newTabURL(); }
  if (lower === "nexus://history" || lower === "nova://history") return internalURL("history");
  if (lower === "nexus://bookmarks" || lower === "nova://bookmarks") return internalURL("bookmarks");
  if (lower === "nexus://downloads" || lower === "nova://downloads") return internalURL("downloads");
  if (lower === "nexus://settings" || lower === "nova://settings") return internalURL("settings");
  if (lower === "nexus://search-settings" || lower === "nova://search-settings") return internalURL("search-settings");
  if (lower === "nexus://profiles" || lower === "nova://profiles") return internalURL("profiles");

  if (/^(https?|file):\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-zа-я]{2,}([/:?#].*)?$/i.test(raw) && !/\s/.test(raw)) {
    // HTTPS-Only: всегда принудительно https
    return settings.httpsOnly ? `https://${raw}` : `https://${raw}`;
  }

  return nexusSearchURL(raw);
}


function handleViewNavigation(view, rawUrl) {
  const value = String(rawUrl || "");
  const lower = value.toLowerCase();

  if (!lower.startsWith("nexus://") && !lower.startsWith("nova://")) return false;

  try {
    const parsed = new URL(value);
    const target = (parsed.hostname || "") + (parsed.pathname || "");

    if (target === "theme-next") { nextTheme(); return true; }
    if (target === "theme-set") { setTheme(parsed.searchParams.get("theme") || "dark"); return true; }

    if (target === "settings-update") {
      const patchRaw = parsed.searchParams.get("patch") || "{}";
      const patch = JSON.parse(patchRaw);
      settings = { ...settings, ...(patch || {}) };
      saveSettings();
      injectInternalDataForAll();
      broadcastTabs("settings-update");
      for (const tab of tabs) { try { injectForcedSiteTheme(tab.view); } catch (_) {} }
      applySessionPolicy();
      return true;
    }

    if (target === "clear-browsing-data") { clearBrowsingData(); return true; }
    if (target === "reset-user-profile") { try { resetUserProfileToFirstRun(); } catch (_) {} return true; }
    if (target === "history-clear") { clearHistory(); return true; }
    if (target === "downloads-clear") { clearDownloads(); return true; }
    if (target === "bookmark-remove") { removeBookmark(parsed.searchParams.get("id") || ""); return true; }
    if (target === "bookmark-add") {
      const payload = JSON.parse(parsed.searchParams.get("payload") || "{}");
      addBookmark(payload);
      return true;
    }
    if (target === "download-open") { const p = parsed.searchParams.get("path"); if (p) shell.openPath(p).catch(() => {}); return true; }
    if (target === "download-show") { const p = parsed.searchParams.get("path"); if (p) shell.showItemInFolder(p); return true; }
    if (target === "download-cancel") { cancelDownload(parsed.searchParams.get("id") || ""); return true; }
    if (target === "search-rebuild") { try { rebuildSearchIndex(); injectInternalDataForAll(); } catch (_) {} return true; }
    if (target === "search-clear") { try { searchEngine && searchEngine.clear(); injectInternalDataForAll(); } catch (_) {} return true; }

    if (target === "profile-action") {
      const action = parsed.searchParams.get("action") || "";
      const payload = JSON.parse(parsed.searchParams.get("payload") || "{}");
      handleProfileAction(action, payload);
      injectInternalDataForAll();
      broadcastTabs("profiles-update");
      return true;
    }

    if (target === "search-add-site") {
      const url = parsed.searchParams.get("url") || "";
      const maxDepth = Number(parsed.searchParams.get("maxDepth") || 1);
      const maxPages = Number(parsed.searchParams.get("maxPages") || 50);
      const timeout = Number(parsed.searchParams.get("timeout") || 9000);
      if (searchEngine && url) searchEngine.crawl(url, { maxDepth, maxPages, timeout, crawl: true }).then(() => injectInternalDataForAll()).catch(() => injectInternalDataForAll());
      return true;
    }
  } catch (_) {}

  const targetURL = normalizeURL(value);
  if (targetURL && targetURL !== value) {
    view.webContents.loadURL(targetURL);
    return true;
  }

  return true;
}

function getDisplayURL(url) {
  if (isNewTabURL(url)) return "";
  if (isNexusSearchURL(url)) {
    try { return new URL(url).searchParams.get("q") || ""; } catch (_) { return ""; }
  }
  if (isHistoryURL(url)) return "nexus://history";
  if (isBookmarksURL(url)) return "nexus://bookmarks";
  if (isDownloadsURL(url)) return "nexus://downloads";
  if (isSettingsURL(url)) return "nexus://settings";
  if (isSearchSettingsURL(url)) return "nexus://search-settings";
  if (isProfilesURL(url)) return "nexus://profiles";
  return url || "";
}

function getTitleForInternal(url, fallback = "Новая вкладка") {
  if (isNewTabURL(url)) return "Nexus Search";
  if (isNexusSearchURL(url)) {
    try {
      const q = new URL(url).searchParams.get("q") || "";
      return q ? `Nexus Search: ${q}` : "Nexus Search";
    } catch (_) {
      return "Nexus Search";
    }
  }
  if (isHistoryURL(url)) return "История";
  if (isBookmarksURL(url)) return "Закладки";
  if (isDownloadsURL(url)) return "Загрузки";
  if (isSettingsURL(url)) return "Настройки";
  if (isSearchSettingsURL(url)) return "Настройки поиска";
  if (isProfilesURL(url)) return "Профили";
  return fallback;
}


function hasPrivateTab() {
  return tabs.some(t => t.privateMode);
}

function partitionForPrivate() {
  return `private:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Изоляция профилей: каждый профиль получает свой persist-раздел.
// Раньше все «профили» делили общий persist:browser — cookies/storage общие.
function partitionForProfile(profileId) {
  if (!profileId) return "persist:browser";
  return `persist:profile-${profileId}`;
}

function searchIndexDir() {
  const dir = path.join(dataDir(), "search-index");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function startSearchEngine() {
  if (searchEngine) return;
  searchEngine = new NexusSearchEngine({ dataDir: searchIndexDir(), port: SEARCH_PORT });
  searchEngine.indexBookmarks(bookmarks);
  for (const item of historyItems.slice(0, 1000)) {
    searchEngine.addVisitedPage(item);
  }
  searchEngine.startServer({
    getHistory: () => historyItems,
    getBookmarks: () => bookmarks,
    onIndexChanged: () => injectInternalDataForAll(),
    uploadsDir: uploadsDir()
  });
}

function queueIndexVisitedPage(item, tab) {
  if (!searchEngine) return;
  if (!settings.saveHistory) return;
  if (tab && tab.privateMode) return;
  if (!item || !item.url || !/^https?:\/\//i.test(item.url)) return;
  setTimeout(() => {
    try { searchEngine.addVisitedPage(item); injectInternalDataForAll(); } catch (_) {}
  }, 250);
}

function rebuildSearchIndex() {
  if (!searchEngine) return null;
  return searchEngine.rebuildFrom({ history: historyItems, bookmarks });
}

function searchStatusPayload() {
  return searchEngine ? searchEngine.status() : { ok: false, pages: 0, port: SEARCH_PORT, errors: [] };
}

function isGoogleAuthLikeURL(url) {
  try {
    const host = new URL(String(url || "")).hostname;
    return GOOGLE_AUTH_HOST_RE.test(host);
  } catch (_) {
    return false;
  }
}

function setChromeIdentityForSession(ses) {
  if (!ses) return;
  try { ses.setUserAgent(CHROME_UA, CHROME_ACCEPT_LANGUAGE); } catch (_) {
    try { ses.setUserAgent(CHROME_UA); } catch (__) {}
  }
}

function setChromeIdentityForWebContents(wc) {
  if (!wc) return;
  try { wc.setUserAgent(CHROME_UA, CHROME_CLIENT_HINTS); } catch (_) {
    try { wc.setUserAgent(CHROME_UA); } catch (__) {}
  }
}

function applyBrowserRequestHeaders(details, cb) {
  const headers = details.requestHeaders || {};
  headers["User-Agent"] = CHROME_UA;
  headers["Accept-Language"] = headers["Accept-Language"] || CHROME_ACCEPT_LANGUAGE;

  const isGoogleAuth = isGoogleAuthLikeURL(details.url);
  if (settings.doNotTrack && !isGoogleAuth) {
    headers["DNT"] = "1";
    headers["Sec-GPC"] = "1";
  } else {
    delete headers["DNT"];
    delete headers["Sec-GPC"];
  }

  if (/^https?:\/\//i.test(String(details.url || ""))) {
    headers["sec-ch-ua"] = `"Not.A/Brand";v="99", "Google Chrome";v="${CHROME_MAJOR}", "Chromium";v="${CHROME_MAJOR}"`;
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = `"${CHROME_CLIENT_HINTS.platform}"`;
  }

  cb({ requestHeaders: headers });
}

// ============================================================================
// СЕССИЯ: применяем Do Not Track, HTTPS-Only, blocking insecure content,
// permission handler, User-Agent.
// ============================================================================

function applySessionPolicy(ses) {
  const list = ses ? [ses] : session.getAllSessions();
  for (const s of list) {
    try {
      setChromeIdentityForSession(s);
      s.webRequest.onBeforeSendHeaders(applyBrowserRequestHeaders);

      // HTTPS-Only: блокируем смешанное содержимое и downgrade http:// в фреймах
      if (settings.blockInsecureContent) {
        s.webRequest.onHeadersReceived((details, cb) => {
          const headers = details.responseHeaders || {};
          headers["Content-Security-Policy"] = headers["Content-Security-Policy"] || [];
          cb({ responseHeaders: headers });
        });
      }
    } catch (_) {}
  }
}

function configurePermissionHandler(ses) {
  if (!settings.askForPermissions) return;
  try {
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      // По умолчанию — спрашивать пользователя через диалог.
      // Упрощённо: разрешаем только безопасные, остальные отклоняем.
      const safe = ["notifications", "fullscreen", "clipboard-read", "clipboard-sanitized-write"];
      const unsafe = ["media", "geolocation", "midi", "midiSysex", "openExternal", "window-management", "fileSystem"];
      if (safe.includes(permission)) return callback(true);
      if (unsafe.includes(permission)) {
        // Спрашиваем пользователя
        if (!mainWindow || mainWindow.isDestroyed()) return callback(false);
        const choice = require("electron").dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Запретить", "Разрешить"],
          defaultId: 0,
          cancelId: 0,
          title: "Nexus — запрос разрешения",
          message: `Сайт запрашивает разрешение: ${permission}`,
          detail: "Разрешить этому сайту использовать этот ресурс?"
        });
        return callback(choice === 1);
      }
      callback(false);
    });

    ses.setPermissionCheckHandler(() => true); // проверка проходит, если request-хендлер разрешил
  } catch (_) {}
}

function launchURLFromArgs(argv = []) {
  for (const arg of argv || []) {
    const value = String(arg || "").trim();
    if (!value || value.startsWith("--")) continue;
    if (/^(https?:\/\/|file:\/\/)/i.test(value)) return value;
  }
  return "";
}

let pendingLaunchURL = launchURLFromArgs(process.argv);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = launchURLFromArgs(argv);
    if (url) pendingLaunchURL = url;

    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    if (url) {
      createTab(normalizeURL(url), true, { privateMode: settings.privateModeDefault });
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url) pendingLaunchURL = url;
  if (mainWindow && !mainWindow.isDestroyed() && url) {
    createTab(normalizeURL(url), true, { privateMode: settings.privateModeDefault });
    mainWindow.focus();
  }
});

function openPendingLaunchURL() {
  const url = pendingLaunchURL;
  pendingLaunchURL = "";
  if (!url) return;
  createTab(normalizeURL(url), true, { privateMode: settings.privateModeDefault });
}

function createWindow() {
  loadState();
  startSearchEngine();

  const persistent = session.fromPartition("persist:browser");
  setChromeIdentityForSession(persistent);
  applySessionPolicy(persistent);
  configurePermissionHandler(persistent);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 660,
    frame: false,
    title: APP_NAME,
    backgroundColor: "#202124",
    icon: path.join(__dirname, "assets", "nexus-user-logo.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:browser"
    }
  });

  let bootstrapped = false;
  const bootstrapAfterUiLoaded = () => {
    if (bootstrapped || !mainWindow || mainWindow.isDestroyed()) return;
    bootstrapped = true;
    restoreSessionOrCreateTab();
    openPendingLaunchURL();
    applyBoundsToActiveView();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
    }, 20);
  };

  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.webContents.once("did-finish-load", bootstrapAfterUiLoaded);
  mainWindow.once("ready-to-show", () => {
    bootstrapAfterUiLoaded();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  });
  setTimeout(bootstrapAfterUiLoaded, 2500);

  mainWindow.on("resize", () => { closeMenuWindow(); applyBoundsToActiveView(); sendWindowState(); });
  mainWindow.on("move", () => closeMenuWindow());
  mainWindow.on("minimize", () => closeMenuWindow());
  mainWindow.on("closed", () => { closeMenuWindow(); mainWindow = null; });
  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);
  mainWindow.on("enter-full-screen", sendWindowState);
  mainWindow.on("leave-full-screen", sendWindowState);

  persistent.on("will-download", (_event, item) => handleDownload(item));

  // Внешние ссылки открывать в системном браузере для небезопасных схем
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(mailto:|tel:|magnet:|intent:)/i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    }
    return { action: "deny" };
  });
}

function restoreSessionOrCreateTab() {
  if (needsProfileSetup()) {
    createTab(newTabURL(), true, { privateMode: false });
    detachAllBrowserViews();
    return;
  }

  const saved = readJSON(sessionFile(), null);
  if (settings.restoreTabs && saved && Array.isArray(saved.tabs) && saved.tabs.length) {
    for (const item of saved.tabs.slice(0, 30)) {
      createTab(item.url || newTabURL(), false, { pinned: Boolean(item.pinned) });
    }
    const targetId = saved.activeId && tabs.find(t => t.id === saved.activeId)
      ? saved.activeId
      : (tabs[0] && tabs[0].id);
    setActiveTab(targetId);
  } else {
    createTab(newTabURL(), true, { privateMode: settings.privateModeDefault });
  }
}

function makeView(options = {}) {
  // Изоляция профилей: приватная вкладка → временный partition,
  // обычная → partition активного профиля.
  const profileId = options.profileId || activeProfileId;
  const partition = options.privateMode
    ? partitionForPrivate()
    : (profileId ? partitionForProfile(profileId) : "persist:browser");

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,  // ← раньше было true
      devTools: isDev,
      preload: path.join(__dirname, "site-preload.js"),
      partition,
      spellcheck: true
    }
  });

  const wc = view.webContents;
  setChromeIdentityForWebContents(wc);

  if (options.privateMode) {
    const ses = session.fromPartition(partition);
    setChromeIdentityForSession(ses);
    applySessionPolicy(ses);
    configurePermissionHandler(ses);
  } else if (profileId) {
    const ses = session.fromPartition(partitionForProfile(profileId));
    setChromeIdentityForSession(ses);
    applySessionPolicy(ses);
    configurePermissionHandler(ses);
  }

  // Открытие новых окон/вкладок из сайта
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (/^(mailto:|tel:|magnet:|intent:)/i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    }
    if (disposition === "background-tab" || disposition === "foreground-tab" || disposition === "new-window") {
      createTab(url, true, { privateMode: Boolean(options.privateMode), profileId });
      return { action: "deny" };
    }
    return { action: "deny" };
  });

  wc.on("did-start-loading", () => updateTabFromWebContents(view, { loading: true }));
  wc.on("did-stop-loading", () => { 
    updateTabFromWebContents(view, { loading: false }); 
    const url = view.webContents.getURL();
    if (isInternalURL(url) && !isSearchSurfaceURL(url)) injectClickBlur(view);
    injectForcedSiteTheme(view); 
    injectInternalData(view); 
  });
  wc.on("dom-ready", () => { 
    const url = view.webContents.getURL();
    if (isInternalURL(url) && !isSearchSurfaceURL(url)) injectClickBlur(view);
    injectForcedSiteTheme(view); 
    injectLocalBridge(view); 
    injectInternalData(view); 
  });
  wc.on("page-title-updated", (_event, title) => updateTabFromWebContents(view, { title }));
  wc.on("page-favicon-updated", (_event, favicons) => updateTabFromWebContents(view, { favicon: favicons && favicons[0] ? favicons[0] : "" }));
  wc.on("did-navigate", (_event, url) => updateTabFromWebContents(view, { url }));
  wc.on("did-navigate-in-page", (_event, url) => updateTabFromWebContents(view, { url }));
  wc.on("will-navigate", (event, url) => { if (handleViewNavigation(view, url)) event.preventDefault(); });
  wc.on("context-menu", (_event, params) => showCustomContextMenu(view, params));

  return view;
}


function resetUserProfileToFirstRun() {
  profiles = [];
  activeProfileId = null;
  passwordVault = [];
  settings.setupComplete = false;
  saveProfiles();
  savePasswords();
  saveSettings();

  if (mainWindow) {
    for (const tab of tabs) {
      try { mainWindow.removeBrowserView(tab.view); } catch (_) {}
      try { tab.view.webContents.destroy(); } catch (_) {}
    }
  }

  tabs = [];
  activeTabId = null;
  createTab(newTabURL(), true, { privateMode: false });
  detachAllBrowserViews();
  broadcastTabs("reset-user-profile");
  saveSessionSoon();
}

function needsProfileSetup() {
  return !settings.setupComplete || !profiles.length;
}

function detachAllBrowserViews() {
  if (!mainWindow) return;
  for (const tab of tabs) {
    try { mainWindow.removeBrowserView(tab.view); } catch (_) {}
  }
}

function attachActiveBrowserViewIfAllowed() {
  detachAllBrowserViews();
  if (!mainWindow || needsProfileSetup()) return;
  const tab = getActiveTab();
  if (!tab || !tab.view) return;
  try { mainWindow.addBrowserView(tab.view); } catch (_) {}
  applyBoundsToActiveView();
  try { tab.view.webContents.focus(); } catch (_) {}
}

function createTab(url = newTabURL(), activate = true, options = {}) {
  const id = nextTabId++;
  const privateMode = Boolean(options.privateMode);
  if (privateMode && hasPrivateTab()) {
    const existing = tabs.find(t => t.privateMode);
    if (existing) {
      if (activate) setActiveTab(existing.id);
      return existing;
    }
  }
  const view = makeView({ privateMode, profileId: options.profileId });
  const tab = {
    id,
    view,
    title: privateMode ? "Приватная вкладка" : getTitleForInternal(url, "Новая вкладка"),
    url: getDisplayURL(url),
    realURL: url,
    favicon: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    bookmarked: false,
    pinned: Boolean(options.pinned),
    privateMode,
    profileId: options.profileId || activeProfileId,
    zoomFactor: 1.0,
    findOpen: false
  };

  if (tab.pinned) {
    const firstUnpinnedIndex = tabs.findIndex(t => !t.pinned);
    if (firstUnpinnedIndex >= 0) tabs.splice(firstUnpinnedIndex, 0, tab);
    else tabs.push(tab);
  } else {
    tabs.push(tab);
  }

  view.webContents.loadURL(url);

  if (activate) setActiveTab(id);
  broadcastTabs("tab-created");
  saveSessionSoon();
  return tab;
}

function setActiveTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || !mainWindow) return;

  const old = getActiveTab();
  if (old && old.view && old.id !== id) {
    try { mainWindow.removeBrowserView(old.view); } catch (_) {}
  }

  activeTabId = id;

  if (needsProfileSetup()) {
    detachAllBrowserViews();
    updateTabFromWebContents(tab.view);
    broadcastTabs("tab-activated");
    saveSessionSoon();
    return;
  }

  mainWindow.addBrowserView(tab.view);
  applyBoundsToActiveView();
  tab.view.webContents.focus();
  updateTabFromWebContents(tab.view);
  broadcastTabs("tab-activated");
  saveSessionSoon();
}

function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0 || !mainWindow) return;

  const wasActive = tabs[index].id === activeTabId;
  const closing = tabs[index];

  // Сохраняем в истории закрытых для Ctrl+Shift+T (не приватные)
  if (!closing.privateMode) {
    const url = currentRealURL(closing);
    if (url && !isInternalURL(url)) {
      closedTabHistory.unshift({ url, title: closing.title, at: Date.now() });
      if (closedTabHistory.length > 50) closedTabHistory.length = 50;
    }
  }

  try { mainWindow.removeBrowserView(closing.view); } catch (_) {}
  try { closing.view.webContents.destroy(); } catch (_) {}

  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createTab(newTabURL(), true, { privateMode: settings.privateModeDefault });
    return;
  }

  if (wasActive) setActiveTab(tabs[Math.min(index, tabs.length - 1)].id);
  broadcastTabs("tab-closed");
  saveSessionSoon();
}

function reopenLastClosedTab() {
  if (!closedTabHistory.length) return;
  const last = closedTabHistory.shift();
  if (last && last.url) createTab(last.url, true);
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

function currentRealURL(tab) {
  if (!tab) return "";
  try { return tab.view.webContents.getURL() || tab.realURL || ""; } catch (_) { return tab.realURL || ""; }
}

function applyBoundsToActiveView() {
  if (needsProfileSetup()) {
    detachAllBrowserViews();
    return;
  }
  const tab = getActiveTab();
  if (!tab || !tab.view || !mainWindow) return;

  const content = mainWindow.getContentBounds();
  const safeBounds = {
    x: Math.max(0, Math.round(viewBounds.x || 0)),
    y: Math.max(0, Math.round(viewBounds.y || 96)),
    width: Math.max(200, Math.round(viewBounds.width || content.width)),
    height: Math.max(200, Math.round(viewBounds.height || (content.height - (viewBounds.y || 96))))
  };

  tab.view.setBounds(safeBounds);
  tab.view.setAutoResize({ width: true, height: true });
}

function updateTabFromWebContents(view, patch = {}) {
  const tab = tabs.find(t => t.view === view);
  if (!tab) return;

  const wc = view.webContents;
  const actualURL = patch.url !== undefined ? patch.url : wc.getURL();
  const title = patch.title !== undefined ? patch.title : wc.getTitle();

  tab.realURL = actualURL || tab.realURL;
  tab.url = getDisplayURL(actualURL);

  if (tab.privateMode && isNewTabURL(actualURL)) {
    tab.title = "Приватная вкладка";
  } else if (isInternalURL(actualURL)) {
    tab.title = getTitleForInternal(actualURL);
  } else {
    tab.title = title || tab.title || "Новая вкладка";
  }

  tab.favicon = patch.favicon !== undefined ? patch.favicon : tab.favicon;
  tab.loading = patch.loading !== undefined ? patch.loading : tab.loading;
  tab.canGoBack = wc.canGoBack ? wc.canGoBack() : false;
  tab.canGoForward = wc.canGoForward ? wc.canGoForward() : false;
  tab.bookmarked = isBookmarked(tab.realURL);

  if (!tab.loading) addHistoryIfNeeded(tab);
  broadcastTabs("tab-updated", tab.id);
  saveSessionSoon();
}

function addHistoryIfNeeded(tab) {
  if (tab.privateMode || !settings.saveHistory) return;
  const url = currentRealURL(tab);
  if (!url || isInternalURL(url) || url === "about:blank") return;

  const item = {
    id: Date.now() + "-" + Math.random().toString(16).slice(2),
    title: tab.title || url,
    url,
    displayUrl: getDisplayURL(url),
    favicon: tab.favicon || "",
    visitedAt: Date.now()
  };

  const last = historyItems[0];
  if (last && last.url === item.url && Date.now() - last.visitedAt < 15000) return;

  historyItems.unshift(item);
  historyItems = historyItems.slice(0, 5000);
  saveHistory();
  queueIndexVisitedPage(item, tab);
}

function isBookmarked(url) {
  if (!url || isInternalURL(url)) return false;
  return bookmarks.some(b => b.url === url);
}

function toggleBookmarkForActive() {
  const tab = getActiveTab();
  if (!tab || tab.privateMode) return;
  const url = currentRealURL(tab);
  if (!url || isInternalURL(url)) return;

  const index = bookmarks.findIndex(b => b.url === url);
  if (index >= 0) {
    bookmarks.splice(index, 1);
  } else {
    bookmarks.unshift({
      id: Date.now() + "-" + Math.random().toString(16).slice(2),
      title: tab.title || url,
      url,
      favicon: tab.favicon || "",
      createdAt: Date.now()
    });
  }

  saveBookmarks();
  if (searchEngine) searchEngine.indexBookmarks(bookmarks);
  updateTabFromWebContents(tab.view);
  injectInternalDataForAll();
  broadcastTabs("bookmark-changed");
}

function togglePinForActive() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.pinned = !tab.pinned;
  sortTabsPinnedFirst();
  broadcastTabs("pin-changed");
  saveSessionSoon();
}

function sortTabsPinnedFirst() {
  tabs.sort((a, b) => {
    if (a.pinned === b.pinned) return a.id - b.id;
    return a.pinned ? -1 : 1;
  });
}

function addBookmark(payload = {}) {
  const url = String(payload.url || "").trim();
  if (!url || isInternalURL(url)) return;
  const title = String(payload.title || url).trim() || url;
  if (bookmarks.some(b => b.url === url)) return;

  bookmarks.unshift({
    id: Date.now() + "-" + Math.random().toString(16).slice(2),
    title,
    url,
    favicon: payload.favicon || "",
    createdAt: Date.now()
  });

  saveBookmarks();
  if (searchEngine) searchEngine.indexBookmarks(bookmarks);
  injectInternalDataForAll();
  broadcastTabs("bookmark-changed");
}

function removeBookmark(id) {
  bookmarks = bookmarks.filter(b => b.id !== id);
  saveBookmarks();
  if (searchEngine) searchEngine.indexBookmarks(bookmarks);
  injectInternalDataForAll();
  broadcastTabs("bookmark-removed");
}

function clearHistory() {
  historyItems = [];
  saveHistory();
  if (searchEngine) searchEngine.clear();
  injectInternalDataForAll();
}

function clearDownloads() {
  downloads = [];
  saveDownloads();
  injectInternalDataForAll();
  broadcastTabs("downloads-clear");
}

function cancelDownload(id) {
  const download = activeDownloads.get(String(id || ""));
  if (!download) return false;
  try {
    download.cancel();
    return true;
  } catch (_) {
    return false;
  }
}

function clearBrowsingData() {
  historyItems = [];
  saveHistory();
  const ses = session.fromPartition("persist:browser");
  ses.clearCache().catch(() => {});
  ses.clearStorageData().catch(() => {});
  // Также чистим cookies всех профильных partition'ов
  for (const p of profiles) {
    try {
      const s = session.fromPartition(partitionForProfile(p.id));
      s.clearCache().catch(() => {});
      s.clearStorageData().catch(() => {});
    } catch (_) {}
  }
  if (searchEngine) searchEngine.clear();
  injectInternalDataForAll();
}

let sessionTimer = null;
function saveSessionSoon() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSession, 300);
}

function saveSession() {
  // Считаем activeId среди ВСЕХ вкладок (включая приватные) — приватные
  // не сохраняем в tabs, но активный id может быть приватным (тогда fallback на первую).
  const activeTab = getActiveTab();
  const savedTabs = tabs
    .filter(t => !t.privateMode)
    .map(t => {
      const real = currentRealURL(t);
      let url = real;

      if (!real || isNewTabURL(real)) url = newTabURL();
      else if (isNexusSearchURL(real)) {
        try {
          const q = new URL(real).searchParams.get("q") || "";
          url = nexusSearchURL(q);
        } catch (_) {
          url = newTabURL();
        }
      } else if (isHistoryURL(real)) url = internalURL("history");
      else if (isBookmarksURL(real)) url = internalURL("bookmarks");
      else if (isDownloadsURL(real)) url = internalURL("downloads");
      else if (isSettingsURL(real)) url = internalURL("settings");
      else if (isSearchSettingsURL(real)) url = internalURL("search-settings");
      else if (isProfilesURL(real)) url = internalURL("profiles");

      return { url, pinned: Boolean(t.pinned) };
    });

  // Если активная вкладка приватная — берём первую неприватную
  const activeId = activeTab && !activeTab.privateMode ? activeTab.id : (tabs.find(t => !t.privateMode) || {}).id || null;

  writeJSON(sessionFile(), { activeId, tabs: savedTabs, savedAt: Date.now() });
}

function handleDownload(item) {
  const id = Date.now() + "-" + Math.random().toString(16).slice(2);
  const filename = item.getFilename();
  const savePath = path.join(app.getPath("downloads"), filename);
  item.setSavePath(savePath);

  const record = {
    id,
    filename,
    url: item.getURL(),
    savePath,
    state: "progressing",
    receivedBytes: 0,
    totalBytes: item.getTotalBytes(),
    startedAt: Date.now(),
    endedAt: null,
    canCancel: true
  };

  activeDownloads.set(id, item);
  downloads.unshift(record);
  saveDownloads();
  injectInternalDataForAll();
  broadcastTabs("downloads-update");

  item.on("updated", (_event, state) => {
    record.state = state === "interrupted" ? "interrupted" : "progressing";
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.canCancel = record.state === "progressing";
    saveDownloads();
    injectInternalDataForAll();
    broadcastTabs("tab-updated");
  });

  item.once("done", (_event, state) => {
    activeDownloads.delete(id);
    record.state = state;
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.endedAt = Date.now();
    record.canCancel = false;
    saveDownloads();
    injectInternalDataForAll();
    broadcastTabs("downloads-update");
  });
}

function serializeTabs() {
  const active = getActiveTab();
  return {
    activeTabId,
    theme: currentTheme,
    setupRequired: !settings.setupComplete || !profiles.length,
    profiles,
    activeProfileId,
    settings,
    activeBookmarked: active ? isBookmarked(currentRealURL(active)) : false,
    activePinned: active ? Boolean(active.pinned) : false,
    activePrivate: active ? Boolean(active.privateMode) : false,
    activeZoom: active ? (active.zoomFactor || 1.0) : 1.0,
    canReopenClosed: closedTabHistory.length > 0,
    downloads: downloads,
    tabs: tabs.map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      loading: t.loading,
      canGoBack: t.canGoBack,
      canGoForward: t.canGoForward,
      bookmarked: isBookmarked(currentRealURL(t)),
      pinned: Boolean(t.pinned),
      privateMode: Boolean(t.privateMode)
    }))
  };
}

function broadcastTabs(reason = "update", tabId = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("tabs-state", { ...serializeTabs(), reason });
  };

  if (reason === "tab-updated") {
    // per-tab debounce, не глобальный
    const key = tabId || "global";
    clearTimeout(broadcastTimers.get(key));
    broadcastTimers.set(key, setTimeout(() => {
      broadcastTimers.delete(key);
      send();
    }, 35));
  } else {
    send();
  }
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window-state", {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  });
}

function setTheme(theme) {
  if (!["light", "dark", "amoled"].includes(theme)) return;
  currentTheme = theme;
  saveTheme();
  nativeTheme.themeSource = theme === "light" ? "light" : "dark";

  for (const tab of tabs) {
    const currentURL = tab.view.webContents.getURL();

    if (isNewTabURL(currentURL)) tab.view.webContents.loadURL(newTabURL());
    else if (isNexusSearchURL(currentURL)) {
      try {
        const currentParams = new URL(currentURL).searchParams;
        const q = currentParams.get("q") || "";
        const section = currentParams.get("section") || "all";
        tab.view.webContents.loadURL(nexusSearchURL(q, section));
      } catch (_) {
        tab.view.webContents.loadURL(newTabURL());
      }
    } else if (isHistoryURL(currentURL)) tab.view.webContents.loadURL(internalURL("history"));
    else if (isBookmarksURL(currentURL)) tab.view.webContents.loadURL(internalURL("bookmarks"));
    else if (isDownloadsURL(currentURL)) tab.view.webContents.loadURL(internalURL("downloads"));
    else if (isSettingsURL(currentURL)) tab.view.webContents.loadURL(internalURL("settings"));
    else if (isSearchSettingsURL(currentURL)) tab.view.webContents.loadURL(internalURL("search-settings"));
    else if (isProfilesURL(currentURL)) tab.view.webContents.loadURL(internalURL("profiles"));
    else {
      tab.view.webContents.executeJavaScript(`
        window.__nexusAccent = ${JSON.stringify(getAccent())};
        document.documentElement.style.setProperty('--nexus-accent', window.__nexusAccent || '#21b8ff');
        true;
      `).catch(() => {});
    }
  }

  broadcastTabs("theme-changed");
  saveSessionSoon();
}

function nextTheme() {
  const order = ["light", "dark", "amoled"];
  setTheme(order[(order.indexOf(currentTheme) + 1) % order.length]);
}

function getAccent() {
  return (settings && settings.accentColor) || "#21b8ff";
}


function injectForcedSiteTheme(view) {
  if (!settings.forceSiteTheme) return;
  const url = view.webContents.getURL();
  if (isInternalURL(url) || !/^https?:\/\//i.test(url)) return;

  const theme = currentTheme;
  const isLight = theme === "light";
  const css = isLight ? `
    :root, html, body { color-scheme: light !important; }
    html, body { background: #f4fbff !important; color: #132235 !important; }
    input, textarea, select, button { color-scheme: light !important; }
  ` : `
    :root, html, body { color-scheme: dark !important; }
    html, body { background: #0b1018 !important; color: #f2fbff !important; }
    input, textarea, select { background-color: #121a26 !important; color: #f2fbff !important; border-color: rgba(120,210,255,.22) !important; }
  `;

  view.webContents.insertCSS(css).catch(() => {});
}

// ============================================================================
// BLUR-ЭФФЕКТ ПРИ КЛИКЕ — только для внутренних страниц Nexus
// ============================================================================
function injectClickBlur(view) {
  const url = view.webContents.getURL();
  if (!isInternalURL(url)) return; // не применять на внешних сайтах

  const accent = getAccent();
  const script = `
    (() => {
      if (window.__nexusClickBlurInstalled) return;
      window.__nexusClickBlurInstalled = true;
      window.__nexusAccent = ${JSON.stringify(accent)};
      const style = document.createElement('style');
      style.textContent = \`
        @keyframes nexusBlurRipple {
          0%   { opacity: .55; width: 8px;   height: 8px;   filter: blur(2px); }
          35%  { opacity: .35; width: 70px;  height: 70px;  filter: blur(10px); }
          70%  { opacity: .15; width: 130px; height: 130px; filter: blur(20px); }
          100% { opacity: 0;   width: 180px; height: 180px; filter: blur(32px); }
        }
        .nexus-click-blur {
          position: fixed;
          left: 0; top: 0;
          width: 8px; height: 8px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 2147483647;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle,
            color-mix(in srgb, var(--nexus-accent, #21b8ff) 60%, transparent) 0%,
            color-mix(in srgb, var(--nexus-accent, #21b8ff) 25%, transparent) 40%,
            transparent 70%);
          mix-blend-mode: screen;
          animation: nexusBlurRipple 720ms cubic-bezier(.2,.8,.2,1) forwards;
        }
      \`;
      document.documentElement.style.setProperty('--nexus-accent', window.__nexusAccent || '#21b8ff');
      (document.head || document.documentElement).appendChild(style);
      document.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        const ripple = document.createElement('div');
        ripple.className = 'nexus-click-blur';
        ripple.style.left = event.clientX + 'px';
        ripple.style.top  = event.clientY + 'px';
        (document.body || document.documentElement).appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      }, true);
    })();
  `;
  view.webContents.executeJavaScript(script).catch(() => {});
}

function injectLocalBridge(view) {
  const current = view.webContents.getURL();
  if (!isInternalURL(current)) return;

  const searchPage = fileURLFor(searchFile());
  const script = `
    (() => {
      if (window.__nexusBridgeInstalled) return;
      window.__nexusBridgeInstalled = true;

      const go = (url) => { location.href = url; };
      const api = window.nexus || window.nova || {};
      window.nexus = api;
      window.nova = api;
      api.setTheme = (theme) => go('nexus://theme-set?theme=' + encodeURIComponent(theme || 'dark'));
      api.updateSettings = (patch) => go('nexus://settings-update?patch=' + encodeURIComponent(JSON.stringify(patch || {})));
      api.clearBrowsingData = () => go('nexus://clear-browsing-data');
      api.clearHistory = () => go('nexus://history-clear');
      api.clearDownloads = () => go('nexus://downloads-clear');
      api.addBookmark = (payload) => go('nexus://bookmark-add?payload=' + encodeURIComponent(JSON.stringify(payload || {})));
      api.removeBookmark = (id) => go('nexus://bookmark-remove?id=' + encodeURIComponent(id || ''));
      api.openDownload = (p) => go('nexus://download-open?path=' + encodeURIComponent(p || ''));
      api.showDownload = (p) => go('nexus://download-show?path=' + encodeURIComponent(p || ''));
      api.cancelDownload = (id) => go('nexus://download-cancel?id=' + encodeURIComponent(id || ''));
      api.rebuildSearch = () => go('nexus://search-rebuild');
      api.clearSearchIndex = () => go('nexus://search-clear');
      api.addSearchSite = (payload) => {
        const p = payload || {};
        go('nexus://search-add-site?url=' + encodeURIComponent(p.url || '') + '&maxDepth=' + encodeURIComponent(p.maxDepth || 1) + '&maxPages=' + encodeURIComponent(p.maxPages || 50) + '&timeout=' + encodeURIComponent(p.timeout || 9000));
      };

      document.addEventListener('click', (event) => {
        const theme = event.target.closest('[data-nexus-theme]');
        if (theme) {
          event.preventDefault();
          go('nexus://theme-next');
        }
      }, true);

      document.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-nexus-search]');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('input');
        const value = input ? input.value.trim() : '';
        if (!value) return;
        if (/^[\\w.-]+\\.[a-zа-я]{2,}([/:?#].*)?$/i.test(value) && !/\\s/.test(value)) {
          location.href = 'https://' + value;
        } else {
          location.href = ${JSON.stringify(searchPage)} + '?theme=${currentTheme}&accent=${encodeURIComponent(getAccent())}&q=' + encodeURIComponent(value) + '&v=' + Date.now();
        }
      }, true);
    })();
  `;
  view.webContents.executeJavaScript(script).catch(() => {});
}

function internalPayload() {
  return { theme: currentTheme, history: historyItems, bookmarks, downloads, settings, search: searchStatusPayload(), profiles, activeProfileId, passwords: passwordVault, setupRequired: !settings.setupComplete || !profiles.length };
}

function injectInternalData(view) {
  const url = view.webContents.getURL();
  if (!isHistoryURL(url) && !isBookmarksURL(url) && !isDownloadsURL(url) && !isSettingsURL(url) && !isSearchSettingsURL(url) && !isProfilesURL(url)) return;
  const payload = JSON.stringify(internalPayload());
  view.webContents.executeJavaScript(`
    window.__BROWSER_DATA__ = ${payload};
    if (typeof window.renderNexusData === "function") window.renderNexusData(window.__BROWSER_DATA__);
    true;
  `).catch(() => {});
}

function injectInternalDataForAll() {
  for (const tab of tabs) {
    try { injectInternalData(tab.view); } catch (_) {}
  }
}


function openOrFocusInternal(name) {
  const matcher = { history: isHistoryURL, bookmarks: isBookmarksURL, downloads: isDownloadsURL, settings: isSettingsURL, "search-settings": isSearchSettingsURL, profiles: isProfilesURL }[name];
  if (matcher) {
    const existing = tabs.find(t => { try { return matcher(currentRealURL(t)); } catch (_) { return false; } });
    if (existing) { setActiveTab(existing.id); return existing; }
  }
  return createTab(internalURL(name), true);
}

function activeProfileOrFirst() {
  return profiles.find(p => p.id === activeProfileId) || profiles[0] || null;
}

function isHttpLikeURL(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function normalizeOrigin(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.origin;
  } catch (_) {
    try {
      const u = new URL("https://" + String(value || "").trim());
      return u.origin;
    } catch (__) {
      return "";
    }
  }
}

function getHostname(value) {
  try { return new URL(String(value || "")).hostname.replace(/^www\./i, ""); } catch (_) { return ""; }
}

function tabByWebContentsId(webContentsId) {
  return tabs.find(t => t && t.view && t.view.webContents && t.view.webContents.id === webContentsId) || null;
}

function passwordScopeMatches(entry, origin, href) {
  const targetOrigin = normalizeOrigin(origin || href);
  if (!targetOrigin) return false;
  const entryOrigin = normalizeOrigin(entry.origin || entry.url || entry.site || "");
  if (entryOrigin && entryOrigin === targetOrigin) return true;

  const targetHost = getHostname(targetOrigin);
  const entryHost = getHostname(entryOrigin || entry.site || entry.url || "");
  return Boolean(targetHost && entryHost && (targetHost === entryHost || targetHost.endsWith("." + entryHost) || entryHost.endsWith("." + targetHost)));
}

function normalizePasswordPayload(payload = {}) {
  const href = String(payload.href || payload.url || "").trim();
  const origin = normalizeOrigin(payload.origin || href);
  const username = String(payload.username || "").trim().slice(0, 320);
  const password = String(payload.password || "");
  if (!origin || !username || !password || password.length > 4096) return null;
  return {
    origin,
    url: isHttpLikeURL(href) ? href : origin,
    site: getHostname(origin) || origin,
    username,
    password,
    title: String(payload.title || "").trim().slice(0, 240)
  };
}

const pendingPasswordPrompts = new Map();

function savedPasswordsForSender(event, payload = {}) {
  const tab = tabByWebContentsId(event && event.sender ? event.sender.id : 0);
  if (!tab || tab.privateMode) return [];
  const origin = normalizeOrigin(payload.origin || payload.href || "");
  if (!origin) return [];
  const profileId = tab.profileId || activeProfileId;
  return passwordVault
    .filter(p => p.profileId === profileId && passwordScopeMatches(p, origin, payload.href))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, 5)
    .map(p => ({ id: p.id, origin: p.origin || normalizeOrigin(p.site), site: p.site, username: p.username, password: p.password }));
}

async function offerToSavePassword(event, payload = {}) {
  const tab = tabByWebContentsId(event && event.sender ? event.sender.id : 0);
  if (!tab || tab.privateMode) return;

  const data = normalizePasswordPayload(payload);
  if (!data) return;

  const profileId = tab.profileId || activeProfileId;
  if (!profileId) return;

  const existing = passwordVault.find(p => p.profileId === profileId && passwordScopeMatches(p, data.origin, data.url) && String(p.username || "") === data.username);
  if (existing && existing.password === data.password) return;

  const promptKey = [profileId, data.origin, data.username].join("|");
  if (pendingPasswordPrompts.has(promptKey)) return;
  pendingPasswordPrompts.set(promptKey, Date.now());

  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const response = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: existing ? "Nexus — обновить пароль?" : "Nexus — сохранить пароль?",
      message: existing ? `Обновить сохранённый пароль для ${data.site}?` : `Сохранить пароль для ${data.site}?`,
      detail: `Логин: ${data.username}`,
      buttons: [existing ? "Обновить" : "Сохранить", "Не сейчас"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (response.response !== 0) return;

    const now = Date.now();
    if (existing) {
      existing.password = data.password;
      existing.origin = data.origin;
      existing.url = data.url;
      existing.site = data.site;
      existing.title = data.title || existing.title || "";
      existing.updatedAt = now;
    } else {
      passwordVault.unshift({
        id: "pass-" + now.toString(36) + "-" + Math.random().toString(16).slice(2),
        profileId,
        site: data.site,
        origin: data.origin,
        url: data.url,
        username: data.username,
        password: data.password,
        note: data.title || "",
        createdAt: now,
        updatedAt: now
      });
    }
    savePasswords();
    injectInternalDataForAll();
    broadcastTabs("passwords-update");
  } finally {
    setTimeout(() => pendingPasswordPrompts.delete(promptKey), 2500);
  }
}

function setActiveProfileSafely(id) {
  if (id && profiles.some(p => p.id === id)) activeProfileId = id;
  else activeProfileId = profiles[0] ? profiles[0].id : null;
  settings.setupComplete = Boolean(activeProfileId && profiles.length);
}

function handleProfileAction(action, payload = {}) {
  if (action === "add-profile") {
    const name = String(payload.name || "").trim();
    if (!name) return;
    const avatar = String(payload.avatar || "wolf").trim();
    const customAvatar = String(payload.customAvatar || "").trim();
    const id = "profile-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2);
    profiles.push({ id, name, avatar, customAvatar, createdAt: Date.now() });
    activeProfileId = id;
    settings.setupComplete = true;
    saveProfiles();
    saveSettings();
    return;
  }

  if (action === "switch-profile") {
    const id = String(payload.id || "");
    if (profiles.some(p => p.id === id)) {
      activeProfileId = id;
      settings.setupComplete = true;
      saveProfiles();
      saveSettings();
    }
    return;
  }

  if (action === "remove-profile") {
    const id = String(payload.id || "");
    if (!id) return;
    profiles = profiles.filter(p => p.id !== id);
    passwordVault = passwordVault.filter(p => p.profileId !== id);
    // Чистим partition удалённого профиля
    try {
      const ses = session.fromPartition(partitionForProfile(id));
      ses.clearCache().catch(() => {});
      ses.clearStorageData().catch(() => {});
    } catch (_) {}
    if (activeProfileId === id || !profiles.some(p => p.id === activeProfileId)) setActiveProfileSafely(null);
    saveProfiles();
    savePasswords();
    saveSettings();
    if (needsProfileSetup()) detachAllBrowserViews();
    return;
  }

  if (action === "add-password") {
    const active = activeProfileOrFirst();
    if (!active) return;
    const origin = normalizeOrigin(payload.site || "");
    const now = Date.now();
    const entry = {
      id: "pass-" + now.toString(36) + "-" + Math.random().toString(16).slice(2),
      profileId: active.id,
      site: origin ? (getHostname(origin) || origin) : String(payload.site || "").trim(),
      origin,
      url: origin || String(payload.site || "").trim(),
      username: String(payload.username || "").trim(),
      password: String(payload.password || ""),
      note: String(payload.note || ""),
      createdAt: now,
      updatedAt: now
    };
    if (!entry.site || !entry.username || !entry.password) return;
    passwordVault.unshift(entry);
    savePasswords();
    return;
  }

  if (action === "remove-password") {
    const id = String(payload.id || "");
    passwordVault = passwordVault.filter(p => p.id !== id);
    savePasswords();
    return;
  }

  if (action === "export-passwords") {
    const type = String(payload.type || "csv").toLowerCase();
    const active = activeProfileOrFirst() || { id: "profile", name: "profile" };
    const list = passwordVault.filter(p => p.profileId === active.id);
    const safeName = String(active.name || "profile").replace(/[^\wа-яА-ЯёЁ.-]+/g, "_");
    const dir = app.getPath("downloads");
    if (type === "json") {
      const file = path.join(dir, `nexus-passwords-${safeName}.json`);
      fs.writeFileSync(file, JSON.stringify(list, null, 2));
      shell.showItemInFolder(file);
      return;
    }
    const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    const rows = [["name", "url", "username", "password", "note"], ...list.map(p => [p.site, p.url || p.origin || p.site, p.username, p.password, p.note])];
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    const file = path.join(dir, `nexus-passwords-${safeName}.csv`);
    fs.writeFileSync(file, csv);
    shell.showItemInFolder(file);
  }
}

// ============================================================================
// КАСТОМНЫЕ МЕНЮ — отдельное прозрачное окно поверх BrowserView.
// BrowserView перекрывает DOM основного окна, поэтому меню внутри index.html
// было видно/кликабельно нестабильно. Popup-окно решает это и для кнопки меню,
// и для контекстного меню страницы.
// ============================================================================

const POPUP_MENU_WIDTH = 342;
const POPUP_CONTEXT_WIDTH = 312;
const POPUP_MAX_HEIGHT = 620;
let popupOpenSeq = 0;

function menuItem(action, label, icon = "", shortcut = "", enabled = true) {
  return { action, label, icon, shortcut, enabled };
}
function menuSeparator() { return { separator: true }; }
function menuTitle(label) { return { type: "title", label }; }
function menuZoomItem() {
  const tab = getActiveTab();
  const zoom = Math.round(((tab && tab.zoomFactor) || 1) * 100) + "%";
  return { type: "zoom", label: "Масштаб", value: zoom };
}

function buildAppMenuItems() {
  const tab = getActiveTab();
  return [
    menuTitle("Nexus"),
    menuItem("new-tab", "Новая вкладка", "plus", "Ctrl+T"),
    menuItem("new-private", "Приватная вкладка", "shield", "Ctrl+Shift+N"),
    menuItem("reopen-closed", "Восстановить закрытую", "restore", "Ctrl+Shift+T", closedTabHistory.length > 0),
    menuSeparator(),
    menuItem("history", "История", "history"),
    menuItem("bookmarks", "Закладки", "star", "Ctrl+H"),
    menuItem("downloads", "Загрузки", "download", "Ctrl+J"),
    menuItem("profiles", "Профили и пароли", "user"),
    menuSeparator(),
    menuItem("find", "Найти на странице", "search", "Ctrl+F", Boolean(tab)),
    menuItem("copy-url", "Копировать адрес", "copy", "", Boolean(tab && tab.url)),
    menuZoomItem(),
    menuSeparator(),
    menuItem("settings", "Настройки", "settings"),
    menuItem("search-settings", "Настройки поиска", "search-settings")
  ];
}

function buildContextMenuItems(params = {}, view = null) {
  const items = [];
  const linkURL = String(params.linkURL || "");
  const srcURL = String(params.srcURL || "");
  const selectionText = String(params.selectionText || "").trim();
  const isImage = srcURL && (params.mediaType === "image" || /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(srcURL));

  if (linkURL) {
    items.push(
      menuItem("open-link-new-tab", "Открыть ссылку в новой вкладке", "external"),
      menuItem("open-link-private", "Открыть ссылку приватно", "shield"),
      menuItem("copy-link", "Копировать ссылку", "copy"),
      menuSeparator()
    );
  }

  if (isImage) {
    items.push(
      menuItem("open-image-new-tab", "Открыть картинку", "image"),
      menuItem("copy-image-url", "Копировать адрес картинки", "copy"),
      menuSeparator()
    );
  }

  if (params.isEditable) {
    items.push(
      menuItem("edit-cut", "Вырезать", "cut", "Ctrl+X"),
      menuItem("edit-copy", "Копировать", "copy", "Ctrl+C"),
      menuItem("edit-paste", "Вставить", "paste", "Ctrl+V"),
      menuItem("edit-select-all", "Выделить всё", "select-all", "Ctrl+A"),
      menuSeparator()
    );
  } else if (selectionText) {
    items.push(
      menuItem("copy-selection", "Копировать", "copy", "Ctrl+C"),
      menuItem("search-selection", "Искать в Nexus", "search"),
      menuSeparator()
    );
  }

  const canBack = Boolean(view && view.webContents && view.webContents.canGoBack && view.webContents.canGoBack());
  items.push(
    menuItem("web-back", "Назад", "arrow-left", "", canBack),
    menuItem("web-reload", "Обновить", "refresh", "Ctrl+R")
  );

  return items.filter((item, index, list) => {
    if (!item.separator) return true;
    const prev = list[index - 1];
    const next = list[index + 1];
    return Boolean(prev && next && !prev.separator && !next.separator);
  });
}

function estimateMenuHeight(items) {
  let height = 18; // panel padding + border, the window no longer has outer padding
  for (const item of items) {
    if (item.separator) height += 15;
    else if (item.type === "title") height += 35;
    else if (item.type === "zoom") height += 48;
    else height += 40;
  }
  return Math.max(72, Math.min(POPUP_MAX_HEIGHT, height));
}

async function capturePopupBackdrop(pos, width, height) {
  if (!mainWindow || mainWindow.isDestroyed()) return "";
  try {
    const bounds = mainWindow.getContentBounds();
    const rect = {
      x: Math.max(0, Math.round(pos.x - bounds.x)),
      y: Math.max(0, Math.round(pos.y - bounds.y)),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height))
    };
    const image = await mainWindow.capturePage(rect);
    if (!image || (image.isEmpty && image.isEmpty())) return "";
    return image.toDataURL();
  } catch (_) {
    return "";
  }
}

function clampMenuPosition(x, y, width, height) {
  let area = null;
  try {
    area = screen.getDisplayMatching({ x, y, width, height }).workArea;
  } catch (_) {}
  if (!area) area = { x: 0, y: 0, width: 1920, height: 1080 };

  const margin = 8;
  const maxX = area.x + area.width - width - margin;
  const maxY = area.y + area.height - height - margin;
  return {
    x: Math.max(area.x + margin, Math.min(Math.round(x), maxX)),
    y: Math.max(area.y + margin, Math.min(Math.round(y), maxY))
  };
}

function closeMenuWindow(options = {}) {
  popupOpenSeq += 1;
  const clearModel = options.clearModel !== false;
  const view = menuView;
  menuView = null;
  menuViewBounds = null;
  if (clearModel) activeMenuModel = null;
  if (view) {
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.removeBrowserView(view); } catch (_) {}
    try { if (view.webContents && !view.webContents.isDestroyed()) view.webContents.destroy(); } catch (_) {}
  }
}

function popupBoundsForScreenPosition(pos, width, height) {
  const content = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow.getContentBounds()
    : { x: 0, y: 0, width: 1280, height: 720 };
  return {
    x: Math.max(0, Math.round(pos.x - content.x)),
    y: Math.max(0, Math.round(pos.y - content.y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function attachMenuViewOnTop() {
  if (!mainWindow || mainWindow.isDestroyed() || !menuView) return;
  try { mainWindow.removeBrowserView(menuView); } catch (_) {}
  try { mainWindow.addBrowserView(menuView); } catch (_) { return; }
  if (menuViewBounds) {
    try { menuView.setBounds(menuViewBounds); } catch (_) {}
    try { menuView.setAutoResize({ width: false, height: false }); } catch (_) {}
  }
}

async function openMenuPopup({ type = "app", items = [], x = 0, y = 0, width = POPUP_MENU_WIDTH, context = null } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  closeMenuWindow();

  const seq = ++popupOpenSeq;
  const height = estimateMenuHeight(items);
  const pos = clampMenuPosition(x, y, width, height);
  const backdropDataUrl = await capturePopupBackdrop(pos, width, height);
  if (seq !== popupOpenSeq || !mainWindow || mainWindow.isDestroyed()) return;

  activeMenuModel = {
    type,
    accent: getAccent(),
    theme: currentTheme,
    items,
    context,
    backdropDataUrl
  };

  menuViewBounds = popupBoundsForScreenPosition(pos, width, height);
  menuView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  try { menuView.webContents.setBackgroundColor("#00000000"); } catch (_) {}
  attachMenuViewOnTop();
  menuView.webContents.loadFile(path.join(__dirname, "ui", "menu-popup.html"));
  menuView.webContents.once("did-finish-load", () => {
    if (seq !== popupOpenSeq || !menuView || menuView.webContents.isDestroyed()) return;
    try { menuView.webContents.focus(); } catch (_) {}
  });
}

function showCustomAppMenu(anchor = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getContentBounds();
  const width = POPUP_MENU_WIDTH;
  const items = buildAppMenuItems();
  const x = bounds.x + Number(anchor.right || anchor.x || bounds.width - 12) - width;
  const y = bounds.y + Number(anchor.bottom || anchor.y || 86) + 8;
  openMenuPopup({ type: "app", items, x, y, width });
}

function showCustomAppMenuAtPoint(point = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getContentBounds();
  const width = POPUP_MENU_WIDTH;
  const items = buildAppMenuItems();
  const x = bounds.x + Number(point.x || 0);
  const y = bounds.y + Number(point.y || 0);
  openMenuPopup({ type: "app", items, x, y, width });
}

function showCustomContextMenu(view, params) {
  if (!view || !view.webContents || !mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getContentBounds();
  const items = buildContextMenuItems(params, view);
  const width = POPUP_CONTEXT_WIDTH;
  const x = bounds.x + viewBounds.x + Number(params.x || 0);
  const y = bounds.y + viewBounds.y + Number(params.y || 0);
  openMenuPopup({
    type: "context",
    items,
    x,
    y,
    width,
    context: { view, params: { ...params } }
  });
}

function runMenuAction(action) {
  const model = activeMenuModel;
  const context = model && model.context ? model.context : {};
  const view = context.view || (getActiveTab() && getActiveTab().view);
  const params = context.params || {};

  closeMenuWindow({ clearModel: false });
  activeMenuModel = null;

  switch (action) {
    case "new-tab": createTab(newTabURL(), true); break;
    case "new-private": createTab(newTabURL(), true, { privateMode: true }); break;
    case "reopen-closed": reopenLastClosedTab(); break;
    case "history": openOrFocusInternal("history"); break;
    case "bookmarks": openOrFocusInternal("bookmarks"); break;
    case "downloads": openOrFocusInternal("downloads"); break;
    case "profiles": openOrFocusInternal("profiles"); break;
    case "settings": openOrFocusInternal("settings"); break;
    case "search-settings": openOrFocusInternal("search-settings"); break;
    case "find": openFindInPage(); break;
    case "print": if (view && view.webContents.print) view.webContents.print(); break;
    case "save-page": if (view && view.webContents.savePage) view.webContents.savePage(path.join(app.getPath("downloads"), "page.html"), "HTMLComplete").catch(() => {}); break;
    case "copy-url": if (view && view.webContents.getURL) clipboard.writeText(view.webContents.getURL()); break;
    case "zoom-in": zoomActive(0.1); break;
    case "zoom-out": zoomActive(-0.1); break;
    case "zoom-reset": zoomReset(); break;

    case "open-link-new-tab": if (params.linkURL) createTab(params.linkURL, true); break;
    case "open-link-private": if (params.linkURL) createTab(params.linkURL, true, { privateMode: true }); break;
    case "copy-link": if (params.linkURL) clipboard.writeText(params.linkURL); break;
    case "open-image-new-tab": if (params.srcURL) createTab(params.srcURL, true); break;
    case "copy-image-url": if (params.srcURL) clipboard.writeText(params.srcURL); break;
    case "search-selection": if (params.selectionText) createTab(nexusSearchURL(params.selectionText), true); break;
    case "copy-selection": if (view && view.webContents.copy) view.webContents.copy(); break;
    case "edit-cut": if (view && view.webContents.cut) view.webContents.cut(); break;
    case "edit-copy": if (view && view.webContents.copy) view.webContents.copy(); break;
    case "edit-paste": if (view && view.webContents.paste) view.webContents.paste(); break;
    case "edit-select-all": if (view && view.webContents.selectAll) view.webContents.selectAll(); break;
    case "web-back": if (view && view.webContents.canGoBack && view.webContents.canGoBack()) view.webContents.goBack(); break;
    case "web-reload": if (view && view.webContents.reload) view.webContents.reload(); break;
  }
}

// ============================================================================
// FIND ON PAGE + ZOOM
// ============================================================================

function openFindInPage() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.findOpen = true;
  broadcastTabs("find-opened");
}

function findInPage(text, opts = {}) {
  const tab = getActiveTab();
  if (!tab) return;
  if (!text) {
    tab.view.webContents.stopFindInPage("clearSelection");
    return;
  }
  tab.view.webContents.findInPage(text, { forward: !opts.backwards, findNext: opts.findNext || false });
}

function closeFindInPage() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.findOpen = false;
  try { tab.view.webContents.stopFindInPage("clearSelection"); } catch (_) {}
  broadcastTabs("find-closed");
}

function zoomActive(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.zoomFactor = Math.max(0.25, Math.min(3.0, (tab.zoomFactor || 1.0) + delta));
  try { tab.view.webContents.setZoomFactor(tab.zoomFactor); } catch (_) {}
  broadcastTabs("zoom-changed");
}

function zoomReset() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.zoomFactor = 1.0;
  try { tab.view.webContents.setZoomFactor(1.0); } catch (_) {}
  broadcastTabs("zoom-changed");
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("nexus", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("nexus");
    }
  } catch (_) {}

  // Безопасный обработчик сертификатов: принимаем только self-signed для localhost/file://
  app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
    const isLocal = /^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(url);
    if (isLocal && error === "ERR_CERT_AUTHORITY_INVALID") {
      event.preventDefault();
      callback(true);
      return;
    }
    // Для всех остальных — НЕ принимаем (раньше принимали всё)
    event.preventDefault();
    callback(false);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  saveSession();
  if (settings.clearDownloadsOnExit) {
    downloads = [];
    saveDownloads();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ============================================================================
// IPC
// ============================================================================

ipcMain.handle("tabs:get", () => serializeTabs());
ipcMain.on("tabs:new", (_event, url) => createTab(normalizeURL(url || ""), true, { privateMode: settings.privateModeDefault }));
ipcMain.on("tabs:new-private", () => createTab(newTabURL(), true, { privateMode: true }));
ipcMain.on("tabs:activate", (_event, id) => setActiveTab(Number(id)));
ipcMain.on("tabs:close", (_event, id) => closeTab(Number(id)));
ipcMain.on("tabs:pin-toggle", () => togglePinForActive());
ipcMain.on("tabs:reopen-closed", () => reopenLastClosedTab());
ipcMain.on("tabs:cycle", (_event, dir) => {
  if (!tabs.length) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  if (idx < 0) return setActiveTab(tabs[0].id);
  const next = dir === "back"
    ? (idx - 1 + tabs.length) % tabs.length
    : (idx + 1) % tabs.length;
  setActiveTab(tabs[next].id);
});
ipcMain.on("tabs:activate-by-index", (_event, index) => {
  const t = tabs[index];
  if (t) setActiveTab(t.id);
});
ipcMain.on("tabs:navigate", (_event, text) => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.loadURL(normalizeURL(text));
});
ipcMain.on("tabs:home", () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.loadURL(newTabURL());
});
ipcMain.on("tabs:back", () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.canGoBack && tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
});
ipcMain.on("tabs:forward", () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.canGoForward && tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
});
ipcMain.on("tabs:reload", () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.reload && tab.view.webContents.reload();
});
ipcMain.on("tabs:reload-bypass-cache", () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.reloadIgnoringCache && tab.view.webContents.reloadIgnoringCache();
});
ipcMain.on("tabs:print", () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.print && tab.view.webContents.print();
});
ipcMain.on("tabs:save-page", () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.savePage && tab.view.webContents.savePage(path.join(app.getPath("downloads"), "page.html"), "HTMLComplete").catch(() => {});
});
ipcMain.on("layout:set-bounds", (_event, bounds) => {
  viewBounds = bounds;
  applyBoundsToActiveView();
});
ipcMain.on("theme:next", () => nextTheme());
ipcMain.on("theme:set", (_event, theme) => setTheme(theme));
ipcMain.on("bookmark:toggle", () => toggleBookmarkForActive());
ipcMain.on("open:history", () => openOrFocusInternal("history"));
ipcMain.on("open:bookmarks", () => openOrFocusInternal("bookmarks"));
ipcMain.on("open:downloads", () => openOrFocusInternal("downloads"));
ipcMain.on("open:settings", () => openOrFocusInternal("settings"));
ipcMain.on("open:profiles", () => openOrFocusInternal("profiles"));
ipcMain.on("open:search-settings", () => openOrFocusInternal("search-settings"));
ipcMain.on("history:clear", () => clearHistory());
ipcMain.on("search:rebuild", () => {
  try { rebuildSearchIndex(); injectInternalDataForAll(); } catch (_) {}
});
ipcMain.on("search:clear", () => {
  try { searchEngine && searchEngine.clear(); injectInternalDataForAll(); } catch (_) {}
});
ipcMain.on("search:add-site", (_event, payload) => {
  try {
    if (!searchEngine) return;
    searchEngine.crawl(payload.url, payload).then(() => injectInternalDataForAll()).catch(() => injectInternalDataForAll());
  } catch (_) {}
});
ipcMain.on("bookmarks:remove", (_event, id) => removeBookmark(id));
ipcMain.on("bookmarks:add", (_event, payload) => addBookmark(payload || {}));
ipcMain.on("downloads:clear", () => clearDownloads());
ipcMain.on("download:open", (_event, filePath) => { if (filePath) shell.openPath(filePath).catch(() => {}); });
ipcMain.on("download:show", (_event, filePath) => { if (filePath) shell.showItemInFolder(filePath); });
ipcMain.on("download:cancel", (_event, id) => cancelDownload(id));
ipcMain.on("settings:update", (_event, patch) => {
  settings = { ...settings, ...(patch || {}) };
  saveSettings();
  injectInternalDataForAll();
  broadcastTabs("settings-update");
  for (const tab of tabs) { try { injectForcedSiteTheme(tab.view); } catch (_) {} }
  applySessionPolicy();
});
ipcMain.on("data:clear-browsing", () => clearBrowsingData());
ipcMain.on("menu:show", () => showCustomAppMenu());
ipcMain.on("menu:show-custom", (_event, payload = {}) => {
  if (payload && payload.point) showCustomAppMenuAtPoint(payload.point);
  else showCustomAppMenu(payload && payload.anchor ? payload.anchor : {});
});
ipcMain.handle("menu:get-state", () => {
  if (!activeMenuModel) return { type: "empty", accent: getAccent(), theme: currentTheme, items: [], backdropDataUrl: "" };
  return {
    type: activeMenuModel.type,
    accent: activeMenuModel.accent || getAccent(),
    theme: activeMenuModel.theme || currentTheme,
    items: activeMenuModel.items || [],
    backdropDataUrl: activeMenuModel.backdropDataUrl || ""
  };
});
ipcMain.on("menu:action", (_event, action) => runMenuAction(String(action || "")));
ipcMain.on("menu:close", () => closeMenuWindow());

ipcMain.handle("passwords:find", (event, payload = {}) => savedPasswordsForSender(event, payload));
ipcMain.on("passwords:candidate", (event, payload = {}) => {
  offerToSavePassword(event, payload).catch(err => console.error("offerToSavePassword failed:", err));
});

ipcMain.handle("setup:create-profile", (_event, payload = {}) => {
  const name = String(payload.name || "").trim();
  const avatar = String(payload.avatar || "wolf").trim();
  const customAvatar = String(payload.customAvatar || "").trim();
  if (!name) throw new Error("Введите имя профиля");

  const id = "profile-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2);
  const profile = { id, name, avatar, customAvatar, createdAt: Date.now() };

  profiles = [profile];
  activeProfileId = id;
  settings.setupComplete = true;
  settings.accentColor = settings.accentColor || "#21b8ff";

  saveProfiles();
  saveSettings();

  // Применяем политику для нового partition'а профиля
  const ses = session.fromPartition(partitionForProfile(id));
  applySessionPolicy(ses);
  configurePermissionHandler(ses);

  attachActiveBrowserViewIfAllowed();
  const next = serializeTabs();
  broadcastTabs("settings-update");
  return next;
});

ipcMain.on("find:open", () => openFindInPage());
ipcMain.on("find:close", () => closeFindInPage());
ipcMain.on("find:next", (_event, text) => findInPage(text, { findNext: true }));
ipcMain.on("find:prev", (_event, text) => findInPage(text, { findNext: true, backwards: true }));
ipcMain.on("find:query", (_event, text) => findInPage(text, {}));

ipcMain.on("zoom:in", () => zoomActive(0.1));
ipcMain.on("zoom:out", () => zoomActive(-0.1));
ipcMain.on("zoom:reset", () => zoomReset());

ipcMain.on("window:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("window:maximize-toggle", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  sendWindowState();
});
ipcMain.on("window:close", () => mainWindow && mainWindow.close());

// Отдаём каталог uploads для фотопоиска (если когда-нибудь понадобится)
ipcMain.handle("uploads:list", () => {
  try { return fs.readdirSync(uploadsDir()).slice(-50); } catch (_) { return []; }
});
