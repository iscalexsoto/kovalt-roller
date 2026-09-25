import { BaseAuthStore, type AuthRecord } from 'pocketbase';

/** Sesión de la suite Kovalt compartida entre subdominios (`kovalt.mx`, `notes.`, `inventory.`…).
 *
 *  El token de PocketBase vive en una cookie con `Domain=.kovalt.mx`, así que entrar en cualquier
 *  web de la suite deja la sesión abierta en todas, y cerrarla en una la cierra en todas. No es
 *  `HttpOnly` porque el SDK necesita el token para el header `Authorization`: la exposición es la
 *  misma que tenía `localStorage`. La API no cambia (lee el header, nunca la cookie).
 *
 *  ARCHIVO COMPARTIDO: es idéntico en Kovalt Home, Kovalt Notes y Kovalt Inventory
 *  (`web/src/sync/suiteAuth.ts`). Si cambia uno, cambian los tres en el mismo día. */

export const SUITE_COOKIE = 'kv_suite_auth';
/** Clave del `LocalAuthStore` que usaban las apps antes de la sesión de suite. */
export const LEGACY_STORAGE_KEY = 'pocketbase_auth';
/** Dueño del espejo local (IndexedDB) de cada app; lo consulta la guardia de dueño de la app. */
export const LOCAL_OWNER_KEY = 'kv-local-owner';

const SUITE_DOMAIN = 'kovalt.mx';
/** Más que el token (5 días) a propósito: un token vencido sin red no debe cerrar la sesión; se
 *  renueva con `authRefresh` al volver la conexión. Cada `save` la extiende. */
const MAX_AGE_S = 30 * 24 * 60 * 60;
/** Lo único del registro que viaja en la cookie (lejos de los 4 KB). */
const RECORD_FIELDS = ['id', 'email', 'name', 'verified', 'is_admin', 'collectionId', 'collectionName'] as const;

/** Qué cambió al releer la cookie: otra web de la suite entró, renovó el token, cambió de usuario
 *  o cerró la sesión. */
export type SuiteChange = 'same' | 'signed-in' | 'refreshed' | 'user-changed' | 'gone';

export interface CookieJar {
  read(): string;
  write(cookie: string): void;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SuiteAuth {
  token: string;
  record: AuthRecord;
}

/** `.kovalt.mx` en producción; en localhost (y cualquier otro host) una cookie del host, que en
 *  localhost se comparte entre puertos: el login compartido también funciona en desarrollo. */
export function cookieDomain(hostname: string): string | undefined {
  return hostname === SUITE_DOMAIN || hostname.endsWith(`.${SUITE_DOMAIN}`) ? `.${SUITE_DOMAIN}` : undefined;
}

export function slimRecord(record: AuthRecord): AuthRecord {
  if (!record) return null;
  const slim: Record<string, unknown> = {};
  for (const field of RECORD_FIELDS) if (record[field] !== undefined) slim[field] = record[field];
  return slim as AuthRecord;
}

function attributes(domain: string | undefined, secure: boolean, maxAge: number): string {
  return [`Path=/`, domain ? `Domain=${domain}` : '', `Max-Age=${maxAge}`, 'SameSite=Lax', secure ? 'Secure' : ''].filter(Boolean).join('; ');
}

export function serializeSuiteCookie(auth: SuiteAuth, domain: string | undefined, secure: boolean): string {
  const value = encodeURIComponent(JSON.stringify({ token: auth.token, record: slimRecord(auth.record) }));
  return `${SUITE_COOKIE}=${value}; ${attributes(domain, secure, MAX_AGE_S)}`;
}

export function expiredSuiteCookie(domain: string | undefined, secure: boolean): string {
  return `${SUITE_COOKIE}=; ${attributes(domain, secure, 0)}`;
}

/** Lee la sesión de un header `Cookie` / `document.cookie`. Cualquier cosa ilegible es "sin sesión". */
export function parseSuiteCookie(cookies: string): SuiteAuth | null {
  for (const part of cookies.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== SUITE_COOKIE) continue;
    return parseAuth(safeDecode(part.slice(eq + 1).trim()));
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function parseAuth(raw: string | null): SuiteAuth | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { token?: unknown; record?: unknown; model?: unknown };
    if (typeof data.token !== 'string' || !data.token) return null;
    const record = (data.record ?? data.model ?? null) as AuthRecord;
    return { token: data.token, record: record && typeof record === 'object' ? record : null };
  } catch {
    return null;
  }
}

/** Jar en memoria (tests y entornos sin `document`): guarda `nombre=valor` y respeta `Max-Age=0`. */
export function memoryCookieJar(): CookieJar {
  const cookies = new Map<string, string>();
  return {
    read: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    write: (cookie) => {
      const [pair, ...attrs] = cookie.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      if (attrs.some((a) => a.trim().toLowerCase() === 'max-age=0')) cookies.delete(name);
      else cookies.set(name, pair.slice(eq + 1).trim());
    },
  };
}

function browserJar(): CookieJar {
  if (typeof document === 'undefined') return memoryCookieJar();
  return { read: () => document.cookie, write: (c) => (document.cookie = c) };
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** AuthStore de PocketBase respaldado por la cookie de suite. Si el navegador bloquea cookies,
 *  cae a `localStorage` como antes (sesión por app, sin compartir). */
export class SuiteAuthStore extends BaseAuthStore {
  private readonly jar: CookieJar;
  private readonly storage: KeyValueStorage | null;
  private readonly domain: string | undefined;
  private readonly secure: boolean;
  private cookiesBlocked = false;

  constructor(options: { jar?: CookieJar; storage?: KeyValueStorage | null; hostname?: string; secure?: boolean } = {}) {
    super();
    this.jar = options.jar ?? browserJar();
    this.storage = options.storage !== undefined ? options.storage : browserStorage();
    const location = typeof window !== 'undefined' ? window.location : undefined;
    this.domain = cookieDomain(options.hostname ?? location?.hostname ?? '');
    this.secure = options.secure ?? location?.protocol === 'https:';

    const fromCookie = parseSuiteCookie(this.jar.read());
    const legacy = parseAuth(this.getItem(LEGACY_STORAGE_KEY));
    // El espejo local de la app es del usuario de la sesión vieja: anotarlo antes de migrar, para
    // que la guardia de dueño lo borre si la cookie trae a otra persona.
    if (legacy?.record?.id && this.getItem(LOCAL_OWNER_KEY) === null) this.setItem(LOCAL_OWNER_KEY, legacy.record.id);

    if (fromCookie) {
      super.save(fromCookie.token, fromCookie.record);
      this.removeItem(LEGACY_STORAGE_KEY);
    } else if (legacy) {
      this.save(legacy.token, legacy.record);
    }
  }

  save(token: string, record?: AuthRecord): void {
    super.save(token, record);
    this.persist();
  }

  clear(): void {
    super.clear();
    this.jar.write(expiredSuiteCookie(this.domain, this.secure));
    this.removeItem(LEGACY_STORAGE_KEY);
  }

  /** Relee la cookie (otra web de la suite pudo cambiarla: esos cambios no disparan `storage`). */
  resync(): SuiteChange {
    if (this.cookiesBlocked) return 'same';
    const prevToken = this.token;
    const prevId = this.record?.id ?? null;
    const next = parseSuiteCookie(this.jar.read());
    if (!next) {
      if (!prevToken) return 'same';
      super.clear();
      return 'gone';
    }
    if (next.token === prevToken) return 'same';
    super.save(next.token, next.record);
    if (!prevId) return 'signed-in';
    return next.record?.id === prevId ? 'refreshed' : 'user-changed';
  }

  private persist(): void {
    this.jar.write(serializeSuiteCookie({ token: this.token, record: this.record }, this.domain, this.secure));
    this.cookiesBlocked = parseSuiteCookie(this.jar.read())?.token !== this.token;
    if (this.cookiesBlocked) this.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ token: this.token, record: this.record }));
    else this.removeItem(LEGACY_STORAGE_KEY);
  }

  private getItem(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private setItem(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* sin localStorage (modo privado) */
    }
  }

  private removeItem(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      /* sin localStorage (modo privado) */
    }
  }
}

/** Vuelve a leer la cookie al regresar a la pestaña (foco / visibilidad) y, donde existe,
 *  con `cookieStore`. Llama a `onChange` solo cuando algo cambió. Devuelve la función para dejar
 *  de escuchar. */
export function watchSuiteSession(store: SuiteAuthStore, onChange: (change: SuiteChange) => void): () => void {
  const check = () => {
    const change = store.resync();
    if (change !== 'same') onChange(change);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') check();
  };
  const cookieStore = (window as unknown as { cookieStore?: EventTarget }).cookieStore;
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', onVisibility);
  cookieStore?.addEventListener('change', check);
  return () => {
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', onVisibility);
    cookieStore?.removeEventListener('change', check);
  };
}
