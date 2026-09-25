import { describe, expect, it } from 'vitest';
import { DiceRoll, declare, transition, type RollRecord } from '../engine';
import { characterFrom, characterToMap, rollFields, rollFrom, settingsFrom, settingsToMap, type Json, type RawHistory } from './models';

const dice = (v: number[]) => DiceRoll.fromValues(v, 10);
const DM = 'dm-uid';
const OWNER = 'owner-uid';

/** Lo que Firestore devolvería: los campos escritos, sin el `updatedAt` del servidor. */
function stored(r: RollRecord, previous: RawHistory[], uid: string): Json & { historial: RawHistory[] } {
  const { updatedAt: _ignored, ...fields } = rollFields(r, previous, uid);
  return { ...fields, historial: fields.historial, characterId: OWNER, declaradoPor: OWNER };
}

describe('tiradas', () => {
  it('ida y vuelta de un flujo completo, con el actor derivado del uid', () => {
    let r = declare('Salto el foso', { index: 1, name: 'Saltar', level: 2 });
    let doc = stored(r, [], OWNER);
    const steps: [Parameters<typeof transition>[1], 'dm' | 'owner', string][] = [
      [{ kind: 'approve' }, 'dm', DM],
      [{ kind: 'rollOpposition', dice: dice([4, 2]) }, 'dm', DM],
      [{ kind: 'rollPlayer', dice: dice([6, 6]) }, 'owner', OWNER],
      [{ kind: 'resolve', tieWinner: 'player' }, 'owner', OWNER],
      [{ kind: 'applyAdvance', applied: { xpGained: 0, xpSpent: 0, newSkill: { name: 'Saltar lejos', level: 3, permanent: false, derivedFrom: 'Saltar 2' }, replacedIndex: null } }, 'owner', OWNER],
    ];
    for (const [action, actor, uid] of steps) {
      const parsed = rollFrom('r1', doc, DM);
      expect(parsed.record).toEqual(r);
      r = transition(parsed.record, action, actor);
      doc = stored(r, parsed.rawHistory, uid);
    }
    const last = rollFrom('r1', doc, DM);
    expect(last.record).toEqual(r);
    expect(doc.historial.map((h) => h.por)).toEqual([OWNER, DM, DM, OWNER, OWNER]);
    expect(doc.avance).toEqual({
      estado: 'aplicado',
      xpGained: 0,
      xpSpent: 0,
      newSkill: { name: 'Saltar lejos', level: 3, permanent: false, derivedFrom: 'Saltar 2' },
      replacedSkillIndex: null,
    });
    expect(doc.tirada).toEqual({ dados: [6, 6], total: 12 });
  });

  it('narrar deja dos entradas en el historial', () => {
    const r = transition(declare('Busco pistas', { index: 0, name: 'Do Anything', level: 1 }), { kind: 'narrate', narration: 'Encuentras una llave.' }, 'dm');
    const doc = stored(r, [{ de: null, a: 'declarada', por: OWNER }], DM);
    expect(doc.historial).toEqual([
      { de: null, a: 'declarada', por: OWNER },
      { de: 'declarada', a: 'sin_tirada', por: DM },
      { de: 'sin_tirada', a: 'resuelta', por: DM },
    ]);
    expect(doc.avance).toEqual({ estado: 'no_aplica' });
    expect(doc.outcome).toBe('narrado');
  });
});

describe('personaje y ajustes', () => {
  it('ida y vuelta de la hoja', () => {
    const sheet = { name: 'Ana', description: 'x', notes: 'y', xp: 2, skills: [{ name: 'Do Anything', level: 1, permanent: true, derivedFrom: null }] };
    const { updatedAt: _ignored, ...m } = characterToMap(OWNER, sheet);
    expect(characterFrom(OWNER, m)).toEqual({ id: OWNER, ownerUid: OWNER, lastAppliedRollId: null, sheet });
  });

  it('ida y vuelta de los ajustes', () => {
    const s = { skillSlots: 3, tieWinner: 'opposition' as const, xpSameRoll: false, maxDice: 6 };
    expect(settingsFrom(settingsToMap(s))).toEqual(s);
  });
});
