import { describe, expect, it } from 'vitest';
import { DiceRoll, declare, transition, type RollRecord } from '../engine';
import { catalogFrom, catalogToMap, characterFrom, characterToMap, itemFrom, itemToMap, lineFrom, lineToMap, offerFrom, rollFields, rollFrom, settingsFrom, settingsToMap, type Json, type RawHistory } from './models';

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
      [{ kind: 'rollOpposition', opposition: { kind: 'dice', dice: dice([4, 2]) } }, 'dm', DM],
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

  it('la oposición fija va y vuelve como {dados: [], total}', () => {
    let r = transition(declare('Trepo', { index: 0, name: 'Do Anything', level: 1 }), { kind: 'approve' }, 'dm');
    r = transition(r, { kind: 'rollOpposition', opposition: { kind: 'fixed', target: 9 } }, 'dm');
    const doc = stored(r, [{ de: null, a: 'declarada', por: OWNER }], DM);
    expect(doc.oposicion).toEqual({ dados: [], total: 9 });
    expect(rollFrom('r1', doc, DM).record.opposition).toEqual({ kind: 'fixed', target: 9 });
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
    expect(characterFrom(OWNER, m)).toEqual({ id: OWNER, ownerUid: OWNER, lastAppliedRollId: null, coins: 0, sheet });
  });

  it('ida y vuelta de los ajustes', () => {
    const s = { skillSlots: 3, tieWinner: 'opposition' as const, xpSameRoll: false, maxDice: 6 };
    expect(settingsFrom(settingsToMap(s))).toEqual(s);
  });
});

describe('objetos', () => {
  it('ida y vuelta de catálogo, copia y línea', () => {
    const cat = { name: 'Poción', description: 'Cura 1', value: 4, icon: 'flask-round', color: 'rose' };
    expect(catalogFrom('c1', catalogToMap(cat))).toEqual({ id: 'c1', ...cat });
    expect(itemFrom('c1', { ...itemToMap({ ...cat, quantity: 2 }), catalogItemId: 'c1' })).toEqual({ id: 'c1', ...cat, quantity: 2, catalogItemId: 'c1' });
    expect(lineFrom('c1', lineToMap({ ...cat, price: 3, stock: 5 }))).toEqual({ id: 'c1', ...cat, price: 3, stock: 5 });
  });

  it('objetos viejos sin ícono ni color toman los de siempre', () => {
    expect(catalogFrom('c1', { name: 'Cuerda', quantity: 3 })).toEqual({ id: 'c1', name: 'Cuerda', description: '', value: null, icon: 'package', color: 'slate' });
  });

  it('ventanas: tipo, público y abierta', () => {
    expect(offerFrom('o1', { kind: 'shop', title: 'Herrería', open: true, audience: ['*', 3] })).toMatchObject({ kind: 'shop', open: true, audience: ['*'] });
    expect(offerFrom('o1', { kind: 'x' }).kind).toBe('loot');
  });
});
