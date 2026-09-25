import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  applyRoll,
  declare,
  resolve,
  transition,
  type Actor,
  type AdvancementChoice,
  type ApplyResult,
  type FlowAction,
  type RollOutcome,
  type RoomSettings,
  type SkillRef,
} from '../engine';
import { db } from '../firebase/app';
import { UserError } from './errors';
import { rollFields, skillToMap, type CharacterDoc, type RollDoc, type Room } from './models';

/* Tiradas de la sala. Cada cambio de estado pasa por la máquina de estados del motor (`transition`) y se escribe
 * tal cual; las Security Rules validan lo mismo del lado del servidor. */

const rolls = (roomId: string) => collection(db, 'rooms', roomId, 'rolls');

export const rollsQuery = (roomId: string, max = 100) => query(rolls(roomId), orderBy('createdAt', 'desc'), limit(max));

/** El jugador declara una acción con una de sus habilidades. */
export async function declareRoll(roomId: string, uid: string, action: string, skill: SkillRef): Promise<void> {
  const record = declare(action, skill);
  await addDoc(rolls(roomId), { ...rollFields(record, [], uid), characterId: uid, declaradoPor: uid, createdAt: serverTimestamp() });
}

/** Aplica una acción del flujo y la persiste. Devuelve la tirada resultante. */
export async function act(room: Room, roll: RollDoc, action: FlowAction, actor: Actor, uid: string): Promise<RollDoc> {
  const next = transition(roll.record, action, actor);
  const fields = rollFields(next, roll.rawHistory, uid);
  await updateDoc(doc(rolls(room.id), roll.id), fields);
  return { ...roll, record: next, rawHistory: fields.historial };
}

/** Resultado de una tirada resuelta, con el criterio de empate con el que se resolvió. */
export function outcomeOf(roll: RollDoc, settings: RoomSettings): RollOutcome {
  const { playerRoll, opposition, tieWinner } = roll.record;
  if (!playerRoll || !opposition) throw new UserError('Esta tirada todavía no tiene dados.');
  return resolve(playerRoll, opposition, tieWinner ?? settings.tieWinner);
}

/** Aplica el resultado a la hoja (XP y, si se eligió, la habilidad nueva) y marca el avance como aplicado, en un
 *  solo batch (las reglas lo comprueban con `getAfter`). */
export async function applyAdvance(
  room: Room,
  roll: RollDoc,
  character: CharacterDoc,
  choice: AdvancementChoice | null,
  actor: Actor,
  uid: string,
): Promise<ApplyResult> {
  const record = roll.record;
  const result = applyRoll(character.sheet, room.settings, record.playerRoll!, outcomeOf(roll, room.settings), record.skill.index, choice);
  const next = transition(
    record,
    {
      kind: 'applyAdvance',
      applied: { xpGained: result.xpGained, xpSpent: result.xpSpent, newSkill: result.newSkill, replacedIndex: result.replaced?.index ?? null },
    },
    actor,
  );

  const batch = writeBatch(db);
  batch.update(doc(db, 'rooms', room.id, 'characters', character.id), {
    xp: result.character.xp,
    skills: result.character.skills.map(skillToMap),
    lastAppliedRollId: roll.id,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(rolls(room.id), roll.id), rollFields(next, roll.rawHistory, uid));
  await batch.commit();
  return result;
}
