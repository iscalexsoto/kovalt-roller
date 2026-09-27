import { forwardRef } from 'react';
import type { Axes } from '../../state/theme';

/* Dados de la capa medieval (kovalt-medieval-skill § Dados): una loseta `cut-s` de 44 sobre `bg`, con rombos de 6px
 * (Puntos) o la cifra en Amaranth 700 (Numeral), según el eje Dados. Los del jugador van en `on` con rim fuerte; los
 * del DM, en `onv` con el rim normal. Los 6 (los que hacen avanzar) se marcan en la tinta brillante. */

/** Celdas de la cuadrícula 3 × 3 con rombo, por cara. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export type DiceStyle = Axes['dice'];

export function DieTile({ value, style, dm = false, slot = false }: { value: number; style: DiceStyle; dm?: boolean; slot?: boolean }) {
  const cls = ['rl-die', `rl-die--${style}`, value === 6 && !slot ? 'rl-die--six' : '', slot ? 'rl-die--slot' : ''].filter(Boolean).join(' ');
  return (
    <span className={`rl-die-rim${dm ? ' rl-die-rim--dm' : ''}`} role="img" aria-label={slot ? 'dado por tirar' : String(value)}>
      <span className={cls}>
        {slot ? (
          <i className="rl-die__hole" />
        ) : style === 'numeral' ? (
          value
        ) : (
          Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[value]?.includes(i) ? 'rl-pip' : 'rl-pip rl-pip--off'} />)
        )}
      </span>
    </span>
  );
}

/** Una fila de dados. Sin `dice`, `count` huecos por tirar. El `ref` es el contenedor: sus hijos son los dados que
 *  rueda el reveal. */
export const DiceRow = forwardRef<HTMLSpanElement, { dice: readonly number[] | null; count: number; style: DiceStyle; dm?: boolean }>(function DiceRow({ dice, count, style, dm = false }, ref) {
  return (
    <span ref={ref} className="rl-dice">
      {dice ? dice.map((v, i) => <DieTile key={i} value={v} style={style} dm={dm} />) : Array.from({ length: count }, (_, i) => <DieTile key={i} value={0} style={style} dm={dm} slot />)}
    </span>
  );
});
