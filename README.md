# Kovalt Roller

Mesa virtual para jugar **Roll For Shoes** por salas, directo en el navegador: **[roller.kovalt.mx](https://roller.kovalt.mx)**.

- **Web:** React + Vite + TypeScript (`web/`), con el sistema de diseño **Kovalt Design** de la suite.
- **Motor de reglas:** TypeScript puro y testeado (`web/src/engine`).
- **Backend:** Firebase Auth (solo custom tokens), Cloud Firestore (datos) y Realtime Database (presencia y espejo de
  membresía). Las Security Rules (`firebase/`) replican las invariantes del motor.
- **Acceso:** un Worker de Cloudflare (`web/worker`) emite las sesiones de Firebase. Las cuentas pasan por la lista
  blanca de la suite (Kovalt API) y los invitados entran solo con un código de sala.

## Cómo se juega

1. Alguien con cuenta de Kovalt autorizada crea una sala y es el DM. La sala tiene un código de 6 caracteres y un enlace
   de invitación (`roller.kovalt.mx/unirse/CODIGO`).
2. Los jugadores entran con el código: como invitados (solo su nombre) o con su cuenta de Kovalt. Crean su personaje.
3. Cada acción pasa por el flujo de tirada: declarar → el DM aprueba → oposición → tirada → resuelta.

Las reglas concretas y las variantes de la casa están en [docs/rules.md](docs/rules.md).

## Estructura

```
web/                 la app (Vite + React), el Worker y sus tests
  src/engine/        motor de reglas (TypeScript puro)
  src/data/          modelos (mapeo a Firestore) y repositorios
  src/firebase/      configuración y sesión
  src/screens/       Entrar, Lobby y Sala
  src/components/    piezas de la sala y primitivas kv-* de Kovalt Design
  worker/            /api/sesion y /api/invitado (custom tokens de Firebase)
firebase/            reglas de Firestore y RTDB, índices y tests de reglas (con el Firebase CLI local)
scripts/             emuladores (Git Bash)
tools/icons/         genera web/src/icons/paths.ts desde lucide-static
tools/brand/         rasteriza La Piedra de Roller (Kovalt Design) a favicons, íconos PWA e imagen OG
docs/rules.md        reglas implementadas
```

## Requisitos

- Node LTS y pnpm.
- Para los emuladores y los tests de reglas: JDK 21 y `npm install` en `firebase/tests` (trae el Firebase CLI; no hace
  falta instalarlo global). `scripts/env.sh` prepara `PATH` y `JAVA_HOME`.

## Desarrollo

Con emuladores (Auth, Firestore y RTDB con el proyecto `demo-kovalt`; UI en http://127.0.0.1:4000). En una terminal:

```bash
bash scripts/emulators.sh
```

Y en otra:

```bash
cd web && pnpm install && pnpm dev:emu
```

Abre http://localhost:5179. En modo emuladores la pantalla de entrada ofrece **Entrar como cuenta (dev)** (sin pasar por
la suite) y la sesión vive en cada pestaña, así que puedes ser el DM en una y un invitado en otra.

Contra el proyecto real hacen falta la sesión de la suite y el Worker (`pnpm worker:dev` con un `.dev.vars` que tenga
`FIREBASE_SERVICE_ACCOUNT`); lo normal es probarlo ya desplegado.

## Tests

```bash
cd web && pnpm test
```

Motor (reglas, flujo y propiedades con fast-check), mapeo de modelos y Worker (firma de tokens, lista blanca,
invitados). También `pnpm lint` y `pnpm build`.

```bash
bash firebase/tests/run-emulators.sh
```

Reglas de Firestore y RTDB contra los emuladores.

## Acceso y sesiones

Solo el Worker de `roller.kovalt.mx` emite sesiones de Firebase (custom tokens firmados con una cuenta de servicio):

- **Cuentas:** Roller manda a `kovalt.mx/entrar`. Con la cookie de la suite (`kv_suite_auth`), `POST /api/sesion` valida
  el token con `auth-refresh` de Kovalt API, que aplica la lista blanca (`auth_allowed_emails`, en
  admin.kovalt.mx/usuarios).
- **Invitados:** `POST /api/invitado` con código y nombre. La sesión solo sirve en esa sala (claims `guest` y `room`).
  Se renueva con su ID token mientras siga siendo miembro, así conserva su personaje.
- Todas las sesiones llevan `kvExp` (24 h). Las reglas rechazan las vencidas, y así quien sale de la lista blanca o es
  expulsado pierde el acceso en menos de un día.

## Despliegue

La web y el Worker se publican juntos en Cloudflare:

```bash
cd web && pnpm deploy
```

La primera vez, desde tu terminal:

1. `pnpm exec wrangler login`
2. En Firebase Console → Configuración del proyecto → **Cuentas de servicio**, genera una clave privada (JSON) y
   cárgala: `pnpm exec wrangler secret put FIREBASE_SERVICE_ACCOUNT` (pega el JSON completo). No la subas al repo.
3. En Firebase Console → Authentication → Método de acceso, **desactiva Correo/Contraseña y Anónimo**. Los custom
   tokens no dependen de ningún proveedor.
4. Publica las reglas (abajo).

## Proyecto de Firebase (`kovalt-roller-db`)

La configuración web está en `web/src/firebase/app.ts` (la `apiKey` es pública por diseño). Deben estar activados
**Firestore Database** y **Realtime Database**.

Las reglas hay que publicarlas cada vez que cambian:

- Con la consola: pegar `firebase/firestore.rules` en *Firestore Database → Reglas* y `firebase/database.rules.json` en
  *Realtime Database → Reglas*, y publicar.
- O con el CLI local: `cd firebase/tests && npx firebase deploy --only firestore,database --project kovalt-roller-db`
  (necesita `npx firebase login`).
