import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch, type DocumentReference } from 'firebase/firestore';
import type { Character, Skill } from '../engine';
import { db } from '../firebase/app';
import { characterToMap, skillToMap } from './models';

const characterRef = (roomId: string, cid: string) => doc(db, 'rooms', roomId, 'characters', cid);

export const charactersQuery = (roomId: string) => collection(db, 'rooms', roomId, 'characters');

/** Crea la hoja (el id es el uid del dueño) y la enlaza en la membresía. */
export async function createCharacter(roomId: string, uid: string, sheet: Character): Promise<void> {
  const batch = writeBatch(db);
  batch.set(characterRef(roomId, uid), characterToMap(uid, sheet));
  batch.update(doc(db, 'rooms', roomId, 'members', uid), { characterId: uid });
  await batch.commit();
}

/** Cambia uno o más textos de la hoja (nombre y descripción sin espacios de sobra). */
export async function updateCharacterTexts(roomId: string, cid: string, texts: Partial<{ name: string; description: string; notes: string }>): Promise<void> {
  await updateDoc(characterRef(roomId, cid), {
    ...(texts.name !== undefined && { name: texts.name.trim() }),
    ...(texts.description !== undefined && { description: texts.description.trim() }),
    ...(texts.notes !== undefined && { notes: texts.notes }),
    updatedAt: serverTimestamp(),
  });
}

/** Corrección manual del DM (xp y habilidades), sujeta a las invariantes. */
export async function dmUpdateSheet(roomId: string, cid: string, xp: number, skills: Skill[]): Promise<void> {
  await updateDoc(characterRef(roomId, cid), { xp, skills: skills.map(skillToMap), updatedAt: serverTimestamp() });
}

/** El DM borra a un jugador que ya no está en la sala: su ficha, su inventario y sus tiradas. */
export async function deletePastPlayer(roomId: string, cid: string): Promise<void> {
  const [rolls, items] = await Promise.all([
    getDocs(query(collection(db, 'rooms', roomId, 'rolls'), where('characterId', '==', cid))),
    getDocs(collection(db, 'rooms', roomId, 'characters', cid, 'inventory')),
  ]);
  const refs: DocumentReference[] = [...rolls.docs.map((d) => d.ref), ...items.docs.map((d) => d.ref), characterRef(roomId, cid)];
  // La ficha va al final: si algo falla a medias, el jugador sigue en la lista y se puede reintentar.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/** Cuántas tiradas tiene un personaje (para avisar antes de borrar). */
export async function countRolls(roomId: string, cid: string): Promise<number> {
  return (await getDocs(query(collection(db, 'rooms', roomId, 'rolls'), where('characterId', '==', cid)))).size;
}
