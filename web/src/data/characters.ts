import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
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

export async function updateCharacterTexts(roomId: string, cid: string, texts: { name: string; description: string; notes: string }): Promise<void> {
  await updateDoc(characterRef(roomId, cid), {
    name: texts.name.trim(),
    description: texts.description.trim(),
    notes: texts.notes,
    updatedAt: serverTimestamp(),
  });
}

/** Corrección manual del DM (xp y habilidades), sujeta a las invariantes. */
export async function dmUpdateSheet(roomId: string, cid: string, xp: number, skills: Skill[]): Promise<void> {
  await updateDoc(characterRef(roomId, cid), { xp, skills: skills.map(skillToMap), updatedAt: serverTimestamp() });
}
