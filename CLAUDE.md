# Kovalt Roller

Mesa virtual para jugar **Roll For Shoes** por salas, en el navegador (roller.kovalt.mx). Web React + Vite con Kovalt
Design, motor de reglas en TypeScript, backend Firebase (Auth con custom tokens, Firestore y Realtime Database) y un
Worker de Cloudflare que emite las sesiones. Setup, comandos y estructura: [README.md](README.md). Reglas de juego
implementadas: [docs/rules.md](docs/rules.md).

## Git (obligatorio)

- Rama `main`, remoto `git@github-iscalexsoto:iscalexsoto/kovalt-roller.git`.
- Autor: `iscalexsoto <iscalexsoto@gmail.com>` (configurar `git config user.name/user.email` en el clon).
- **Nunca** añadir `Co-Authored-By`, ni mencionar a Claude, IA o agentes en commits, PRs ni mensajes.
- Commits pequeños y frecuentes, en español y con formato convencional (`feat(web): …`, `fix(engine): …`,
  `feat(worker): …`), y `git push origin main` después de cada uno.

## Arquitectura

- `web/src/engine`: lógica pura, sin I/O. Es la **fuente de verdad** de las reglas: dados, resolución, avance (skills,
  XP, slots) y la máquina de estados de tiradas (`rollFlow.ts`). Viene de un motor en Rust y conserva sus tests
  (`rules`, `flow`, `properties` con fast-check).
- `firebase/firestore.rules` y `database.rules.json` **replican** las invariantes del motor en el servidor. Si cambia
  una regla de juego, hay que cambiar motor, reglas y tests a la vez.
- Cada paso de una tirada es `transition` (motor) → `rollFields` (`web/src/data/models.ts`, mapeo a Firestore). Los
  nombres de campo en español (`estado`, `historial{de,a,por}`, `tirada`, `avance`…) los exige `firestore.rules`. El
  historial guarda el uid en `por`; el motor trabaja con `Actor` (dm/owner/other).
- Repositorios en `web/src/data`, pantallas en `web/src/screens`, piezas de la sala en `web/src/components/room`.
- Presencia en RTDB con `onDisconnect`. RTDB lleva un espejo de la membresía (`roomAccess`, `members`) porque sus reglas
  no pueden leer Firestore.

## Kovalt Design

- Sistema de diseño de la suite: skill en `D:\Proyectos\Kovalt Design\kovalt-skill`. CSS plano con tokens `--kv-*`, sin
  Tailwind ni librerías de UI, formas Corte (`clip-path`) en lugar de `border-radius`, íconos Lucide (`GameIcon`).
- `web/src/styles/tokens.css`, `components.css` y `web/src/components/kv/*` son copia de **Kovalt Notes** (la versión
  más nueva). No se editan aquí: si la skill cambia, se copian de nuevo. Lo propio de Roller va en `app.css` con el
  prefijo `rl-`.
- `web/src/suite/suiteAuth.ts` es un archivo compartido de la suite: idéntico byte a byte al de las demás webs.
- Íconos: añadir la clave en `tools/icons/keys.json` y ejecutar `node tools/icons/build.mjs` (no editar `paths.ts`).
- Marca: La Piedra de Roller (un d6 que muestra cinco en la cara izquierda), masters en
  `kovalt-skill/assets/brand/roller*.svg`; `node tools/brand/render.mjs --install` regenera favicons, íconos PWA y
  `og.png`.
- Textos en español, voz de la suite (primera persona del plural, sin mencionar al kobold).

## Acceso (decisión de diseño)

- **Solo el Worker emite sesiones** (`web/worker/sessions.ts`), como custom tokens con claims `name`, `kvExp`, `admin`,
  `guest` y `room`. En Firebase están **desactivados** los proveedores Correo/Contraseña y Anónimo.
- **Cuentas:** lista blanca de la suite. La cookie `kv_suite_auth` se valida con `auth-refresh` de Kovalt API, y el uid
  de Firebase es el id de PocketBase. El login es `kovalt.mx/entrar?volver=…`; Roller no tiene login propio.
- **Invitados:** código de sala + nombre y uid `g_…`. Solo pueden estar en su sala (`inScope` en las reglas) y no
  crean salas. Renuevan con su ID token mientras sigan siendo miembros.
- `kvExp` = 24 h. Las reglas exigen que siga vigente (`authed()`), y la web renueva antes de que venza.
- Secreto `FIREBASE_SERVICE_ACCOUNT` en Cloudflare (lo carga el usuario con `wrangler secret put`). Nunca en el repo.

## Decisiones de juego

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
  - El catálogo es privado del DM y no tiene cantidades: nombre, descripción, valor opcional (precio por defecto),
    ícono y color (claves `ITEM_ICON_KEYS`/`ITEM_COLOR_KEYS` del motor; las reglas validan el color).
  - El DM entrega arrastrando (`drag.ts`, eventos de puntero; tocar el asa y luego el destino también sirve). El id
    de la copia es el del catálogo, así se apilan.
  - Cada inventario lo ven solo su dueño y el DM; el dueño solo cambia la cantidad (≥ 0). Se muestra en cuadrícula.
  - Monedas en el personaje (`coins`): el DM las ajusta, el dueño solo puede bajarlas (pagar).
- **Botín y tienda** (`offers/{id}` + `lines/{catalogId}`): existencias limitadas, el primero que llega se lo lleva.
  Público `audience` = `['*']` o uids; los jugadores consultan `open == true` + `array-contains` ('*' y su uid).
  Tomar/comprar es un batch (línea −q, inventario +q, monedas −precio·q) que `claimLine`/`claimedCopy` validan.
- **Tiradas:** no se pueden borrar, salvo las de un jugador que ya no es miembro: el DM lo borra por completo (ficha,
  inventario y tiradas) desde "Jugadores anteriores" en la pestaña Sala.
- **Código de sala:** nunca se muestra en pantalla (puede haber stream); solo el botón "Copiar código".

## Firebase

- Proyecto real: **`kovalt-roller-db`**. La configuración web está en `web/src/firebase/app.ts`; la `apiKey` es
  pública por diseño y el usuario aceptó dejarla en el repo.
- `pnpm dev` usa el proyecto real; `pnpm dev:emu` usa los emuladores (`demo-kovalt`), con login dev (custom tokens sin
  firmar, que solo acepta el emulador) y la sesión por pestaña.
- El Firebase CLI es local (`firebase/tests/node_modules`). El usuario publica las reglas pegándolas en la consola web:
  **cuando cambien las reglas, recuérdale publicarlas**.
- Cualquier prueba contra el proyecto real crea datos: pide permiso antes.
- **Firestore rules:** es fácil superar el límite de 1000 expresiones. Las ramas de `updateRoll` comprueban primero el
  par de estados.

## Trampas del entorno

- **Instalaciones desde la app de Claude:** lo que se instala en `AppData` (p. ej. `npm -g`) queda virtualizado en la
  carpeta del paquete MSIX y el usuario no lo ve. Las herramientas globales y los `login` (`wrangler login`) los hace
  el usuario desde su terminal.
- El panel de navegador integrado no abre `127.0.0.1`: para dos usuarios a la vez, usa dos pestañas en `localhost` con
  `pnpm dev:emu`.

## Verificación

- Web: `cd web && pnpm test && pnpm lint && pnpm build` (sin errores; el único aviso de lint es de `kv/Nav.tsx`, copia
  de la suite).
- Reglas: `bash firebase/tests/run-emulators.sh`, con JDK 21. Si ya hay emuladores corriendo, usa otra config con
  otros puertos (`firebase emulators:exec --config …`): los tests leen `FIRESTORE_EMULATOR_HOST` y borran datos.
- De punta a punta: `bash scripts/emulators.sh` + `pnpm dev:emu` y el flujo completo con dos pestañas (DM e invitado).
