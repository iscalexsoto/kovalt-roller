# Kovalt Roller

Mesa virtual para jugar **Roll For Shoes** por salas.

- **Motor de reglas:** Rust (`crates/r4s_engine`), lógica pura y testeada.
- **App:** Flutter para Windows (`app/`). El motor se integra con flutter_rust_bridge (`app/rust`).
- **Backend:** Firebase Auth, Cloud Firestore (datos persistentes) y Realtime Database (presencia y espejo de membresía).
  Las Security Rules (`firebase/`) replican las invariantes del motor.

## Cómo se juega

1. Un usuario registrado crea una sala y es el DM. La sala tiene un código de 6 caracteres.
2. Los jugadores entran con el código (como invitados o con cuenta) y crean su personaje.
3. Cada acción pasa por el flujo de tirada: declarar → el DM aprueba → oposición → tirada → resuelta.

Las reglas concretas y las variantes de la casa están en [docs/rules.md](docs/rules.md).

## Estructura

```
crates/r4s_engine/   motor de reglas (Rust puro)
app/                 app Flutter (Windows)
app/rust/            crate puente para flutter_rust_bridge
firebase/            reglas de Firestore y RTDB, índices y tests de reglas
scripts/             utilidades de desarrollo (Git Bash)
assets/              ícono fuente (SVG)
tools/icongen/       genera el ícono de Windows y el PNG de la app desde el SVG
docs/rules.md        reglas implementadas
```

## Requisitos (Windows)

- Rust (stable) y Flutter con soporte para Windows (Visual Studio Build Tools con C++).
- `cargo install flutter_rust_bridge_codegen --version 2.13.0 --locked`
- Node LTS y Firebase CLI: `npm install -g firebase-tools`
- JDK 21 (lo exigen los emuladores de Firebase).
- SDK C++ de Firebase 13.12.0 descomprimido en `C:\dev-sdks\firebase_cpp_sdk_13.12.0\` (o `FIREBASE_CPP_SDK_DIR` apuntando a
  `firebase_cpp_sdk_windows`). CMake intenta descargarlo solo, pero la descarga suele cortarse:

```bash
curl --http1.1 -L --retry 10 -C - -o firebase_cpp_sdk_windows_13.12.0.zip https://dl.google.com/firebase/sdk/cpp/firebase_cpp_sdk_windows_13.12.0.zip
```

`scripts/env.sh` prepara el `PATH`, `JAVA_HOME`, `FIREBASE_CPP_SDK_DIR` y un arreglo para un fallo del JDK en Windows
(`Unable to establish loopback connection`).

## Desarrollo

La app usa por defecto el proyecto real **`kovalt-roller-db`**:

```bash
bash scripts/run-app.sh
```

Para desarrollar sin tocar datos reales, usa los emuladores (Auth, Firestore y RTDB con el proyecto `demo-kovalt`; UI
en http://127.0.0.1:4000). En una terminal:

```bash
bash scripts/emulators.sh
```

Y en otra:

```bash
bash scripts/run-app.sh --emu
```

Para probar con varios jugadores, abre varias instancias del ejecutable
`app/build/windows/x64/runner/Debug/kovalt_roller.exe`. Todas comparten la sesión de Firebase de Windows, así que usa
una instancia por usuario de Windows o prueba DM y jugador por turnos cerrando sesión.

Tras cambiar la API de `app/rust/src/api`, regenera los bindings:

```bash
cd app && flutter_rust_bridge_codegen generate
```

### Ícono

El ícono fuente es `assets/kovalt_roller_icon.svg`. Si cambia, regenera el `.ico` de Windows (16 a 256 px) y el PNG que usa
la app:

```bash
cargo run -p icongen -- assets/kovalt_roller_icon.svg app/windows/runner/resources/app_icon.ico app/assets/icon.png
```

## Tests

```bash
cargo test -p r4s_engine
```

```bash
cargo build -p rust_lib_kovalt_roller && cd app && flutter test
```

```bash
bash firebase/tests/run-emulators.sh
```

Partida completa en Windows contra los emuladores (se niega a correr contra el proyecto real):

```bash
cd app && flutter test integration_test/game_flow_test.dart -d windows --dart-define=USE_EMULATORS=true
```

## Proyecto de Firebase (`kovalt-roller-db`)

La configuración de la app web está en `app/lib/firebase_options.dart` (en Windows FlutterFire usa la de web). En la
consola deben estar activados:

- **Authentication:** proveedores Correo electrónico/contraseña y Anónimo.
- **Firestore Database** y **Realtime Database**.

Las reglas del repositorio hay que publicarlas cada vez que cambian:

- Con la consola: pegar `firebase/firestore.rules` en *Firestore Database → Reglas* y `firebase/database.rules.json`
  en *Realtime Database → Reglas*, y publicar.
- O con el CLI (instalado desde una terminal normal, no desde la app de Claude):
  `firebase deploy --only firestore,database`.

Las consultas de la app solo usan índices de un campo, que Firestore crea solo; `firebase/firestore.indexes.json`
queda para consultas futuras.

Nota: Firebase marca el soporte de Windows de FlutterFire como beta y no recomendado para producción.

### Limitaciones de FlutterFire en Windows (y cómo se esquivan)

- `firebase_database` cierra el proceso en cuanto hace cualquier operación. La app usa Realtime Database por su API
  REST (`app/lib/src/data/rtdb_rest.dart`: HTTP + Server-Sent Events). Como REST no tiene `onDisconnect`, la
  presencia funciona con latidos cada 20 s.
- `linkWithCredential` (convertir invitado en cuenta) falla con un error interno; se recurre a `accounts:update` de la
  API REST de Auth, que conserva el uid.
- Los listeners de Firestore pueden emitir primero una instantánea vacía de la caché local antes de que el servidor
  deniegue una lectura.
- Al cambiar de usuario en el mismo proceso, el cliente de Firestore conserva estado del usuario anterior y el servidor
  rechaza lecturas legítimas del nuevo. Al cerrar sesión la app reinicia Firestore y borra su caché
  (`AppConfig.resetFirestore`). Los emuladores no reproducen este fallo.
- Convertir un invitado en cuenta por REST revoca su sesión anónima: la app cierra sesión y vuelve a entrar con email.

Prueba de humo contra el proyecto real (crea dos cuentas `@example.com` y una sala, y lo borra al terminar salvo la
sala y sus tiradas, que las reglas no dejan borrar):

```bash
cd app && flutter test integration_test/real_project_smoke_test.dart -d windows --dart-define=CONFIRM_REAL_PROJECT=kovalt-roller-db
```

## Generar el ejecutable

```bash
bash scripts/package.sh
```

Deja la app lista en `dist/Kovalt Roller/Kovalt Roller.exe` (la carpeta entera es necesaria: DLL y `data/`) y un
`dist/KovaltRoller-windows.zip` para copiarla a otro equipo con Windows 10/11 x64. Incluye el runtime de Visual C++.
La carpeta `dist/` no se sube al repositorio.
