import { useEffect } from 'react';
import { Portal } from '../kv/Overlay';
import { cancelDrag, startPointerDrag, toggleArmed, useDrag, type DragPayload } from './drag';
import { ItemGlyph } from './itemLook';

/** Asa de arrastre de un objeto del catálogo (su ícono). */
export function DragHandle({ payload, label }: { payload: DragPayload; label: string }) {
  const armedHere = useDrag((s) => s.armed && s.payload?.item.id === payload.item.id);
  return (
    <button
      type="button"
      className={`kv-icon-btn rl-drag-handle${armedHere ? ' rl-drag-handle--armed' : ''}`}
      aria-label={label}
      aria-pressed={armedHere}
      title={label}
      onPointerDown={(e) => startPointerDrag(e, payload)}
      onClick={() => toggleArmed(payload)}
    >
      <ItemGlyph look={payload.item} />
    </button>
  );
}

/** Lo que sigue al puntero mientras se arrastra, y el aviso cuando hay un objeto levantado. */
export function DragLayer() {
  const payload = useDrag((s) => s.payload);
  const armed = useDrag((s) => s.armed);
  const x = useDrag((s) => s.x);
  const y = useDrag((s) => s.y);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload) return null;
  return (
    <Portal>
      {armed ? (
        <div className="rl-drag-hint kv-float-1" role="status">
          <ItemGlyph look={payload.item} />
          <span className="rl-grow">
            <strong>{payload.item.name}</strong>: toca a quién dárselo o dónde ponerlo.
          </span>
          <button type="button" className="kv-btn kv-btn--text kv-btn--dense" onClick={cancelDrag}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="rl-drag-ghost" style={{ left: x, top: y }} aria-hidden>
          <ItemGlyph look={payload.item} size={22} />
          <span>{payload.item.name}</span>
        </div>
      )}
    </Portal>
  );
}
