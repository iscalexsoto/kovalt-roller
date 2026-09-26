import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import {
  BASE_SKILL, CODE, createEnv, declaredRoll, DEFAULT_SETTINGS, DM, guest, P1, P2, registered,
  ROOM, seedRoll, seedRoom, withClaims,
} from './helpers.js';

let env;

beforeAll(async () => {
  env = await createEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  dbs = {};
  await env.clearFirestore();
});

// Una instancia por usuario y test: los batch exigen refs de la misma instancia.
let dbs = {};
const cached = (key, make) => (dbs[key] ??= make().firestore());
const dmDb = () => cached(DM, () => registered(env, DM));
const p1Db = () => cached(P1, () => guest(env, P1));
const p2Db = () => cached(P2, () => registered(env, P2));
const rollRef = (db, id = 'r1') => doc(db, `rooms/${ROOM}/rolls/${id}`);
const charRef = (db, uid) => doc(db, `rooms/${ROOM}/characters/${uid}`);

const TREPAR = { name: 'Trepar', level: 2, permanent: false, derivedFrom: 'Do Anything 1' };
const H0 = (uid = P1) => [{ de: null, a: 'declarada', por: uid }];

function newRoomBatch(db, uid, roomId, code) {
  const b = writeBatch(db);
  b.set(doc(db, `rooms/${roomId}`), {
    name: 'Mi mesa', dmUid: uid, code, settings: DEFAULT_SETTINGS, status: 'open', createdAt: serverTimestamp(),
  });
  b.set(doc(db, `roomCodes/${code}`), { roomId, createdAt: serverTimestamp() });
  b.set(doc(db, `rooms/${roomId}/members/${uid}`), {
    role: 'dm', displayName: 'DM', joinCode: null, characterId: null, joinedAt: serverTimestamp(),
  });
  return b;
}

describe('salas', () => {
  it('un invitado no puede crear salas', async () => {
    const db = guest(env, 'g_anon', 'r2').firestore();
    await assertFails(newRoomBatch(db, 'g_anon', 'r2', 'AAAAAA').commit());
  });

  it('sin sesión vigente (kvExp vencido o ausente) no se puede nada', async () => {
    await seedRoom(env);
    const expired = withClaims(env, DM, { name: DM, kvExp: Date.now() - 1000 }).firestore();
    await assertFails(getDoc(doc(expired, `rooms/${ROOM}`)));
    const noExp = withClaims(env, DM, { name: DM }).firestore();
    await assertFails(getDoc(doc(noExp, `rooms/${ROOM}`)));
    const legacy = env.authenticatedContext('nuevoDm', { firebase: { sign_in_provider: 'password' } }).firestore();
    await assertFails(newRoomBatch(legacy, 'nuevoDm', 'r2', 'AAAAAA').commit());
    await assertSucceeds(getDoc(doc(dmDb(), `rooms/${ROOM}`)));
  });

  it('un usuario registrado crea sala, código y membresía de DM en un batch', async () => {
    const db = registered(env, 'nuevoDm').firestore();
    await assertSucceeds(newRoomBatch(db, 'nuevoDm', 'r2', 'AAAAAA').commit());
  });

  it('no se puede crear una sala a nombre de otro', async () => {
    const db = registered(env, 'x').firestore();
    await assertFails(newRoomBatch(db, 'otro', 'r2', 'AAAAAA').commit());
  });

  it('ajustes inválidos se rechazan', async () => {
    await seedRoom(env);
    await assertFails(updateDoc(doc(dmDb(), `rooms/${ROOM}`), { settings: { ...DEFAULT_SETTINGS, skillSlots: 0 } }));
    await assertSucceeds(updateDoc(doc(dmDb(), `rooms/${ROOM}`), { settings: { ...DEFAULT_SETTINGS, skillSlots: 3 } }));
    await assertFails(updateDoc(doc(p1Db(), `rooms/${ROOM}`), { name: 'Hackeada' }));
  });

  it('cada usuario gestiona solo su índice de salas', async () => {
    const mine = doc(p1Db(), `users/${P1}/rooms/${ROOM}`);
    await assertSucceeds(setDoc(mine, { name: 'Mesa', role: 'player' }));
    await assertSucceeds(getDoc(mine));
    await assertFails(getDoc(doc(p2Db(), `users/${P1}/rooms/${ROOM}`)));
    await assertFails(setDoc(doc(p2Db(), `users/${P1}/rooms/x`), { name: 'Intrusa', role: 'dm' }));
  });

  it('los códigos se pueden leer uno a uno pero no listar', async () => {
    await seedRoom(env);
    await assertSucceeds(getDoc(doc(registered(env, 'nadie').firestore(), `roomCodes/${CODE}`)));
    await assertSucceeds(getDoc(doc(guest(env, 'g_nadie').firestore(), `roomCodes/${CODE}`)));
    // Un invitado de otra sala no puede leer este código.
    await assertFails(getDoc(doc(guest(env, 'g_ajeno', 'otra').firestore(), `roomCodes/${CODE}`)));
  });
});

describe('unirse', () => {
  const member = (joinCode, role = 'player') => ({
    role, displayName: 'Nueve', joinCode, characterId: null, joinedAt: serverTimestamp(),
  });

  it('con el código correcto sí, con uno incorrecto no', async () => {
    await seedRoom(env, { players: [] });
    const db = guest(env, 'p9').firestore();
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member('ZZZZZZ')));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member(CODE)));
  });

  it('un invitado de otra sala no entra aunque tenga el código', async () => {
    await seedRoom(env, { players: [] });
    const db = guest(env, 'g_otra', 'otra').firestore();
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/g_otra`), member(CODE)));
  });

  it('no se puede entrar como DM ni inscribir a otro usuario', async () => {
    await seedRoom(env, { players: [] });
    const db = guest(env, 'p9').firestore();
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member(CODE, 'dm')));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p8`), member(CODE)));
  });

  it('un no miembro no puede leer la sala', async () => {
    await seedRoom(env);
    await assertFails(getDoc(doc(registered(env, 'ajeno').firestore(), `rooms/${ROOM}`)));
    await assertFails(getDoc(doc(guest(env, 'g_ajeno', 'otra').firestore(), `rooms/${ROOM}`)));
    await assertSucceeds(getDoc(doc(p1Db(), `rooms/${ROOM}`)));
  });
});

describe('personajes', () => {
  const sheet = (uid, extra = {}) => ({
    ownerUid: uid, name: 'Nueve', description: '', notes: '', xp: 0,
    skills: [BASE_SKILL], lastAppliedRollId: null, updatedAt: serverTimestamp(), ...extra,
  });

  async function seedMember(uid) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `rooms/${ROOM}/members/${uid}`), {
        role: 'player', displayName: uid, joinCode: CODE, characterId: null, joinedAt: new Date(),
      });
    });
  }

  it('un miembro crea su personaje con Do Anything 1', async () => {
    await seedRoom(env, { players: [] });
    await seedMember('p9');
    const db = guest(env, 'p9').firestore();
    await assertFails(setDoc(charRef(db, 'p9'), sheet('p9', { xp: 3 })));
    await assertFails(setDoc(charRef(db, 'p9'), sheet('p9', { skills: [TREPAR] })));
    await assertFails(setDoc(charRef(db, 'p9'), sheet('p9', { skills: [BASE_SKILL, TREPAR] })));
    await assertFails(setDoc(charRef(db, 'p9'), sheet('p9', { name: '' })));
    await assertSucceeds(setDoc(charRef(db, 'p9'), sheet('p9')));
  });

  it('el DM no tiene personaje propio', async () => {
    await seedRoom(env, { players: [] });
    await assertFails(setDoc(charRef(dmDb(), DM), sheet(DM)));
  });

  it('el dueño edita textos pero no xp ni habilidades', async () => {
    await seedRoom(env);
    await assertSucceeds(updateDoc(charRef(p1Db(), P1), { name: 'Otro nombre', notes: 'Tengo miedo' }));
    await assertFails(updateDoc(charRef(p1Db(), P1), { xp: 5 }));
    await assertFails(updateDoc(charRef(p1Db(), P1), { skills: [BASE_SKILL, TREPAR] }));
    await assertFails(updateDoc(charRef(p2Db(), P1), { notes: 'ajeno' }));
  });

  it('el DM puede corregir la hoja respetando las invariantes', async () => {
    await seedRoom(env);
    await assertSucceeds(updateDoc(charRef(dmDb(), P1), { xp: 2, skills: [BASE_SKILL, TREPAR] }));
    const tooMany = [BASE_SKILL, TREPAR, { ...TREPAR, name: 'Nadar' }, { ...TREPAR, name: 'Correr' }];
    await assertFails(updateDoc(charRef(dmDb(), P1), { skills: tooMany }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { skills: [TREPAR] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { skills: [BASE_SKILL, { ...TREPAR, permanent: true }] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { xp: -1 }));
  });
});

describe('catálogo e inventario', () => {
  const look = { icon: 'package', color: 'sand' };
  const catalogItem = (extra = {}) => ({ name: 'Cuerda', description: '10 m', value: null, ...look, ...extra });
  const item = (extra = {}) => ({ ...catalogItem(), quantity: 1, ...extra });
  const inv = (db, uid, id = 'c1') => doc(db, `rooms/${ROOM}/characters/${uid}/inventory/${id}`);

  it('el catálogo es privado del DM y no lleva cantidades', async () => {
    await seedRoom(env);
    const ref = (db) => doc(db, `rooms/${ROOM}/catalog/c1`);
    await assertSucceeds(setDoc(ref(dmDb()), catalogItem({ value: 5, color: 'ember', icon: 'sword' })));
    await assertFails(setDoc(ref(dmDb()), catalogItem({ quantity: 1 })));
    await assertFails(setDoc(ref(dmDb()), catalogItem({ color: 'fucsia' })));
    await assertFails(setDoc(ref(dmDb()), catalogItem({ value: -1 })));
    await assertFails(setDoc(ref(dmDb()), catalogItem({ name: '' })));
    await assertFails(getDoc(ref(p1Db())));
    await assertFails(setDoc(ref(p1Db()), catalogItem()));
  });

  it('el DM entrega copias; el dueño solo ajusta la cantidad', async () => {
    await seedRoom(env);
    await assertSucceeds(setDoc(inv(dmDb(), P1), {
      ...item({ quantity: 2 }), catalogItemId: 'c1', givenBy: DM, givenAt: serverTimestamp(),
    }));
    await assertFails(setDoc(inv(p1Db(), P1, 'i2'), item()));
    await assertSucceeds(getDoc(inv(p1Db(), P1)));
    await assertFails(getDoc(inv(p2Db(), P1)));
    await assertSucceeds(updateDoc(inv(p1Db(), P1), { quantity: 0 }));
    await assertFails(updateDoc(inv(p1Db(), P1), { quantity: -1 }));
    await assertFails(updateDoc(inv(p1Db(), P1), { name: 'Cuerda mágica' }));
    await assertFails(deleteDoc(inv(p1Db(), P1)));
    await assertSucceeds(deleteDoc(inv(dmDb(), P1)));
  });

  it('monedas: el DM las ajusta; el dueño no se las sube', async () => {
    await seedRoom(env);
    await assertSucceeds(updateDoc(charRef(dmDb(), P1), { coins: 10 }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { coins: -1 }));
    await assertFails(updateDoc(charRef(p1Db(), P1), { coins: 11 }));
    await assertFails(updateDoc(charRef(p2Db(), P1), { coins: 5 }));
  });
});

describe('botines y tiendas', () => {
  const look = { icon: 'flask-round', color: 'rose' };
  const line = (extra = {}) => ({ name: 'Poción', description: 'Cura', value: 4, ...look, price: 4, stock: 3, ...extra });
  const offerRef = (db, id = 'o1') => doc(db, `rooms/${ROOM}/offers/${id}`);
  const lineRef = (db, id = 'o1', lid = 'c1') => doc(db, `rooms/${ROOM}/offers/${id}/lines/${lid}`);
  const inv = (db, uid, id = 'c1') => doc(db, `rooms/${ROOM}/characters/${uid}/inventory/${id}`);
  const copy = (quantity) => ({
    name: 'Poción', description: 'Cura', value: 4, ...look, quantity,
    catalogItemId: 'c1', offerId: 'o1', givenBy: null, givenAt: serverTimestamp(),
  });

  async function seedOffer({ kind = 'loot', open = true, audience = ['*'], stock = 3, coins = 10 } = {}) {
    await seedRoom(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(offerRef(db), { kind, title: 'Cofre', open, audience, createdAt: new Date(), updatedAt: new Date() });
      await setDoc(lineRef(db), line({ stock }));
      await updateDoc(charRef(db, P1), { coins });
    });
  }

  /** P1 toma (o compra) `q` unidades; `coins` es su saldo después, si la tienda cobra. */
  function claimBatch(db, q, { from = 3, invQty = q, create = true, coins } = {}) {
    const b = writeBatch(db);
    b.update(lineRef(db), { stock: from - q });
    if (create) b.set(inv(db, P1), copy(invQty));
    else b.update(inv(db, P1), { quantity: invQty });
    if (coins !== undefined) b.update(charRef(db, P1), { coins, updatedAt: serverTimestamp() });
    return b.commit();
  }

  it('solo el DM los arma', async () => {
    await seedRoom(env);
    const offer = { kind: 'shop', title: 'Herrería', open: false, audience: ['*'], createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(offerRef(dmDb()), offer));
    await assertSucceeds(setDoc(lineRef(dmDb()), line()));
    await assertFails(setDoc(offerRef(dmDb(), 'o2'), { ...offer, kind: 'subasta' }));
    await assertFails(setDoc(lineRef(dmDb(), 'o1', 'c2'), line({ stock: -1 })));
    await assertFails(setDoc(offerRef(p1Db(), 'o3'), offer));
    await assertFails(setDoc(lineRef(p1Db(), 'o1', 'c3'), line()));
  });

  it('se ven abiertos y solo por su público', async () => {
    await seedOffer({ audience: [P2] });
    await assertFails(getDoc(offerRef(p1Db())));
    await assertFails(getDoc(lineRef(p1Db())));
    await assertSucceeds(getDoc(offerRef(p2Db())));
    await assertSucceeds(getDoc(lineRef(p2Db())));
    const offers = collection(p2Db(), `rooms/${ROOM}/offers`);
    await assertSucceeds(getDocs(query(offers, where('open', '==', true), where('audience', 'array-contains', P2))));
    await assertSucceeds(getDocs(query(offers, where('open', '==', true), where('audience', 'array-contains', '*'))));
    await assertFails(getDocs(query(offers, where('audience', 'array-contains', P2))));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(offerRef(ctx.firestore()), { open: false }));
    await assertFails(getDoc(offerRef(p2Db())));
  });

  it('botín: el primero que llega se lo lleva, sin pagar', async () => {
    await seedOffer();
    await assertFails(claimBatch(p1Db(), 2, { invQty: 3 }));
    await assertFails(claimBatch(p1Db(), 4));
    await assertSucceeds(claimBatch(p1Db(), 2));
    await assertFails(claimBatch(p1Db(), 2, { from: 1, create: false, invQty: 4 }));
    await assertSucceeds(claimBatch(p1Db(), 1, { from: 1, create: false, invQty: 3 }));
    await assertFails(updateDoc(lineRef(p1Db()), { stock: 0, price: 0 }));
  });

  it('no se toma sin llevárselo, ni de una ventana cerrada o ajena', async () => {
    await seedOffer();
    await assertFails(updateDoc(lineRef(p1Db()), { stock: 2 }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(offerRef(ctx.firestore()), { open: false }));
    await assertFails(claimBatch(p1Db(), 1));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(offerRef(ctx.firestore()), { open: true, audience: [P2] }));
    await assertFails(claimBatch(p1Db(), 1));
  });

  it('la copia debe ser fiel a la línea', async () => {
    await seedOffer();
    const b = writeBatch(p1Db());
    b.update(lineRef(p1Db()), { stock: 2 });
    b.set(inv(p1Db(), P1), { ...copy(1), name: 'Poción legendaria' });
    await assertFails(b.commit());
  });

  it('tienda: cobra precio × cantidad y no deja deber', async () => {
    await seedOffer({ kind: 'shop', coins: 10 });
    await assertFails(claimBatch(p1Db(), 2));
    await assertFails(claimBatch(p1Db(), 2, { coins: 3 }));
    await assertFails(claimBatch(p1Db(), 3, { coins: -2 }));
    await assertSucceeds(claimBatch(p1Db(), 2, { coins: 2 }));
  });
});

describe('tiradas: declarar', () => {
  it('el jugador declara con una habilidad propia', async () => {
    await seedRoom(env);
    await assertSucceeds(setDoc(rollRef(p1Db()), declaredRoll(P1)));
  });

  it('no se declara por otro, con habilidad inventada, ni siendo DM', async () => {
    await seedRoom(env);
    await assertFails(setDoc(rollRef(p1Db()), { ...declaredRoll(P1), characterId: P2 }));
    await assertFails(setDoc(rollRef(p1Db()), declaredRoll(P1, { skillLevel: 2 })));
    await assertFails(setDoc(rollRef(p1Db()), declaredRoll(P1, { skillIndex: 1, skillName: 'Trepar', skillLevel: 2 })));
    await assertFails(setDoc(rollRef(p1Db()), { ...declaredRoll(P1), estado: 'aprobada' }));
    await assertFails(setDoc(rollRef(dmDb()), declaredRoll(DM)));
  });

  it('las tiradas no se borran', async () => {
    await seedRoom(env);
    await seedRoll(env, 'r1', { characterId: P1 });
    await assertFails(deleteDoc(rollRef(p1Db())));
    await assertFails(deleteDoc(rollRef(dmDb())));
  });

  it('el DM borra las tiradas, la ficha y el inventario de quien ya no está', async () => {
    await seedRoom(env);
    await seedRoll(env, 'r1', { characterId: P1 });
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `rooms/${ROOM}/characters/${P1}/inventory/c1`), { name: 'Cuerda', quantity: 1 }));
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), `rooms/${ROOM}/members/${P1}`)));
    await assertFails(deleteDoc(rollRef(p2Db())));
    const b = writeBatch(dmDb());
    b.delete(rollRef(dmDb()));
    b.delete(doc(dmDb(), `rooms/${ROOM}/characters/${P1}/inventory/c1`));
    b.delete(charRef(dmDb(), P1));
    await assertSucceeds(b.commit());
  });
});

describe('tiradas: flujo completo', () => {
  const upd = (extra) => ({ ...extra, updatedAt: serverTimestamp() });

  it('declarada → aprobada → oposicion → tirada → resuelta → avance aplicado', async () => {
    await seedRoom(env);
    // El propósito es opcional y corto.
    await assertFails(setDoc(rollRef(p1Db()), { ...declaredRoll(P1), proposito: 'x'.repeat(201) }));
    await assertSucceeds(setDoc(rollRef(p1Db()), { ...declaredRoll(P1), proposito: 'llegar al otro lado' }));

    let h = H0();
    // El jugador no puede aprobarse ni saltar pasos.
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'aprobada', historial: [...h, { de: 'declarada', a: 'aprobada', por: P1 }],
    })));
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'tirada', tirada: { dados: [6], total: 6 }, historial: [...h, { de: 'declarada', a: 'tirada', por: P1 }],
    })));

    h = [...h, { de: 'declarada', a: 'aprobada', por: DM }];
    await assertSucceeds(updateDoc(rollRef(dmDb()), upd({ estado: 'aprobada', historial: h })));

    // Oposición con total falso: rechazada.
    const hOpp = [...h, { de: 'aprobada', a: 'oposicion', por: DM }];
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [3, 3], total: 12 }, historial: hOpp,
    })));
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [3, 7], total: 10 }, historial: hOpp,
    })));
    // Objetivo fijo: sin dados; entero entre 1 y maxDice·6, y solo el DM.
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [], total: 0 }, historial: hOpp,
    })));
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [], total: 61 }, historial: hOpp,
    })));
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [], total: 9, fijo: true }, historial: hOpp,
    })));
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'oposicion', oposicion: { dados: [], total: 9 }, historial: [...h, { de: 'aprobada', a: 'oposicion', por: P1 }],
    })));
    await assertSucceeds(updateDoc(rollRef(dmDb()), upd({
      estado: 'oposicion', oposicion: { dados: [3, 3], total: 6 }, historial: hOpp,
    })));
    h = hOpp;

    // El DM no tira por el jugador; el número de dados debe ser el nivel.
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'tirada', tirada: { dados: [6], total: 6 }, historial: [...h, { de: 'oposicion', a: 'tirada', por: DM }],
    })));
    const hRoll = [...h, { de: 'oposicion', a: 'tirada', por: P1 }];
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'tirada', tirada: { dados: [6, 6], total: 12 }, historial: hRoll,
    })));
    await assertSucceeds(updateDoc(rollRef(p1Db()), upd({
      estado: 'tirada', tirada: { dados: [6], total: 6 }, historial: hRoll,
    })));
    h = hRoll;

    // 6 contra 6 con empate a favor del jugador: éxito.
    const hRes = [...h, { de: 'tirada', a: 'resuelta', por: P1 }];
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'resuelta', outcome: 'fallo', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));
    await assertFails(updateDoc(rollRef(p1Db()), upd({
      estado: 'resuelta', outcome: 'exito', tieWinner: 'opposition', avance: { estado: 'pendiente' }, historial: hRes,
    })));
    await assertSucceeds(updateDoc(rollRef(p1Db()), upd({
      estado: 'resuelta', outcome: 'exito', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));

    // Todos 6: habilidad nueva de nivel 2, gratis.
    const saltar = { name: 'Saltar', level: 2, permanent: false, derivedFrom: 'Do Anything 1' };
    const apply = (db, skill, xp = 0) => {
      const b = writeBatch(db);
      b.update(charRef(db, P1), { skills: [BASE_SKILL, skill], xp, lastAppliedRollId: 'r1' });
      b.update(rollRef(db), upd({
        avance: { estado: 'aplicado', xpGained: 0, xpSpent: 0, newSkill: skill, replacedSkillIndex: null },
      }));
      return b.commit();
    };
    await assertFails(apply(p1Db(), { ...saltar, level: 3 }));
    await assertFails(apply(p1Db(), saltar, 4));
    await assertFails(apply(p2Db(), saltar));
    await assertSucceeds(apply(p1Db(), saltar));

    // No se aplica dos veces.
    await assertFails(apply(p1Db(), saltar));
  });

  it('fallo: +1 XP, y con xpSameRoll puede gastarse en la misma tirada', async () => {
    await seedRoom(env);
    const resolved = (id) => seedRoll(env, id, {
      characterId: P1, estado: 'resuelta',
      oposicion: { dados: [5], total: 5 }, tirada: { dados: [2], total: 2 },
      outcome: 'fallo', tieWinner: 'player', avance: { estado: 'pendiente' },
    });

    await resolved('r1');
    const onlyXp = (db, xp) => {
      const b = writeBatch(db);
      b.update(charRef(db, P1), { xp, lastAppliedRollId: 'r1' });
      b.update(rollRef(db, 'r1'), upd({
        avance: { estado: 'aplicado', xpGained: 1, xpSpent: 0, newSkill: null, replacedSkillIndex: null },
      }));
      return b.commit();
    };
    await assertFails(onlyXp(p1Db(), 5));
    await assertSucceeds(onlyXp(p1Db(), 1));

    // Segunda tirada fallida: gana 1 y gasta 1 para convertir el 2 en 6.
    await resolved('r2');
    const correr = { name: 'Correr', level: 2, permanent: false, derivedFrom: 'Do Anything 1' };
    const b = writeBatch(p1Db());
    b.update(charRef(p1Db(), P1), { xp: 1, skills: [BASE_SKILL, correr], lastAppliedRollId: 'r2' });
    b.update(rollRef(p1Db(), 'r2'), upd({
      avance: { estado: 'aplicado', xpGained: 1, xpSpent: 1, newSkill: correr, replacedSkillIndex: null },
    }));
    await assertSucceeds(b.commit());
  });

  it('sin xpSameRoll no se puede gastar el XP recién ganado', async () => {
    await seedRoom(env, { settings: { ...DEFAULT_SETTINGS, xpSameRoll: false } });
    await seedRoll(env, 'r1', {
      characterId: P1, estado: 'resuelta',
      oposicion: { dados: [5], total: 5 }, tirada: { dados: [2], total: 2 },
      outcome: 'fallo', tieWinner: 'player', avance: { estado: 'pendiente' },
    });
    const correr = { name: 'Correr', level: 2, permanent: false, derivedFrom: 'Do Anything 1' };
    const b = writeBatch(p1Db());
    b.update(charRef(p1Db(), P1), { xp: 0, skills: [BASE_SKILL, correr], lastAppliedRollId: 'r1' });
    b.update(rollRef(p1Db()), upd({
      avance: { estado: 'aplicado', xpGained: 1, xpSpent: 1, newSkill: correr, replacedSkillIndex: null },
    }));
    await assertFails(b.commit());
  });

  it('estados: solo el DM, con nombre y valor acotados', async () => {
    await seedRoom(env);
    const lluvia = { name: 'Lloviendo', rating: -4 };
    await assertFails(updateDoc(charRef(p1Db(), P1), { statuses: [lluvia] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { statuses: [{ name: '', rating: -4 }] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { statuses: [{ name: 'Herido', rating: 21 }] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { statuses: [{ name: 'Herido', rating: -1, extra: 1 }] }));
    await assertFails(updateDoc(charRef(dmDb(), P1), { statuses: Array(11).fill(lluvia) }));
    await assertSucceeds(updateDoc(charRef(dmDb(), P1), { statuses: [lluvia, { name: 'Zapato limpio', rating: 2 }] }));
    await assertSucceeds(updateDoc(charRef(dmDb(), P1), { statuses: [] }));
  });

  it('modificador: lo fija el DM al oponer y cuenta en el resultado', async () => {
    await seedRoom(env);
    const h = [{ de: null, a: 'declarada', por: P1 }, { de: 'declarada', a: 'aprobada', por: DM }];
    await seedRoll(env, 'r1', { characterId: P1, estado: 'aprobada', historial: h });
    const hOpp = [...h, { de: 'aprobada', a: 'oposicion', por: DM }];
    await assertFails(updateDoc(rollRef(dmDb(), 'r1'), upd({
      estado: 'oposicion', oposicion: { dados: [3], total: 3 }, modificador: -201, historial: hOpp,
    })));
    await assertFails(updateDoc(rollRef(dmDb(), 'r1'), upd({
      estado: 'oposicion', oposicion: { dados: [3], total: 3 }, modificador: -1, modificadorNota: 'x'.repeat(201), historial: hOpp,
    })));
    await assertSucceeds(updateDoc(rollRef(dmDb(), 'r1'), upd({
      estado: 'oposicion', oposicion: { dados: [3], total: 3 }, modificador: -2, modificadorNota: '−2 Lloviendo', historial: hOpp,
    })));
    const hRoll = [...hOpp, { de: 'oposicion', a: 'tirada', por: P1 }];
    // El jugador no toca el modificador.
    await assertFails(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'tirada', tirada: { dados: [4], total: 4 }, modificador: 0, historial: hRoll,
    })));
    await assertSucceeds(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'tirada', tirada: { dados: [4], total: 4 }, historial: hRoll,
    })));
    // 4 − 2 = 2 < 3: fallo aunque los dados superen la oposición.
    const hRes = [...hRoll, { de: 'tirada', a: 'resuelta', por: P1 }];
    await assertFails(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'resuelta', outcome: 'exito', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));
    await assertSucceeds(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'resuelta', outcome: 'fallo', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));
  });

  it('empate parcial: outcome «empate» y el avance no da XP', async () => {
    await seedRoom(env, { settings: { ...DEFAULT_SETTINGS, tieWinner: 'partial' } });
    const h = [{ de: null, a: 'declarada', por: P1 }, { de: 'declarada', a: 'aprobada', por: DM },
               { de: 'aprobada', a: 'oposicion', por: DM }, { de: 'oposicion', a: 'tirada', por: P1 }];
    await seedRoll(env, 'r1', {
      characterId: P1, estado: 'tirada', historial: h,
      oposicion: { dados: [4], total: 4 }, tirada: { dados: [4], total: 4 },
    });
    const hRes = [...h, { de: 'tirada', a: 'resuelta', por: P1 }];
    for (const outcome of ['exito', 'fallo']) {
      await assertFails(updateDoc(rollRef(p1Db(), 'r1'), upd({
        estado: 'resuelta', outcome, tieWinner: 'partial', avance: { estado: 'pendiente' }, historial: hRes,
      })));
    }
    await assertSucceeds(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'resuelta', outcome: 'empate', tieWinner: 'partial', avance: { estado: 'pendiente' }, historial: hRes,
    })));
    const apply = (xp, xpGained) => {
      const b = writeBatch(p1Db());
      b.update(charRef(p1Db(), P1), { xp, lastAppliedRollId: 'r1' });
      b.update(rollRef(p1Db(), 'r1'), upd({
        avance: { estado: 'aplicado', xpGained, xpSpent: 0, newSkill: null, replacedSkillIndex: null },
      }));
      return b.commit();
    };
    await assertFails(apply(1, 1));
    await assertSucceeds(apply(0, 0));
  });

  it('objetivo fijo: se resuelve contra el total sin dados', async () => {
    await seedRoom(env);
    const h = [{ de: null, a: 'declarada', por: P1 }, { de: 'declarada', a: 'aprobada', por: DM }];
    await seedRoll(env, 'r1', { characterId: P1, estado: 'aprobada', historial: h });
    const hOpp = [...h, { de: 'aprobada', a: 'oposicion', por: DM }];
    await assertSucceeds(updateDoc(rollRef(dmDb(), 'r1'), upd({
      estado: 'oposicion', oposicion: { dados: [], total: 3 }, historial: hOpp,
    })));
    const hRoll = [...hOpp, { de: 'oposicion', a: 'tirada', por: P1 }];
    await assertSucceeds(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'tirada', tirada: { dados: [2], total: 2 }, historial: hRoll,
    })));
    const hRes = [...hRoll, { de: 'tirada', a: 'resuelta', por: P1 }];
    await assertFails(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'resuelta', outcome: 'exito', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));
    await assertSucceeds(updateDoc(rollRef(p1Db(), 'r1'), upd({
      estado: 'resuelta', outcome: 'fallo', tieWinner: 'player', avance: { estado: 'pendiente' }, historial: hRes,
    })));
  });

  it('slots llenos: reemplazar cualquier habilidad menos Do Anything 1', async () => {
    await seedRoom(env, { settings: { ...DEFAULT_SETTINGS, skillSlots: 1 }, skills: { [P1]: [BASE_SKILL, TREPAR] } });
    await seedRoll(env, 'r1', {
      characterId: P1, estado: 'resuelta', skillIndex: 1, skillName: 'Trepar', skillLevel: 2,
      oposicion: { dados: [3], total: 3 }, tirada: { dados: [6, 6], total: 12 },
      outcome: 'exito', tieWinner: 'player', avance: { estado: 'pendiente' },
    });
    const muros = { name: 'Escalar muros', level: 3, permanent: false, derivedFrom: 'Trepar 2' };
    const apply = (skills, idx) => {
      const b = writeBatch(p1Db());
      b.update(charRef(p1Db(), P1), { skills, lastAppliedRollId: 'r1' });
      b.update(rollRef(p1Db()), upd({
        avance: { estado: 'aplicado', xpGained: 0, xpSpent: 0, newSkill: muros, replacedSkillIndex: idx },
      }));
      return b.commit();
    };
    await assertFails(apply([BASE_SKILL, TREPAR, muros], null)); // sin slot libre
    await assertFails(apply([muros, TREPAR], 0));                // Do Anything es permanente
    await assertSucceeds(apply([BASE_SKILL, muros], 1));
  });

  it('sin_tirada: el DM narra y la tirada queda resuelta sin avance', async () => {
    await seedRoom(env);
    await seedRoll(env, 'r1', { characterId: P1 });
    const h = [...H0(), { de: 'declarada', a: 'sin_tirada', por: DM }, { de: 'sin_tirada', a: 'resuelta', por: DM }];
    const narrate = (db, extra = {}) => updateDoc(rollRef(db), upd({
      estado: 'resuelta', outcome: 'narrado', narracion: 'Saltas sin problema.',
      avance: { estado: 'no_aplica' }, historial: h, ...extra,
    }));
    await assertFails(narrate(p1Db()));
    await assertFails(narrate(dmDb(), { narracion: '' }));
    await assertSucceeds(narrate(dmDb()));
  });

  it('contraoferta aceptada y rechazo seguido de retirada', async () => {
    await seedRoom(env, { skills: { [P2]: [BASE_SKILL, TREPAR] } });
    await seedRoll(env, 'r1', {
      ...declaredRoll(P2, { skillIndex: 1, skillName: 'Trepar', skillLevel: 2 }),
      createdAt: new Date(), updatedAt: new Date(),
    });

    let h = [...H0(P2), { de: 'declarada', a: 'contraoferta', por: DM }];
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'contraoferta', historial: h, notaDm: 'Eso no es trepar',
      contraoferta: { skillIndex: 0, skillName: 'Do Anything', skillLevel: 2 },
    })));
    await assertSucceeds(updateDoc(rollRef(dmDb()), upd({
      estado: 'contraoferta', historial: h, notaDm: 'Eso no es trepar',
      contraoferta: { skillIndex: 0, skillName: 'Do Anything', skillLevel: 1 },
    })));

    // Otro jugador no puede aceptar por P2.
    const hAccept = [...h, { de: 'contraoferta', a: 'declarada', por: P2 }];
    const accept = (db) => updateDoc(rollRef(db), upd({
      estado: 'declarada', skillIndex: 0, skillName: 'Do Anything', skillLevel: 1, proposito: 'ver qué hay arriba',
      contraoferta: null, notaDm: null, historial: hAccept,
    }));
    await assertFails(accept(p1Db()));
    await assertSucceeds(accept(p2Db()));
    h = hAccept;

    h = [...h, { de: 'declarada', a: 'rechazada', por: DM }];
    await assertSucceeds(updateDoc(rollRef(dmDb()), upd({ estado: 'rechazada', notaDm: 'No', historial: h })));

    const hWithdraw = [...h, { de: 'rechazada', a: 'retirada', por: P2 }];
    await assertFails(updateDoc(rollRef(p1Db()), upd({ estado: 'retirada', historial: hWithdraw })));
    await assertSucceeds(updateDoc(rollRef(p2Db()), upd({ estado: 'retirada', historial: hWithdraw })));
  });

  it('el historial no se puede reescribir', async () => {
    await seedRoom(env);
    await seedRoll(env, 'r1', { characterId: P1 });
    await assertFails(updateDoc(rollRef(dmDb()), upd({
      estado: 'aprobada',
      historial: [{ de: null, a: 'declarada', por: DM }, { de: 'declarada', a: 'aprobada', por: DM }],
    })));
  });
});
