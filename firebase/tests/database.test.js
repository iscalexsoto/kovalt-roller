import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, remove, serverTimestamp, set } from 'firebase/database';
import { CODE, createEnv, DM, guest, P1, P2, registered, ROOM, withClaims } from './helpers.js';

let env;

beforeAll(async () => {
  env = await createEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `roomAccess/${ROOM}`), { dm: DM, code: CODE });
    await set(ref(db, `members/${ROOM}/${DM}`), { role: 'dm', code: CODE });
    await set(ref(db, `members/${ROOM}/${P1}`), { role: 'player', code: CODE });
  });
});

const presence = (name) => ({ state: 'online', name, lastChanged: serverTimestamp() });

describe('RTDB', () => {
  it('un invitado no puede reservar una sala', async () => {
    const db = guest(env, 'g_anon', 'r2').database();
    await assertFails(set(ref(db, 'roomAccess/r2'), { dm: 'g_anon', code: 'AAAAAA' }));
    const reg = registered(env, 'nuevo').database();
    await assertSucceeds(set(ref(reg, 'roomAccess/r2'), { dm: 'nuevo', code: 'AAAAAA' }));
  });

  it('unirse exige el código vigente', async () => {
    const db = guest(env, P2).database();
    await assertFails(set(ref(db, `members/${ROOM}/${P2}`), { role: 'player', code: 'ZZZZZZ' }));
    await assertFails(set(ref(db, `members/${ROOM}/${P2}`), { role: 'dm', code: CODE }));
    await assertSucceeds(set(ref(db, `members/${ROOM}/${P2}`), { role: 'player', code: CODE }));
  });

  it('un invitado de otra sala no entra aunque tenga el código', async () => {
    const db = guest(env, 'g_otra', 'otra').database();
    await assertFails(set(ref(db, `members/${ROOM}/g_otra`), { role: 'player', code: CODE }));
  });

  it('sin sesión vigente no se escribe nada', async () => {
    const expired = withClaims(env, P1, { name: P1, kvExp: Date.now() - 1000 }).database();
    await assertFails(set(ref(expired, `presence/${ROOM}/${P1}`), presence('Ana')));
    const reg = withClaims(env, 'nuevo', { name: 'nuevo' }).database();
    await assertFails(set(ref(reg, 'roomAccess/r2'), { dm: 'nuevo', code: 'AAAAAA' }));
  });

  it('presencia: solo la propia y solo siendo miembro', async () => {
    const p1 = guest(env, P1).database();
    await assertSucceeds(set(ref(p1, `presence/${ROOM}/${P1}`), presence('Ana')));
    await assertFails(set(ref(p1, `presence/${ROOM}/${P2}`), presence('Falso')));
    const outsider = registered(env, 'ajeno').database();
    await assertFails(set(ref(outsider, `presence/${ROOM}/ajeno`), presence('Ajeno')));
    await assertSucceeds(remove(ref(p1, `presence/${ROOM}/${P1}`)));
  });

  it('eventos en vivo: firmados por su autor; el DM puede limpiarlos', async () => {
    const p1 = guest(env, P1).database();
    const ev = (por) => ({ fase: 'tirada', por, at: serverTimestamp() });
    await assertSucceeds(set(ref(p1, `live/${ROOM}/rollEvents/r1`), ev(P1)));
    await assertFails(set(ref(p1, `live/${ROOM}/rollEvents/r2`), ev(DM)));
    const dm = registered(env, DM).database();
    await assertSucceeds(remove(ref(dm, `live/${ROOM}/rollEvents/r1`)));
  });
});
