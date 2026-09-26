import { describe, expect, it } from 'vitest';
import {
  DiceRoll,
  EngineError,
  MAX_DICE_LIMIT,
  SeededDice,
  advancementOption,
  applyRoll,
  baseSkill,
  defaultRoomSettings,
  adjustCoins,
  claim,
  editSkill,
  giveItem,
  grantSkill,
  removeSkill,
  MAX_STOCK,
  newCatalogItem,
  offerLine,
  stack,
  validateOfferTitle,
  newCharacter,
  resolve,
  roll,
  skillLabel,
  slotUsage,
  slotsFull,
  validateCharacter,
  type AdvancementChoice,
  type Character,
  type RoomSettings,
  type Skill,
  type SlotChoice,
} from './index';

// Portado de crates/r4s_engine/tests/rules.rs.

const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ ...defaultRoomSettings(), ...over });
const dice = (values: number[]) => DiceRoll.fromValues(values, MAX_DICE_LIMIT);
const skill = (name: string, level: number): Skill => ({ name, level, permanent: false, derivedFrom: null });
const heroWith = (skills: Skill[], xp: number): Character => {
  const c = newCharacter('Heroína', '');
  c.skills.push(...skills);
  c.xp = xp;
  return c;
};
const choice = (name: string, slot: SlotChoice): AdvancementChoice => ({ newSkillName: name, slot });
const append: SlotChoice = { kind: 'append' };
const replace = (index: number): SlotChoice => ({ kind: 'replace', index });

function errorOf(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e;
    throw e;
  }
  throw new Error('se esperaba un EngineError');
}

describe('personaje', () => {
  it('empieza con Do Anything 1', () => {
    const c = newCharacter('  Ana  ', 'exploradora');
    expect(c.name).toBe('Ana');
    expect(c.skills).toEqual([baseSkill()]);
    expect(skillLabel(c.skills[0]!)).toBe('Do Anything 1');
    expect(c.xp).toBe(0);
    expect(validateCharacter(c, settings())).toEqual([]);
  });

  it('el nombre es obligatorio', () => {
    expect(() => newCharacter('   ', '')).toThrow(EngineError);
    expect(() => newCharacter('x'.repeat(61), '')).toThrow(EngineError);
  });

  it('Do Anything no ocupa slot', () => {
    const s = settings({ skillSlots: 2 });
    const c = heroWith([skill('Trepar', 2), skill('Nadar', 2)], 0);
    expect(slotUsage(c, s)).toEqual({ used: 2, capacity: 2 });
    expect(slotsFull(c, s)).toBe(true);
    expect(validateCharacter(c, s)).toEqual([]);
  });

  it('la validación detecta hojas rotas', () => {
    const s = settings({ skillSlots: 1 });
    const c = heroWith([skill('Trepar', 2), skill('trepar', 3)], 0);
    c.skills[0]!.level = 2;
    const details = validateCharacter(c, s).map((e) => e.detail);
    expect(details).toContainEqual({ kind: 'MissingBaseSkill' });
    expect(details).toContainEqual({ kind: 'DuplicateSkillName', name: 'trepar' });
    expect(details).toContainEqual({ kind: 'TooManySkills', used: 2, capacity: 1 });
  });

  it('el DM otorga, corrige y quita habilidades', () => {
    const s = settings({ skillSlots: 2, maxDice: 4 });
    let c = grantSkill(newCharacter('Ana', ''), s, '  Trepar   muros ', 2);
    expect(c.skills[1]).toEqual({ name: 'Trepar muros', level: 2, permanent: false, derivedFrom: null });
    expect(errorOf(() => grantSkill(c, s, 'trepar MUROS', 3)).kind).toBe('DuplicateSkillName');
    expect(errorOf(() => grantSkill(c, s, 'Nadar', 5)).kind).toBe('InvalidSkillLevel');
    expect(errorOf(() => grantSkill(c, s, 'Nadar', 0)).kind).toBe('InvalidSkillLevel');
    expect(errorOf(() => grantSkill(c, s, ' ', 2)).kind).toBe('InvalidSkillName');

    c = grantSkill(c, s, 'Nadar', 3);
    expect(errorOf(() => grantSkill(c, s, 'Volar', 2)).kind).toBe('SlotsFull');

    const gained: Skill = { name: 'Saltar', level: 3, permanent: false, derivedFrom: 'Trepar muros 2' };
    c = { ...c, skills: [c.skills[0]!, c.skills[1]!, gained] };
    c = editSkill(c, s, 2, 'Saltar lejos', 4);
    expect(c.skills[2]).toEqual({ name: 'Saltar lejos', level: 4, permanent: false, derivedFrom: 'Trepar muros 2' });
    expect(errorOf(() => editSkill(c, s, 2, 'trepar muros', 4)).kind).toBe('DuplicateSkillName');
    expect(editSkill(c, s, 2, 'SALTAR LEJOS', 2).skills[2]!.name).toBe('SALTAR LEJOS');
    expect(errorOf(() => editSkill(c, s, 0, 'Otra', 1)).kind).toBe('CannotReplacePermanent');
    expect(errorOf(() => editSkill(c, s, 9, 'Otra', 1)).kind).toBe('SkillIndexOutOfRange');

    expect(errorOf(() => removeSkill(c, 0)).kind).toBe('CannotReplacePermanent');
    c = removeSkill(c, 1);
    expect(c.skills.map((k) => k.name)).toEqual(['Do Anything', 'Saltar lejos']);
    expect(validateCharacter(c, s)).toEqual([]);
  });
});

describe('dados y resolución', () => {
  it('los dados con semilla son deterministas y están en rango', () => {
    const a = roll(10, 10, new SeededDice(42));
    const b = roll(10, 10, new SeededDice(42));
    expect(a.dice).toEqual(b.dice);
    const src = new SeededDice(7);
    const seen = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const v = src.d6();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen[v - 1]!++;
    }
    expect(seen.every((n) => n > 800), `distribución sospechosa: ${seen.join(',')}`).toBe(true);
  });

  it('valida las tiradas', () => {
    expect(() => DiceRoll.fromValues([], 10)).toThrow(EngineError);
    expect(() => DiceRoll.fromValues([7], 10)).toThrow(EngineError);
    expect(() => DiceRoll.fromValues(Array(11).fill(1), 10)).toThrow(EngineError);
    expect(() => DiceRoll.fromValues([1, 1, 1, 1], 3)).toThrow(EngineError);
    expect(() => DiceRoll.fromValues([2.5], 10)).toThrow(EngineError);
  });

  it('el empate sigue el ajuste de la sala', () => {
    const p = dice([3, 4]);
    const o = dice([5, 2]);
    const player = resolve(p, o, 'player');
    expect(player.outcome).toBe('success');
    expect(player.xpGained).toBe(0);
    const opp = resolve(p, o, 'opposition');
    expect(opp.outcome).toBe('failure');
    expect(opp.xpGained).toBe(1);
  });
});

describe('avance', () => {
  it('fallar da 1 XP', () => {
    const c = heroWith([], 0);
    const r = dice([2]);
    const o = resolve(r, dice([5]), 'player');
    const res = applyRoll(c, settings(), r, o, 0, null);
    expect(res.character.xp).toBe(1);
    expect(res.xpGained).toBe(1);
    expect(res.newSkill).toBeNull();
    expect(c.xp).toBe(0);
  });

  it('todo 6 da una habilidad nueva un nivel más alta', () => {
    const c = heroWith([], 0);
    const r = dice([6]);
    const o = resolve(r, dice([3]), 'player');
    const opt = advancementOption(c, settings(), r, o, 0)!;
    expect(opt.natural).toBe(true);
    expect(opt.newLevel).toBe(2);
    expect(opt.xpCost).toBe(0);

    const res = applyRoll(c, settings(), r, o, 0, choice('Trepar', append));
    expect(skillLabel(res.newSkill!)).toBe('Trepar 2');
    expect(res.newSkill!.derivedFrom).toBe('Do Anything 1');
    expect(res.character.skills).toHaveLength(2);
    expect(c.skills).toHaveLength(1);
    expect(res.xpSpent).toBe(0);
  });

  it('el XP convierte dados en 6 solo para avanzar', () => {
    // Trepar 2 saca [6, 3] contra 12: falla, pero con 1 XP puede avanzar.
    const c = heroWith([skill('Trepar', 2)], 1);
    const r = dice([6, 3]);
    const o = resolve(r, dice([6, 6]), 'player');
    expect(o.outcome, 'el XP no cambia el resultado').toBe('failure');

    const opt = advancementOption(c, settings(), r, o, 1)!;
    expect(opt.natural).toBe(false);
    expect(opt.xpCost).toBe(1);
    expect(opt.xpAvailable).toBe(2); // 1 previo + 1 de esta tirada

    const res = applyRoll(c, settings(), r, o, 1, choice('Trepar muros', append));
    expect(res.character.xp).toBe(1); // 1 + 1 - 1
    expect(res.newSkill!.level).toBe(3);
  });

  it('ajuste de XP en la misma tirada', () => {
    const c = heroWith([], 0);
    const r = dice([2]);
    const o = resolve(r, dice([5]), 'player');

    const withIt = settings({ xpSameRoll: true });
    expect(advancementOption(c, withIt, r, o, 0)).not.toBeNull();
    expect(applyRoll(c, withIt, r, o, 0, choice('Correr', append)).character.xp).toBe(0);

    const without = settings({ xpSameRoll: false });
    expect(advancementOption(c, without, r, o, 0)).toBeNull();
    expect(errorOf(() => applyRoll(c, without, r, o, 0, choice('Correr', append))).detail).toEqual({ kind: 'NotEligible' });
  });

  it('sin XP suficiente no hay opción', () => {
    const c = heroWith([skill('Trepar', 2)], 0);
    const r = dice([1, 2]);
    const o = resolve(r, dice([6]), 'player');
    expect(advancementOption(c, settings(), r, o, 1)).toBeNull();
  });

  it('con los slots llenos hay que reemplazar o descartar', () => {
    const s = settings({ skillSlots: 1 });
    const c = heroWith([skill('Trepar', 2)], 0);
    const r = dice([6]);
    const o = resolve(r, dice([1]), 'player');

    expect(advancementOption(c, s, r, o, 0)!.slotsFull).toBe(true);
    expect(errorOf(() => applyRoll(c, s, r, o, 0, choice('Nadar', append))).detail).toEqual({ kind: 'SlotsFull' });
    expect(errorOf(() => applyRoll(c, s, r, o, 0, choice('Nadar', replace(0)))).detail).toEqual({ kind: 'CannotReplacePermanent' });

    const replaced = applyRoll(c, s, r, o, 0, choice('Nadar', replace(1)));
    expect(skillLabel(replaced.character.skills[1]!)).toBe('Nadar 2');
    expect(replaced.replaced!.skill.name).toBe('Trepar');
    expect(validateCharacter(replaced.character, s)).toEqual([]);

    const discarded = applyRoll(c, s, r, o, 0, choice('Nadar', { kind: 'discard' }));
    expect(discarded.character.skills).toEqual(c.skills);
  });

  it('rechaza nombres de habilidad repetidos', () => {
    const c = heroWith([skill('Trepar', 2)], 0);
    const r = dice([6]);
    const o = resolve(r, dice([1]), 'player');
    expect(errorOf(() => applyRoll(c, settings(), r, o, 0, choice('  trepar ', append))).detail).toEqual({
      kind: 'DuplicateSkillName',
      name: 'trepar',
    });
    // Reemplazar la misma habilidad por una con su nombre sí es válido.
    expect(() => applyRoll(c, settings(), r, o, 0, choice('Trepar', replace(1)))).not.toThrow();
  });

  it('una habilidad en el nivel máximo no avanza', () => {
    const s = settings({ maxDice: 3 });
    const c = heroWith([skill('Trepar', 3)], 0);
    const r = dice([6, 6, 6]);
    const o = resolve(r, dice([1]), 'player');
    expect(advancementOption(c, s, r, o, 1)).toBeNull();
  });

  it('el número de dados debe coincidir con el nivel', () => {
    const c = heroWith([skill('Trepar', 2)], 0);
    const r = dice([6]);
    const o = resolve(r, dice([1]), 'player');
    expect(errorOf(() => advancementOption(c, settings(), r, o, 1)).detail).toEqual({ kind: 'DiceCountMismatch', expected: 2, got: 1 });
  });
});

describe('inventario', () => {
  const cuerda = () => newCatalogItem('Cuerda', '10 m', 5, { icon: 'package', color: 'sand' });

  it('el catálogo no lleva cantidad; el valor es opcional', () => {
    expect(newCatalogItem('Antorcha', '', null).value).toBeNull();
    expect(cuerda()).not.toHaveProperty('quantity');
    expect(() => newCatalogItem('  ', '', 5)).toThrow(EngineError);
    expect(errorOf(() => newCatalogItem('Daga', '', -1)).detail.kind).toBe('InvalidAmount');
    expect(errorOf(() => newCatalogItem('Daga', '', null, { icon: 'no-existe', color: 'slate' })).detail.kind).toBe('InvalidItemLook');
    expect(errorOf(() => newCatalogItem('Daga', '', null, { icon: 'sword', color: 'fucsia' })).detail.kind).toBe('InvalidItemLook');
  });

  it('entregar hace una copia con cantidad propia, que puede ser 0, y se apila', () => {
    const given = giveItem(cuerda(), 3);
    expect(given).toMatchObject({ name: 'Cuerda', icon: 'package', color: 'sand', quantity: 3 });
    expect(giveItem(cuerda(), 0).quantity).toBe(0);
    expect(stack(given.quantity, 2)).toBe(5);
    expect(() => stack(1, 0)).toThrow(EngineError);
  });

  it('la línea de tienda parte del valor como precio', () => {
    expect(offerLine(cuerda(), 3)).toMatchObject({ price: 5, stock: 3 });
    expect(offerLine(newCatalogItem('Piedra', '', null)).price).toBe(0);
    expect(() => offerLine(cuerda(), MAX_STOCK + 1)).toThrow(EngineError);
    expect(() => validateOfferTitle('   ')).toThrow(EngineError);
  });

  it('botín: se toma gratis mientras haya existencias', () => {
    const line = offerLine(cuerda(), 3);
    expect(claim('loot', line, 2, 0)).toEqual({ stock: 1, cost: 0, coins: 0 });
    expect(errorOf(() => claim('loot', { ...line, stock: 1 }, 2, 0)).detail).toEqual({ kind: 'OutOfStock', available: 1 });
    expect(errorOf(() => claim('loot', line, 0, 0)).detail.kind).toBe('InvalidAmount');
  });

  it('tienda: cobra precio × cantidad y no deja deber', () => {
    const line = offerLine(cuerda(), 3);
    expect(claim('shop', line, 2, 12)).toEqual({ stock: 1, cost: 10, coins: 2 });
    expect(errorOf(() => claim('shop', line, 3, 12)).detail).toEqual({ kind: 'NotEnoughCoins', needed: 15, available: 12 });
  });

  it('las monedas nunca quedan negativas', () => {
    expect(adjustCoins(3, 7)).toBe(10);
    expect(() => adjustCoins(3, -4)).toThrow(EngineError);
  });
});
