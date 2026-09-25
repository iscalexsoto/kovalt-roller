#!/usr/bin/env bash
# Arranca Auth, Firestore y RTDB en local con el proyecto de demostración.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
exec firebase emulators:start --project demo-kovalt --only auth,firestore,database
