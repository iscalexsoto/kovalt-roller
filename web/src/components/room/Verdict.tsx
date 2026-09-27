import { forwardRef, type ReactNode } from 'react';
import { GameIcon } from '../../icons/GameIcon';
import type { Axes } from '../../state/theme';

/* El veredicto (kovalt-medieval-skill § Resultado), según el eje Resultado:
 * - Sello: un sello de cera de 72 (Gema en el material, otra Gema invertida 6px dentro y el ícono en `onp`) entre las
 *   dos cartas, y la palabra en tinta semántica entre dos reglas que se desvanecen.
 * - Estandarte: una banda a lo ancho con cola de golondrina, lavado y rim semánticos, la palabra entre dos rombos.
 * El sello lleva el material; la palabra, el estado. Nunca un sello verde o rojo. */

export type Outcome = 'exito' | 'fallo' | 'empate';
export type SealStyle = Axes['seal'];

const ICON: Record<Outcome, string> = { exito: 'check', fallo: 'x', empate: 'equal' };

/** El centro de la arena: «contra» mientras se decide (y siempre con Estandarte); el sello al resolver. */
export const SealMark = forwardRef<HTMLSpanElement, { outcome: Outcome | null; style: SealStyle; small?: boolean }>(function SealMark({ outcome, style, small = false }, ref) {
  return (
    <span ref={ref} className={`rl-mark${small ? ' rl-mark--small' : ''}`} aria-hidden>
      {outcome && style === 'sello' ? (
        <span className="rl-seal">
          <GameIcon name={ICON[outcome]} className="rl-seal__icon" strokeWidth={2.6} />
        </span>
      ) : (
        <span className="rl-contra">contra</span>
      )}
    </span>
  );
});

/** La palabra del veredicto y, debajo, lo que trajo la tirada (XP, habilidad nueva…). */
export const VerdictLine = forwardRef<HTMLDivElement, { outcome: Outcome; word: string; style: SealStyle; small?: boolean; children?: ReactNode }>(function VerdictLine(
  { outcome, word, style, small = false, children },
  ref,
) {
  return (
    <div ref={ref} className={`rl-verdict rl-verdict--${outcome}${small ? ' rl-verdict--small' : ''}`} role="status">
      {style === 'estandarte' ? (
        <span className="rl-banner-rim">
          <span className="rl-banner">
            <i className="rl-banner__mark" />
            <span className="rl-verdict__word">{word}</span>
            <i className="rl-banner__mark" />
          </span>
        </span>
      ) : (
        <span className="rl-verdict__line">
          <i className="rl-verdict__rule" />
          <span className="rl-verdict__word">{word}</span>
          <i className="rl-verdict__rule rl-verdict__rule--end" />
        </span>
      )}
      {children && <span className="rl-verdict__extras">{children}</span>}
    </div>
  );
});
