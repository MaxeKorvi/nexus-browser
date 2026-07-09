const { contextBridge, ipcRenderer } = require("electron");

const nexusApi = {
  getTabs: () => ipcRenderer.invoke("tabs:get"),
  onTabsState: (callback) => ipcRenderer.on("tabs-state", (_event, payload) => callback(payload)),
  onWindowState: (callback) => ipcRenderer.on("window-state", (_event, payload) => callback(payload)),

  // Tabs
  newTab: (url = "") => ipcRenderer.send("tabs:new", url),
  newPrivateTab: () => ipcRenderer.send("tabs:new-private"),
  activateTab: (id) => ipcRenderer.send("tabs:activate", id),
  closeTab: (id) => ipcRenderer.send("tabs:close", id),
  togglePin: () => ipcRenderer.send("tabs:pin-toggle"),
  reopenClosedTab: () => ipcRenderer.send("tabs:reopen-closed"),
  cycleTab: (dir) => ipcRenderer.send("tabs:cycle", dir),
  activateTabByIndex: (index) => ipcRenderer.send("tabs:activate-by-index", index),

  // Navigation
  navigate: (text) => ipcRenderer.send("tabs:navigate", text),
  home: () => ipcRenderer.send("tabs:home"),
  back: () => ipcRenderer.send("tabs:back"),
  forward: () => ipcRenderer.send("tabs:forward"),
  reload: () => ipcRenderer.send("tabs:reload"),
  reloadBypassCache: () => ipcRenderer.send("tabs:reload-bypass-cache"),
  print: () => ipcRenderer.send("tabs:print"),
  savePage: () => ipcRenderer.send("tabs:save-page"),

  // Layout / theme
  setBounds: (bounds) => ipcRenderer.send("layout:set-bounds", bounds),
  nextTheme: () => ipcRenderer.send("theme:next"),
  setTheme: (theme) => ipcRenderer.send("theme:set", theme),

  // Bookmarks
  toggleBookmark: () => ipcRenderer.send("bookmark:toggle"),
  removeBookmark: (id) => ipcRenderer.send("bookmarks:remove", id),
  addBookmark: (payload) => ipcRenderer.send("bookmarks:add", payload),

  // Internal pages
  openHistory: () => ipcRenderer.send("open:history"),
  openBookmarks: () => ipcRenderer.send("open:bookmarks"),
  openDownloads: () => ipcRenderer.send("open:downloads"),
  openSettings: () => ipcRenderer.send("open:settings"),
  openProfiles: () => ipcRenderer.send("open:profiles"),
  openSearchSettings: () => ipcRenderer.send("open:search-settings"),

  // History / search
  clearHistory: () => ipcRenderer.send("history:clear"),
  rebuildSearch: () => ipcRenderer.send("search:rebuild"),
  clearSearchIndex: () => ipcRenderer.send("search:clear"),
  addSearchSite: (payload) => ipcRenderer.send("search:add-site", payload),

  // Downloads
  clearDownloads: () => ipcRenderer.send("downloads:clear"),
  openDownload: (filePath) => ipcRenderer.send("download:open", filePath),
  showDownload: (filePath) => ipcRenderer.send("download:show", filePath),
  cancelDownload: (id) => ipcRenderer.send("download:cancel", id),

  // Settings
  updateSettings: (patch) => ipcRenderer.send("settings:update", patch),
  clearBrowsingData: () => ipcRenderer.send("data:clear-browsing"),

  // Find in page
  openFind: () => ipcRenderer.send("find:open"),
  closeFind: () => ipcRenderer.send("find:close"),
  findNext: (text) => ipcRenderer.send("find:next", text),
  findPrev: (text) => ipcRenderer.send("find:prev", text),
  findQuery: (text) => ipcRenderer.send("find:query", text),

  // Zoom
  zoomIn: () => ipcRenderer.send("zoom:in"),
  zoomOut: () => ipcRenderer.send("zoom:out"),
  zoomReset: () => ipcRenderer.send("zoom:reset"),

  // Window / menu
  minimize: () => ipcRenderer.send("window:minimize"),
  maximizeToggle: () => ipcRenderer.send("window:maximize-toggle"),
  showMenu: () => ipcRenderer.send("menu:show"),
  showCustomMenu: (payload) => ipcRenderer.send("menu:show-custom", payload || {}),
  getMenuState: () => ipcRenderer.invoke("menu:get-state"),
  menuAction: (action) => ipcRenderer.send("menu:action", action),
  closeMenu: () => ipcRenderer.send("menu:close"),
  closeWindow: () => ipcRenderer.send("window:close"),

  // Setup
  createInitialProfile: (payload) => ipcRenderer.invoke("setup:create-profile", payload),

  // Find-in-page result events (для подсветки счётчика)
  onFoundInPage: (callback) => ipcRenderer.on("found-in-page", (_e, payload) => callback(payload))
};

contextBridge.exposeInMainWorld("nexus", nexusApi);
contextBridge.exposeInMainWorld("nova", nexusApi);
