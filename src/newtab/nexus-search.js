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
  const SELF = "nexus-search.html";
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme") || "dark";
  const query = params.get("q") || "";
  const section = params.get("section") || "all";

  document.body.dataset.theme = theme;
  document.body.dataset.section = section;
  applyPageAccent(params.get("accent"));
  document.getElementById("q").value = query;

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (m) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[m];
    });
  }
  function tokens(text) {
    return (String(text || "").toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) || []);
  }
  function highlight(text, ts) {
    let out = esc(text || "");
    for (const t of ts.filter(Boolean).slice(0, 8)) {
      const safe = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp("(" + safe + ")", "gi"), "<mark>$1</mark>");
    }
    return out;
  }
  function setActiveTab() {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.section === section);
    });
  }
  function resultCard(r, ts) {
    return '<a class="result" href="' + esc(r.url) + '">' +
      '<div class="fav">' + (r.favicon ? '<img src="' + esc(r.favicon) + '">' : "N") + '</div>' +
      '<div class="content"><h3>' + highlight(r.title || r.url, ts) + '</h3>' +
      '<p>' + highlight(r.snippet || r.description || "", ts) + '</p>' +
      '<div class="url">' + esc(r.url) + '</div></div></a>';
  }
  function mediaCard(r, ts) {
    const img = r.image || r.favicon || "";
    return '<a class="media-card" href="' + esc(r.url) + '">' +
      (img ? '<img class="media-thumb" src="' + esc(img) + '" loading="lazy">' : '<div class="media-thumb"></div>') +
      '<div class="media-body"><div class="media-title">' + highlight(r.title || r.url, ts) + '</div>' +
      '<div class="media-source">' + esc(r.domain || r.url) + '</div></div></a>';
  }
  function videoCard(r, ts) {
    const img = r.image || r.favicon || "";
    return '<a class="video-card" href="' + esc(r.url) + '">' +
      '<div class="thumb-wrap">' + (img ? '<img class="video-thumb" src="' + esc(img) + '" loading="lazy">' : '<div class="video-thumb"></div>') +
      '<div class="play">▶</div></div>' +
      '<div><h3>' + highlight(r.title || r.url, ts) + '</h3>' +
      '<p>' + highlight(r.snippet || r.description || "", ts) + '</p>' +
      '<div class="url">' + esc(r.domain || r.url) + '</div></div></a>';
  }
  function renderEntity(data, arr) {
    const e = data.entity || null;
    if (!e) return "";
    const imgs = (e.images && e.images.length ? e.images : arr.map(function (x) { return x.image; }).filter(Boolean)).slice(0, 4);
    return '<section class="entity"><div><h1>' + esc(e.title || query) + '</h1>' +
      '<p>' + esc(e.content || e.description || "Краткая карточка по запросу.") + '</p>' +
      (e.url ? '<div class="url">' + esc(e.url) + '</div>' : "") + '</div>' +
      '<div class="entity-imgs">' + imgs.map(function (src) { return '<img src="' + esc(src) + '" loading="lazy">'; }).join("") + '</div></section>';
  }
  async function run() {
    setActiveTab();
    const ts = tokens(query);
    const summary = document.getElementById("summary");
    const results = document.getElementById("results");
    if (!query) {
      summary.textContent = "Введите запрос";
      results.innerHTML = '<div class="empty">Начни поиск или выбери раздел.</div>';
      return;
    }
    summary.textContent = "Ищем результаты...";
    try {
      const res = await fetch(API + "/api/search?q=" + encodeURIComponent(query) + "&section=" + encodeURIComponent(section) + "&limit=48");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Search error");
      const arr = data.results || [];
      summary.textContent = "Nexus Search · раздел: " + label(section) + " · результатов: " + arr.length;
      let html = "";
      if (data.answers && data.answers.length) {
        const answerClass = ["all", "news", "shopping"].includes(section) ? "answer-strip" : "empty";
        html += '<div class="' + answerClass + '">' + data.answers.map(esc).join("<br>") + '</div>';
      }
      if (section === "images") {
        html += arr.length ? '<div class="media-grid">' + arr.map(function (r) { return mediaCard(r, ts); }).join("") + '</div>' : '<div class="empty">Картинок не найдено.</div>';
      } else if (section === "videos") {
        html += arr.length ? '<div class="video-grid">' + arr.map(function (r) { return videoCard(r, ts); }).join("") + '</div>' : '<div class="empty">Видео не найдено.</div>';
      } else {
        html += arr.length ? arr.map(function (r) { return resultCard(r, ts); }).join("") : '<div class="empty">Ничего не найдено. Попробуй изменить запрос.</div>';
      }
      results.innerHTML = html;
    } catch (e) {
      summary.textContent = "Ошибка поиска: " + e.message;
      results.innerHTML = '<div class="empty">Поисковик не ответил. Проверь, запущен ли Nexus Search.</div>';
    }
  }
  function label(s) {
    return { all:"Все", images:"Картинки", videos:"Видео", shopping:"Покупки", news:"Новости" }[s] || "Все";
  }
  function openVisual(url) {
    location.href = "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(url);
  }
  async function fileToDataUrl(file) {
    return await new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  document.getElementById("photoBtn").onclick = function () {
    document.getElementById("photoModal").classList.add("open");
  };
  document.getElementById("closePhotoBtn").onclick = function () {
    document.getElementById("photoModal").classList.remove("open");
  };
  document.getElementById("photoModal").addEventListener("click", function (e) {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });
  document.getElementById("searchImageBtn").onclick = async function () {
    const photoStatus = document.getElementById("photoStatus");
    photoStatus.textContent = "";
    try {
      let url = document.getElementById("imageUrl").value.trim();
      const file = document.getElementById("imageFile").files && document.getElementById("imageFile").files[0];
      if (file) {
        photoStatus.textContent = "Сохраняю фото локально...";
        const dataUrl = await fileToDataUrl(file);
        const r = await fetch(API + "/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, dataUrl: dataUrl })
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "upload error");
        url = j.url;
      }
      if (!url) throw new Error("Выбери файл или вставь ссылку.");
      openVisual(url);
    } catch (e) {
      photoStatus.textContent = "Ошибка: " + e.message;
    }
  };

  document.getElementById("form").addEventListener("submit", function (e) {
    e.preventDefault();
    const v = document.getElementById("q").value.trim();
    if (!v) return;
    if (/^[\w.-]+\.[a-zа-я]{2,}([/:?#].*)?$/i.test(v) && !/\s/.test(v)) {
      location.href = "https://" + v;
    } else {
      location.href = SELF + "?theme=" + theme + "&accent=" + encodeURIComponent(params.get("accent") || "") + "&q=" + encodeURIComponent(v) + "&section=" + section + "&v=" + Date.now();
    }
  });
  document.getElementById("tabs").addEventListener("click", function (e) {
    const t = e.target.closest(".tab");
    if (!t) return;
    location.href = SELF + "?theme=" + theme + "&accent=" + encodeURIComponent(params.get("accent") || "") + "&q=" + encodeURIComponent(document.getElementById("q").value.trim()) + "&section=" + t.dataset.section + "&v=" + Date.now();
  });

  run();
})();
