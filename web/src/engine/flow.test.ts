import { describe, expect, it } from 'vitest';
import {
  DiceRoll,
  EngineError,
  FLOW_ACTION_KINDS,
  MAX_DICE_LIMIT,
  ROLL_STATES,
  allowedActions,
  declare,
  isTerminal,
  newCharacter,
  parseRollState,
  permits,
  skillRefFrom,
  transition,
  type Actor,
  type AppliedAdvance,
  type Character,
  type FlowActionKind,
  type RollRecord,
  type RollState,
} from './index';

// Portado de crates/r4s_engine/tests/flow.rs.

const dice = (values: number[]) => DiceRoll.fromValues(values, MAX_DICE_LIMIT);
const noAdvance: AppliedAdvance = { xpGained: 0, xpSpent: 0, newSkill: null, replacedIndex: null };

function hero(): Character {
  const c = newCharacter('Ana', '');
  c.skills.push({ name: 'Trepar', level: 2, permanent: false, derivedFrom: 'Do Anything 1' });
  return c;
}

const declared = (skillIndex: number): RollRecord => declare('Subo por la muralla', skillRefFrom(hero(), skillIndex));
const states = (r: RollRecord): RollState[] => r.history.map((h) => h.to);

function errorOf(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e;
    throw e;
  }
  throw new Error('se esperaba un EngineError');
}

it('camino feliz: declarar, aprobar, oponer, tirar, resolver y aplicar', () => {
  let r = declared(1);
  r = transition(r, { kind: 'approve' }, 'dm');
  r = transition(r, { kind: 'rollOpposition', dice: dice([3, 3]) }, 'dm');
  // La oposición es visible para el jugador antes de tirar.
  expect(r.opposition!.total()).toBe(6);
  r = transition(r, { kind: 'rollPlayer', dice: dice([2, 3]) }, 'owner');
  r = transition(r, { kind: 'resolve', tieWinner: 'player' }, 'owner');
  expect(r.state).toBe('resuelta');
  expect(r.result).toBe('fallo');
  expect(r.advance).toBe('pendiente');

  r = transition(r, { kind: 'applyAdvance', applied: { ...noAdvance, xpGained: 1 } }, 'owner');
  expect(r.advance).toBe('aplicado');
  expect(states(r)).toEqual(['declarada', 'aprobada', 'oposicion', 'tirada', 'resuelta']);
});

it('contraoferta aceptada cambia la habilidad y vuelve a declarada', () => {
  const c = hero();
  let r = transition(declared(1), { kind: 'counterOffer', skill: skillRefFrom(c, 0), note: '  Eso es Do Anything  ' }, 'dm');
  expect(r.state).toBe('contraoferta');
  expect(r.dmNote).toBe('Eso es Do Anything');

  r = transition(r, { kind: 'acceptCounterOffer' }, 'owner');
  expect(r.state).toBe('declarada');
  expect(r.skill.name).toBe('Do Anything');
  expect(r.counterOffer).toBeNull();
  // Vuelve a revisión del DM.
  expect(allowedActions(r, 'dm')).toHaveLength(4);
});

it('rechazada y vuelta a declarar', () => {
  const c = hero();
  let r = transition(declared(1), { kind: 'reject', note: null }, 'dm');
  expect(r.state).toBe('rechazada');
  r = transition(r, { kind: 'redeclare', action: 'Busco una escalera', skill: skillRefFrom(c, 0) }, 'owner');
  expect(r.state).toBe('declarada');
  expect(r.action).toBe('Busco una escalera');
});

it('narrada pasa por sin_tirada hasta resuelta y sin XP', () => {
  const r = transition(declared(1), { kind: 'narrate', narration: 'Subes sin problema.' }, 'dm');
  expect(r.state).toBe('resuelta');
  expect(r.result).toBe('narrado');
  expect(r.advance).toBe('no_aplica');
  expect(states(r)).toEqual(['declarada', 'sin_tirada', 'resuelta']);
  expect(allowedActions(r, 'owner')).toEqual([]);
  expect(errorOf(() => transition(r, { kind: 'applyAdvance', applied: noAdvance }, 'owner')).detail).toEqual({ kind: 'AdvancementNotPending' });
});

it('rechaza al actor equivocado o saltarse pasos', () => {
  let r = declared(1);
  // El jugador no puede aprobarse a sí mismo ni saltar a tirar.
  expect(() => transition(r, { kind: 'approve' }, 'owner')).toThrow(EngineError);
  expect(() => transition(r, { kind: 'rollPlayer', dice: dice([6, 6]) }, 'owner')).toThrow(EngineError);
  // Otro jugador no puede retirar la tirada ajena.
  expect(() => transition(r, { kind: 'withdraw' }, 'other')).toThrow(EngineError);

  r = transition(r, { kind: 'approve' }, 'dm');
  // El DM no tira por el jugador, ni el jugador la oposición.
  expect(() => transition(r, { kind: 'rollOpposition', dice: dice([1]) }, 'owner')).toThrow(EngineError);
  r = transition(r, { kind: 'rollOpposition', dice: dice([1]) }, 'dm');
  expect(() => transition(r, { kind: 'rollPlayer', dice: dice([6, 6]) }, 'dm')).toThrow(EngineError);
  // Retirar ya no es posible tras aprobar.
  expect(() => transition(r, { kind: 'withdraw' }, 'owner')).toThrow(EngineError);
});

it('la tirada del jugador debe coincidir con el nivel declarado', () => {
  let r = transition(declared(1), { kind: 'approve' }, 'dm');
  r = transition(r, { kind: 'rollOpposition', dice: dice([4]) }, 'dm');
  expect(errorOf(() => transition(r, { kind: 'rollPlayer', dice: dice([6]) }, 'owner')).detail).toEqual({
    kind: 'DiceCountMismatch',
    expected: 2,
    got: 1,
  });
});

it('aplicar el avance comprueba que el XP cuadre', () => {
  let r = transition(declared(1), { kind: 'approve' }, 'dm');
  r = transition(r, { kind: 'rollOpposition', dice: dice([1]) }, 'dm');
  r = transition(r, { kind: 'rollPlayer', dice: dice([6, 6]) }, 'owner');
  r = transition(r, { kind: 'resolve', tieWinner: 'player' }, 'dm');
  expect(r.result).toBe('exito');
  // En un éxito no se gana XP.
  expect(errorOf(() => transition(r, { kind: 'applyAdvance', applied: { ...noAdvance, xpGained: 1 } }, 'owner')).detail).toEqual({
    kind: 'NotEligible',
  });
  expect(() => transition(r, { kind: 'applyAdvance', applied: noAdvance }, 'other')).toThrow(EngineError);
});

it('se puede retirar desde todo estado que el jugador edita', () => {
  const c = hero();
  const d = declared(1);
  expect(transition(d, { kind: 'withdraw' }, 'owner').state).toBe('retirada');
  const co = transition(d, { kind: 'counterOffer', skill: skillRefFrom(c, 0), note: null }, 'dm');
  expect(transition(co, { kind: 'withdraw' }, 'owner').state).toBe('retirada');
});

it('la tabla de permisos solo permite las transiciones documentadas', () => {
  const allowed: [RollState, FlowActionKind, Actor][] = [];
  for (const s of ROLL_STATES) {
    for (const k of FLOW_ACTION_KINDS) {
      for (const a of ['dm', 'owner', 'other'] as const) {
        if (permits(s, k, a)) allowed.push([s, k, a]);
      }
    }
  }
  expect(allowed.every(([, , a]) => a !== 'other')).toBe(true);
  expect(allowed.every(([s]) => !isTerminal(s) || s === 'resuelta')).toBe(true);
  // 4 del DM en declarada + aceptar + (editar|retirar)×3 + oposición + tirada + resolver×2 + aplicar×2
  expect(allowed).toHaveLength(17);
});

describe('ids de estado', () => {
  it('ida y vuelta', () => {
    for (const s of ROLL_STATES) expect(parseRollState(s)).toBe(s);
    expect(parseRollState('otra')).toBeNull();
    expect(parseRollState(3)).toBeNull();
  });

  it('transition no modifica la tirada original', () => {
    const d = declared(1);
    const snapshot = structuredClone({ ...d, history: d.history });
    transition(d, { kind: 'approve' }, 'dm');
    expect(d.state).toBe('declarada');
    expect(d.history).toEqual(snapshot.history);
  });
});
