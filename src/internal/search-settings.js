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

  const API = "http://45.151.30.106:17654";
  const params = new URLSearchParams(location.search);
  document.body.dataset.theme = params.get("theme") || "dark";
  applyPageAccent(params.get("accent"));

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[m];
    });
  }

  async function api(path, opts) {
    const r = await fetch(API + path, opts);
    return await r.json();
  }

  async function refresh() {
    try {
      const st = await api("/api/status");
      document.getElementById("status").innerHTML =
        "<b>" + st.pages + "</b> страниц · indexing: " + (st.indexing ? "да" : "нет") +
        " · API: 45.151.30.106:" + st.port + "<br>Источники: " + esc(JSON.stringify(st.bySource || {}));
      document.getElementById("manualSites").innerHTML = (st.manualSites || []).map(function (u) {
        return '<div class="item url">' + esc(u) + '</div>';
      }).join("") || '<div class="muted">Нет сайтов</div>';
      const pages = await api("/api/index/pages");
      document.getElementById("pages").innerHTML = (pages.pages || []).slice(0, 80).map(function (p) {
        return '<div class="item"><b>' + esc(p.title || p.url) + '</b>' +
          '<div class="url">' + esc(p.url) + '</div>' +
          '<div class="muted">' + esc(p.source) + " · " + esc(p.domain) + '</div></div>';
      }).join("") || '<div class="muted">Индекс пустой</div>';
    } catch (e) {
      document.getElementById("status").textContent = "API не отвечает: " + e.message;
    }
  }

  document.getElementById("rebuildBtn").onclick = function () {
    document.getElementById("status").textContent = "Переиндексация...";
    window.nexus && window.nexus.rebuildSearch && window.nexus.rebuildSearch();
    setTimeout(refresh, 800);
  };

  document.getElementById("clearBtn").onclick = async function () {
    if (!confirm("Очистить поисковый индекс? Быстрые сайты лаунчера останутся.")) return;
    window.nexus && window.nexus.clearSearchIndex && window.nexus.clearSearchIndex();
    setTimeout(refresh, 500);
  };

  document.getElementById("addSiteBtn").onclick = async function () {
    const payload = {
      url: document.getElementById("siteUrl").value,
      maxDepth: Number(document.getElementById("maxDepth").value),
      maxPages: Number(document.getElementById("maxPages").value),
      timeout: Number(document.getElementById("timeout").value),
      crawl: true
    };
    document.getElementById("crawlResult").textContent = "Индексация запущена...";
    try {
      const r = await api("/api/index/add-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      document.getElementById("crawlResult").textContent = "Готово. Проиндексировано: " + (r.result && r.result.indexed != null ? r.result.indexed : 0);
    } catch (e) {
      window.nexus && window.nexus.addSearchSite && window.nexus.addSearchSite(payload);
      document.getElementById("crawlResult").textContent = "Отправлено через браузер. Обнови статус через пару секунд.";
    }
    setTimeout(refresh, 1000);
  };

  document.getElementById("refreshBtn").onclick = refresh;

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

  refresh();
})();
