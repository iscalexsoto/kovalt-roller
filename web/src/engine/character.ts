import { EngineError } from './errors';
import { MAX_CHARACTER_NAME_LEN, MAX_SKILL_NAME_LEN, baseSkill, isBaseSkill, type Character, type RoomSettings, type Skill } from './types';

/** Largo en caracteres (no en unidades UTF-16), como `chars().count()` en Rust. */
export function charCount(s: string): number {
  return [...s].length;
}

/** Crea un personaje nuevo con "Do Anything 1". */
export function newCharacter(name: string, description: string): Character {
  return {
    name: normalizeCharacterName(name),
    description: description.trim(),
    notes: '',
    xp: 0,
    skills: [baseSkill()],
  };
}

export function normalizeCharacterName(name: string): string {
  const trimmed = name.trim();
  const len = charCount(trimmed);
  if (len === 0 || len > MAX_CHARACTER_NAME_LEN) {
    throw new EngineError({ kind: 'InvalidCharacterName', max: MAX_CHARACTER_NAME_LEN });
  }
  return trimmed;
}

export function normalizeSkillName(name: string): string {
  const collapsed = name.split(/\s+/).filter(Boolean).join(' ');
  const len = charCount(collapsed);
  if (len === 0 || len > MAX_SKILL_NAME_LEN) {
    throw new EngineError({ kind: 'InvalidSkillName', max: MAX_SKILL_NAME_LEN });
  }
  return collapsed;
}

export interface SlotUsage {
  used: number;
  capacity: number;
}

/** Slots usados y capacidad. "Do Anything 1" no ocupa slot. */
export function slotUsage(character: Character, settings: RoomSettings): SlotUsage {
  return { used: character.skills.filter((s) => !s.permanent).length, capacity: settings.skillSlots };
}

export function slotsFull(character: Character, settings: RoomSettings): boolean {
  const { used, capacity } = slotUsage(character, settings);
  return used >= capacity;
}

/** Busca otra habilidad con el mismo nombre (sin distinguir mayúsculas). */
export function findDuplicate(skills: readonly Skill[], name: string, ignore: number | null = null): boolean {
  const lower = name.toLowerCase();
  return skills.some((s, i) => i !== ignore && s.name.toLowerCase() === lower);
}

function isValid(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

/** Valida todas las invariantes de la hoja. Devuelve todos los errores encontrados (vacío si está bien). */
export function validateCharacter(character: Character, settings: RoomSettings): EngineError[] {
  const errors: EngineError[] = [];

  if (!isValid(() => normalizeCharacterName(character.name))) {
    errors.push(new EngineError({ kind: 'InvalidCharacterName', max: MAX_CHARACTER_NAME_LEN }));
  }

  const first = character.skills[0];
  if (!first || !isBaseSkill(first)) errors.push(new EngineError({ kind: 'MissingBaseSkill' }));

  character.skills.forEach((skill, i) => {
    if (i > 0 && skill.permanent) errors.push(new EngineError({ kind: 'UnexpectedPermanentSkill' }));
    if (!Number.isInteger(skill.level) || skill.level < 1 || skill.level > settings.maxDice) {
      errors.push(new EngineError({ kind: 'InvalidSkillLevel', level: skill.level }));
    }
    if (!isValid(() => normalizeSkillName(skill.name))) {
      errors.push(new EngineError({ kind: 'InvalidSkillName', max: MAX_SKILL_NAME_LEN }));
    }
    if (findDuplicate(character.skills.slice(0, i), skill.name)) {
      errors.push(new EngineError({ kind: 'DuplicateSkillName', name: skill.name }));
    }
  });

  const { used, capacity } = slotUsage(character, settings);
  if (used > capacity) errors.push(new EngineError({ kind: 'TooManySkills', used, capacity }));

  return errors;
}
