import { errorMessage } from '../data/errors';

export interface ToastItem {
  id: number;
  text: string;
  error: boolean;
}

let nextId = 1;
const listeners = new Set<(t: ToastItem) => void>();

/** Aviso breve abajo. `toast('texto')` desde cualquier sitio; `<Toaster />` en la app. */
export function toast(text: string, error = false): void {
  const item: ToastItem = { id: nextId++, text, error };
  for (const l of listeners) l(item);
}

export function toastError(e: unknown): void {
  toast(errorMessage(e), true);
}

export function subscribeToasts(listener: (t: ToastItem) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
