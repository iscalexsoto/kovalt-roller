import type { DiceRoll } from '../../engine';
import { GameIcon } from '../../icons/GameIcon';

/** Un dado: la cara de Lucide del valor; los 6 en Veta (son los que hacen avanzar). */
export function DieFace({ value, muted = false, index = 0 }: { value: number; muted?: boolean; index?: number }) {
  const six = value === 6;
  return (
    <span className={`rl-die${six ? ' rl-die--six' : ''}${muted ? ' rl-die--muted' : ''}`} style={{ animationDelay: `${index * 45}ms` }} aria-label={`${value}`}>
      <GameIcon name={`dice-${value}`} strokeWidth={1.8} />
    </span>
  );
}

export function DiceRow({ label, roll, muted = false }: { label: string; roll: DiceRoll; muted?: boolean }) {
  return (
    <div className="rl-dice-row">
      <span className="rl-dice-row__label">{label}</span>
      <span className="rl-dice-row__dice">
        {roll.dice.map((d, i) => (
          <DieFace key={i} value={d} muted={muted} index={i} />
        ))}
      </span>
      <span className="rl-dice-row__total kv-num">= {roll.total()}</span>
    </div>
  );
}
