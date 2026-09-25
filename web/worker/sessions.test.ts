import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetAccessTokenCache, resetJwksCache, verifyIdToken } from './google';
import { CUSTOM_TOKEN_AUDIENCE, base64url, decodeJwt, signJwt, verifyRs256 } from './jwt';
import { SESSION_TTL_MS, handleApi, type Deps, type Env } from './sessions';

const PROJECT = 'kovalt-roller-db';
const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;

let pem: string;
let publicKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...pkcs8));
  pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  publicKey = pair.publicKey;
  publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
});

beforeEach(() => {
  resetAccessTokenCache();
  resetJwksCache();
});

/** Firestore simulado: rutas de documento → campos. */
type Docs = Record<string, Record<string, string>>;

function setup(opts: { pbStatus?: number; pbRecord?: Record<string, unknown>; docs?: Docs; limited?: boolean } = {}) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/api/collections/auth_users/auth-refresh')) {
      expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe('pb-token');
      const status = opts.pbStatus ?? 200;
      if (status !== 200) return new Response('{"message":"Cuenta no permitida."}', { status });
      return Response.json({ token: 'pb-token-2', record: opts.pbRecord ?? { id: 'abc123def456ghi', email: 'ana@example.com', name: 'Ana', is_admin: true } });
    }
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'at', expires_in: 3600 });
    if (url.startsWith('https://firestore.googleapis.com/')) {
      expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer at');
      const path = url.split('/documents/')[1]!;
      const fields = opts.docs?.[path];
      if (!fields) return new Response('{}', { status: 404 });
      return Response.json({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) });
    }
    if (url.includes('securetoken@system.gserviceaccount.com')) return Response.json({ keys: [{ ...publicJwk, kid: 'k1', alg: 'RS256', use: 'sig' }] });
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;

  const env: Env = {
    ASSETS: {} as Fetcher,
    PB_URL: 'https://api.kovalt.mx',
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: PROJECT, client_email: 'sa@kovalt-roller-db.iam.gserviceaccount.com', private_key: pem }),
    GUEST_LIMIT: { limit: async () => ({ success: !opts.limited }) } as unknown as RateLimit,
  };
  const deps: Deps = { fetch: fetchFn, now: () => NOW, randomId: () => 'r4nd0m' };
  const post = (path: string, body: unknown) =>
    handleApi(new Request(`https://roller.kovalt.mx${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), env, deps);
  return { post, calls };
}

async function customTokenOf(res: Response) {
  expect(res.status).toBe(200);
  const body = (await res.json()) as { firebaseToken: string; roomId?: string; pbToken?: string };
  const jwt = decodeJwt(body.firebaseToken);
  expect(await verifyRs256(jwt, publicKey)).toBe(true);
  expect(jwt.payload.aud).toBe(CUSTOM_TOKEN_AUDIENCE);
  expect(jwt.payload.iss).toBe('sa@kovalt-roller-db.iam.gserviceaccount.com');
  return { body, payload: jwt.payload as { uid: string; claims: Record<string, unknown> } };
}

/** ID token de Firebase como los que emite securetoken (firmado con la clave de prueba). */
function idToken(payload: Record<string, unknown>) {
  return signJwt({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, iat: NOW_S - 10, exp: NOW_S + 3000, ...payload }, pem, 'k1');
}

describe('/api/sesion (cuentas de la suite)', () => {
  it('canjea un token de la lista blanca por un custom token', async () => {
    const { post } = setup();
    const { body, payload } = await customTokenOf(await post('/api/sesion', { token: 'pb-token' }));
    expect(payload.uid).toBe('abc123def456ghi');
    expect(payload.claims).toEqual({ name: 'Ana', kvExp: NOW + SESSION_TTL_MS, admin: true });
    expect(body.pbToken).toBe('pb-token-2');
  });

  it('usa el correo si la cuenta no tiene nombre', async () => {
    const { post } = setup({ pbRecord: { id: 'x1', email: 'beto@example.com', name: '' } });
    const { payload } = await customTokenOf(await post('/api/sesion', { token: 'pb-token' }));
    expect(payload.claims).toEqual({ name: 'beto', kvExp: NOW + SESSION_TTL_MS });
  });

  it.each([400, 401, 403])('responde 403 si Kovalt API rechaza la cuenta (%i)', async (status) => {
    const { post } = setup({ pbStatus: status });
    const res = await post('/api/sesion', { token: 'pb-token' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Esta cuenta no tiene acceso a Kovalt Roller.' });
  });

  it('sin token no llama a nadie', async () => {
    const { post, calls } = setup();
    expect((await post('/api/sesion', {})).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('/api/invitado', () => {
  const docs: Docs = { 'roomCodes/ABC234': { roomId: 'room1' }, 'rooms/room1/members/g_viejo': { displayName: 'Carla' } };

  it('con un código válido da una sesión limitada a la sala', async () => {
    const { post } = setup({ docs });
    const { body, payload } = await customTokenOf(await post('/api/invitado', { codigo: ' abc-234 ', nombre: '  Carla  ' }));
    expect(body.roomId).toBe('room1');
    expect(payload.uid).toBe('g_r4nd0m');
    expect(payload.claims).toEqual({ name: 'Carla', guest: true, room: 'room1', kvExp: NOW + SESSION_TTL_MS });
  });

  it('un código inexistente da 404', async () => {
    const { post } = setup({ docs });
    const res = await post('/api/invitado', { codigo: 'ZZZ234', nombre: 'Carla' });
    expect(res.status).toBe(404);
  });

  it('valida código y nombre antes de consultar Firestore', async () => {
    const { post, calls } = setup({ docs });
    expect((await post('/api/invitado', { codigo: 'ABC', nombre: 'Carla' })).status).toBe(400);
    expect((await post('/api/invitado', { codigo: 'ABC234', nombre: '   ' })).status).toBe(400);
    expect((await post('/api/invitado', { codigo: 'ABC234', nombre: 'x'.repeat(41) })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('respeta el límite de intentos', async () => {
    const { post } = setup({ docs, limited: true });
    expect((await post('/api/invitado', { codigo: 'ABC234', nombre: 'Carla' })).status).toBe(429);
  });

  it('renueva la sesión de un miembro conservando su uid', async () => {
    const { post } = setup({ docs });
    const token = await idToken({ sub: 'g_viejo', guest: true, room: 'room1', name: 'Carla' });
    const { payload } = await customTokenOf(await post('/api/invitado', { idToken: token }));
    expect(payload.uid).toBe('g_viejo');
    expect(payload.claims).toEqual({ name: 'Carla', guest: true, room: 'room1', kvExp: NOW + SESSION_TTL_MS });
  });

  it('no renueva a un invitado expulsado', async () => {
    const { post } = setup({ docs });
    const token = await idToken({ sub: 'g_expulsado', guest: true, room: 'room1' });
    expect((await post('/api/invitado', { idToken: token })).status).toBe(403);
  });

  it('no renueva tokens de cuentas, vencidos ni de otro proyecto', async () => {
    const { post } = setup({ docs });
    expect((await post('/api/invitado', { idToken: await idToken({ sub: 'g_viejo', room: 'room1' }) })).status).toBe(401);
    expect((await post('/api/invitado', { idToken: await idToken({ sub: 'g_viejo', guest: true, room: 'room1', exp: NOW_S - 1 }) })).status).toBe(401);
    expect((await post('/api/invitado', { idToken: await idToken({ sub: 'g_viejo', guest: true, room: 'room1', aud: 'otro' }) })).status).toBe(401);
    expect((await post('/api/invitado', { idToken: 'basura' })).status).toBe(401);
  });
});

describe('verifyIdToken', () => {
  it('rechaza una firma alterada', async () => {
    const token = await idToken({ sub: 'u1' });
    const [h, p] = token.split('.');
    const forged = `${h}.${p}.${base64url('firma falsa')}`;
    const fetchFn = (async () => Response.json({ keys: [{ ...publicJwk, kid: 'k1' }] })) as unknown as typeof fetch;
    expect(await verifyIdToken(forged, PROJECT, fetchFn, NOW_S)).toBeNull();
    expect(await verifyIdToken(token, PROJECT, fetchFn, NOW_S)).toMatchObject({ sub: 'u1' });
  });
});

it('otras rutas y métodos', async () => {
  const { post } = setup();
  expect((await post('/api/otra', {})).status).toBe(404);
  const env = {} as Env;
  const res = await handleApi(new Request('https://roller.kovalt.mx/api/sesion'), env);
  expect(res.status).toBe(405);
});
