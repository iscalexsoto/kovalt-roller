import { charCount } from './character';
import { EngineError } from './errors';

export const MAX_ITEM_NAME_LEN = 80;
export const MAX_OFFER_TITLE_LEN = 60;
/** Tope de existencias por objeto en un botín o una tienda. */
export const MAX_STOCK = 999;

/** Colores de objeto. Solo tiñen el trazo del ícono; la interfaz traduce cada clave a un tono. */
export const ITEM_COLOR_KEYS = ['slate', 'bone', 'sand', 'amber', 'rust', 'ember', 'rose', 'violet', 'cobalt', 'sky', 'jade', 'moss'] as const;
export type ItemColor = (typeof ITEM_COLOR_KEYS)[number];

/** Íconos de objeto (claves del set de `GameIcon`). */
export const ITEM_ICON_KEYS = [
  'package', 'backpack', 'gift', 'box', 'amphora', 'vault',
  'sword', 'swords', 'axe', 'hammer', 'pickaxe', 'shovel', 'bow-arrow', 'crosshair', 'bomb', 'shield', 'shield-half',
  'wand', 'wand-sparkles', 'sparkles', 'flame', 'zap', 'snowflake', 'orbit', 'eye', 'skull', 'ghost', 'bone',
  'flask-conical', 'flask-round', 'test-tube-diagonal', 'pill', 'syringe', 'bandage', 'heart', 'hand-heart', 'cross',
  'scroll', 'scroll-text', 'book', 'book-open', 'map', 'compass', 'telescope', 'feather', 'key', 'key-round', 'lock',
  'gem', 'diamond', 'coins', 'banknote', 'crown', 'trophy', 'medal', 'award',
  'lamp', 'flame-kindling', 'tent', 'anchor', 'hourglass', 'bell', 'glasses', 'shirt', 'footprints', 'music', 'guitar', 'drum', 'dice-5', 'puzzle',
  'apple', 'beef', 'drumstick', 'ham', 'fish', 'carrot', 'wheat', 'egg', 'cookie', 'croissant', 'sandwich', 'soup', 'grape', 'cherry', 'beer', 'wine', 'milk',
  'leaf', 'sprout', 'flower', 'clover', 'mountain', 'droplet', 'shell', 'paw-print', 'bug', 'rat', 'cat', 'dog',
] as const;

export const DEFAULT_ITEM_ICON = 'package';
export const DEFAULT_ITEM_COLOR: ItemColor = 'slate';

/** Apariencia de un objeto: ícono y color de trazo. */
export interface ItemLook {
  icon: string;
  color: string;
}

/** Objeto del catálogo del DM: no tiene cantidad; el valor es el precio por defecto. */
export interface CatalogItem extends ItemLook {
  name: string;
  /** Incluye el efecto si el objeto es mágico. */
  description: string;
  /** Valor opcional, en monedas. */
  value: number | null;
}

/** Copia de un objeto en el inventario de un personaje. */
export interface Item extends CatalogItem {
  /** Puede ser 0. */
  quantity: number;
}

export type OfferKind = 'loot' | 'shop';

/** Objeto puesto en un botín o una tienda, con existencias limitadas. */
export interface OfferLine extends CatalogItem {
  /** Precio por unidad en la tienda; en el botín no se usa. */
  price: number;
  stock: number;
}

const isCount = (n: number, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= 0 && n <= max;

export function isItemColor(c: string): c is ItemColor {
  return (ITEM_COLOR_KEYS as readonly string[]).includes(c);
}

export function isItemIcon(i: string): boolean {
  return (ITEM_ICON_KEYS as readonly string[]).includes(i);
}

export function validateCatalogItem(item: CatalogItem): void {
  const len = charCount(item.name.trim());
  if (len === 0 || len > MAX_ITEM_NAME_LEN) throw new EngineError({ kind: 'InvalidItemName', max: MAX_ITEM_NAME_LEN });
  if (item.value !== null && !isCount(item.value)) throw new EngineError({ kind: 'InvalidAmount', what: 'valor', value: item.value });
  if (!isItemIcon(item.icon) || !isItemColor(item.color)) throw new EngineError({ kind: 'InvalidItemLook' });
}

export function validateItem(item: Item): void {
  validateCatalogItem(item);
  if (!isCount(item.quantity)) throw new EngineError({ kind: 'InvalidAmount', what: 'cantidad', value: item.quantity });
}

export function newCatalogItem(name: string, description: string, value: number | null, look: ItemLook = { icon: DEFAULT_ITEM_ICON, color: DEFAULT_ITEM_COLOR }): CatalogItem {
  const item: CatalogItem = { name: name.trim(), description: description.trim(), value, icon: look.icon, color: look.color };
  validateCatalogItem(item);
  return item;
}

/** Copia que recibe un personaje, con su propia cantidad. */
export function giveItem(item: CatalogItem, quantity: number): Item {
  const copy: Item = { name: item.name, description: item.description, value: item.value, icon: item.icon, color: item.color, quantity };
  validateItem(copy);
  return copy;
}

/** Suma unidades a una copia ya en el inventario (los objetos del mismo origen se apilan). */
export function stack(current: number, added: number): number {
  if (!isCount(added) || added < 1) throw new EngineError({ kind: 'InvalidAmount', what: 'cantidad', value: added });
  return current + added;
}

export function validateOfferTitle(title: string): string {
  const trimmed = title.trim();
  const len = charCount(trimmed);
  if (len === 0 || len > MAX_OFFER_TITLE_LEN) throw new EngineError({ kind: 'InvalidOfferTitle', max: MAX_OFFER_TITLE_LEN });
  return trimmed;
}

/** Línea de botín o tienda a partir de un objeto del catálogo: el precio parte del valor. */
export function offerLine(item: CatalogItem, stock = 1): OfferLine {
  const line: OfferLine = { ...item, price: item.value ?? 0, stock };
  validateOfferLine(line);
  return line;
}

export function validateOfferLine(line: OfferLine): void {
  validateCatalogItem(line);
  if (!isCount(line.price)) throw new EngineError({ kind: 'InvalidAmount', what: 'precio', value: line.price });
  if (!isCount(line.stock, MAX_STOCK)) throw new EngineError({ kind: 'InvalidAmount', what: 'existencias', value: line.stock });
}

export interface ClaimResult {
  /** Existencias que quedan. */
  stock: number;
  /** Lo que cuesta (0 en el botín). */
  cost: number;
  /** Monedas del personaje después de pagar. */
  coins: number;
}

/** Un jugador toma (botín) o compra (tienda) `quantity` unidades: el primero que llega se las lleva. */
export function claim(kind: OfferKind, line: OfferLine, quantity: number, coins: number): ClaimResult {
  if (!Number.isInteger(quantity) || quantity < 1) throw new EngineError({ kind: 'InvalidAmount', what: 'cantidad', value: quantity });
  if (quantity > line.stock) throw new EngineError({ kind: 'OutOfStock', available: line.stock });
  const cost = kind === 'shop' ? line.price * quantity : 0;
  if (cost > coins) throw new EngineError({ kind: 'NotEnoughCoins', needed: cost, available: coins });
  return { stock: line.stock - quantity, cost, coins: coins - cost };
}

/** Ajuste de monedas del DM: nunca negativas. */
export function adjustCoins(coins: number, delta: number): number {
  const next = coins + delta;
  if (!isCount(next)) throw new EngineError({ kind: 'InvalidAmount', what: 'monedas', value: next });
  return next;
}
