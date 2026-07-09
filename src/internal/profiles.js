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

  let data = { profiles: [], activeProfileId: null, passwords: [], theme: "dark" };

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[m];
    });
  }
  function avatarHTML(p) {
    if (!p) return "?";
    if (p.customAvatar) return '<img src="' + esc(p.customAvatar) + '">';
    const map = {
      wolf: '<img src="../assets/nexus-user-logo.png">',
      dog: "🐶", cat: "🐱", robot: "🤖", fox: "🦊", space: "🌌"
    };
    return map[p.avatar] || esc((p.name || "?").slice(0, 1).toUpperCase());
  }

  function renderNexusData(d) {
    data = d;
    document.body.dataset.theme = d.theme || params.get("theme") || "dark";
    applyPageAccent(d.settings && d.settings.accentColor || params.get("accent"));
    render();
  }
  window.renderNexusData = renderNexusData;

  function render() {
    const ps = data.profiles || [];
    document.getElementById("profiles").innerHTML = ps.length ? ps.map(function (p) {
      return '<div class="item profile-item"><div class="avatar">' + avatarHTML(p) + '</div>' +
        '<div><b>' + esc(p.name) + '</b><div class="muted">' + esc(p.id) + '</div>' +
        (p.id === data.activeProfileId ? '<div class="active-badge">Активный профиль</div>' : "") +
        '<div class="actions" style="margin-top:8px">' +
          '<button onclick="window.__nexus_switchProfile(\'' + esc(p.id) + '\')">Выбрать</button>' +
          (ps.length > 1 ? '<button class="danger" onclick="window.__nexus_removeProfile(\'' + esc(p.id) + '\')">Удалить</button>' : "") +
        '</div></div></div>';
    }).join("") : '<div class="muted">Профилей нет. Сбрось данные или создай профиль при первом запуске.</div>';

    const active = data.activeProfileId || ((ps[0] || {}).id) || null;
    const entries = (data.passwords || []).filter(function (x) { return x.profileId === active; });
    document.getElementById("passwords").innerHTML = entries.length ? entries.map(function (x) {
      return '<div class="item"><b>' + esc(x.site) + '</b>' +
        '<div>' + esc(x.username) + '</div>' +
        '<div class="password">' + esc(x.password) + '</div>' +
        '<div class="muted">' + esc(x.note || "") + '</div>' +
        '<div class="actions"><button onclick="window.__nexus_removePassword(\'' + esc(x.id) + '\')">Удалить</button></div></div>';
    }).join("") : '<div class="muted">Паролей нет</div>';
  }

  let selectedProfileCustomAvatar = "";
  document.getElementById("profileFile").addEventListener("change", function () {
    const file = document.getElementById("profileFile").files && document.getElementById("profileFile").files[0];
    if (!file) { selectedProfileCustomAvatar = ""; return; }
    const r = new FileReader();
    r.onload = function () { selectedProfileCustomAvatar = String(r.result || ""); };
    r.readAsDataURL(file);
  });

  function go(action, payload) {
    location.href = "nexus://profile-action?action=" + encodeURIComponent(action) + "&payload=" + encodeURIComponent(JSON.stringify(payload || {}));
  }

  document.getElementById("addProfileBtn").onclick = function () {
    const name = document.getElementById("profileName").value.trim();
    if (!name) return;
    go("add-profile", {
      name: name,
      avatar: selectedProfileCustomAvatar ? "custom" : document.getElementById("profileAvatar").value,
      customAvatar: selectedProfileCustomAvatar
    });
  };
  document.getElementById("addPasswordBtn").onclick = function () {
    if (!document.getElementById("site").value.trim() ||
        !document.getElementById("username").value.trim() ||
        !document.getElementById("password").value) return;
    go("add-password", {
      site: document.getElementById("site").value.trim(),
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value,
      note: document.getElementById("note").value.trim()
    });
  };
  document.getElementById("exportCsvBtn").onclick = function () { go("export-passwords", { type: "csv" }); };
  document.getElementById("exportJsonBtn").onclick = function () { go("export-passwords", { type: "json" }); };
  document.getElementById("settingsBtn").onclick = function () { location.href = "nexus://settings"; };

  window.__nexus_switchProfile = function (id) { go("switch-profile", { id: id }); };
  window.__nexus_removeProfile = function (id) {
    if (confirm("Удалить профиль и его пароли? Cookies и storage профиля будут очищены.")) {
      go("remove-profile", { id: id });
    }
  };
  window.__nexus_removePassword = function (id) { go("remove-password", { id: id }); };

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
})();
