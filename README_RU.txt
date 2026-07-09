Nexus Browser v6.0 — SECURITY & UX OVERHAUL
==========================================

Полный пересмотр безопасности и UX. Список изменений относительно v5.8.7:

БЕЗОПАСНОСТЬ (критическое):
- Убраны флаги --no-sandbox, --ignore-certificate-errors, --allow-running-insecure-content, --disable-gpu-sandbox.
- webSecurity теперь true (раньше был false — критическая уязвимость same-origin).
- sandbox: true в BrowserView и в главном окне.
- Сертификаты: принимаем только self-signed для localhost, всё остальное — reject (раньше принимали все).
- Пароли теперь шифруются через AES-256-GCM (safeStorage / OS keyring, fallback на machine-derived PBKDF2).
- Профили ИЗОЛИРОВАНЫ: каждый профиль получает свой persist:profile-<id>. Cookies, localStorage, cache — раздельные.
- Удаление профиля очищает его partition.
- CORS на локальном поисковом сервере: только file:// и null origin (раньше был * — любой сайт мог читать историю).
- Заменён hardcoded публичный IP 45.151.30.106 → 127.0.0.1 во всех HTML/CSP/JS.
- DevTools включаются только в dev-режиме (NEXUS_DEV=1).
- Permission handler: камера/микро/гео/внешние ссылки — через диалог.
- Do Not Track + Sec-GPC заголовки.
- Block insecure mixed content (HTTPS-страницы не грузят http://-ресурсы).
- WebRTC IP leak protection (force-webrtc-ip-handling-policy=disable_non_proxied_udp).
- Внешние протоколы (mailto:, tel:, magnet:) открываются через системный обработчик, не в новой вкладке.

НОВыЕ ФУНКЦИИ:
- Find in Page (Ctrl+F) с UI-баром и подсветкой.
- Zoom (Ctrl+Plus / Ctrl+- / Ctrl+0) с индикатором масштаба.
- Reopen closed tab (Ctrl+Shift+T), до 50 закрытых.
- Tab cycling: Ctrl+Tab, Ctrl+Shift+Tab.
- Переключение вкладок по индексу: Ctrl+1..9.
- Печать (Ctrl+P) и Сохранить страницу (Ctrl+S).
- Фокус на адресную строку: Ctrl+L.
- Alt+F / Alt+Left / Alt+Right — меню / назад / вперёд.
- Кастомное Nexus-меню с blur-фоном (замена нативному Menu.popup в тулбаре).
- Реализован endpoint /api/upload-image (раньше был 404 → фотопоиск не работал).

UX / ДИЗАЙН:
- Прозрачный blur-эффект при клике ЛКМ — мягкий, glass-like, с радиальным градиентом акцентного цвета.
  Анимация 720ms, screen-blend, full-page overlay (z-index 2147483647).
- Кастомное Nexus-меню под дизайн браузера: стеклянное, с backdrop-filter blur(28px),
  акцентная подсветка пунктов, разделители с градиентом, клавиатурные сокращения в kbd-блоках.
- Find-bar с blur-фоном, плавной анимацией появления.
- Zoom-indicator — pill-форма с blur-фоном, появляется только когда zoom ≠ 100%.

РЕФАКТОРИНГ:
- Удалён дубль nova-search.html (legacy алиас оставлен только в main.js).
- newtab.html, nexus-search.html, search-settings.html, settings.html, profiles.html, downloads.html
  вынесены в отдельные .js/.css файлы (раньше инлайн-скрипты).
- Создан общий internal.css для внутренних страниц.
- main.js разбит логически на секции с комментариями.
- Per-tab debounce broadcastTimers (раньше глобальный — события вкладок глушили друг друга).
- Null-checks во всех местах, где view может быть null (showBrowserMenu, showNativeContextMenu).
- saveSession правильно считает activeId включая приватные вкладки (раньше ошибка → после рестарта активной становилась не та).

CSP:
- newtab, nexus-search: script-src 'self' (без unsafe-inline).
- search-settings: script-src 'self' (без unsafe-inline).
- settings, profiles, downloads: script-src 'self' (без unsafe-inline).
- history, bookmarks: оставлен 'unsafe-inline' для инлайн-скриптов (внутренние страницы, не загружают внешний контент — безопасно).

СБОРКА:
- package.json: engines, license, author, dev-скрипт.
- run.sh: убран --no-sandbox.
- reset-user-data.sh: без изменений.

ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ:
- При запуске на системах без SUID sandbox helper (старые контейнеры) Electron может потребовать NEXUS_DEV=1 или chrome-suid. Это нормально для sandboxed-режима.
- Пароли шифруются per-machine: бэкап passwords.json на другую машину не дешифруется (по design).
- История закрытых вкладок (closedTabHistory) хранится только в памяти, до 50 элементов, не персистится между сессиями.

ПРИОРИТЕТЫ ДЛЯ СЛЕДУЮЩЕЙ ВЕРСИИ:
- Site isolation по eTLD+1 (сейчас все вкладки одного профиля в одном процессе).
- Adblocker (uBlock-совместимый).
- Импорт профилей из Chrome/Firefox.
- Расширения Chrome (electron-browser-extensions).
- Auto-update через electron-updater.
- Reader mode + перевод страниц.
- WebDAV/Nextcloud синхронизация.
