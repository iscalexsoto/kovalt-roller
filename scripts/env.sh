#!/usr/bin/env bash
# Entorno de desarrollo en Windows (Git Bash): Node, Firebase CLI, JDK 21 y SDK C++ de Firebase.
export PATH="/c/Program Files/nodejs:$(cygpath "$APPDATA")/npm:$PATH"
JDK=$(ls -d /c/Program\ Files/Microsoft/jdk-21* 2>/dev/null | head -1 || true)
if [ -n "$JDK" ]; then
  export JAVA_HOME="$JDK"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
# Evita "Unable to establish loopback connection" del JDK en Windows.
mkdir -p /c/Temp/jdk-uds
export JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk-uds'
# SDK C++ de Firebase descargado a mano (la descarga automática de CMake falla a veces).
export FIREBASE_CPP_SDK_DIR="${FIREBASE_CPP_SDK_DIR:-C:/dev-sdks/firebase_cpp_sdk_13.12.0/firebase_cpp_sdk_windows}"
