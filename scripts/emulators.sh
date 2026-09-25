#!/usr/bin/env bash
# Arranca Auth, Firestore y RTDB en local con el proyecto de demostración (UI en http://127.0.0.1:4000).
# Requiere `npm install` en firebase/tests (trae el Firebase CLI) y JDK 21.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
exec firebase emulators:start --project demo-kovalt --only auth,firestore,database
