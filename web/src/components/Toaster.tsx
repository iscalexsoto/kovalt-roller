import { useCallback, useEffect, useState } from 'react';
import { GameIcon } from '../icons/GameIcon';
import { subscribeToasts, type ToastItem } from '../state/toast';

/** Host de snackbars (nivel 3), abajo; los errores duran más y llevan `circle-alert`. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  useEffect(
    () =>
      subscribeToasts((t) => {
        setItems((list) => [...list.slice(-2), t]);
        window.setTimeout(() => remove(t.id), t.error ? 6000 : 3500);
      }),
    [remove],
  );
  if (items.length === 0) return null;
  return (
    <div className="kv-snackbar-host kv-snackbar-host--bare rl-snackbars" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`kv-snackbar${t.error ? ' rl-snackbar--error' : ''}`} role={t.error ? 'alert' : 'status'}>
          <GameIcon name={t.error ? 'circle-alert' : 'check'} strokeWidth={2.5} />
          <span className="kv-snackbar__text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
