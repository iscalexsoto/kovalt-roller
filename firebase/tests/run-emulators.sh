#!/usr/bin/env bash
# Ejecuta los tests de reglas contra los emuladores (Git Bash en Windows).
set -euo pipefail
export PATH="/c/Program Files/nodejs:$(cygpath "$APPDATA")/npm:$PATH"
if [ -d "/c/Program Files/Microsoft" ]; then
  JDK=$(ls -d /c/Program\ Files/Microsoft/jdk-21* 2>/dev/null | head -1 || true)
  [ -n "$JDK" ] && export JAVA_HOME="$JDK" && export PATH="$JAVA_HOME/bin:$PATH"
fi
# Evita el fallo "Unable to establish loopback connection" del JDK en Windows.
mkdir -p /c/Temp/jdk-uds
export JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk-uds'
cd "$(dirname "$0")"
npm run emu:test
