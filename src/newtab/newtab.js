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

  const storageKey = "nexus.shortcuts.v1";
  function getShortcuts() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch (_) { return []; }
  }
  function saveShortcuts(items) { localStorage.setItem(storageKey, JSON.stringify(items)); }
  function fav(url) {
    try {
      const d = new URL(url).hostname;
      return "https://www.google.com/s2/favicons?sz=128&domain=" + d;
    } catch (_) { return ""; }
  }

  function renderShortcuts() {
    const items = getShortcuts();
    const shortcuts = document.getElementById("shortcuts");
    shortcuts.innerHTML = items.map(function (s, i) {
      return '<a class="shortcut" href="' + s.url + '">' +
        '<button class="remove" data-remove="' + i + '" type="button">×</button>' +
        '<div class="icon"><img src="' + fav(s.url) + '"></div>' +
        '<div class="label">' + (s.title || "") + '</div></a>';
    }).join("") +
      '<button class="shortcut" id="addShortcut" type="button"><div class="icon">＋</div><div class="label">Добавить</div></button>';

    document.querySelectorAll("[data-remove]").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        const arr = getShortcuts();
        arr.splice(Number(b.dataset.remove), 1);
        saveShortcuts(arr);
        renderShortcuts();
      };
    });

    document.getElementById("addShortcut").onclick = function () {
      document.getElementById("addModal").classList.add("open");
    };
  }
  renderShortcuts();

  document.getElementById("closeAdd").onclick = function () {
    document.getElementById("addModal").classList.remove("open");
  };
  document.getElementById("saveShortcut").onclick = function () {
    let title = document.getElementById("titleInput").value.trim();
    let url = document.getElementById("urlInput").value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!title) {
      try { title = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { title = url; }
    }
    const arr = getShortcuts();
    arr.push({ title: title, url: url });
    saveShortcuts(arr);
    document.getElementById("titleInput").value = "";
    document.getElementById("urlInput").value = "";
    document.getElementById("addModal").classList.remove("open");
    renderShortcuts();
  };

  async function fileToDataUrl(file) {
    return await new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function openVisual(url) {
    location.href = "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(url);
  }

  document.getElementById("photoBtn").onclick = function () {
    document.getElementById("photoModal").classList.add("open");
  };
  document.getElementById("closePhotoBtn").onclick = function () {
    document.getElementById("photoModal").classList.remove("open");
  };
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

  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal")) e.target.classList.remove("open");
  });

})();
