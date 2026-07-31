# Руководство по выпуску релиза

Этот документ описывает процесс подготовки и публикации нового релиза Nexus Browser.

---

## 📋 Чеклист перед релизом

### 1. Проверка кода

```bash
# Запустить все проверки
npm run build

# Должно успешно выполниться:
# - npm run check (синтаксис)
# - npm run lint (ESLint)
# - npm test (Jest тесты)
```

### 2. Обновление версий

Обновите версию в `package.json`:

```json
{
  "version": "6.0.0"  // Следующая версия
}
```

### 3. Обновление CHANGELOG.md

Добавьте новую запись в [CHANGELOG.md](CHANGELOG.md):

```markdown
## [6.0.0] - 2026-01-XX

### Добавлено
- ...

### Изменено
- ...

### Исправлено
- ...
```

### 4. Тестирование сборок

```bash
# Linux
npm run dist:linux

# Windows
npm run dist:win
npm run dist:win:portable
```

Проверьте, что:
- ✅ AppImage запускается
- ✅ Installer устанавливается
- ✅ Portable версия работает

### 5. Создание скриншотов (если были изменения UI)

Разместите скриншоты в `docs/screenshots/`:
- main.png
- search.png
- menu.png
- profiles.png
- passwords.png

---

## 🚀 Публикация релиза на GitHub

### Шаг 1: Создайте тег

```bash
git add .
git commit -m "chore: release v6.0.0"
git tag -a v6.0.0 -m "Release version 6.0.0"
git push origin --follow-tags
```

Или используйте npm:

```bash
npm version 6.0.0
```

### Шаг 2: Создайте Release на GitHub

1. Перейдите на https://github.com/MaxeKorvi/nexus-browser/releases
2. Нажмите **Draft a new release**
3. Выберите тег `v6.0.0`
4. Название: `Nexus Browser v6.0.0`
5. Описание: скопируйте из CHANGELOG.md

### Шаг 3: Прикрепите файлы

Загрузите следующие файлы:

- `Nexus Browser-6.0.0-linux.AppImage`
- `Nexus Browser-6.0.0-linux.tar.gz`
- `Nexus Browser-6.0.0-win-x64.exe`
- `Nexus Browser-6.0.0-win-portable.exe`

### Шаг 4: Опубликуйте релиз

Нажмите **Publish release**

---

## 📦 Обновление AUR пакета

### После публикации GitHub Release:

1. Обновите `PKGBUILD` в `packaging/aur/`:
   - Измените `pkgver` на новую версию
   - Обновите `sha256sums` (пересчитайте для нового архива)

2. Сгенерируйте новый `.SRCINFO`:

```bash
cd packaging/aur
makepkg --printsrcinfo > .SRCINFO
```

3. Отправьте изменения в AUR:

```bash
cd aur/nexus-browser
git add PKGBUILD .SRCINFO
git commit -m "Update to v6.0.0"
git push
```

---

## 📢 Анонсирование

После публикации:

1. Обновите README.md (если нужно)
2. Создайте пост в социальных сетях
3. Обновите сайт проекта (если есть)
4. Отправьте уведомление пользователям

---

## 🔧 Автоматизация через CI/CD

GitHub Actions автоматически:

- ✅ Запускает тесты при push в main
- ✅ Собирает Linux и Windows версии
- ✅ Загружает артефакты

Файлы конфигурации:
- `.github/workflows/ci.yml`

---

## 📝 Шаблоны коммитов

Используйте Conventional Commits:

```
feat: добавить экспорт паролей в CSV
fix: исправить утечку памяти при закрытии вкладок
docs: обновить README.md
chore: релиз v6.0.0
```

---

## ✅ Пост-релизная проверка

После публикации проверьте:

- [ ] Релиз отображается на GitHub
- [ ] Все файлы загружены
- [ ] AUR пакет обновлён
- [ ] CI/CD прошёл успешно
- [ ] Документация актуальна

---

**Готово! Релиз опубликован! 🎉**
