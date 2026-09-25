#!/usr/bin/env bash
# Ejecuta los tests de reglas contra los emuladores (Git Bash en Windows).
set -euo pipefail
source "$(dirname "$0")/../../scripts/env.sh"
cd "$(dirname "$0")"
npm run emu:test
