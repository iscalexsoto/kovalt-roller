import { skillLabel, type Character, type FlowActionKind, type RollState } from '../../engine';
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
