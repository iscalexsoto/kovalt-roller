import type { Actor, FlowActionKind, RollState } from './rollFlow';

/** Errores del motor de reglas. `detail` conserva los datos para tests y para la interfaz. */
export type EngineErrorDetail =
  | { kind: 'InvalidCharacterName'; max: number }
  | { kind: 'InvalidSkillName'; max: number }
  | { kind: 'MissingBaseSkill' }
  | { kind: 'UnexpectedPermanentSkill' }
  | { kind: 'TooManySkills'; used: number; capacity: number }
  | { kind: 'SlotsFull' }
  | { kind: 'CannotBuySlot' }
  | { kind: 'CannotReplacePermanent' }
  | { kind: 'SkillIndexOutOfRange'; index: number }
  | { kind: 'DuplicateSkillName'; name: string }
  | { kind: 'InvalidSkillLevel'; level: number }
  | { kind: 'InvalidStatusName'; max: number }
  | { kind: 'InvalidStatusRating'; max: number }
  | { kind: 'TooManyStatuses'; max: number }
  | { kind: 'InvalidModifier'; max: number }
  | { kind: 'NotEligible' }
  | { kind: 'InsufficientXp'; needed: number; available: number }
  | { kind: 'DiceCountOutOfRange'; got: number; max: number }
  | { kind: 'InvalidDieValue'; value: number }
  | { kind: 'DiceCountMismatch'; expected: number; got: number }
  | { kind: 'InvalidTarget'; max: number }
  | { kind: 'EmptyAction' }
  | { kind: 'EmptyNarration' }
  | { kind: 'InvalidItemName'; max: number }
  | { kind: 'InvalidItemLook' }
  | { kind: 'InvalidAmount'; what: string; value: number }
  | { kind: 'InvalidOfferTitle'; max: number }
  | { kind: 'OutOfStock'; available: number }
  | { kind: 'NotEnoughCoins'; needed: number; available: number }
  | { kind: 'TransitionNotAllowed'; state: RollState; action: FlowActionKind; actor: Actor }
  | { kind: 'AdvancementNotPending' }
  | { kind: 'InvalidSettings'; reason: string };

export type EngineErrorKind = EngineErrorDetail['kind'];

function message(d: EngineErrorDetail): string {
  switch (d.kind) {
    case 'InvalidCharacterName':
      return `el nombre del personaje es obligatorio (1-${d.max} caracteres)`;
    case 'InvalidSkillName':
      return `el nombre de la habilidad es obligatorio (1-${d.max} caracteres)`;
    case 'MissingBaseSkill':
      return 'la primera habilidad debe ser "Do Anything 1" permanente';
    case 'UnexpectedPermanentSkill':
      return 'solo "Do Anything 1" puede ser permanente';
    case 'TooManySkills':
      return `hay más habilidades (${d.used}) que slots disponibles (${d.capacity})`;
    case 'SlotsFull':
      return 'todos los slots de habilidad están ocupados';
    case 'CannotBuySlot':
      return 'en esta sala no se compran slots (o no hace falta: hay uno libre)';
    case 'CannotReplacePermanent':
      return '"Do Anything 1" no se puede reemplazar';
    case 'SkillIndexOutOfRange':
      return `índice de habilidad fuera de rango: ${d.index}`;
    case 'DuplicateSkillName':
      return `ya existe una habilidad llamada "${d.name}"`;
    case 'InvalidSkillLevel':
      return `nivel de habilidad inválido: ${d.level}`;
    case 'InvalidStatusName':
      return `el nombre del estado es obligatorio (1-${d.max} caracteres)`;
    case 'InvalidStatusRating':
      return `el valor del estado debe ser un entero entre −${d.max} y +${d.max}`;
    case 'TooManyStatuses':
      return `como mucho ${d.max} estados por personaje`;
    case 'InvalidModifier':
      return `el modificador debe ser un entero entre −${d.max} y +${d.max}`;
    case 'NotEligible':
      return 'esta tirada no permite avanzar';
    case 'InsufficientXp':
      return `XP insuficiente: se necesitan ${d.needed} y hay ${d.available}`;
    case 'DiceCountOutOfRange':
      return `número de dados inválido: ${d.got} (debe estar entre 1 y ${d.max})`;
    case 'InvalidDieValue':
      return `valor de dado inválido: ${d.value}`;
    case 'DiceCountMismatch':
      return `se esperaban ${d.expected} dados y se tiraron ${d.got}`;
    case 'InvalidTarget':
      return `el objetivo fijo debe ser un entero entre 1 y ${d.max}`;
    case 'EmptyAction':
      return 'la acción declarada no puede estar vacía';
    case 'EmptyNarration':
      return 'la narración no puede estar vacía';
    case 'InvalidItemName':
      return `el nombre del objeto es obligatorio (1-${d.max} caracteres)`;
    case 'InvalidItemLook':
      return 'ícono o color de objeto desconocido';
    case 'InvalidAmount':
      return `${d.what} inválido: ${d.value} (debe ser un entero no negativo)`;
    case 'InvalidOfferTitle':
      return `el título es obligatorio (1-${d.max} caracteres)`;
    case 'OutOfStock':
      return d.available === 0 ? 'ya no quedan unidades' : `solo quedan ${d.available}`;
    case 'NotEnoughCoins':
      return `no alcanza: cuesta ${d.needed} y tienes ${d.available} monedas`;
    case 'TransitionNotAllowed':
      return `${d.actor} no puede hacer ${d.action} en estado ${d.state}`;
    case 'AdvancementNotPending':
      return 'el avance de esta tirada ya fue aplicado o no aplica';
    case 'InvalidSettings':
      return `ajustes de sala inválidos: ${d.reason}`;
  }
}

export class EngineError extends Error {
  readonly detail: EngineErrorDetail;

  constructor(detail: EngineErrorDetail) {
    super(message(detail));
    this.name = 'EngineError';
    this.detail = detail;
  }

  get kind(): EngineErrorKind {
    return this.detail.kind;
  }
}
