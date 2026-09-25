import { ref, remove, set } from 'firebase/database';
import { collection, deleteDoc, doc, getDoc, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { validateRoomSettings, type RoomSettings } from '../engine';
import { db, rtdb } from '../firebase/app';
import { isPermissionDenied, UserError } from './errors';
import { roomFrom, settingsToMap, type Room } from './models';

/* Salas, códigos y membresías. Firestore es la fuente de verdad; RTDB lleva un espejo mínimo de la membresía
 * porque sus reglas no pueden leer Firestore. */

// Sin 0/O, 1/I/L ni U para evitar confusiones al dictar el código.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 6;

export const roomRef = (id: string) => doc(db, 'rooms', id);
const codeRef = (code: string) => doc(db, 'roomCodes', code);
const memberRef = (roomId: string, uid: string) => doc(db, 'rooms', roomId, 'members', uid);
const myRoomRef = (uid: string, roomId: string) => doc(db, 'users', uid, 'rooms', roomId);

export const membersQuery = (roomId: string) => collection(db, 'rooms', roomId, 'members');
export const myRoomsQuery = (uid: string) => query(collection(db, 'users', uid, 'rooms'), orderBy('joinedAt', 'desc'));

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  let out = '';
  while (out.length < CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // 240 = 8 × 30: sin sesgo de módulo.
      if (b < 240 && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

async function freeCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newCode();
    if (!(await getDoc(codeRef(code))).exists()) return code;
  }
  throw new UserError('No se pudo generar un código de sala libre.');
}

/** Crea la sala; quien la crea es el DM. Devuelve el id de la sala. */
export async function createRoom(uid: string, displayName: string, name: string, settings: RoomSettings): Promise<string> {
  validateRoomSettings(settings);
  const cleanName = name.trim();
  if (!cleanName) throw new UserError('La sala necesita un nombre.');

  const code = await freeCode();
  const room = doc(collection(db, 'rooms'));
  const batch = writeBatch(db);
  batch.set(room, { name: cleanName, dmUid: uid, code, settings: settingsToMap(settings), status: 'open', createdAt: serverTimestamp() });
  batch.set(codeRef(code), { roomId: room.id, createdAt: serverTimestamp() });
  batch.set(memberRef(room.id, uid), { role: 'dm', displayName, joinCode: null, characterId: null, joinedAt: serverTimestamp() });
  batch.set(myRoomRef(uid, room.id), { name: cleanName, role: 'dm', joinedAt: serverTimestamp() });
  await batch.commit();

  await set(ref(rtdb, `roomAccess/${room.id}`), { dm: uid, code });
  await set(ref(rtdb, `members/${room.id}/${uid}`), { role: 'dm', code });
  return room.id;
}

async function isMember(roomId: string, uid: string): Promise<boolean> {
  try {
    return (await getDoc(memberRef(roomId, uid))).exists();
  } catch (e) {
    // Sin membresía, las reglas no dejan ni leer el documento.
    if (isPermissionDenied(e)) return false;
    throw e;
  }
}

/** Busca la sala de un código (lectura permitida a cualquier sesión válida). */
export async function roomIdForCode(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  if (!isValidCode(normalized)) throw new UserError('El código tiene 6 caracteres.');
  const snap = await getDoc(codeRef(normalized));
  if (!snap.exists()) throw new UserError('No hay ninguna sala con ese código.');
  return String(snap.data().roomId);
}

/** Une al usuario a la sala del código. Devuelve el id de la sala. */
export async function joinByCode(uid: string, displayName: string, code: string): Promise<string> {
  const normalized = normalizeCode(code);
  const roomId = await roomIdForCode(normalized);

  if (!(await isMember(roomId, uid))) {
    await setDoc(memberRef(roomId, uid), { role: 'player', displayName, joinCode: normalized, characterId: null, joinedAt: serverTimestamp() });
    await set(ref(rtdb, `members/${roomId}/${uid}`), { role: 'player', code: normalized });
  }

  const room = roomFrom(roomId, (await getDoc(roomRef(roomId))).data() ?? {});
  await setDoc(myRoomRef(uid, roomId), { name: room.name, role: room.dmUid === uid ? 'dm' : 'player', joinedAt: serverTimestamp() });
  return roomId;
}

export async function updateRoom(room: Room, name: string, settings: RoomSettings): Promise<void> {
  validateRoomSettings(settings);
  const cleanName = name.trim();
  if (!cleanName) throw new UserError('La sala necesita un nombre.');
  await updateDoc(roomRef(room.id), { name: cleanName, settings: settingsToMap(settings) });
}

/** Nuevo código de sala; el anterior deja de servir para unirse. */
export async function rotateCode(room: Room): Promise<string> {
  const code = await freeCode();
  const batch = writeBatch(db);
  batch.set(codeRef(code), { roomId: room.id, createdAt: serverTimestamp() });
  batch.update(roomRef(room.id), { code });
  batch.delete(codeRef(room.code));
  await batch.commit();
  await set(ref(rtdb, `roomAccess/${room.id}/code`), code);
  return code;
}

/** El DM expulsa a un jugador (su personaje se conserva). */
export async function removeMember(roomId: string, uid: string): Promise<void> {
  await deleteDoc(memberRef(roomId, uid));
  await remove(ref(rtdb, `members/${roomId}/${uid}`));
}

/** Quita la sala del índice personal ("Mis salas"). */
export async function forgetRoom(uid: string, roomId: string): Promise<void> {
  await deleteDoc(myRoomRef(uid, roomId));
}
