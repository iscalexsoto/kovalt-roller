/** Cantidades del inventario (DESIGN.md §2 "Cantidades"): siempre con 3 decimales
 *  como máximo y comparadas con epsilon, para que 0.1 + 0.2 sea 0.3 en kilos y
 *  litros igual que en piezas. La misma regla vive en Android (domain/Quantities.kt). */

export const QTY_DECIMALS = 3;
export const QTY_EPSILON = 1e-6;

const SCALE = 10 ** QTY_DECIMALS;

/** Redondea a 3 decimales evitando el sesgo de coma flotante de Math.round(x * 1000). */
export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round((value + Number.EPSILON * Math.sign(value)) * SCALE);
  return scaled / SCALE;
}

export function qtyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < QTY_EPSILON;
}

export function qtyIsZero(value: number): boolean {
  return Math.abs(value) < QTY_EPSILON;
}

export function qtyIsPositive(value: number): boolean {
  return value > QTY_EPSILON;
}

export function qtyIsNegative(value: number): boolean {
  return value < -QTY_EPSILON;
}

/** Suma redondeada: la acumulación de lotes y movimientos pasa por aquí. */
export function qtyAdd(a: number, b: number): number {
  return roundQty(a + b);
}

/** Cantidad en unidades base a partir de una cantidad en una unidad con factor. */
export function toBase(qty: number, factor: number): number {
  return roundQty(qty * factor);
}

/** Texto sin decimales innecesarios: 24 → "24", 0.5 → "0.5", 1.25 → "1.25". */
export function formatQty(value: number): string {
  const rounded = roundQty(value);
  return rounded.toFixed(QTY_DECIMALS).replace(/\.?0+$/, '');
}
