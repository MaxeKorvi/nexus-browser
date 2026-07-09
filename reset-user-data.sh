#!/usr/bin/env bash
set -e

echo "Закрой Nexus перед сбросом."
echo "Удаляю локальные данные Nexus..."

rm -rf "$HOME/.config/Nexus"
rm -rf "$HOME/.config/nexus-browser"
rm -rf "$HOME/.config/nexus"
rm -rf "$HOME/.config/nexus-browser-browser"

echo "Готово. При следующем запуске Nexus снова попросит создать пользователя."
