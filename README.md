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

En una terminal, los emuladores (Auth, Firestore y RTDB con el proyecto `demo-kovalt`; UI en http://127.0.0.1:4000):

```bash
bash scripts/emulators.sh
```

En otra, la app (por defecto se conecta a los emuladores):

```bash
bash scripts/run-app.sh
```

Para probar con varios jugadores, abre varias instancias del ejecutable
`app/build/windows/x64/runner/Debug/kovalt_roller.exe`. Todas comparten la sesión de Firebase de Windows, así que usa
una instancia por usuario de Windows o prueba DM y jugador por turnos cerrando sesión.

Tras cambiar la API de `app/rust/src/api`, regenera los bindings:

```bash
cd app && flutter_rust_bridge_codegen generate
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

## Proyecto real de Firebase

Mientras no exista, la app usa el proyecto de demostración contra los emuladores. Para conectarla a uno real:

1. Crear el proyecto en la consola de Firebase y activar Authentication (Email/Password y Anónimo), Firestore y
   Realtime Database.
2. `flutterfire configure` (o copiar la configuración web en `_production` de `app/lib/firebase_options.dart`).
3. Desplegar reglas e índices: `firebase deploy --only firestore,database --project <id>`.
4. Compilar con `--dart-define=USE_EMULATORS=false`.

Nota: Firebase marca el soporte de Windows de FlutterFire como beta y no recomendado para producción.

### Limitaciones de FlutterFire en Windows (y cómo se esquivan)

- `firebase_database` cierra el proceso en cuanto hace cualquier operación. La app usa Realtime Database por su API
  REST (`app/lib/src/data/rtdb_rest.dart`: HTTP + Server-Sent Events). Como REST no tiene `onDisconnect`, la
  presencia funciona con latidos cada 20 s.
- `linkWithCredential` (convertir invitado en cuenta) falla con un error interno; se recurre a `accounts:update` de la
  API REST de Auth, que conserva el uid.
- Los listeners de Firestore pueden emitir primero una instantánea vacía de la caché local antes de que el servidor
  deniegue una lectura.

El test de integración `app/integration_test/game_flow_test.dart` juega una partida completa en Windows contra los
emuladores:

```bash
cd app && flutter test integration_test/game_flow_test.dart -d windows
```
