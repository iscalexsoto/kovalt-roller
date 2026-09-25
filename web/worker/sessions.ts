import { getFirestoreDoc, verifyIdToken } from './google';
import { createCustomToken, parseServiceAccount, type ServiceAccount } from './jwt';

/* Sesiones de Firebase para Kovalt Roller. Solo este Worker las emite (en Firebase están desactivados los
 * proveedores Correo/Contraseña y Anónimo), como custom tokens con estos claims:
 *
 *   name   nombre visible
 *   kvExp  hasta cuándo (ms) aceptan las reglas la sesión; pasado ese momento hay que volver a pedirla aquí
 *   admin  la cuenta es admin de la suite (solo cuentas)
 *   guest  invitado (true) limitado a la sala `room`
 *
 * - Cuentas: token de PocketBase de la suite → `auth-refresh` en Kovalt API, que aplica la lista blanca.
 * - Invitados: código de sala existente, o renovación con su ID token mientras sigan siendo miembros. */

export interface Env {
  ASSETS: Fetcher;
  PB_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  GUEST_LIMIT?: RateLimit;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  randomId: () => string;
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_NAME = 40;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function defaultDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    randomId: () => {
      const bytes = new Uint8Array(15);
      crypto.getRandomValues(bytes);
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const fail = (status: number, error: string) => json({ error }, status);

export function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase().replace(/[\s-]/g, '');
  return c.length === 6 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && [...n].length <= MAX_NAME ? n : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function serviceAccount(env: Env): ServiceAccount {
  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  return { ...sa, project_id: env.FIREBASE_PROJECT_ID || sa.project_id };
}

interface PbRecord {
  id?: string;
  email?: string;
  name?: string;
  is_admin?: boolean;
}

/** POST /api/sesion {token}: token de PocketBase de la suite → custom token de Firebase. */
export async function accountSession(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson(request);
  const pbToken = body?.token;
  if (typeof pbToken !== 'string' || !pbToken) return fail(400, 'Falta la sesión de Kovalt.');

  const res = await deps.fetch(`${env.PB_URL.replace(/\/+$/, '')}/api/collections/auth_users/auth-refresh`, {
    method: 'POST',
    headers: { Authorization: pbToken },
  });
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
    return fail(403, 'Esta cuenta no tiene acceso a Kovalt Roller.');
  }
  if (!res.ok) return fail(502, 'Kovalt no responde. Inténtalo en un momento.');

  const auth = (await res.json()) as { token?: string; record?: PbRecord };
  const record = auth.record ?? {};
  if (!record.id) return fail(502, 'Respuesta inesperada de Kovalt.');
  const name = cleanName(record.name) ?? cleanName(record.email?.split('@')[0]) ?? 'Jugador';
  const claims: Record<string, unknown> = { name, kvExp: deps.now() + SESSION_TTL_MS };
  if (record.is_admin === true) claims.admin = true;

  const firebaseToken = await createCustomToken(serviceAccount(env), record.id, claims, Math.floor(deps.now() / 1000));
  return json({ firebaseToken, pbToken: auth.token, pbRecord: record });
}

/** POST /api/invitado {codigo, nombre} o {idToken}: sesión de invitado limitada a una sala. */
export async function guestSession(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (env.GUEST_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
    const { success } = await env.GUEST_LIMIT.limit({ key: ip });
    if (!success) return fail(429, 'Demasiados intentos. Espera un minuto.');
  }

  const body = await readJson(request);
  if (!body) return fail(400, 'Petición inválida.');
  const sa = serviceAccount(env);
  const nowS = Math.floor(deps.now() / 1000);

  // Renovación: el invitado conserva su uid (y su personaje) mientras siga en la sala.
  if (typeof body.idToken === 'string' && body.idToken) {
    const claims = await verifyIdToken(body.idToken, sa.project_id, deps.fetch, nowS);
    const uid = typeof claims?.sub === 'string' ? claims.sub : null;
    const room = typeof claims?.room === 'string' ? claims.room : null;
    if (!claims || claims.guest !== true || !uid || !room) return fail(401, 'La sesión de invitado no es válida.');
    const member = await getFirestoreDoc(sa, `rooms/${room}/members/${uid}`, deps.fetch);
    if (!member) return fail(403, 'Ya no formas parte de esta sala.');
    const name = cleanName(member.displayName?.stringValue) ?? cleanName(claims.name) ?? 'Invitado';
    const firebaseToken = await createCustomToken(sa, uid, { name, guest: true, room, kvExp: deps.now() + SESSION_TTL_MS }, nowS);
    return json({ firebaseToken, roomId: room });
  }

  const code = normalizeCode(body.codigo);
  if (!code) return fail(400, 'El código tiene 6 caracteres.');
  const name = cleanName(body.nombre);
  if (!name) return fail(400, `Escribe tu nombre (hasta ${MAX_NAME} caracteres).`);

  const codeDoc = await getFirestoreDoc(sa, `roomCodes/${code}`, deps.fetch);
  const roomId = codeDoc?.roomId?.stringValue;
  if (!roomId) return fail(404, 'No hay ninguna sala con ese código.');

  const uid = `g_${deps.randomId()}`;
  const firebaseToken = await createCustomToken(sa, uid, { name, guest: true, room: roomId, kvExp: deps.now() + SESSION_TTL_MS }, nowS);
  return json({ firebaseToken, roomId, code });
}

export async function handleApi(request: Request, env: Env, deps: Deps = defaultDeps()): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST') return fail(405, 'Método no permitido.');
  try {
    if (pathname === '/api/sesion') return await accountSession(request, env, deps);
    if (pathname === '/api/invitado') return await guestSession(request, env, deps);
    return fail(404, 'No existe.');
  } catch (e) {
    console.error(e);
    return fail(500, 'Algo falló al abrir la sesión.');
  }
}
