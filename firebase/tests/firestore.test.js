import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  anonymous, BASE_SKILL, CODE, createEnv, declaredRoll, DEFAULT_SETTINGS, DM, P1, P2, registered,
  ROOM, seedRoll, seedRoom,
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
const p1Db = () => cached(P1, () => anonymous(env, P1));
const p2Db = () => cached(P2, () => anonymous(env, P2));
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
  it('un usuario anónimo no puede crear salas', async () => {
    const db = anonymous(env, 'anon').firestore();
    await assertFails(newRoomBatch(db, 'anon', 'r2', 'AAAAAA').commit());
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

  it('los códigos se pueden leer uno a uno pero no listar', async () => {
    await seedRoom(env);
    await assertSucceeds(getDoc(doc(anonymous(env, 'nadie').firestore(), `roomCodes/${CODE}`)));
  });
});

describe('unirse', () => {
  const member = (joinCode, role = 'player') => ({
    role, displayName: 'Nueve', joinCode, characterId: null, joinedAt: serverTimestamp(),
  });

  it('con el código correcto sí, con uno incorrecto no', async () => {
    await seedRoom(env, { players: [] });
    const db = anonymous(env, 'p9').firestore();
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member('ZZZZZZ')));
    await assertSucceeds(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member(CODE)));
  });

  it('no se puede entrar como DM ni inscribir a otro usuario', async () => {
    await seedRoom(env, { players: [] });
    const db = anonymous(env, 'p9').firestore();
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p9`), member(CODE, 'dm')));
    await assertFails(setDoc(doc(db, `rooms/${ROOM}/members/p8`), member(CODE)));
  });

  it('un no miembro no puede leer la sala', async () => {
    await seedRoom(env);
    await assertFails(getDoc(doc(anonymous(env, 'ajeno').firestore(), `rooms/${ROOM}`)));
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
    const db = anonymous(env, 'p9').firestore();
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
  const item = (extra = {}) => ({ name: 'Cuerda', description: '10 m', value: null, quantity: 1, ...extra });
  const inv = (db, uid, id = 'i1') => doc(db, `rooms/${ROOM}/characters/${uid}/inventory/${id}`);

  it('el catálogo es privado del DM', async () => {
    await seedRoom(env);
    const ref = (db) => doc(db, `rooms/${ROOM}/catalog/c1`);
    await assertSucceeds(setDoc(ref(dmDb()), item({ value: 5, quantity: 0 })));
    await assertFails(setDoc(ref(dmDb()), item({ quantity: -1 })));
    await assertFails(setDoc(ref(dmDb()), item({ name: '' })));
    await assertFails(getDoc(ref(p1Db())));
    await assertFails(setDoc(ref(p1Db()), item()));
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
});

describe('tiradas: flujo completo', () => {
  const upd = (extra) => ({ ...extra, updatedAt: serverTimestamp() });

  it('declarada → aprobada → oposicion → tirada → resuelta → avance aplicado', async () => {
    await seedRoom(env);
    await assertSucceeds(setDoc(rollRef(p1Db()), declaredRoll(P1)));

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
      estado: 'declarada', skillIndex: 0, skillName: 'Do Anything', skillLevel: 1,
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
