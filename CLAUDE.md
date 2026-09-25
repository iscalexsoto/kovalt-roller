# Kovalt Roller

Mesa virtual para jugar **Roll For Shoes** por salas. Motor de reglas en Rust, app Flutter **solo para Windows** y
backend Firebase (Auth, Firestore y Realtime Database). Setup, comandos y estructura: [README.md](README.md). Reglas
de juego implementadas: [docs/rules.md](docs/rules.md).

## Git (obligatorio)

- Rama `main`, remoto `https://github.com/iscalexsoto/kovalt-roller.git`.
- Autor: `iscalexsoto <iscalexsoto@gmail.com>` (configurar `git config user.name/user.email` en el clon).
- **Nunca** añadir `Co-Authored-By`, ni mencionar a Claude, IA o agentes en commits, PRs ni mensajes.
- Commits pequeños y frecuentes, en español y con formato convencional (`feat(app): …`, `fix(engine): …`), y
  `git push origin main` después de cada uno.
- `dist/` (ejecutables) no se sube.

## Arquitectura

- `crates/r4s_engine`: lógica pura, sin I/O. Es la **fuente de verdad** de las reglas: dados, resolución, avance
  (skills, XP, slots) y la máquina de estados de tiradas (`roll_flow.rs`).
- `app/rust`: crate puente de flutter_rust_bridge 2.13.0, con DTOs planos (structs y enums sin datos, para no
  depender de `freezed`). Tras cambiar `app/rust/src/api`, ejecutar `flutter_rust_bridge_codegen generate` en `app/`.
- `firebase/firestore.rules` y `database.rules.json` **replican** las invariantes del motor en el servidor. Si cambia
  una regla de juego, hay que cambiar motor, reglas y tests a la vez.
- App: Riverpod 3 + go_router. Repositorios en `app/lib/src/data`, pantallas en `app/lib/src/features`.
- Cada paso de una tirada es `rollTransition` (Rust) → `rollFields` (mapeo a Firestore). El historial en
  Firestore guarda el uid en `por`; el motor trabaja con `Actor` (dm/owner/other).

## Decisiones de diseño

- **Autenticación:** el DM se registra con email y contraseña. Los jugadores pueden entrar anónimos y convertirse en
  cuenta después, conservando el uid.
- **Ajustes por sala:** `skillSlots` (por defecto 5), `tieWinner` (por defecto gana el jugador), `xpSameRoll` (por
  defecto sí) y `maxDice` (10).
- **Do Anything 1:** permanente, no ocupa slot y no se puede reemplazar.
- **XP:** 1 XP convierte un dado en 6, solo para avanzar, nunca para cambiar el resultado.
- **Flujo de tirada:** declarada →(DM) aprobada → oposicion → tirada → resuelta.
  - Desde declarada, el DM también puede hacer contraoferta (proponer otra skill), rechazar o resolver sin tirada.
  - Tras contraoferta o rechazo, el jugador vuelve a declarar o retira.
  - La oposición la tira el DM antes que el jugador y es visible para él.
  - "Sin tirada" termina en resuelta con narración y sin XP.
- **Inventario:**
  - El catálogo es privado del DM, que entrega copias a los personajes.
  - Cada inventario lo ven solo su dueño y el DM; el dueño solo cambia la cantidad (≥ 0).
  - El valor es un entero opcional.
- **Tiradas:** no se pueden borrar (las reglas lo prohíben).

## Firebase

- Proyecto real: **`kovalt-roller-db`**. La configuración web está en `app/lib/firebase_options.dart`; la `apiKey`
  es pública por diseño y el usuario aceptó dejarla en el repo.
- La app usa el proyecto real por defecto; los emuladores (`demo-kovalt`) solo con
  `--dart-define=USE_EMULATORS=true`.
- El usuario **no tiene Firebase CLI funcional**: publica las reglas pegándolas en la consola web. Cuando cambien
  las reglas, recuérdale publicarlas.
- Cualquier prueba contra el proyecto real crea datos: pide permiso antes. `real_project_smoke_test.dart` solo corre
  con `--dart-define=CONFIRM_REAL_PROJECT=kovalt-roller-db` y limpia lo que puede.

## Trampas de Windows (ya resueltas; no revertir)

- **`firebase_database`:** el plugin cierra el proceso. RTDB se usa por REST y SSE (`rtdb_rest.dart`) y la presencia
  va con latidos.
- **`linkWithCredential`:** falla. Se usa `accounts:update` por REST y luego `signOut` + `signIn`, porque fijar la
  contraseña revoca la sesión anónima.
- **Cambio de usuario en el mismo proceso:** Firestore conserva estado y el servidor deniega lecturas legítimas. Al
  cerrar sesión se ejecuta `AppConfig.resetFirestore` (terminate + clearPersistence).
- **Varias ventanas:**
  - Cada ventana toma una plaza con un **mutex con nombre de Windows** (`app/rust/src/api/instance.rs`); la plaza
    fija la app de Firebase, con su propia sesión y caché.
  - La app `[DEFAULT]` debe inicializarse siempre, porque cloud_firestore la resuelve internamente.
  - Los bloqueos de archivo no sirven entre procesos lanzados desde la app de Claude.
  - Los tests multi-app **en un mismo proceso** no detectan fallos de la app por defecto: usar
    `second_window_test.dart` con otra ventana abierta.
- **Firestore rules:** es fácil superar el límite de 1000 expresiones. Las ramas de `updateRoll` comprueban primero el
  par de estados.
- **Listeners de Firestore:** pueden emitir primero una instantánea vacía de caché; en tests de permisos, leer con
  `Source.server`.
- **SDK C++ de Firebase:** se descarga a mano en `C:\dev-sdks\` (`FIREBASE_CPP_SDK_DIR`, ver `scripts/env.sh`).
- **Instalaciones desde la app de Claude:** lo que se instala en `AppData` (p. ej. `npm -g`) queda virtualizado en la
  carpeta del paquete MSIX y el usuario no lo ve. Las herramientas globales las instala el usuario desde su terminal.

## Verificación

- Motor: `cargo test -p r4s_engine` y `cargo clippy -- -D warnings`.
- Reglas: `bash firebase/tests/run-emulators.sh`, con JDK 21 y Node; `scripts/env.sh` prepara el entorno.
- App: `cargo build -p rust_lib_kovalt_roller && cd app && flutter test`, más `flutter analyze` sin avisos.
- Integración en Windows, con `bash scripts/emulators.sh` corriendo: `game_flow_test`, `multi_window_test` y
  `second_window_test` (`--dart-define=USE_EMULATORS=true`).
- Ejecutable: `bash scripts/package.sh` → `dist/Kovalt Roller/`. Falla si el usuario tiene la app abierta.
- Formato: Rust y Dart a 120 columnas (`rustfmt.toml`; `formatter.page_width` en `analysis_options.yaml`).
