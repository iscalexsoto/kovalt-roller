#!/usr/bin/env bash
# Compila y lanza la app de Windows contra los emuladores.
set -euo pipefail
cd "$(dirname "$0")/../app"
source ../scripts/env.sh
flutter run -d windows "$@"
