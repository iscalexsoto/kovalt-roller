/* La coreografía Sello (kovalt-medieval-skill § Movimiento): los dados ruedan, aparecen la suma y el total, cada estado
 * se aplica por turno y el veredicto cae. Con la Web Animations API y solo `opacity`, `transform` y `filter`; con
 * `fill: 'backwards'` cada pieza espera oculta su turno. Los tiempos (ms) son los de la skill. */

export const STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
const TUMBLE = 'cubic-bezier(.2, .7, .3, 1)';
const FALL = 'cubic-bezier(.55, 0, .8, .3)';

export const DIE_MS = 480;
export const DIE_STAGGER = 90;
/** Tras los dados: la suma y el total entran, y 600 ms después empiezan los estados. */
export const STATES_AFTER = 600;
const CHIP_MS = 220;
/** Del chip al primer paso, cada paso del total y la pausa tras cada estado. */
export const STEP_LEAD = 260;
export const STEP_MS = 140;
export const STATE_PAUSE = 220;
/** El veredicto entra 150 ms después del último estado; el golpe llega 290 ms después. */
export const VERDICT_AFTER = 150;
export const IMPACT_AT = 290;
export const VERDICT_MS = 380;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type El = Element | null | undefined;

function run(el: El, frames: Keyframe[], options: KeyframeAnimationOptions): void {
  if (el && 'animate' in el) el.animate(frames, { fill: 'backwards', ...options });
}

/** Cuándo termina de rodar una fila de `count` dados. */
export function tumbleEnd(count: number): number {
  return Math.max(0, count - 1) * DIE_STAGGER + DIE_MS;
}

/** Los dados ruedan: `rotate(-140deg) scale(.4)` → pasan 10° → reposan; 90 ms entre uno y otro. */
export function tumble(dice: El[], delay = 0): void {
  dice.forEach((d, i) =>
    run(
      d,
      [
        { opacity: 0, transform: 'rotate(-140deg) scale(.4)' },
        { opacity: 1, transform: 'rotate(10deg) scale(1.06)', offset: 0.7 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: DIE_MS, delay: delay + i * DIE_STAGGER, easing: TUMBLE },
    ),
  );
}

export function fadeIn(el: El, delay: number, duration = 220): void {
  run(el, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration, delay, easing: STANDARD });
}

/** El total entra un poco después que la suma, creciendo. */
export function popIn(el: El, delay: number): void {
  run(el, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay, easing: STANDARD });
}

/** Un estado entra deslizándose desde la izquierda. */
export function slideIn(el: El, delay: number): void {
  run(el, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: CHIP_MS, delay, easing: STANDARD });
}

/** Un paso del total: golpe `scale(1.35) → 1`. El tinte (−/+) lo pone la clase del número. */
export function punch(el: El): void {
  if (el && 'animate' in el) el.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 360, easing: STANDARD });
}

/** El veredicto cae: `scale(2) → .94 → 1`, acelerando. */
export function fall(el: El, delay: number, from = 2): void {
  run(
    el,
    [
      { opacity: 0, transform: `scale(${from})` },
      { opacity: 1, transform: 'scale(.94)', offset: 0.75 },
      { opacity: 1, transform: 'none' },
    ],
    { duration: VERDICT_MS, delay, easing: FALL },
  );
}

/** El panel acusa el golpe: 1–2px durante 200 ms. */
export function jolt(el: El, delay: number): void {
  if (el && 'animate' in el)
    el.animate([{ transform: 'none' }, { transform: 'translate(1px, 2px)' }, { transform: 'translate(-1px, -1px)' }, { transform: 'none' }], { duration: 200, delay });
}

/** Cancela lo que el reveal esté animando dentro de `root` (antes de uno nuevo y al terminar). Las animaciones de
 *  CSS (los puntos de espera) siguen. */
export function cancelAll(root: El): void {
  if (!root || !('getAnimations' in root)) return;
  (root as HTMLElement)
    .getAnimations({ subtree: true })
    .filter((a) => !('animationName' in a))
    .forEach((a) => a.cancel());
}

/** Del primer dado del jugador a que el veredicto termina de caer, con estos estados (sus deltas). */
export function revealDuration(dice: number, deltas: readonly number[]): number {
  if (prefersReducedMotion()) return 0;
  const states = deltas.reduce((t, d) => t + STEP_LEAD + Math.abs(d) * STEP_MS + STATE_PAUSE, 0);
  return tumbleEnd(dice) + STATES_AFTER + states + VERDICT_AFTER + VERDICT_MS + IMPACT_AT;
}
