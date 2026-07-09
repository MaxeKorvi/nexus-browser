"use strict";

const api = window.nexus || window.nova;
const root = document.getElementById("menu");

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ICONS = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z"/><path d="M12 8v8"/></svg>',
  restore: '<svg viewBox="0 0 24 24"><path d="M4 7v6h6"/><path d="M5 13a7 7 0 1 0 2-6"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v10"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
  user: '<svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  'search-settings': '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/><path d="M9 7v6M7 10h6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.3 8 8 0 0 1-1.6.7 1.7 1.7 0 0 0-1.1 1.5V22H9v-.2a1.7 1.7 0 0 0-1.1-1.5 8 8 0 0 1-1.6-.7 1.7 1.7 0 0 0-1.9.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 2.6 15 8 8 0 0 1 2 13.3 1.7 1.7 0 0 0 .8 12H.6V8h.2A1.7 1.7 0 0 0 2 6.7 8 8 0 0 1 2.6 5a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9.3 8 8 0 0 1 1.6-.7A1.7 1.7 0 0 0 9 .8V.6h4v.2a1.7 1.7 0 0 0 1.1 1.5 8 8 0 0 1 1.6.7 1.7 1.7 0 0 0 1.9-.3l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 19.4 5 8 8 0 0 1 20 6.7 1.7 1.7 0 0 0 21.2 8h.2v4h-.2a1.7 1.7 0 0 0-1.2 1.3 8 8 0 0 1-.6 1.7z"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M21 16l-5-5L5 19"/></svg>',
  cut: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9"/><path d="M8.1 8.1L20 20"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><path d="M9 5h6"/><path d="M9 3h6v4H9z"/><path d="M7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/></svg>',
  'select-all': '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M2 8V4a2 2 0 0 1 2-2h4M16 2h4a2 2 0 0 1 2 2v4M22 16v4a2 2 0 0 1-2 2h-4M8 22H4a2 2 0 0 1-2-2v-4"/></svg>',
  'arrow-left': '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 12m16 0-2 5.5A7 7 0 0 1 5.5 15"/></svg>'
};

function iconMarkup(name) {
  const key = String(name || "").trim();
  if (ICONS[key]) return ICONS[key];
  return esc(key);
}

function setAccent(color) {
  if (/^#[0-9a-f]{6}$/i.test(String(color || ""))) {
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent2", color);
  }
}

function setBackdrop(dataUrl) {
  const value = String(dataUrl || "");
  if (value.startsWith("data:image/")) {
    root.style.setProperty("--popup-backdrop", "url(\"" + value.replace(/\"/g, "") + "\")");
    root.classList.remove("no-backdrop");
  } else {
    root.style.removeProperty("--popup-backdrop");
    root.classList.add("no-backdrop");
  }
}

function renderItem(item) {
  if (item.separator) return '<div class="separator" role="separator"></div>';
  if (item.type === "title") return `<div class="menu-title">${esc(item.label)}</div>`;
  if (item.type === "zoom") {
    return `<div class="zoom-row" role="group" aria-label="Масштаб">
      <div class="zoom-label">${esc(item.label || "Масштаб")}: ${esc(item.value || "100%")}</div>
      <button class="zoom-btn" data-action="zoom-out" title="Уменьшить">−</button>
      <button class="zoom-btn" data-action="zoom-reset" title="Сбросить">100</button>
      <button class="zoom-btn" data-action="zoom-in" title="Увеличить">＋</button>
    </div>`;
  }
  const disabled = item.enabled === false ? " disabled" : "";
  const shortcut = item.shortcut ? `<kbd>${esc(item.shortcut)}</kbd>` : "<span></span>";
  return `<button class="item" data-action="${esc(item.action)}" role="menuitem"${disabled}>
    <span class="icon">${iconMarkup(item.icon)}</span>
    <span class="label">${esc(item.label || "")}</span>
    ${shortcut}
  </button>`;
}

async function init() {
  try {
    const state = api && api.getMenuState ? await api.getMenuState() : null;
    if (!state || !Array.isArray(state.items)) return;
    setAccent(state.accent);
    setBackdrop(state.backdropDataUrl);
    root.innerHTML = state.items.map(renderItem).join("");
    const first = root.querySelector("button:not([disabled])");
    if (first) setTimeout(() => first.focus(), 30);
  } catch (_) {}
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  event.preventDefault();
  api && api.menuAction && api.menuAction(button.dataset.action || "");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    api && api.closeMenu && api.closeMenu();
    return;
  }

  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = Array.from(root.querySelectorAll("button:not([disabled])"));
  if (!buttons.length) return;
  const current = document.activeElement;
  const index = buttons.indexOf(current);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next = buttons[(index + step + buttons.length) % buttons.length] || buttons[0];
  next.focus();
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

init();
