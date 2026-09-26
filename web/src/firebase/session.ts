import { onIdTokenChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { joinByCode, normalizeCode, roomIdForCode } from '../data/rooms';
import { UserError } from '../data/errors';
import { SuiteAuthStore, watchSuiteSession } from '../suite/suiteAuth';
import { auth, IS_EMULATOR } from './app';

/* Sesión de Kovalt Roller. Las sesiones de Firebase solo las emite el Worker (`/api/sesion`, `/api/invitado`) como
 * custom tokens; sus claims (`name`, `kvExp`, `guest`, `room`, `admin`) son lo que leen las reglas.
 *
 * - Cuenta: la sesión de la suite (cookie `kv_suite_auth` de `.kovalt.mx`) se canjea en `/api/sesion`, que pasa
 *   por la lista blanca. Si la suite cierra sesión o cambia de usuario, Roller lo sigue.
 * - Invitado: código de sala + nombre en `/api/invitado`; queda limitado a esa sala.
 * - Las dos se renuevan antes de que venza `kvExp` (24 h). */

export interface Session {
  uid: string;
  name: string;
  guest: boolean;
  /** Sala a la que se limita un invitado. */
  room: string | null;
  admin: boolean;
  /** Hasta cuándo aceptan las reglas esta sesión (ms). */
  kvExp: number;
}

export type SessionState = { status: 'loading' } | { status: 'signed-out'; reason?: string } | { status: 'signed-in'; session: Session };

/** Renovar cuando quede menos de esto. */
const RENEW_MARGIN_MS = 2 * 60 * 60 * 1000;
const RENEW_CHECK_MS = 10 * 60 * 1000;

export const suiteAuth = new SuiteAuthStore();

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

function emit(next: SessionState): void {
  state = next;
  for (const l of listeners) l();
}

export function getSessionState(): SessionState {
  return state;
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** La sesión actual; solo para pantallas detrás de `Gate`. */
export function useSession(): Session {
  const s = useSessionState();
  if (s.status !== 'signed-in') throw new Error('useSession fuera de Gate');
  return s.session;
}

async function sessionOf(user: User): Promise<Session | null> {
  const { claims } = await user.getIdTokenResult();
  const kvExp = typeof claims.kvExp === 'number' ? claims.kvExp : 0;
  if (!kvExp) return null;
  return {
    uid: user.uid,
    name: typeof claims.name === 'string' && claims.name ? claims.name : 'Jugador',
    guest: claims.guest === true,
    room: typeof claims.room === 'string' ? claims.room : null,
    admin: claims.admin === true,
    kvExp,
  };
}

// ---------- llamadas al Worker ----------

async function callWorker(path: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new UserError('Sin conexión. Inténtalo de nuevo.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new UserError(typeof data.error === 'string' ? data.error : 'No se pudo abrir la sesión.');
    (err as UserError & { status?: number }).status = res.status;
    throw err;
  }
  return data;
}

function statusOf(e: unknown): number | undefined {
  return (e as { status?: number }).status;
}

/** Canjea la sesión de la suite por una de Firebase. `false` si no hay sesión de la suite. */
export async function signInWithSuite(): Promise<boolean> {
  const token = suiteAuth.token;
  if (!token) return false;
  const data = await callWorker('/api/sesion', { token });
  if (typeof data.pbToken === 'string') suiteAuth.save(data.pbToken, (data.pbRecord as never) ?? suiteAuth.record);
  await signInWithCustomToken(auth, String(data.firebaseToken));
  return true;
}

/** Entra como invitado a la sala del código y se une a ella. Devuelve el id de la sala. */
export async function enterAsGuest(code: string, name: string): Promise<string> {
  const codigo = normalizeCode(code);
  if (IS_EMULATOR) return devGuest(codigo, name);
  const data = await callWorker('/api/invitado', { codigo, nombre: name });
  const cred = await signInWithCustomToken(auth, String(data.firebaseToken));
  const session = await sessionOf(cred.user);
  return joinByCode(cred.user.uid, session?.name ?? name.trim(), codigo);
}

async function renewGuest(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const data = await callWorker('/api/invitado', { idToken });
  await signInWithCustomToken(auth, String(data.firebaseToken));
}

/** Cierra la sesión. En una cuenta también cierra la de la suite (así funciona en todas las webs de Kovalt). */
export async function signOutEverywhere(): Promise<void> {
  const wasAccount = state.status === 'signed-in' && !state.session.guest;
  await signOut(auth);
  if (wasAccount) suiteAuth.clear();
}

// ---------- renovación ----------

let renewing: Promise<void> | null = null;

/** Pide una sesión nueva si la actual está por vencer (o si la suite cambió de usuario). */
function refresh(force = false): Promise<void> {
  renewing ??= (async () => {
    const user = auth.currentUser;
    const current = state.status === 'signed-in' ? state.session : null;
    try {
      if (!user) {
        // Sin sesión de Firebase: si la suite tiene una, se canjea sola.
        if (!IS_EMULATOR && suiteAuth.token) await signInWithSuite();
        return;
      }
      if (IS_EMULATOR || !current) return;
      if (!current.guest) {
        const suiteUid = suiteAuth.record?.id;
        if (!suiteAuth.token) {
          // La suite cerró sesión en otra web.
          await signOut(auth);
          return;
        }
        if (force || suiteUid !== current.uid || current.kvExp - Date.now() < RENEW_MARGIN_MS) await signInWithSuite();
      } else if (force || current.kvExp - Date.now() < RENEW_MARGIN_MS) {
        await renewGuest(user);
      }
    } catch (e) {
      const status = statusOf(e);
      if (status === 401 || status === 403) {
        await signOut(auth);
        emit({ status: 'signed-out', reason: (e as Error).message });
      } else if (state.status === 'loading') {
        emit({ status: 'signed-out', reason: (e as Error).message });
      }
      // Otros errores (red): se reintenta en la próxima comprobación.
    }
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

let started = false;

/** Arranca el seguimiento de la sesión (una vez, en main.tsx). */
export function startSession(): void {
  if (started) return;
  started = true;

  let first = true;
  onIdTokenChanged(auth, (user) => {
    void (async () => {
      const session = user ? await sessionOf(user) : null;
      if (first) {
        first = false;
        // Primera carga: renovar (o canjear la sesión de la suite) antes de enseñar nada.
        if (!session || session.kvExp - Date.now() < RENEW_MARGIN_MS || (!session.guest && suiteAuth.record?.id !== session.uid)) {
          if (session) emit({ status: 'signed-in', session });
          await refresh();
          // El listener también verá el cambio, pero puede llegar después: se resuelve aquí para no enseñar
          // "sin sesión" un instante.
          const now = auth.currentUser ? await sessionOf(auth.currentUser) : null;
          if (now) emit({ status: 'signed-in', session: now });
          else if (state.status !== 'signed-out') emit({ status: 'signed-out' });
          return;
        }
      }
      if (session) emit({ status: 'signed-in', session });
      else if (state.status !== 'signed-out') emit({ status: 'signed-out' });
    })();
  });

  watchSuiteSession(suiteAuth, () => void refresh());
  setInterval(() => void refresh(), RENEW_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
}

// ---------- desarrollo con emuladores ----------

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Custom token sin firmar: el emulador de Auth lo acepta, producción no. */
function unsignedToken(uid: string, claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'dev@demo-kovalt.iam.gserviceaccount.com',
    sub: 'dev@demo-kovalt.iam.gserviceaccount.com',
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.`;
}

const devUid = (name: string) => `dev_${name.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '') || 'anon'}`;

/** Solo con emuladores: entra como una cuenta (DM o jugador) con este nombre. */
export async function devSignIn(name: string): Promise<void> {
  if (!IS_EMULATOR) throw new Error('Solo con emuladores');
  await signInWithCustomToken(auth, unsignedToken(devUid(name), { name: name.trim(), kvExp: Date.now() + 24 * 3600 * 1000 }));
}

async function devGuest(code: string, name: string): Promise<string> {
  // Como el Worker: primero se busca la sala del código y luego se emite la sesión limitada a ella.
  await signInWithCustomToken(auth, unsignedToken('dev_lookup', { name: 'dev', kvExp: Date.now() + 60_000 }));
  let roomId: string;
  try {
    roomId = await roomIdForCode(code);
  } catch (e) {
    await signOut(auth); // que no quede la sesión de búsqueda como si fuera una cuenta
    throw e;
  }
  const uid = `g_${devUid(name).slice(4)}`;
  await signInWithCustomToken(auth, unsignedToken(uid, { name: name.trim(), guest: true, room: roomId, kvExp: Date.now() + 24 * 3600 * 1000 }));
  return joinByCode(uid, name.trim(), code);
}
