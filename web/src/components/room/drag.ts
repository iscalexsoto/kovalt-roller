import { useEffect, useSyncExternalStore } from 'react';
import type { CatalogDoc } from '../../data/models';

/* Arrastrar objetos del catálogo a un jugador, a su ficha o a una ventana de botín/tienda.
 * Con eventos de puntero (sirve con mouse y con el dedo) y sin librerías. El asa también es un botón:
 * tocarla sin mover "levanta" el objeto y el siguiente toque en un destino lo suelta (Esc cancela).
 * Los componentes están en DragUI.tsx. */

export interface DragPayload {
  item: CatalogDoc;
}

interface State {
  payload: DragPayload | null;
  /** Levantado con un toque: esperando que se toque un destino. */
  armed: boolean;
  x: number;
  y: number;
  over: string | null;
}

const targets = new Map<string, (p: DragPayload) => void>();
let state: State = { payload: null, armed: false, x: 0, y: 0, over: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useDrag<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const cancelDrag = () => set({ payload: null, armed: false, over: null });

function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  const key = el?.dataset.drop ?? null;
  return key && targets.has(key) ? key : null;
}

function drop(key: string | null) {
  const payload = state.payload;
  cancelDrag();
  if (payload && key) targets.get(key)?.(payload);
}

const MOVE_THRESHOLD = 6;
let suppressClick = false;

/** `pointerdown` en el asa: si el puntero se mueve, empieza a arrastrar. */
export function startPointerDrag(e: { clientX: number; clientY: number; button: number; pointerType: string }, payload: DragPayload) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  const move = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < MOVE_THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      document.body.classList.add('rl-dragging');
      set({ payload, armed: false });
    }
    ev.preventDefault();
    set({ x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) });
  };
  const end = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!dragging) return; // fue un toque: lo maneja el clic
    document.body.classList.remove('rl-dragging');
    // El clic que sigue a soltar (si lo hay) llega en esta misma tarea; después ya no hay que ignorar nada.
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    });
    drop(ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null);
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** Clic en el asa: levanta el objeto (o lo suelta si ya estaba levantado). */
export function toggleArmed(payload: DragPayload) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (state.armed && state.payload?.item.id === payload.item.id) cancelDrag();
  else set({ payload, armed: true, over: null });
}

/** Registra un destino. Devuelve las props para el elemento y si hay algo que soltar en él. */
export function useDropTarget(key: string, onDrop: (p: DragPayload) => void) {
  useEffect(() => {
    targets.set(key, onDrop);
    return () => {
      targets.delete(key);
    };
  });
  const active = useDrag((s) => s.payload !== null);
  const armed = useDrag((s) => s.armed);
  const over = useDrag((s) => s.over === key);
  return {
    /** Hay un objeto en mano (arrastrado o levantado). */
    active,
    over,
    props: {
      'data-drop': key,
      className: `rl-drop${active ? ' rl-drop--active' : ''}${over ? ' rl-drop--over' : ''}`,
      onClickCapture: armed
        ? (e: { preventDefault: () => void; stopPropagation: () => void }) => {
            e.preventDefault();
            e.stopPropagation();
            drop(key);
          }
        : undefined,
    },
  };
}
