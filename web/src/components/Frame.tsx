import type { ReactNode } from 'react';

/** Marco (kovalt-medieval-skill § Marco): solo en los tres paneles principales de una pantalla (la tirada en la mesa,
 *  la ficha y la ventana de botín o tienda). Capas anidadas con el mismo corte, nunca filtros: línea (1px) → fondo
 *  (hueco) → línea → panel. Con Filete el hueco y la segunda línea miden 0 y queda una sola línea fuerte. */
export function Frame({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rl-frame ${className}`}>
      <div className="rl-frame__gap">
        <div className="rl-frame__in">{children}</div>
      </div>
    </div>
  );
}
