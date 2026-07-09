(function () {
  "use strict";

  function applyPageAccent(color) {
    const v = String(color || "").trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    const root = document.documentElement;
    root.style.setProperty("--nexus-accent", v);
    root.style.setProperty("--accent", v);
    root.style.setProperty("--accent2", v);
    root.style.setProperty("--accent3", v);
  }

  const params = new URLSearchParams(location.search);
  document.body.dataset.theme = params.get("theme") || "dark";
  applyPageAccent(params.get("accent"));

  function renderNexusData(data) {
    const s = data.settings || {};
    document.body.dataset.theme = data.theme || params.get("theme") || "dark";
    document.getElementById("theme").value = data.theme || params.get("theme") || "dark";
    document.getElementById("accentColor").value = s.accentColor || "#21b8ff";
    applyPageAccent(document.getElementById("accentColor").value);
    document.getElementById("restoreTabs").checked = !!s.restoreTabs;
    document.getElementById("clearDownloadsOnExit").checked = !!s.clearDownloadsOnExit;
    document.getElementById("forceSiteTheme").checked = !!s.forceSiteTheme;
    document.getElementById("privateModeDefault").checked = !!s.privateModeDefault;
    document.getElementById("saveHistory").checked = s.saveHistory !== false;
    document.getElementById("httpsOnly").checked = s.httpsOnly !== false;
    document.getElementById("blockInsecureContent").checked = s.blockInsecureContent !== false;
    document.getElementById("doNotTrack").checked = s.doNotTrack !== false;
    document.getElementById("askForPermissions").checked = s.askForPermissions !== false;
  }

  function update() {
    const patch = {
      restoreTabs: document.getElementById("restoreTabs").checked,
      clearDownloadsOnExit: document.getElementById("clearDownloadsOnExit").checked,
      forceSiteTheme: document.getElementById("forceSiteTheme").checked,
      privateModeDefault: document.getElementById("privateModeDefault").checked,
      saveHistory: document.getElementById("saveHistory").checked,
      httpsOnly: document.getElementById("httpsOnly").checked,
      blockInsecureContent: document.getElementById("blockInsecureContent").checked,
      doNotTrack: document.getElementById("doNotTrack").checked,
      askForPermissions: document.getElementById("askForPermissions").checked,
      accentColor: document.getElementById("accentColor").value
    };
    window.nexus && window.nexus.updateSettings && window.nexus.updateSettings(patch);
    applyPageAccent(document.getElementById("accentColor").value);
  }

  document.getElementById("theme").addEventListener("change", function () {
    if (window.nexus && window.nexus.setTheme) window.nexus.setTheme(document.getElementById("theme").value);
    else location.href = "nexus://theme-set?theme=" + encodeURIComponent(document.getElementById("theme").value);
  });

  ["accentColor", "restoreTabs", "clearDownloadsOnExit", "forceSiteTheme", "privateModeDefault",
   "saveHistory", "httpsOnly", "blockInsecureContent", "doNotTrack", "askForPermissions"].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", update);
    if (el.type !== "checkbox") el.addEventListener("input", update);
  });

  document.getElementById("openBookmarksBtn").onclick = function () { location.href = "nexus://bookmarks"; };
  document.getElementById("openHistoryBtn").onclick = function () { location.href = "nexus://history"; };
  document.getElementById("openProfilesBtn").onclick = function () { location.href = "nexus://profiles"; };
  document.getElementById("openSearchSettingsBtn").onclick = function () { location.href = "nexus://search-settings"; };
  document.getElementById("clearDataBtn").onclick = function () {
    if (confirm("Очистить историю, cookies, cache и localStorage?")) {
      window.nexus && window.nexus.clearBrowsingData && window.nexus.clearBrowsingData();
    }
  };
  document.getElementById("resetUserBtn").onclick = function () {
    if (confirm("Сбросить пользователя и снова показать первый запуск?")) {
      location.href = "nexus://reset-user-profile";
    }
  };

  // Blur-эффект при клике ЛКМ
  document.addEventListener("mousedown", function (event) {
    if (event.button !== 0) return;
    const r = document.createElement("div");
    r.className = "nexus-click-blur";
    r.style.left = event.clientX + "px";
    r.style.top = event.clientY + "px";
    document.body.appendChild(r);
    r.addEventListener("animationend", function () { r.remove(); }, { once: true });
  }, true);

  if (window.__BROWSER_DATA__) renderNexusData(window.__BROWSER_DATA__);
  window.renderNexusData = renderNexusData;
})();
