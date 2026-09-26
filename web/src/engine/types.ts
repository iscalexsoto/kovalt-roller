import { EngineError } from './errors';

/** Nombre de la habilidad con la que empieza todo personaje. */
export const BASE_SKILL_NAME = 'Do Anything';
/** Límite absoluto de dados por tirada (y por tanto de nivel de habilidad). */
export const MAX_DICE_LIMIT = 10;
export const MAX_CHARACTER_NAME_LEN = 60;
export const MAX_SKILL_NAME_LEN = 40;
export const MAX_STATUS_NAME_LEN = 40;
/** Estados por personaje (las reglas los validan sin bucles). */
export const MAX_STATUSES = 10;
/** Valor absoluto máximo de un estado y del modificador total de una tirada (10 estados al máximo). */
export const MAX_STATUS_RATING = 20;
export const MAX_MODIFIER = MAX_STATUSES * MAX_STATUS_RATING;

/** Un estado: modificador con nombre («−4 Lloviendo», «+2 Zapato limpio»). Lo pone y quita el DM; al oponer
 *  elige cuáles aplican y su suma modifica el total del jugador (nunca los dados: el avance sale de los dados). */
export interface Status {
  name: string;
  rating: number;
}

export interface Skill {
  name: string;
  level: number;
  /** Solo "Do Anything 1" es permanente: no ocupa slot y no se puede reemplazar. */
  permanent: boolean;
  /** Etiqueta de la habilidad de la que se derivó (p. ej. "Do Anything 1"). */
  derivedFrom: string | null;
}

export function baseSkill(): Skill {
  return { name: BASE_SKILL_NAME, level: 1, permanent: true, derivedFrom: null };
}

export function isBaseSkill(skill: Skill): boolean {
  return skill.permanent && skill.name === BASE_SKILL_NAME && skill.level === 1;
}

/** "Nombre N", como se escribe en la hoja. */
export function skillLabel(skill: Pick<Skill, 'name' | 'level'>): string {
  return `${skill.name} ${skill.level}`;
}

export interface Character {
  name: string;
  description: string;
  notes: string;
  xp: number;
  /** Invariante: `skills[0]` es "Do Anything 1" permanente. */
  skills: Skill[];
  statuses: Status[];
}

/** Quién gana en empate; `partial`: nadie, el jugador lo consigue a medias y no gana XP. */
export type TieWinner = 'player' | 'opposition' | 'partial';

/** Tabla de dificultad de Roll For Shoes: el DM tira `dice` d6 o usa el objetivo fijo `target`. */
export interface Difficulty {
  key: 'easy' | 'moderate' | 'hard' | 'veryHard';
  dice: number;
  target: number;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  { key: 'easy', dice: 1, target: 3 },
  { key: 'moderate', dice: 2, target: 6 },
  { key: 'hard', dice: 3, target: 9 },
  { key: 'veryHard', dice: 4, target: 12 },
];

/** Objetivo fijo máximo: lo que darían `MAX_DICE_LIMIT` seises. */
export const MAX_FIXED_TARGET = MAX_DICE_LIMIT * 6;

export interface RoomSettings {
  /** Slots para habilidades ganadas; "Do Anything 1" no cuenta. */
  skillSlots: number;
  tieWinner: TieWinner;
  /** Si el XP ganado al fallar puede gastarse en esa misma tirada. */
  xpSameRoll: boolean;
  /** Dados máximos por tirada (<= `MAX_DICE_LIMIT`). */
  maxDice: number;
}

export function defaultRoomSettings(): RoomSettings {
  return { skillSlots: 5, tieWinner: 'player', xpSameRoll: true, maxDice: MAX_DICE_LIMIT };
}

export function validateRoomSettings(settings: RoomSettings): void {
  if (!Number.isInteger(settings.skillSlots) || settings.skillSlots < 1) {
    throw new EngineError({ kind: 'InvalidSettings', reason: 'se necesita al menos 1 slot' });
  }
  if (!Number.isInteger(settings.maxDice) || settings.maxDice < 2 || settings.maxDice > MAX_DICE_LIMIT) {
    throw new EngineError({ kind: 'InvalidSettings', reason: 'máximo de dados entre 2 y 10' });
  }
}
