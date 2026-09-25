import { useCallback, useState } from 'react';
import { toastError } from '../state/toast';

/** Ejecuta una acción asíncrona marcando `busy` y mostrando el error en un aviso. Devuelve `true` si salió bien. */
export function useBusy(): [boolean, (action: () => Promise<unknown>) => Promise<boolean>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
