# Nexus Browser

<div align="center">

<img src="src/assets/nexus-logo.svg" alt="Nexus Browser" width="180">

**Nexus Browser** — кастомный браузер на **Electron + Node.js** с собственным интерфейсом, вкладками, поиском, профилями, загрузками, историей, закладками и локальным менеджером паролей.

![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33.x-47848F?logo=electron)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ Возможности

- 🧭 **Кастомный интерфейс браузера**
  - вкладки;
  - адресная строка;
  - кнопки назад/вперёд/обновить;
  - меню браузера;
  - контекстное меню.

- 🔎 **Nexus Search**
  - своя новая вкладка;
  - поиск в стиле glass UI;
  - вкладки результатов: **Все**, **Новости**, **Покупки**;
  - оформление выдачи в стиле обычного поисковика.

- 🔐 **Менеджер паролей**
  - предложение сохранить пароль после входа на сайт;
  - обновление сохранённого пароля;
  - автоподстановка логина и пароля;
  - локальное зашифрованное хранилище.

- 👤 **Профили**
  - поддержка пользовательских профилей;
  - разделение пользовательских данных.

- 📥 **Загрузки**
  - просмотр активных и завершённых загрузок;
  - отмена загрузки;
  - отдельная страница загрузок.

- ⭐ **Закладки и история**
  - сохранение посещённых страниц;
  - управление закладками;
  - внутренние страницы браузера.

- 🎨 **Glass-дизайн**
  - стеклянная строка поиска;
  - кастомные popup-меню;
  - blur-эффекты;
  - SVG-иконки.

- 📦 **Упаковка**
  - Arch/AUR package;
  - Windows EXE через `electron-builder`;
  - desktop-entry для Linux;
  - ярлык в меню приложений.

---

## 📸 Скриншоты

> Добавь сюда свои скриншоты после публикации проекта.

```md
![Main window](docs/screenshots/main.png)
![Search page](docs/screenshots/search.png)
![Menu](docs/screenshots/menu.png)
```

---

## 📦 Установка на Arch / CachyOS / Manjaro

### Вариант 1: локальная установка из репозитория

```bash
sudo pacman -S --needed base-devel git
paru -S --needed electron33-bin

git clone https://github.com/MaxeKorvi/nexus-browser.git
cd nexus-browser/packaging/aur-local
makepkg -Csi
```

Запуск:

```bash
nexus-browser
```

После установки браузер появится в меню приложений как:

```text
Nexus Browser
```

---

### Вариант 2: установка из AUR

Когда пакет будет опубликован в AUR:

```bash
paru -S nexus-browser
```

`electron33-bin` подтянется автоматически как зависимость.

---

## 🪟 Сборка Windows EXE

### Требования

- Windows 10/11 или Linux с Wine;
- Node.js 22+;
- npm;
- интернет для скачивания Electron и зависимостей.

### Сборка на Windows

```powershell
npm install
npm run check
npm run dist:win
```

Готовый установщик появится в папке:

```text
release/
```

Обычно файл называется примерно так:

```text
Nexus Browser-6.0.0-win-x64.exe
```

### Portable-версия

```powershell
npm run dist:win:portable
```

---

## 🛠️ Запуск в режиме разработки

```bash
npm install
npm start
```

Проверка JavaScript-файлов:

```bash
npm run check
```

---

## 📁 Структура проекта

```text
nexus-browser/
├── src/
│   ├── main.js                  # Главный процесс Electron
│   ├── preload.js               # Preload для UI
│   ├── site-preload.js          # Preload для сайтов
│   ├── ui/                      # Основной интерфейс браузера
│   ├── newtab/                  # Новая вкладка и Nexus Search
│   ├── internal/                # Внутренние страницы браузера
│   ├── search-engine/           # Логика поиска
│   └── assets/                  # Логотипы и иконки
│
├── build/                       # Иконки и файлы для сборки
├── packaging/
│   ├── aur/                     # Файлы для публикации в AUR
│   ├── aur-local/               # Локальная сборка Arch-пакета
│   └── windows/                 # Инструкции для Windows
│
├── scripts/                     # Вспомогательные скрипты
├── package.json
└── package-lock.json
```

---

## 🔐 Где хранятся данные

Пользовательские данные браузера хранятся локально в директории профиля Electron.

На Linux обычно:

```text
~/.config/nexus-browser/
```

Там могут находиться:

```text
history.json
bookmarks.json
passwords.json
profiles.json
settings.json
```

Пароли сохраняются локально и шифруются средствами Electron/системного хранилища, если это доступно в окружении.

---

## 🧹 Сброс данных браузера

Если нужно сбросить профиль:

```bash
mv ~/.config/nexus-browser ~/.config/nexus-browser_backup
nexus-browser
```

Если нужно удалить данные полностью:

```bash
rm -rf ~/.config/nexus-browser
```

---

## 🌐 Сделать Nexus Browser браузером по умолчанию

```bash
xdg-settings set default-web-browser nexus-browser.desktop

xdg-mime default nexus-browser.desktop x-scheme-handler/http
xdg-mime default nexus-browser.desktop x-scheme-handler/https
xdg-mime default nexus-browser.desktop text/html
```

Проверка:

```bash
xdg-settings get default-web-browser
xdg-mime query default x-scheme-handler/http
xdg-mime query default x-scheme-handler/https
```

---

## 📦 Публикация в AUR

Файлы для AUR находятся здесь:

```text
packaging/aur/
```

Для публикации нужны:

```text
PKGBUILD
.SRCINFO
nexus-browser.sh
nexus-browser.desktop
nexus-browser.install
```

Перед публикацией нужно создать GitHub Release с архивом:

```text
nexus-browser-6.0.0.tar.gz
```

Release tag:

```text
v6.0.0
```

После публикации пользователи смогут установить браузер через:

```bash
paru -S nexus-browser
```

---

## ⚠️ Примечания

- Для Arch-пакета используется **Electron 33**, чтобы поведение браузера было стабильным и не ломалось из-за rolling-обновлений системного Electron.
- Некоторые сайты могут по-разному относиться к кастомным Electron-браузерам.
- Если Google показывает предупреждение о небезопасном браузере, это может быть связано с серверной политикой Google по отношению к нестандартным Chromium/Electron-клиентам.

---

## 🧪 Проверка после установки

```bash
which nexus-browser
nexus-browser
```

Проверка файлов установки:

```bash
ls -lah /usr/bin/nexus-browser
ls -lah /opt/nexus-browser
ls -lah /usr/share/applications/nexus-browser.desktop
```

---

## 🗑️ Удаление

```bash
sudo pacman -Rns nexus-browser
```

Если Electron 33 больше не нужен:

```bash
sudo pacman -Rns electron33-bin
```

Удаление пользовательских данных:

```bash
rm -rf ~/.config/nexus-browser
```

---

## 📄 Лицензия

Проект распространяется под лицензией **MIT**.

---

<div align="center">

**Nexus Browser**  
Свой браузер. Свой стиль. Свой поиск.

</div>
