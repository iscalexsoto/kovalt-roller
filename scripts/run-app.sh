#!/usr/bin/env bash
# Compila y lanza la app de Windows.
#   bash scripts/run-app.sh        -> proyecto real (kovalt-roller-db)
#   bash scripts/run-app.sh --emu  -> emuladores locales (bash scripts/emulators.sh)
set -euo pipefail
cd "$(dirname "$0")/../app"
source ../scripts/env.sh
args=()
if [ "${1:-}" = "--emu" ]; then
  args+=(--dart-define=USE_EMULATORS=true)
  shift
fi
flutter run -d windows "${args[@]}" "$@"
