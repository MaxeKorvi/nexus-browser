# Nexus Browser

<div align="center">

<img src="src/assets/nexus-logo.svg" alt="Nexus Browser" width="180">

**Nexus Browser** — кастомный браузер на **Electron + Node.js** с собственным интерфейсом, вкладками, поиском, профилями, загрузками, историей, закладками и локальным менеджером паролей.

![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33.x-47848F?logo=electron)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js)
![License](https://img.shields.io/badge/license-MIT-green)
![CI/CD](https://github.com/MaxeKorvi/nexus-browser/workflows/CI%2FCD%20Pipeline/badge.svg)

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
  - локальное зашифрованное хранилище (AES-256-GCM).

- 👤 **Профили**
  - поддержка пользовательских профилей;
  - разделение пользовательских данных;
  - изоляция cookies и localStorage между профилями.

- 📥 **Загрузки**
  - просмотр активных и завершённых загрузок;
  - отмена загрузки;
  - отдельная страница загрузок.

- ⭐ **Закладки и история**
  - сохранение посещённых страниц;
  - управление закладками;
  - внутренние страницы браузера;
  - импорт/экспорт закладок в HTML.

- 🎨 **Glass-дизайн**
  - стеклянная строка поиска;
  - кастомные popup-меню;
  - blur-эффекты;
  - SVG-иконки;
  - тёмная/светлая темы.

- 📦 **Упаковка**
  - Arch/AUR package;
  - Windows EXE через `electron-builder`;
  - desktop-entry для Linux;
  - ярлык в меню приложений.

- 🔒 **Безопасность**
  - шифрование паролей AES-256-GCM через OS keyring;
  - отключены опасные Chrome флаги;
  - WebRTC не сливает локальный IP;
  - строгая Content Security Policy.

---

## 📸 Скриншоты

> Добавь сюда свои скриншоты после публикации проекта.

```markdown
![Main window](docs/screenshots/main.png)
![Search page](docs/screenshots/search.png)
![Menu](docs/screenshots/menu.png)
![Profiles](docs/screenshots/profiles.png)
![Passwords](docs/screenshots/passwords.png)
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

### Вариант 2: из AUR (после публикации)

```bash
paru -S nexus-browser
```

---

## 🪟 Установка на Windows

### Вариант 1: Installer

1. Скачайте `Nexus Browser-6.0.0-win-x64.exe` из [Releases](https://github.com/MaxeKorvi/nexus-browser/releases)
2. Запустите установщик
3. Следуйте инструкциям мастера установки

### Вариант 2: Portable версия

1. Скачайте `Nexus Browser-6.0.0-win-portable.exe`
2. Запустите без установки

---

## 🐧 Установка на Linux (AppImage)

1. Скачайте `Nexus Browser-6.0.0-linux.AppImage` из [Releases](https://github.com/MaxeKorvi/nexus-browser/releases)
2. Сделайте файл исполняемым:
   ```bash
   chmod +x "Nexus Browser-6.0.0-linux.AppImage"
   ```
3. Запустите:
   ```bash
   ./Nexus Browser-6.0.0-linux.AppImage
   ```

---

## 🛠️ Разработка

### Требования

- Node.js >= 18
- npm >= 9
- Git

### Установка зависимостей

```bash
npm install
```

### Запуск в режиме разработки

```bash
npm run dev
```

### Проверка кода

```bash
# Синтаксическая проверка
npm run check

# ESLint
npm run lint

# Prettier форматирование
npm run format

# Тесты
npm test
```

### Сборка дистрибутивов

```bash
# Linux AppImage и tar.gz
npm run dist:linux

# Windows installer
npm run dist:win

# Windows portable
npm run dist:win:portable
```

---

## 📁 Структура проекта

```
nexus-browser/
├── src/
│   ├── main.js              # Главный процесс Electron
│   ├── preload.js           # Preload скрипт
│   ├── site-preload.js      # Preload для сайтов
│   ├── ui/                  # UI браузера
│   │   ├── app.js
│   │   ├── index.html
│   │   └── styles.css
│   ├── internal/            # Внутренние страницы
│   │   ├── settings.*
│   │   ├── profiles.*
│   │   ├── downloads.*
│   │   └── history.*
│   ├── newtab/              # Новая вкладка
│   │   ├── newtab.*
│   │   └── nexus-search.*
│   └── search-engine/       # Поисковый движок
│       └── engine.js
├── packaging/               # Файлы для упаковки
│   ├── aur/                 # AUR пакет
│   ├── aur-local/           # Локальная сборка AUR
│   └── windows/             # Windows установщик
├── tests/                   # Тесты
│   └── main.test.js
├── docs/                    # Документация
│   └── screenshots/         # Скриншоты
├── build/                   # Ресурсы сборки
│   └── icons/               # Иконки
├── .github/workflows/       # CI/CD
│   └── ci.yml
├── package.json
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── SECURITY.md
```

---

## 🧪 Тестирование

Проект использует **Jest** для тестирования:

```bash
# Запустить все тесты
npm test

# Запустить с покрытием
npm run test:coverage

# Запустить в режиме watching
npm run test:watch
```

---

## 📝 Changelog

См. [CHANGELOG.md](CHANGELOG.md)

---

## 🤝 Вклад в проект

См. [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 🔒 Безопасность

См. [SECURITY.md](SECURITY.md)

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

## 📞 Контакты

- GitHub: [MaxeKorvi/nexus-browser](https://github.com/MaxeKorvi/nexus-browser)
- Issues: [Сообщить об ошибке](https://github.com/MaxeKorvi/nexus-browser/issues)

---

<div align="center">

**Nexus Browser**  
Свой браузер. Свой стиль. Свой поиск.

[![Changelog](https://img.shields.io/badge/changelog-v6.0.0-blue)](CHANGELOG.md)
[![Contributing](https://img.shields.io/badge/contributing-welcome-green)](CONTRIBUTING.md)
[![Security](https://img.shields.io/badge/security-policy-red)](SECURITY.md)

</div>
