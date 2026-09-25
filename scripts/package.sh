#!/usr/bin/env bash
# Compila la app en Release y la empaqueta en dist/:
#   dist/Kovalt Roller/Kovalt Roller.exe (+ DLL y datos)  y  dist/KovaltRoller-windows.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/env.sh"

cd "$ROOT/app"
flutter build windows --release

OUT="$ROOT/dist/Kovalt Roller"
rm -rf "$OUT" "$ROOT/dist/KovaltRoller-windows.zip"
mkdir -p "$OUT"
cp -r build/windows/x64/runner/Release/. "$OUT/"
mv "$OUT/kovalt_roller.exe" "$OUT/Kovalt Roller.exe"
# Restos de compilación que no se necesitan para ejecutar.
rm -f "$OUT"/*.lib "$OUT"/*.exp

# Runtime de Visual C++ junto al exe, para equipos que no lo tengan instalado.
for dll in msvcp140.dll vcruntime140.dll vcruntime140_1.dll; do
  [ -f "/c/Windows/System32/$dll" ] && cp "/c/Windows/System32/$dll" "$OUT/"
done

cd "$ROOT/dist"
powershell.exe -NoProfile -Command "Compress-Archive -Path 'Kovalt Roller' -DestinationPath 'KovaltRoller-windows.zip' -Force"
echo "Listo: $OUT/Kovalt Roller.exe"
