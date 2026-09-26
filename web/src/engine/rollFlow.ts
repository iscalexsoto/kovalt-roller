/* Máquina de estados de una tirada:
 *
 *   declarada ──(DM)──► aprobada ──(DM)──► oposicion ──(jugador)──► tirada ──► resuelta
 *       ├──(DM)──► contraoferta ──(jugador acepta / edita)──► declarada
 *       ├──(DM)──► rechazada ────(jugador edita)────────────► declarada
 *       ├──(DM)──► sin_tirada ──► resuelta (narración directa)
 *       └──(jugador)──► retirada (también desde contraoferta o rechazada)
 *
 * Los ids de estado son los que se guardan en Firestore (`estado`, `historial.de/a`). */

import type { DiceRoll } from './dice';
import { EngineError } from './errors';
import { resolve } from './resolve';
import { DIFFICULTIES, MAX_FIXED_TARGET, MAX_MODIFIER, type Character, type Difficulty, type Skill, type TieWinner } from './types';

export const ROLL_STATES = ['declarada', 'aprobada', 'contraoferta', 'rechazada', 'sin_tirada', 'oposicion', 'tirada', 'resuelta', 'retirada'] as const;
export type RollState = (typeof ROLL_STATES)[number];

export function parseRollState(s: unknown): RollState | null {
  return typeof s === 'string' && (ROLL_STATES as readonly string[]).includes(s) ? (s as RollState) : null;
}

export function isTerminal(state: RollState): boolean {
  return state === 'resuelta' || state === 'retirada';
}

/** Quién intenta la transición, relativo a la tirada: el DM, el dueño del personaje o cualquier otro miembro. */
export type Actor = 'dm' | 'owner' | 'other';

/** Referencia a una habilidad del personaje en el momento de declarar. */
export interface SkillRef {
  index: number;
  name: string;
  level: number;
}

export function skillRefFrom(character: Character, index: number): SkillRef {
  const skill: Skill | undefined = character.skills[index];
  if (!skill) throw new EngineError({ kind: 'SkillIndexOutOfRange', index });
  return { index, name: skill.name, level: skill.level };
}

/** La oposición del DM: dados tirados o un objetivo fijo (dificultad estática: 3, 6, 9, 12…). */
export type Opposition = { kind: 'dice'; dice: DiceRoll } | { kind: 'fixed'; target: number };

export function oppositionTotal(o: Opposition): number {
  return o.kind === 'dice' ? o.dice.total() : o.target;
}

/** Objetivo fijo validado: entero entre 1 y `MAX_FIXED_TARGET` (las reglas acotan además por `maxDice`). */
export function fixedOpposition(target: number): Opposition {
  if (!Number.isInteger(target) || target < 1 || target > MAX_FIXED_TARGET) {
    throw new EngineError({ kind: 'InvalidTarget', max: MAX_FIXED_TARGET });
  }
  return { kind: 'fixed', target };
}

/** La dificultad de la tabla a la que corresponde una oposición (por número de dados o por objetivo), si alguna. */
export function difficultyOf(o: Opposition): Difficulty | null {
  return DIFFICULTIES.find((d) => (o.kind === 'dice' ? d.dice === o.dice.length : d.target === o.target)) ?? null;
}

export type RollResult = 'exito' | 'fallo' | 'empate' | 'narrado';
export type AdvanceState = 'pendiente' | 'aplicado' | 'no_aplica';

/** Lo que se aplicó a la hoja al cerrar la tirada. */
export interface AppliedAdvance {
  xpGained: number;
  xpSpent: number;
  newSkill: Skill | null;
  replacedIndex: number | null;
}

export interface HistoryEntry {
  from: RollState | null;
  to: RollState;
  by: Actor;
}

export interface RollRecord {
  state: RollState;
  action: string;
  /** El "para qué" de la acción (opcional): completa la frase «intenta [acción] para [propósito]». */
  purpose: string | null;
  skill: SkillRef;
  counterOffer: SkillRef | null;
  dmNote: string | null;
  opposition: Opposition | null;
  /** Suma de los estados que el DM aplicó al oponer (0 si ninguno) y su lista, para mostrarla. */
  modifier: number;
  modifierNote: string | null;
  playerRoll: DiceRoll | null;
  result: RollResult | null;
  narration: string | null;
  tieWinner: TieWinner | null;
  advance: AdvanceState | null;
  applied: AppliedAdvance | null;
  history: HistoryEntry[];
}

export type FlowAction =
  | { kind: 'approve' }
  | { kind: 'counterOffer'; skill: SkillRef; note: string | null }
  | { kind: 'reject'; note: string | null }
  | { kind: 'narrate'; narration: string }
  | { kind: 'acceptCounterOffer' }
  | { kind: 'redeclare'; action: string; purpose: string | null; skill: SkillRef }
  | { kind: 'withdraw' }
  | { kind: 'rollOpposition'; opposition: Opposition; modifier?: number; modifierNote?: string | null }
  | { kind: 'rollPlayer'; dice: DiceRoll }
  | { kind: 'resolve'; tieWinner: TieWinner }
  | { kind: 'applyAdvance'; applied: AppliedAdvance };

export type FlowActionKind = FlowAction['kind'];

export const FLOW_ACTION_KINDS: readonly FlowActionKind[] = [
  'approve',
  'counterOffer',
  'reject',
  'narrate',
  'acceptCounterOffer',
  'redeclare',
  'withdraw',
  'rollOpposition',
  'rollPlayer',
  'resolve',
  'applyAdvance',
];

function cleanNote(note: string | null): string | null {
  const n = note?.trim() ?? '';
  return n === '' ? null : n;
}

/** Tabla de permisos: estado actual × acción × actor. */
export function permits(state: RollState, kind: FlowActionKind, actor: Actor): boolean {
  switch (kind) {
    case 'approve':
    case 'counterOffer':
    case 'reject':
    case 'narrate':
      return state === 'declarada' && actor === 'dm';
    case 'acceptCounterOffer':
      return state === 'contraoferta' && actor === 'owner';
    case 'redeclare':
    case 'withdraw':
      return (state === 'declarada' || state === 'contraoferta' || state === 'rechazada') && actor === 'owner';
    case 'rollOpposition':
      return state === 'aprobada' && actor === 'dm';
    case 'rollPlayer':
      return state === 'oposicion' && actor === 'owner';
    case 'resolve':
      return state === 'tirada' && (actor === 'owner' || actor === 'dm');
    case 'applyAdvance':
      return state === 'resuelta' && (actor === 'owner' || actor === 'dm');
  }
}

/** Acciones que `actor` puede hacer ahora mismo sobre una tirada en `state` con avance `advance`. */
export function allowedActionsFor(state: RollState, advance: AdvanceState | null, actor: Actor): FlowActionKind[] {
  return FLOW_ACTION_KINDS.filter((k) => permits(state, k, actor)).filter((k) => k !== 'applyAdvance' || advance === 'pendiente');
}

export function allowedActions(record: Pick<RollRecord, 'state' | 'advance'>, actor: Actor): FlowActionKind[] {
  return allowedActionsFor(record.state, record.advance, actor);
}

/** Crea una tirada en estado `declarada`. */
export function declare(action: string, skill: SkillRef, purpose: string | null = null): RollRecord {
  const text = action.trim();
  if (text === '') throw new EngineError({ kind: 'EmptyAction' });
  return {
    state: 'declarada',
    action: text,
    purpose: cleanNote(purpose),
    skill,
    counterOffer: null,
    dmNote: null,
    opposition: null,
    modifier: 0,
    modifierNote: null,
    playerRoll: null,
    result: null,
    narration: null,
    tieWinner: null,
    advance: null,
    applied: null,
    history: [{ from: null, to: 'declarada', by: 'owner' }],
  };
}

/** Aplica una acción a la tirada y devuelve la tirada nueva (la original no cambia). */
export function transition(record: RollRecord, action: FlowAction, actor: Actor): RollRecord {
  const kind = action.kind;
  const notAllowed = () => new EngineError({ kind: 'TransitionNotAllowed', state: record.state, action: kind, actor });
  if (!permits(record.state, kind, actor)) throw notAllowed();

  const next: RollRecord = { ...record, history: [...record.history] };
  const goto = (to: RollState) => {
    next.history.push({ from: next.state, to, by: actor });
    next.state = to;
  };

  switch (action.kind) {
    case 'approve':
      goto('aprobada');
      break;
    case 'counterOffer':
      next.counterOffer = action.skill;
      next.dmNote = cleanNote(action.note);
      goto('contraoferta');
      break;
    case 'reject':
      next.dmNote = cleanNote(action.note);
      goto('rechazada');
      break;
    case 'narrate': {
      const narration = action.narration.trim();
      if (narration === '') throw new EngineError({ kind: 'EmptyNarration' });
      next.narration = narration;
      next.result = 'narrado';
      next.advance = 'no_aplica';
      goto('sin_tirada');
      goto('resuelta');
      break;
    }
    case 'acceptCounterOffer': {
      if (!next.counterOffer) throw notAllowed();
      next.skill = next.counterOffer;
      next.counterOffer = null;
      next.dmNote = null;
      goto('declarada');
      break;
    }
    case 'redeclare': {
      const text = action.action.trim();
      if (text === '') throw new EngineError({ kind: 'EmptyAction' });
      next.action = text;
      next.purpose = cleanNote(action.purpose);
      next.skill = action.skill;
      next.counterOffer = null;
      next.dmNote = null;
      goto('declarada');
      break;
    }
    case 'withdraw':
      goto('retirada');
      break;
    case 'rollOpposition': {
      const modifier = action.modifier ?? 0;
      if (!Number.isInteger(modifier) || Math.abs(modifier) > MAX_MODIFIER) throw new EngineError({ kind: 'InvalidModifier', max: MAX_MODIFIER });
      next.opposition = action.opposition.kind === 'fixed' ? fixedOpposition(action.opposition.target) : action.opposition;
      next.modifier = modifier;
      next.modifierNote = modifier === 0 ? null : cleanNote(action.modifierNote ?? null);
      goto('oposicion');
      break;
    }
    case 'rollPlayer': {
      const expected = next.skill.level;
      if (action.dice.length !== expected) throw new EngineError({ kind: 'DiceCountMismatch', expected, got: action.dice.length });
      next.playerRoll = action.dice;
      goto('tirada');
      break;
    }
    case 'resolve': {
      // En estado `tirada` siempre existen la tirada y la oposición.
      if (!next.playerRoll || !next.opposition) throw notAllowed();
      const outcome = resolve(next.playerRoll, oppositionTotal(next.opposition), action.tieWinner, next.modifier);
      next.result = outcome.outcome === 'success' ? 'exito' : outcome.outcome === 'tie' ? 'empate' : 'fallo';
      next.tieWinner = action.tieWinner;
      next.advance = 'pendiente';
      goto('resuelta');
      break;
    }
    case 'applyAdvance': {
      if (next.advance !== 'pendiente') throw new EngineError({ kind: 'AdvancementNotPending' });
      const { applied } = action;
      const expectedXp = next.result === 'fallo' ? 1 : 0;
      if (applied.xpGained !== expectedXp) throw new EngineError({ kind: 'NotEligible' });
      if (applied.newSkill === null && (applied.xpSpent !== 0 || applied.replacedIndex !== null)) {
        throw new EngineError({ kind: 'NotEligible' });
      }
      next.applied = applied;
      next.advance = 'aplicado';
      break;
    }
  }

  return next;
}
