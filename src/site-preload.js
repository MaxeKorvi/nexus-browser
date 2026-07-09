"use strict";

const { ipcRenderer } = require("electron");

function isWebPage() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function installBrowserCompatibilityPatch() {
  if (!isWebPage()) return;

  const script = document.createElement("script");
  script.textContent = `(() => {
    try {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    } catch (_) {}
    try {
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.app = window.chrome.app || { isInstalled: false };
    } catch (_) {}
    try {
      const ua = navigator.userAgent || "";
      if (/Electron\//i.test(ua)) {
        Object.defineProperty(Navigator.prototype, "userAgent", {
          get: () => ua.replace(/\\sElectron\\/[^\\s]+/i, ""),
          configurable: true
        });
      }
    } catch (_) {}
  })();`;
  (document.documentElement || document).appendChild(script);
  script.remove();
}

function visible(el) {
  if (!el || el.disabled || el.readOnly) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function textScore(input) {
  const hay = [input.name, input.id, input.autocomplete, input.placeholder, input.getAttribute("aria-label")]
    .join(" ").toLowerCase();
  let score = 0;
  if (/user|login|email|mail|account|phone|телефон|почта|логин|аккаунт/.test(hay)) score += 7;
  if (/name|identifier|auth|учет|учёт/.test(hay)) score += 3;
  if (/search|query|find|поиск/.test(hay)) score -= 12;
  return score;
}

function fieldsForPassword(passwordInput) {
  const form = passwordInput.form || passwordInput.closest("form") || document;
  const candidates = Array.from(form.querySelectorAll("input"))
    .filter(visible)
    .filter(input => input !== passwordInput)
    .filter(input => {
      const type = String(input.type || "text").toLowerCase();
      return ["text", "email", "tel", "number", "search", "url", ""].includes(type);
    })
    .map(input => {
      const a = input.getBoundingClientRect();
      const b = passwordInput.getBoundingClientRect();
      const distance = Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2);
      return { input, score: textScore(input) - distance / 90 };
    })
    .sort((a, b) => b.score - a.score);

  const usernameInput = candidates.length ? candidates[0].input : null;
  return { form, usernameInput, passwordInput };
}

function findLoginFields() {
  const passwords = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);
  if (!passwords.length) return null;
  const passwordInput = passwords.find(input => !/new|confirm|repeat|again|нов|повтор|подтверж/i.test([input.name, input.id, input.autocomplete, input.placeholder].join(" "))) || passwords[0];
  return fieldsForPassword(passwordInput);
}

function currentCandidate() {
  if (!isWebPage()) return null;
  const found = findLoginFields();
  if (!found) return null;
  const username = found.usernameInput ? String(found.usernameInput.value || "").trim() : "";
  const password = String(found.passwordInput.value || "");
  if (!username || !password) return null;
  return {
    origin: location.origin,
    href: location.href,
    title: document.title || "",
    username,
    password
  };
}

let lastSent = "";
function reportCandidateSoon() {
  setTimeout(() => {
    const data = currentCandidate();
    if (!data) return;
    const sig = data.origin + "|" + data.username + "|" + data.password;
    if (sig === lastSent) return;
    lastSent = sig;
    ipcRenderer.send("passwords:candidate", data);
  }, 160);
}

async function autofillSavedPassword() {
  if (!isWebPage()) return;
  const found = findLoginFields();
  if (!found) return;

  let entries = [];
  try {
    entries = await ipcRenderer.invoke("passwords:find", { origin: location.origin, href: location.href });
  } catch (_) {
    entries = [];
  }
  if (!Array.isArray(entries) || !entries.length) return;

  const saved = entries[0];
  if (!saved || !saved.username || !saved.password) return;

  if (found.usernameInput && !found.usernameInput.value) {
    found.usernameInput.value = saved.username;
    found.usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
    found.usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (!found.passwordInput.value) {
    found.passwordInput.value = saved.password;
    found.passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    found.passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function notifyMainPointerActivity() {
  try { ipcRenderer.send("menu:close"); } catch (_) {}
}

function installMenuAutoCloseWatcher() {
  if (!isWebPage()) return;
  document.addEventListener("pointerdown", notifyMainPointerActivity, true);
  document.addEventListener("wheel", notifyMainPointerActivity, { capture: true, passive: true });
}

function installPasswordWatcher() {
  if (!isWebPage()) return;

  const boot = () => {
    setTimeout(autofillSavedPassword, 300);
    setTimeout(autofillSavedPassword, 1100);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  document.addEventListener("submit", (event) => {
    const found = findLoginFields();
    if (found && (event.target === found.form || found.form.contains(event.target))) reportCandidateSoon();
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target && event.target.closest ? event.target.closest('button,input[type="submit"],[role="button"],a') : null;
    if (!target) return;
    const label = [target.textContent, target.value, target.getAttribute("aria-label"), target.title].join(" ").toLowerCase();
    if (/sign|login|log in|submit|continue|next|войти|вход|продолжить|далее|отправить/.test(label)) reportCandidateSoon();
  }, true);

  window.addEventListener("beforeunload", () => {
    const data = currentCandidate();
    if (data) ipcRenderer.send("passwords:candidate", data);
  });

  const mo = new MutationObserver(() => {
    clearTimeout(mo._t);
    mo._t = setTimeout(autofillSavedPassword, 350);
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
}

installBrowserCompatibilityPatch();
installMenuAutoCloseWatcher();
installPasswordWatcher();
