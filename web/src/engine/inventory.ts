import { charCount } from './character';
import { EngineError } from './errors';

export const MAX_ITEM_NAME_LEN = 80;

/** Objeto del catálogo del DM o del inventario de un personaje. */
export interface Item {
  name: string;
  /** Incluye el efecto si el objeto es mágico. */
  description: string;
  /** Valor opcional, en la unidad que use la mesa. */
  value: number | null;
  /** Puede ser 0. */
  quantity: number;
}

export function validateItem(item: Item): void {
  const len = charCount(item.name.trim());
  if (len === 0 || len > MAX_ITEM_NAME_LEN) throw new EngineError({ kind: 'InvalidItemName', max: MAX_ITEM_NAME_LEN });
}

export function newItem(name: string, description: string, value: number | null, quantity: number): Item {
  const item: Item = { name: name.trim(), description: description.trim(), value, quantity };
  validateItem(item);
  return item;
}

/** Copia que el DM entrega a un personaje, con su propia cantidad. */
export function giveItem(item: Item, quantity: number): Item {
  return { ...item, quantity };
}
