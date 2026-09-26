import { BASE_SKILL_NAME, difficultyOf, type Character, type Difficulty, type FlowActionKind, type Opposition, type RollState, type Skill } from '../../engine';

/* Nombre visible de la habilidad base. El dato (motor, Firestore, reglas) sigue siendo "Do Anything": solo se traduce
   al pintar, incluidas las etiquetas guardadas en `derivedFrom` ("Do Anything 1"). */
const BASE_SKILL_DISPLAY = 'Hacer cualquier cosa';

export function skillName(name: string): string {
  return name === BASE_SKILL_NAME ? BASE_SKILL_DISPLAY : name;
}

/** "Nombre N" tal como se muestra en pantalla. */
export function skillLabel(skill: Pick<Skill, 'name' | 'level'>): string {
  return `${skillName(skill.name)} ${skill.level}`;
}

export const DIFFICULTY_LABEL: Record<Difficulty['key'], string> = {
  easy: 'Fácil',
  moderate: 'Moderado',
  hard: 'Difícil',
  veryHard: 'Muy difícil',
};

/** Cómo se describe la oposición bajo el nombre del DM: «Difícil · 3d6», «Objetivo fijo · 7»… */
export function oppositionLabel(o: Opposition): string {
  const d = difficultyOf(o);
  const how = o.kind === 'dice' ? `${o.dice.length}d6` : `objetivo ${o.target}`;
  return d ? `${DIFFICULTY_LABEL[d.key]} · ${how}` : o.kind === 'dice' ? `Oposición · ${how}` : `Objetivo fijo · ${o.target}`;
}

/** Traduce una etiqueta guardada ("Do Anything 1" → "Hacer cualquier cosa 1"). */
export function skillLabelText(label: string): string {
  return label.startsWith(`${BASE_SKILL_NAME} `) ? BASE_SKILL_DISPLAY + label.slice(BASE_SKILL_NAME.length) : label;
}
import type { RollDoc } from '../../data/models';

export const STATE_LABEL: Record<RollState, string> = {
  declarada: 'Declarada',
  aprobada: 'Aprobada',
  contraoferta: 'Contraoferta',
  rechazada: 'Rechazada',
  sin_tirada: 'Sin tirada',
  oposicion: 'Oposición',
  tirada: 'Tirada',
  resuelta: 'Resuelta',
  retirada: 'Retirada',
};

/** Tono del Tag de estado (roles de estado de Kovalt: nunca decoración, siempre significado). */
export const STATE_TONE: Record<RollState, 'info' | 'warning' | 'success' | 'error' | 'neutral' | 'veta'> = {
  declarada: 'info',
  aprobada: 'veta',
  contraoferta: 'warning',
  rechazada: 'error',
  sin_tirada: 'neutral',
  oposicion: 'veta',
  tirada: 'veta',
  resuelta: 'success',
  retirada: 'neutral',
};

export function actionLabel(kind: FlowActionKind, roll: RollDoc): string {
  switch (kind) {
    case 'approve':
      return 'Aprobar';
    case 'counterOffer':
      return 'Contraoferta';
    case 'reject':
      return 'Rechazar';
    case 'narrate':
      return 'Narrar sin tirada';
    case 'acceptCounterOffer':
      return 'Aceptar';
    case 'redeclare':
      return 'Editar';
    case 'withdraw':
      return 'Retirar';
    case 'rollOpposition':
      return 'Tirar oposición';
    case 'rollPlayer':
      return `Tirar ${roll.record.skill.level}d6`;
    case 'resolve':
      return 'Resolver';
    case 'applyAdvance':
      return 'Aplicar avance';
  }
}

export const ACTION_ICON: Partial<Record<FlowActionKind, string>> = {
  approve: 'check',
  counterOffer: 'undo-2',
  reject: 'x',
  narrate: 'scroll-text',
  acceptCounterOffer: 'check',
  redeclare: 'pencil',
  withdraw: 'trash-2',
  rollOpposition: 'shield',
  rollPlayer: 'dices',
  resolve: 'swords',
  applyAdvance: 'trending-up',
};

/** Acciones principales (botón relleno) frente a secundarias. */
export function isPrimaryAction(kind: FlowActionKind): boolean {
  return kind === 'approve' || kind === 'acceptCounterOffer' || kind === 'rollOpposition' || kind === 'rollPlayer' || kind === 'resolve' || kind === 'applyAdvance';
}

/** Opciones de habilidad para un Select ("Trepar 2 · 2d6"). */
export function skillOptions(sheet: Character, exclude?: number) {
  return sheet.skills
    .map((s, i) => ({ value: String(i), label: `${skillLabel(s)} · ${s.level}d6` }))
    .filter((o) => Number(o.value) !== exclude);
}
