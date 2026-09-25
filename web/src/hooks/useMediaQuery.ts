import { useSyncExternalStore } from 'react';

/** Clases de tamaño de ventana (layout-and-responsive.md): compacto < 600, medio ≥ 600, expandido ≥ 840. */
export const MEDIUM = '(min-width: 600px)';
export const EXPANDED = '(min-width: 840px)';
/** Grande >= 1400: el editor muestra el panel de propiedades al lado (laptops de 1280-1366 van sin panel). */
export const LARGE = '(min-width: 1400px)';

const cache = new Map<string, MediaQueryList>();
function query(q: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return null;
  let m = cache.get(q);
  if (!m) {
    m = window.matchMedia(q);
    cache.set(q, m);
  }
  return m;
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = query(q);
      m?.addEventListener('change', onChange);
      return () => m?.removeEventListener('change', onChange);
    },
    () => query(q)?.matches ?? false,
    () => false,
  );
}
