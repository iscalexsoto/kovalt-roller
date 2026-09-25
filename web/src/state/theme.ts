import { useSyncExternalStore } from 'react';

/** Tema Kovalt (theming.md; el mismo módulo de Kovalt Notes): dos ejes guardados por separado — la **paleta** (`kv-palette`, seis) y el
 *  **modo** (`kv-mode`: `system` | `dark` | `light`). El tema aplicado es `<paleta>-<modo resuelto>` en
 *  `data-theme` de <html>; con `system` se sigue `prefers-color-scheme` en vivo. Cambiar la paleta nunca
 *  toca el modo, ni al revés. */
export const PALETTES = [
  { value: 'cobalto', label: 'Cobalto', description: 'Roca azul-gris con la veta de cobalto; de día crema y lavanda.' },
  { value: 'grafito', label: 'Grafito', description: 'Roca neutra sin pulir; el cobalto solo en las acciones.' },
  { value: 'fosforo', label: 'Fósforo', description: 'Monocromo verde fósforo en todas las tintas.' },
  { value: 'brasa', label: 'Brasa', description: 'Rojo tomate, plano: sin metal ni filo.' },
  { value: 'azafran', label: 'Azafrán', description: 'Azafrán, plano: café tostado de noche, arena de día.' },
  { value: 'pizarra', label: 'Pizarra', description: 'Neutros con un petróleo sobrio; el par formal.' },
] as const;
export type Palette = (typeof PALETTES)[number]['value'];
export const MODES = [
  { value: 'system', label: 'Sistema', icon: 'monitor' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'light', label: 'Claro', icon: 'sun' },
] as const;
export type Mode = (typeof MODES)[number]['value'];
export type ResolvedMode = 'dark' | 'light';
export type ThemeName = `${Palette}-${ResolvedMode}`;

const PALETTE_KEY = 'kv-palette';
const MODE_KEY = 'kv-mode';
/** Clave anterior (un solo valor); se migra una vez a los dos ejes. */
const LEGACY_KEY = 'kv-theme';
const LEGACY: Record<string, [Palette, Mode]> = {
  cobalto: ['cobalto', 'dark'],
  grafito: ['grafito', 'dark'],
  claro: ['cobalto', 'light'],
  fosforo: ['fosforo', 'dark'],
  brasa: ['brasa', 'light'],
  azafran: ['azafran', 'dark'],
  pizarra: ['pizarra', 'light'],
};

/** `bg` de cada tema, para `meta theme-color` (misma tabla en el script anti-destello de index.html). */
export const THEME_COLOR: Record<ThemeName, string> = {
  'cobalto-dark': '#050D1E',
  'cobalto-light': '#F9EFDF',
  'grafito-dark': '#0C0D10',
  'grafito-light': '#EDEFF3',
  'fosforo-dark': '#020C04',
  'fosforo-light': '#DFF6E4',
  'brasa-dark': '#180806',
  'brasa-light': '#FDEBDA',
  'azafran-dark': '#160D07',
  'azafran-light': '#F9EED5',
  'pizarra-dark': '#0B1014',
  'pizarra-light': '#E9F0F7',
};

const listeners = new Set<() => void>();
const darkQuery = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const isPalette = (v: string | null): v is Palette => PALETTES.some((p) => p.value === v);
const isMode = (v: string | null): v is Mode => MODES.some((m) => m.value === v);

function migrateLegacy(): void {
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old === null) return;
    const pair = LEGACY[old];
    if (pair && !localStorage.getItem(PALETTE_KEY) && !localStorage.getItem(MODE_KEY)) {
      localStorage.setItem(PALETTE_KEY, pair[0]);
      localStorage.setItem(MODE_KEY, pair[1]);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* sin localStorage */
  }
}

export function getPalette(): Palette {
  try {
    migrateLegacy();
    const v = localStorage.getItem(PALETTE_KEY);
    return isPalette(v) ? v : 'cobalto';
  } catch {
    return 'cobalto';
  }
}

export function getMode(): Mode {
  try {
    migrateLegacy();
    const v = localStorage.getItem(MODE_KEY);
    return isMode(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Modo en vigor: el elegido o, con `system`, el del dispositivo. */
export function resolveMode(mode: Mode = getMode()): ResolvedMode {
  if (mode !== 'system') return mode;
  return darkQuery ? (darkQuery.matches ? 'dark' : 'light') : 'dark';
}

export function resolveTheme(palette: Palette = getPalette(), mode: Mode = getMode()): ThemeName {
  return `${palette}-${resolveMode(mode)}`;
}

export function applyTheme(): void {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

function persist(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin localStorage: solo esta sesión */
  }
  notify();
}

export function setPalette(palette: Palette): void {
  persist(PALETTE_KEY, palette === 'cobalto' ? null : palette);
}

export function setMode(mode: Mode): void {
  persist(MODE_KEY, mode === 'system' ? null : mode);
}

function notify() {
  applyTheme();
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    darkQuery?.addEventListener('change', notify);
    window.addEventListener('storage', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      darkQuery?.removeEventListener('change', notify);
      window.removeEventListener('storage', notify);
    }
  };
}

export function useTheme(): {
  palette: Palette;
  mode: Mode;
  resolvedMode: ResolvedMode;
  theme: ThemeName;
  setPalette: (p: Palette) => void;
  setMode: (m: Mode) => void;
} {
  const palette = useSyncExternalStore(subscribe, getPalette, () => 'cobalto' as Palette);
  const mode = useSyncExternalStore(subscribe, getMode, () => 'system' as Mode);
  const resolvedMode = useSyncExternalStore(subscribe, () => resolveMode(), () => 'dark' as ResolvedMode);
  return { palette, mode, resolvedMode, theme: `${palette}-${resolvedMode}`, setPalette, setMode };
}
