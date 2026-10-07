#!/bin/sh
# Installs the brain CLI (npm link) and registers the brain plugin marketplace in Claude Code.
set -eu
cd "$(dirname "$0")"

command -v git >/dev/null 2>&1 || { echo "Fehler: git fehlt." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Fehler: Node.js fehlt (benötigt ≥ 24)." >&2; exit 1; }
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || { echo "Fehler: Node.js $major gefunden, benötigt ≥ 24." >&2; exit 1; }

npm --prefix scripts install
npm --prefix scripts link

if command -v claude >/dev/null 2>&1; then
    claude plugin marketplace add chrisb88/brain \
        || echo "Hinweis: Marketplace brain ist bereits registriert oder nicht erreichbar."
else
    echo "Hinweis: claude nicht gefunden – später ausführen: claude plugin marketplace add chrisb88/brain"
fi

command -v qmd >/dev/null 2>&1 \
    || echo "Hinweis: qmd fehlt – npm install -g @tobilu/qmd (oder ohne qmd: export BRAIN_SEARCH=off)"

echo "Fertig: brain $(brain --version 2>/dev/null || echo '– nicht im PATH, npm-Prefix prüfen')"
