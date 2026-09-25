import fc from 'fast-check';
import { expect, it } from 'vitest';
import {
  MAX_DICE_LIMIT,
  SeededDice,
  advancementOption,
  applyRoll,
  isBaseSkill,
  newCharacter,
  resolve,
  roll,
  validateCharacter,
  type AdvancementChoice,
  type RoomSettings,
  type SlotChoice,
} from './index';

// Portado de crates/r4s_engine/tests/properties.rs (proptest → fast-check).

const arbSettings = fc.record<RoomSettings>({
  skillSlots: fc.integer({ min: 1, max: 6 }),
  tieWinner: fc.constantFrom('player', 'opposition'),
  xpSameRoll: fc.boolean(),
  maxDice: fc.constant(MAX_DICE_LIMIT),
});

const byte = fc.integer({ min: 0, max: 255 });
const arbStep = fc.tuple(byte, fc.integer({ min: 1, max: 4 }), byte, byte);

/** Tras cualquier secuencia de tiradas y elecciones, la hoja sigue siendo válida y "Do Anything 1" sigue en su sitio. */
it('applyRoll conserva las invariantes', () => {
  fc.assert(
    fc.property(arbSettings, fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }), fc.array(arbStep, { minLength: 1, maxLength: 39 }), (settings, seed, steps) => {
      const dice = new SeededDice(seed);
      let c = newCharacter('Prueba', '');
      steps.forEach(([skillPick, oppDice, slotPick, namePick], i) => {
        const idx = skillPick % c.skills.length;
        const level = c.skills[idx]!.level;
        const player = roll(level, settings.maxDice, dice);
        const opposition = roll(oppDice, settings.maxDice, dice);
        const outcome = resolve(player, opposition, settings.tieWinner);

        const opt = advancementOption(c, settings, player, outcome, idx);
        let choice: AdvancementChoice | null = null;
        if (opt) {
          let slot: SlotChoice;
          if (opt.slotsFull) {
            const nonBase = c.skills.length - 1;
            slot = slotPick % 3 === 0 || nonBase === 0 ? { kind: 'discard' } : { kind: 'replace', index: 1 + (slotPick % nonBase) };
          } else {
            slot = { kind: 'append' };
          }
          choice = { newSkillName: `Skill ${i}-${namePick}`, slot };
        }

        const xpBefore = c.xp;
        const res = applyRoll(c, settings, player, outcome, idx, choice);
        expect(res.character.xp).toBe(xpBefore + res.xpGained - res.xpSpent);
        c = res.character;
        expect(validateCharacter(c, settings).map((e) => e.message)).toEqual([]);
        expect(isBaseSkill(c.skills[0]!)).toBe(true);
      });
    }),
    { numRuns: 256 },
  );
});
