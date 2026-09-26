import { findDuplicate, normalizeSkillName, slotsFull } from './character';
import type { DiceRoll } from './dice';
import { EngineError } from './errors';
import type { RollOutcome } from './resolve';
import { skillLabel, slotPrice, type Character, type RoomSettings, type Skill } from './types';

/** Posibilidad de ganar una habilidad nueva tras una tirada. */
export interface AdvancementOption {
  sourceSkillIndex: number;
  sourceLabel: string;
  newLevel: number;
  /** Todos los dados salieron 6: avance gratis. */
  natural: boolean;
  /** XP necesario: 1 por cada dado que no sea 6. */
  xpCost: number;
  /** XP que se puede gastar en esta tirada. */
  xpAvailable: number;
  /** Hay que elegir qué habilidad reemplazar (o descartar la nueva). */
  slotsFull: boolean;
  /** Con los slots llenos y `buySlots` activo: lo que cuesta comprar un slot (2 × nivel nuevo); si no, `null`. */
  slotPrice: number | null;
  /** El XP alcanza para los dados y el slot. */
  canBuySlot: boolean;
}

/** `append` ocupa un slot libre; `replace` sustituye la habilidad en `index` (nunca 0); `buy` compra un slot con XP
 *  y la añade; `discard` renuncia. */
export type SlotChoice = { kind: 'append' } | { kind: 'replace'; index: number } | { kind: 'buy' } | { kind: 'discard' };

export interface AdvancementChoice {
  newSkillName: string;
  slot: SlotChoice;
}

export interface ApplyResult {
  character: Character;
  xpGained: number;
  xpSpent: number;
  newSkill: Skill | null;
  /** Índice y habilidad reemplazada. */
  replaced: { index: number; skill: Skill } | null;
}

function sourceSkill(character: Character, skillIndex: number): Skill {
  const skill = character.skills[skillIndex];
  if (!skill) throw new EngineError({ kind: 'SkillIndexOutOfRange', index: skillIndex });
  return skill;
}

function checkRollMatches(skill: Skill, roll: DiceRoll): void {
  if (roll.length !== skill.level) throw new EngineError({ kind: 'DiceCountMismatch', expected: skill.level, got: roll.length });
}

function xpAvailable(character: Character, settings: RoomSettings, outcome: RollOutcome): number {
  return settings.xpSameRoll ? character.xp + outcome.xpGained : character.xp;
}

/** Calcula si la tirada permite ganar una habilidad nueva.
 *
 *  Devuelve `null` si no hay avance posible: no todos son 6 y el XP no alcanza, o la habilidad ya está en el
 *  nivel máximo. */
export function advancementOption(
  character: Character,
  settings: RoomSettings,
  roll: DiceRoll,
  outcome: RollOutcome,
  skillIndex: number,
): AdvancementOption | null {
  const skill = sourceSkill(character, skillIndex);
  checkRollMatches(skill, roll);

  if (skill.level >= settings.maxDice) return null;

  const xpCost = roll.nonSixes();
  const available = xpAvailable(character, settings, outcome);
  if (xpCost > available) return null;

  const full = slotsFull(character, settings);
  const price = full && settings.buySlots ? slotPrice(skill.level + 1) : null;
  return {
    sourceSkillIndex: skillIndex,
    sourceLabel: skillLabel(skill),
    newLevel: skill.level + 1,
    natural: xpCost === 0,
    xpCost,
    xpAvailable: available,
    slotsFull: full,
    slotPrice: price,
    canBuySlot: price !== null && xpCost + price <= available,
  };
}

function cloneCharacter(c: Character): Character {
  return { ...c, skills: c.skills.map((s) => ({ ...s })) };
}

/** Aplica el resultado de una tirada resuelta a la hoja: XP por fallo y, opcionalmente, la habilidad nueva
 *  elegida por el jugador. */
export function applyRoll(
  character: Character,
  settings: RoomSettings,
  roll: DiceRoll,
  outcome: RollOutcome,
  skillIndex: number,
  choice: AdvancementChoice | null,
): ApplyResult {
  const skill = sourceSkill(character, skillIndex);
  checkRollMatches(skill, roll);

  const updated = cloneCharacter(character);
  updated.xp = character.xp + outcome.xpGained;

  if (!choice || choice.slot.kind === 'discard') {
    return { character: updated, xpGained: outcome.xpGained, xpSpent: 0, newSkill: null, replaced: null };
  }

  const option = advancementOption(character, settings, roll, outcome, skillIndex);
  if (!option) throw new EngineError({ kind: 'NotEligible' });

  const newSkill: Skill = {
    name: normalizeSkillName(choice.newSkillName),
    level: option.newLevel,
    permanent: false,
    derivedFrom: option.sourceLabel,
  };

  let replaced: ApplyResult['replaced'] = null;
  let xpSpent = option.xpCost;
  if (choice.slot.kind === 'append' || choice.slot.kind === 'buy') {
    if (choice.slot.kind === 'buy') {
      if (option.slotPrice === null) throw new EngineError({ kind: 'CannotBuySlot' });
      if (!option.canBuySlot) throw new EngineError({ kind: 'InsufficientXp', needed: option.xpCost + option.slotPrice, available: option.xpAvailable });
      updated.extraSlots += 1;
      xpSpent += option.slotPrice;
    } else if (option.slotsFull) {
      throw new EngineError({ kind: 'SlotsFull' });
    }
    if (findDuplicate(updated.skills, newSkill.name)) throw new EngineError({ kind: 'DuplicateSkillName', name: newSkill.name });
    updated.skills.push({ ...newSkill });
  } else {
    const index = choice.slot.index;
    const target = updated.skills[index];
    if (!target) throw new EngineError({ kind: 'SkillIndexOutOfRange', index });
    if (target.permanent) throw new EngineError({ kind: 'CannotReplacePermanent' });
    if (findDuplicate(updated.skills, newSkill.name, index)) throw new EngineError({ kind: 'DuplicateSkillName', name: newSkill.name });
    updated.skills[index] = { ...newSkill };
    replaced = { index, skill: target };
  }

  // `advancementOption` ya garantizó que el XP alcanza según `xpSameRoll` (y `canBuySlot` con el slot).
  updated.xp -= xpSpent;

  return { character: updated, xpGained: outcome.xpGained, xpSpent, newSkill, replaced };
}
