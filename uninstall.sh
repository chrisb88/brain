#!/bin/sh
# Removes the brain CLI (npm link) and, after confirmation, the qmd indexes of all brain knowledge folders.
# Never touches knowledge folders, repositories or Claude Code settings.
set -eu
cd "$(dirname "$0")"

yes=false
case "${1-}" in
    '') ;;
    --yes) yes=true ;;
    *) echo "Verwendung: ./uninstall.sh [--yes]" >&2; exit 1 ;;
esac

if command -v npm >/dev/null 2>&1; then
    npm rm -g brain-cli
    echo "CLI brain entfernt."
else
    echo "Hinweis: npm nicht gefunden – CLI brain nicht entfernt."
fi

# Same directories as qmd and the brain CLI use.
config="${QMD_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/qmd}"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/qmd"
files=$(find "$config" "$cache" -maxdepth 1 -type f -name 'brain-*' 2>/dev/null | sort)
if [ -z "$files" ]; then
    echo "Keine qmd-Indexe von brain gefunden."
else
    echo "qmd-Indexe von brain (Modelle und andere qmd-Indexe bleiben erhalten):"
    echo "$files" | sed 's/^/  - /'
    if [ "$yes" = false ] && [ -t 0 ]; then
        printf 'Löschen? [j/N] '
        read -r answer
        case "$answer" in j|J|ja|Ja|y|Y|yes) yes=true ;; esac
    fi
    if [ "$yes" = true ]; then
        echo "$files" | while IFS= read -r file; do rm -f "$file"; done
        echo "qmd-Indexe gelöscht."
    else
        echo "Nicht gelöscht – zum Löschen: ./uninstall.sh --yes"
    fi
fi

cat <<'EOF'
Plugin brain in Claude Code bleibt installiert. Entfernen:
  - pro Projekt im Repo-Root: claude plugin uninstall brain@brain --scope project
  - oder überall: claude plugin marketplace remove brain
    Achtung: entfernt den Eintrag brain@brain auch aus .claude/settings.json geteilter Projekte (Änderung an eingecheckten Dateien).
Wissens-Ordner und Repositories wurden nicht angefasst.
EOF
