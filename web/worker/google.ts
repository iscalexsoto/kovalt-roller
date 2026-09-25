import { decodeJwt, signJwt, verifyRs256, type ServiceAccount } from './jwt';

/* Llamadas a Google con la cuenta de servicio: access token OAuth (JWT bearer), lecturas de Firestore por REST
 * (saltan las Security Rules: solo se leen códigos de sala y membresías) y verificación de ID tokens. */

type FetchFn = typeof fetch;

let cachedToken: { email: string; token: string; expiresAt: number } | null = null;

export async function accessToken(sa: ServiceAccount, fetchFn: FetchFn = fetch, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.expiresAt > nowS + 60) return cachedToken.token;
  const assertion = await signJwt(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: nowS, exp: nowS + 3600 },
    sa.private_key,
  );
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { email: sa.client_email, token: body.access_token, expiresAt: nowS + body.expires_in };
  return body.access_token;
}

export function resetAccessTokenCache(): void {
  cachedToken = null;
}

/** Campos de un documento de Firestore (formato REST), o `null` si no existe. */
export async function getFirestoreDoc(
  sa: ServiceAccount,
  path: string,
  fetchFn: FetchFn = fetch,
): Promise<Record<string, { stringValue?: string }> | null> {
  const token = await accessToken(sa, fetchFn);
  const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/${path}`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const body = (await res.json()) as { fields?: Record<string, { stringValue?: string }> };
  return body.fields ?? {};
}

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null;

async function securetokenKeys(fetchFn: FetchFn, nowS: number): Promise<Map<string, CryptoKey>> {
  if (jwksCache && jwksCache.expiresAt > nowS) return jwksCache.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  jwksCache = { keys: map, expiresAt: nowS + 3600 };
  return map;
}

export function resetJwksCache(): void {
  jwksCache = null;
}

/** Verifica un ID token de Firebase del proyecto y devuelve sus claims (o `null` si no es válido). */
export async function verifyIdToken(idToken: string, projectId: string, fetchFn: FetchFn = fetch, nowS = Math.floor(Date.now() / 1000)): Promise<Record<string, unknown> | null> {
  let jwt;
  try {
    jwt = decodeJwt(idToken);
  } catch {
    return null;
  }
  if (jwt.header.alg !== 'RS256' || !jwt.header.kid) return null;
  const key = (await securetokenKeys(fetchFn, nowS)).get(jwt.header.kid);
  if (!key || !(await verifyRs256(jwt, key))) return null;
  const p = jwt.payload;
  const ok =
    p.aud === projectId &&
    p.iss === `https://securetoken.google.com/${projectId}` &&
    typeof p.sub === 'string' &&
    p.sub.length > 0 &&
    typeof p.exp === 'number' &&
    p.exp > nowS &&
    typeof p.iat === 'number' &&
    p.iat <= nowS + 300;
  return ok ? p : null;
}
