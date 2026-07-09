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

  let items = [];

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[m];
    });
  }
  function formatTime(ts) { try { return new Date(ts).toLocaleString("ru-RU"); } catch (e) { return ""; } }
  function size(n) {
    if (!n) return "0 Б";
    const u = ["Б", "КБ", "МБ", "ГБ"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + " " + u[i];
  }

  function statusText(i) {
    const received = Number(i.receivedBytes || 0), total = Number(i.totalBytes || 0);
    const pct = total ? Math.max(0, Math.min(100, Math.round(received / total * 100))) : null;
    if (i.state === "progressing") return "Загрузка" + (pct !== null ? " · " + pct + "%" : "") + " · " + size(received) + (total ? " / " + size(total) : "");
    if (i.state === "completed") return "Готово · " + size(received || total);
    if (i.state === "cancelled") return "Отменено";
    if (i.state === "interrupted") return "Прервано";
    return i.state || "Готово";
  }
  function progressHTML(i) {
    const total = Number(i.totalBytes || 0);
    if (i.state !== "progressing" || !total) return "";
    const pct = Math.max(0, Math.min(100, Math.round(Number(i.receivedBytes || 0) / total * 100)));
    return '<div class="progress"><div class="bar" style="width:' + pct + '%"></div></div>';
  }

  function renderNexusData(data) { items = data.downloads || []; render(); }
  window.renderNexusData = renderNexusData;

  function render() {
    const list = document.getElementById("list");
    if (!items.length) { list.innerHTML = '<div class="empty">Загрузок пока нет</div>'; return; }
    list.innerHTML = items.map(function (i) {
      const canCancel = i.state === "progressing" && i.canCancel !== false;
      const cancel = canCancel ? '<button class="small danger" data-cancel="' + esc(i.id) + '">Отменить</button>' : "";
      return '<div class="card"><div class="favicon">↓</div>' +
        '<div class="content"><div class="title">' + esc(i.filename) + '</div>' +
        '<div class="url">' + esc(i.savePath) + '</div>' +
        '<div class="meta">' + esc(statusText(i)) + " · " + formatTime(i.startedAt) + '</div>' +
        progressHTML(i) + '</div>' +
        '<div class="row-actions">' +
          '<button class="small" data-open="' + encodeURIComponent(i.savePath || "") + '">Открыть</button>' +
          '<button class="small" data-show="' + encodeURIComponent(i.savePath || "") + '">В папке</button>' +
          cancel +
        '</div></div>';
    }).join("");
  }

  document.getElementById("clearBtn").onclick = function () {
    window.nexus && window.nexus.clearDownloads && window.nexus.clearDownloads();
  };
  document.addEventListener("click", function (event) {
    const open = event.target.closest("[data-open]");
    if (open) { window.nexus && window.nexus.openDownload && window.nexus.openDownload(decodeURIComponent(open.dataset.open || "")); return; }
    const show = event.target.closest("[data-show]");
    if (show) { window.nexus && window.nexus.showDownload && window.nexus.showDownload(decodeURIComponent(show.dataset.show || "")); return; }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) { window.nexus && window.nexus.cancelDownload && window.nexus.cancelDownload(cancel.dataset.cancel || ""); }
  });

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
