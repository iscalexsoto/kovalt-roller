import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export const PROJECT_ID = 'demo-kovalt';
export const ROOM = 'room1';
export const CODE = 'K7Q2MX';
export const DM = 'dm';
export const P1 = 'p1';
export const P2 = 'p2';

export const DEFAULT_SETTINGS = { skillSlots: 2, tieWinner: 'player', xpSameRoll: true, maxDice: 10 };
export const BASE_SKILL = { name: 'Do Anything', level: 1, permanent: true, derivedFrom: null };

// `firebase emulators:exec` publica dónde quedó cada emulador; por defecto, los puertos de firebase.json.
function emulator(envVar, port) {
  const [host, p] = (process.env[envVar] ?? `127.0.0.1:${port}`).split(':');
  return { host, port: Number(p) };
}

export async function createEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(here('../firestore.rules'), 'utf8'),
      ...emulator('FIRESTORE_EMULATOR_HOST', 8080),
    },
    database: {
      rules: readFileSync(here('../database.rules.json'), 'utf8'),
      ...emulator('FIREBASE_DATABASE_EMULATOR_HOST', 9000),
    },
  });
}

// Las sesiones las emite el Worker (web/worker/sessions.ts) como custom tokens: `kvExp` es hasta cuándo valen
// y los invitados llevan `guest` y la sala a la que se limitan (`room`).
const IN_A_DAY = () => Date.now() + 24 * 60 * 60 * 1000;
const custom = (claims) => ({ firebase: { sign_in_provider: 'custom' }, ...claims });

/** Cuenta de la lista blanca de la suite. */
export function registered(env, uid) {
  return env.authenticatedContext(uid, custom({ name: uid, kvExp: IN_A_DAY() }));
}

/** Invitado limitado a la sala `room`. */
export function guest(env, uid, room = ROOM) {
  return env.authenticatedContext(uid, custom({ name: uid, guest: true, room, kvExp: IN_A_DAY() }));
}

/** Sesión con claims arbitrarios (p. ej. `kvExp` vencido o ausente). */
export function withClaims(env, uid, claims) {
  return env.authenticatedContext(uid, custom(claims));
}

/** Crea sala + código + DM + jugadores (con personaje) sin pasar por reglas. */
export async function seedRoom(env, { settings = DEFAULT_SETTINGS, players = [P1, P2], skills = {} } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `rooms/${ROOM}`), {
      name: 'Mesa', dmUid: DM, code: CODE, settings, status: 'open', createdAt: new Date(),
    });
    await setDoc(doc(db, `roomCodes/${CODE}`), { roomId: ROOM, createdAt: new Date() });
    await setDoc(doc(db, `rooms/${ROOM}/members/${DM}`), {
      role: 'dm', displayName: 'DM', joinCode: null, characterId: null, joinedAt: new Date(),
    });
    for (const p of players) {
      await setDoc(doc(db, `rooms/${ROOM}/members/${p}`), {
        role: 'player', displayName: p, joinCode: CODE, characterId: p, joinedAt: new Date(),
      });
      await setDoc(doc(db, `rooms/${ROOM}/characters/${p}`), {
        ownerUid: p, name: `Personaje ${p}`, description: '', notes: '', xp: 0,
        skills: skills[p] ?? [BASE_SKILL], lastAppliedRollId: null, updatedAt: new Date(),
      });
    }
  });
}

/** Documento de tirada recién declarada, tal como lo escribe el cliente. */
export function declaredRoll(uid, { skillIndex = 0, skillName = 'Do Anything', skillLevel = 1 } = {}) {
  return {
    estado: 'declarada',
    characterId: uid,
    declaradoPor: uid,
    accion: 'Salto el foso',
    proposito: null,
    skillIndex, skillName, skillLevel,
    contraoferta: null, notaDm: null, oposicion: null, modificador: 0, modificadorNota: null, tirada: null,
    outcome: null, narracion: null, tieWinner: null, avance: null,
    historial: [{ de: null, a: 'declarada', por: uid }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Escribe una tirada en un estado arbitrario sin pasar por reglas. */
export async function seedRoll(env, id, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `rooms/${ROOM}/rolls/${id}`), {
      ...declaredRoll(data.characterId ?? P1),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    });
  });
}

export function hist(prev, ...entries) {
  return [...prev, ...entries];
}

export { doc, serverTimestamp, setDoc, writeBatch };
