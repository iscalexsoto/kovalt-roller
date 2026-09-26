import { useEffect, useRef, useState } from 'react';
import { GameIcon } from '../../icons/GameIcon';

/* Dados de una tirada. La bandeja sabe animar un reveal: cada dado gira (cambiando de cara cada 60 ms) y cae por
 * separado, 120 ms después del anterior; al caer el último, el total cuenta hacia arriba. Solo se animan
 * `transform` y `opacity` (web-motion.md); el giro de caras es un cambio de contenido. */

const SPIN_MS = 60;
const LAND_MS = 320; // --kv-duration-long, easing kobold
const STEP_MS = 120;
const COUNT_MS = 220; // --kv-duration-medium

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cuánto dura el reveal de `count` dados, del primer giro al final del conteo. */
export function revealDuration(count: number): number {
  if (prefersReducedMotion()) return 0;
  return LAND_MS + Math.max(0, count - 1) * STEP_MS + COUNT_MS;
}

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** Un dado: la cara de Lucide del valor; los 6 en cobalto (son los que hacen avanzar). */
export function DieFace({ value, muted = false, slot = false, rolling = false, landed = false }: { value: number; muted?: boolean; slot?: boolean; rolling?: boolean; landed?: boolean }) {
  const cls = ['rl-die', value === 6 && !slot && !rolling ? 'rl-die--six' : '', muted ? 'rl-die--muted' : '', slot ? 'rl-die--slot' : '', rolling ? 'rl-die--rolling' : '', landed ? 'rl-die--land' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} aria-label={slot ? 'dado por tirar' : `${value}`}>
      <GameIcon name={`dice-${value}`} strokeWidth={1.8} />
    </span>
  );
}

interface Anim {
  key: number;
  faces: number[];
  landed: number;
  counting: boolean;
}

/** Dados y total de un lado del duelo. Sin `dice`, muestra `count` huecos. Cuando `animateKey` cambia (y no es 0)
 *  reproduce el reveal y avisa con `onDone` al terminar. */
export function DiceTray({ dice, count, muted = false, animateKey = 0, onDone }: { dice: readonly number[] | null; count: number; muted?: boolean; animateKey?: number; onDone?: () => void }) {
  const [anim, setAnim] = useState<Anim | null>(null);
  const [shownTotal, setShownTotal] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (animateKey === 0 || !dice) return;
    const values = [...dice];
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    if (prefersReducedMotion()) {
      setAnim(null);
      setShownTotal(null);
      done.current?.();
      return;
    }
    setAnim({ key: animateKey, faces: values.map(randomFace), landed: 0, counting: false });
    setShownTotal(0);
    const spin = window.setInterval(() => {
      setAnim((a) => (a && a.key === animateKey ? { ...a, faces: a.faces.map((f, i) => (i < a.landed ? f : randomFace())) } : a));
    }, SPIN_MS);
    values.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setAnim((a) => (a && a.key === animateKey ? { ...a, landed: i + 1, faces: a.faces.map((f, j) => (j === i ? values[i]! : f)) } : a));
        }, LAND_MS + i * STEP_MS),
      );
    });
    const total = values.reduce((x, y) => x + y, 0);
    const countStart = LAND_MS + (values.length - 1) * STEP_MS;
    timers.current.push(
      window.setTimeout(() => {
        window.clearInterval(spin);
        setAnim((a) => (a && a.key === animateKey ? { ...a, counting: true } : a));
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / COUNT_MS);
          setShownTotal(Math.round(total * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
          else done.current?.();
        };
        requestAnimationFrame(tick);
      }, countStart),
    );
    return () => {
      window.clearInterval(spin);
      clear();
    };
    // Solo se reinicia con una clave nueva: los dados no cambian una vez escritos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateKey]);

  if (!dice) {
    return (
      <span className="rl-pool">
        <span className="rl-dice">
          {Array.from({ length: count }, (_, i) => (
            <DieFace key={i} value={muted ? 3 : 5} slot muted={muted} />
          ))}
        </span>
        <span className="rl-total rl-total--empty kv-num">—</span>
      </span>
    );
  }

  const total = dice.reduce((x, y) => x + y, 0);
  const live = anim && anim.key === animateKey ? anim : null;
  const totalText = live ? (live.counting ? String(shownTotal ?? 0) : '—') : String(total);
  return (
    <span className="rl-pool">
      <span className="rl-dice">
        {dice.map((v, i) => {
          const rolling = Boolean(live) && live!.landed <= i;
          return <DieFace key={i} value={rolling ? live!.faces[i]! : v} muted={muted} rolling={rolling} landed={Boolean(live) && !rolling} />;
        })}
      </span>
      <span className={`rl-total kv-num${live && !live.counting ? ' rl-total--empty' : ''}`}>{totalText}</span>
    </span>
  );
}
