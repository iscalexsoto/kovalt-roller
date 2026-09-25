#!/usr/bin/env bash
# Entorno de desarrollo en Windows (Git Bash): Node y JDK 21 para los emuladores de Firebase.
# El Firebase CLI es local (firebase/tests/node_modules/.bin), no hace falta instalarlo global.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$ROOT/firebase/tests/node_modules/.bin:/c/Program Files/nodejs:$PATH"
JDK=$(ls -d /c/Program\ Files/Microsoft/jdk-21* /c/Program\ Files/Java/jdk-21* /c/Program\ Files/Eclipse\ Adoptium/jdk-21* 2>/dev/null | head -1 || true)
if [ -n "$JDK" ]; then
  export JAVA_HOME="$JDK"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
# Evita "Unable to establish loopback connection" del JDK en Windows.
mkdir -p /c/Temp/jdk-uds
export JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk-uds'
