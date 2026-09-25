import { serverTimestamp, type DocumentData, type FieldValue, type Timestamp } from 'firebase/firestore';
import {
  DiceRoll,
  MAX_DICE_LIMIT,
  parseRollState,
  type Actor,
  type AdvanceState,
  type AppliedAdvance,
  type Character,
  type HistoryEntry,
  type Item,
  type RollRecord,
  type RollResult,
  type RoomSettings,
  type Skill,
  type SkillRef,
  type TieWinner,
} from '../engine';

/* Mapeo entre los documentos de Firestore y el motor. Los nombres de campo (muchos en español) son los que
 * exige `firebase/firestore.rules`: no se renombran sin cambiar las reglas y sus tests a la vez. */

export type Json = Record<string, unknown>;
export type MemberRole = 'dm' | 'player';

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown, fallback = 0): number => (typeof v === 'number' ? Math.trunc(v) : fallback);
const optInt = (v: unknown): number | null => (typeof v === 'number' ? Math.trunc(v) : null);
const map = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const date = (v: unknown): Date | null => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null);

// ---------- ajustes ----------

export function tieWinnerFrom(v: unknown): TieWinner | null {
  return v === 'player' || v === 'opposition' ? v : null;
}

export function settingsFrom(m: Json | null): RoomSettings {
  return {
    skillSlots: int(m?.skillSlots, 5),
    tieWinner: tieWinnerFrom(m?.tieWinner) ?? 'player',
    xpSameRoll: m?.xpSameRoll !== false,
    maxDice: int(m?.maxDice, MAX_DICE_LIMIT),
  };
}

export function settingsToMap(s: RoomSettings): Json {
  return { skillSlots: s.skillSlots, tieWinner: s.tieWinner, xpSameRoll: s.xpSameRoll, maxDice: s.maxDice };
}

// ---------- sala y miembros ----------

export interface Room {
  id: string;
  name: string;
  dmUid: string;
  code: string;
  status: string;
  settings: RoomSettings;
}

export function roomFrom(id: string, m: DocumentData): Room {
  return {
    id,
    name: str(m.name),
    dmUid: str(m.dmUid),
    code: str(m.code),
    status: str(m.status, 'open'),
    settings: settingsFrom(map(m.settings)),
  };
}

export interface Member {
  uid: string;
  role: MemberRole;
  displayName: string;
  characterId: string | null;
}

export function memberFrom(uid: string, m: DocumentData): Member {
  return { uid, role: m.role === 'dm' ? 'dm' : 'player', displayName: str(m.displayName, '?'), characterId: optStr(m.characterId) };
}

/** Entrada del índice personal `users/{uid}/rooms/{roomId}`. */
export interface MyRoomEntry {
  roomId: string;
  name: string;
  role: MemberRole;
}

export function myRoomFrom(roomId: string, m: DocumentData): MyRoomEntry {
  return { roomId, name: str(m.name, roomId), role: m.role === 'dm' ? 'dm' : 'player' };
}

// ---------- personaje ----------

export function skillFrom(m: Json): Skill {
  return { name: str(m.name), level: int(m.level, 1), permanent: m.permanent === true, derivedFrom: optStr(m.derivedFrom) };
}

export function skillToMap(s: Skill): Json {
  return { name: s.name, level: s.level, permanent: s.permanent, derivedFrom: s.derivedFrom };
}

export interface CharacterDoc {
  id: string;
  ownerUid: string;
  sheet: Character;
  lastAppliedRollId: string | null;
}

export function characterFrom(id: string, m: DocumentData): CharacterDoc {
  return {
    id,
    ownerUid: str(m.ownerUid),
    lastAppliedRollId: optStr(m.lastAppliedRollId),
    sheet: {
      name: str(m.name),
      description: str(m.description),
      notes: str(m.notes),
      xp: int(m.xp),
      skills: list(m.skills).map((s) => skillFrom(map(s) ?? {})),
    },
  };
}

export function characterToMap(ownerUid: string, c: Character): Json {
  return {
    ownerUid,
    name: c.name,
    description: c.description,
    notes: c.notes,
    xp: c.xp,
    skills: c.skills.map(skillToMap),
    lastAppliedRollId: null,
    updatedAt: serverTimestamp(),
  };
}

// ---------- objetos ----------

export interface ItemDoc extends Item {
  id: string;
  catalogItemId: string | null;
}

export function itemFrom(id: string, m: DocumentData): ItemDoc {
  return {
    id,
    name: str(m.name),
    description: str(m.description),
    value: optInt(m.value),
    quantity: int(m.quantity),
    catalogItemId: optStr(m.catalogItemId),
  };
}

export function itemToMap(i: Item): Json {
  return { name: i.name.trim(), description: i.description.trim(), value: i.value, quantity: i.quantity };
}

// ---------- tiradas ----------

/** Entrada del historial tal como está en Firestore (con el uid en `por`). */
export interface RawHistory {
  de: string | null;
  a: string;
  por: string;
}

export interface RollDoc {
  id: string;
  characterId: string;
  record: RollRecord;
  /** Historial tal como está en Firestore; misma posición que `record.history`. */
  rawHistory: RawHistory[];
  createdAt: Date | null;
}

function diceFrom(v: unknown): DiceRoll | null {
  const m = map(v);
  if (!m) return null;
  return DiceRoll.fromValues(list(m.dados).map((d) => int(d)), MAX_DICE_LIMIT);
}

function diceToMap(roll: DiceRoll | null): Json | null {
  return roll ? { dados: [...roll.dice], total: roll.total() } : null;
}

function skillRefFrom(v: unknown): SkillRef | null {
  const m = map(v);
  return m ? { index: int(m.skillIndex), name: str(m.skillName), level: int(m.skillLevel, 1) } : null;
}

function resultFrom(v: unknown): RollResult | null {
  return v === 'exito' || v === 'fallo' || v === 'narrado' ? v : null;
}

function advanceFrom(v: unknown): AdvanceState | null {
  return v === 'pendiente' || v === 'aplicado' || v === 'no_aplica' ? v : null;
}

/** El motor trabaja con actores relativos a la tirada; Firestore guarda uids. */
export function actorOf(uid: string | null | undefined, dmUid: string, characterId: string): Actor {
  return uid === dmUid ? 'dm' : uid === characterId ? 'owner' : 'other';
}

export function rollFrom(id: string, m: DocumentData, dmUid: string): RollDoc {
  const characterId = str(m.characterId);
  const rawHistory: RawHistory[] = list(m.historial).map((h) => {
    const e = map(h) ?? {};
    return { de: optStr(e.de), a: str(e.a), por: str(e.por) };
  });
  const avance = map(m.avance);
  const advance = advanceFrom(avance?.estado);
  const newSkill = map(avance?.newSkill);
  const applied: AppliedAdvance | null =
    advance === 'aplicado' && avance
      ? {
          xpGained: int(avance.xpGained),
          xpSpent: int(avance.xpSpent),
          newSkill: newSkill ? skillFrom(newSkill) : null,
          replacedIndex: optInt(avance.replacedSkillIndex),
        }
      : null;
  const history: HistoryEntry[] = rawHistory.map((h) => ({
    from: parseRollState(h.de),
    to: parseRollState(h.a) ?? 'declarada',
    by: actorOf(h.por, dmUid, characterId),
  }));

  return {
    id,
    characterId,
    rawHistory,
    createdAt: date(m.createdAt),
    record: {
      state: parseRollState(m.estado) ?? 'declarada',
      action: str(m.accion),
      skill: { index: int(m.skillIndex), name: str(m.skillName), level: int(m.skillLevel, 1) },
      counterOffer: skillRefFrom(m.contraoferta),
      dmNote: optStr(m.notaDm),
      opposition: diceFrom(m.oposicion),
      playerRoll: diceFrom(m.tirada),
      result: resultFrom(m.outcome),
      narration: optStr(m.narracion),
      tieWinner: tieWinnerFrom(m.tieWinner),
      advance,
      applied,
      history,
    },
  };
}

function advanceToMap(r: RollRecord): Json | null {
  switch (r.advance) {
    case null:
      return null;
    case 'pendiente':
      return { estado: 'pendiente' };
    case 'no_aplica':
      return { estado: 'no_aplica' };
    case 'aplicado': {
      const a = r.applied!;
      return {
        estado: 'aplicado',
        xpGained: a.xpGained,
        xpSpent: a.xpSpent,
        newSkill: a.newSkill ? skillToMap(a.newSkill) : null,
        replacedSkillIndex: a.replacedIndex,
      };
    }
  }
}

/** Campos mutables de una tirada. Las entradas nuevas del historial se firman con `uid`. */
export function rollFields(r: RollRecord, previousHistory: readonly RawHistory[], uid: string): Json & { historial: RawHistory[]; updatedAt: FieldValue } {
  const co = r.counterOffer;
  return {
    estado: r.state,
    accion: r.action,
    skillIndex: r.skill.index,
    skillName: r.skill.name,
    skillLevel: r.skill.level,
    contraoferta: co ? { skillIndex: co.index, skillName: co.name, skillLevel: co.level } : null,
    notaDm: r.dmNote,
    oposicion: diceToMap(r.opposition),
    tirada: diceToMap(r.playerRoll),
    outcome: r.result,
    narracion: r.narration,
    tieWinner: r.tieWinner,
    avance: advanceToMap(r),
    historial: [...previousHistory, ...r.history.slice(previousHistory.length).map((h) => ({ de: h.from, a: h.to, por: uid }))],
    updatedAt: serverTimestamp(),
  };
}
