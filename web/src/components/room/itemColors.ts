import type { CSSProperties } from 'react';
import { DEFAULT_ITEM_COLOR, type ItemColor, type ItemLook } from '../../engine';

/** Tonos de objeto (la paleta de grupos de Kovalt Inventory): luminosidad media, legibles como trazo en
 *  los tres temas. En Roller también dan el brillo tenue de la casilla. */
const PALETTE: Record<ItemColor, string> = {
  ember: '#d85d47',
  amber: '#b97500',
  moss: '#71902d',
  jade: '#1f9971',
  sky: '#0091b9',
  cobalt: '#5283e0',
  violet: '#956ed2',
  rose: '#ca5e96',
  sand: '#997f52',
  slate: '#77889b',
  bone: '#8c8672',
  rust: '#be6438',
};

export const COLOR_NAMES: Record<ItemColor, string> = {
  slate: 'Pizarra',
  bone: 'Hueso',
  sand: 'Arena',
  amber: 'Ámbar',
  rust: 'Óxido',
  ember: 'Brasa',
  rose: 'Rosa',
  violet: 'Violeta',
  cobalt: 'Cobalto',
  sky: 'Cielo',
  jade: 'Jade',
  moss: 'Musgo',
};

export function itemColor(key: string): string {
  return PALETTE[key as ItemColor] ?? PALETTE[DEFAULT_ITEM_COLOR];
}

/** Variable CSS con el tono del objeto, para el brillo de la casilla. */
export function lookStyle(look: ItemLook): CSSProperties {
  return { '--rl-item': itemColor(look.color) } as CSSProperties;
}
