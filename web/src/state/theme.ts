import { useSyncExternalStore } from 'react';
import { rasterTexture, shapeTokens, type Shape, type TextureKind } from './medieval';

/** Tema de Roller: la capa medieval de Kovalt (kovalt-medieval-skill). Un tema = paleta × material × textura ×
 *  valores por defecto de los ejes, y cada uno existe en oscuro y claro. Se guardan por separado, por persona y en
 *  este navegador: el **tema** (`rl-theme`, cuatro), el **modo** (`kv-mode`: `system` | `dark` | `light`) y los
 *  **ejes** que difieren del tema (`rl-axes`). Elegir un tema vuelve a sus ejes.
 *
 *  En <html>: `data-theme="<tema>-<modo>"` (color y material, styles/medieval.css), un `data-*` por eje de CSS y, en
 *  su `style`, las formas de la Esquina y la textura rasterizada. Dados y Resultado cambian el marcado: los lee la
 *  mesa con `useTheme()`. */

export const AXES = [
  { key: 'shape', label: 'Esquinas', options: [['tallada', 'Tallada'], ['muesca', 'Muesca'], ['concava', 'Cóncava']] },
  { key: 'texture', label: 'Textura', options: [['lisa', 'Lisa'], ['grano', 'Grano'], ['material', 'Material']] },
  { key: 'frame', label: 'Marco', options: [['filete', 'Filete'], ['doble', 'Doble']] },
  { key: 'divider', label: 'Divisores', options: [['filete', 'Filete'], ['doble', 'Doble'], ['rombos', 'Rombos']] },
  { key: 'icons', label: 'Iconos', options: [['tinta', 'Tinta'], ['grabado', 'Grabado'], ['medallon', 'Medallón']] },
  { key: 'dice', label: 'Dados', options: [['puntos', 'Puntos'], ['numeral', 'Numeral']] },
  { key: 'seal', label: 'Resultado', options: [['sello', 'Sello'], ['estandarte', 'Estandarte']] },
] as const;

type AxisDef = (typeof AXES)[number];
export type AxisKey = AxisDef['key'];
export type Axes = { [A in AxisDef as A['key']]: A['options'][number][0] };

export const THEMES = [
  {
    value: 'pergamino',
    label: 'Pergamino',
    description: 'Manual, tinta sepia, cera roja.',
    texture: 'parchment',
    preset: { shape: 'concava', texture: 'material', frame: 'doble', divider: 'rombos', icons: 'grabado', dice: 'numeral', seal: 'sello' },
  },
  {
    value: 'taberna',
    label: 'Taberna',
    description: 'Madera oscura, latón, velas.',
    texture: 'wood',
    preset: { shape: 'tallada', texture: 'material', frame: 'filete', divider: 'filete', icons: 'medallon', dice: 'puntos', seal: 'estandarte' },
  },
  {
    value: 'cripta',
    label: 'Cripta',
    description: 'Piedra, hierro, frío.',
    texture: 'stone',
    preset: { shape: 'muesca', texture: 'material', frame: 'doble', divider: 'doble', icons: 'grabado', dice: 'puntos', seal: 'sello' },
  },
  {
    value: 'bosque',
    label: 'Bosque',
    description: 'Musgo, cuero, claros de luz.',
    texture: 'moss',
    preset: { shape: 'concava', texture: 'material', frame: 'filete', divider: 'rombos', icons: 'medallon', dice: 'numeral', seal: 'estandarte' },
  },
] as const satisfies readonly { value: string; label: string; description: string; texture: TextureKind; preset: Axes }[];

export type Theme = (typeof THEMES)[number]['value'];
export const MODES = [
  { value: 'system', label: 'Sistema', icon: 'monitor' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'light', label: 'Claro', icon: 'sun' },
] as const;
export type Mode = (typeof MODES)[number]['value'];
export type ResolvedMode = 'dark' | 'light';
export type ThemeName = `${Theme}-${ResolvedMode}`;

const DEFAULT_THEME: Theme = 'pergamino';
const THEME_KEY = 'rl-theme';
const MODE_KEY = 'kv-mode';
const AXES_KEY = 'rl-axes';
/** Claves de los temas de la suite (seis paletas), que Roller ya no usa. */
const LEGACY_KEYS = ['kv-palette', 'kv-theme'];

/** `bg` de cada tema, para `meta theme-color` (misma tabla en el script anti-destello de index.html). */
export const THEME_COLOR: Record<ThemeName, string> = {
  'pergamino-dark': '#1e1711',
  'pergamino-light': '#ede0c3',
  'taberna-dark': '#170f0a',
  'taberna-light': '#e7d8bc',
  'cripta-dark': '#111315',
  'cripta-light': '#dadad3',
  'bosque-dark': '#101610',
  'bosque-light': '#dfe4cf',
};

const listeners = new Set<() => void>();
const darkQuery = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const isTheme = (v: string | null): v is Theme => THEMES.some((t) => t.value === v);
const isMode = (v: string | null): v is Mode => MODES.some((m) => m.value === v);
export const themeOf = (theme: Theme) => THEMES.find((t) => t.value === theme)!;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin localStorage: solo esta sesión */
  }
}

export function getTheme(): Theme {
  const v = read(THEME_KEY);
  return isTheme(v) ? v : DEFAULT_THEME;
}

export function getMode(): Mode {
  const v = read(MODE_KEY);
  return isMode(v) ? v : 'system';
}

/** Modo en vigor: el elegido o, con `system`, el del dispositivo. */
export function resolveMode(mode: Mode = getMode()): ResolvedMode {
  if (mode !== 'system') return mode;
  return darkQuery ? (darkQuery.matches ? 'dark' : 'light') : 'dark';
}

/** Los ejes cambiados a mano, validados contra las opciones (un valor viejo o ajeno se ignora). */
function overrides(): Partial<Axes> {
  const raw = read(AXES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const axis of AXES) {
      const v = parsed[axis.key];
      if (typeof v === 'string' && axis.options.some(([o]) => o === v)) out[axis.key] = v;
    }
    return out as Partial<Axes>;
  } catch {
    return {};
  }
}

let axesCache: { raw: string | null; theme: Theme; value: Axes } | null = null;

/** Los ejes en vigor: los del tema con lo cambiado a mano encima. Referencia estable mientras no cambien. */
export function getAxes(): Axes {
  const raw = read(AXES_KEY);
  const theme = getTheme();
  if (axesCache && axesCache.raw === raw && axesCache.theme === theme) return axesCache.value;
  const value = { ...themeOf(theme).preset, ...overrides() } as Axes;
  axesCache = { raw, theme, value };
  return value;
}

/** Sin ninguna clave propia de la capa: se limpian las de las paletas de la suite. */
function dropLegacy(): void {
  for (const key of LEGACY_KEYS) if (read(key) !== null) write(key, null);
}

/** Lo último aplicado en `style`, para no recalcular formas ni rasterizar de más. */
const applied = { shape: '', texture: '' };

export function applyTheme(): void {
  dropLegacy();
  const theme = getTheme();
  const mode = resolveMode();
  const axes = getAxes();
  const root = document.documentElement;
  root.dataset.theme = `${theme}-${mode}`;
  root.dataset.shape = axes.shape;
  root.dataset.texture = axes.texture;
  root.dataset.frame = axes.frame;
  root.dataset.divider = axes.divider;
  root.dataset.icons = axes.icons;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[`${theme}-${mode}`]);

  if (applied.shape !== axes.shape) {
    applied.shape = axes.shape;
    for (const [k, v] of Object.entries(shapeTokens(axes.shape as Shape))) root.style.setProperty(k, v);
  }
  const kind: TextureKind = axes.texture === 'lisa' ? 'none' : axes.texture === 'grano' ? 'grain' : themeOf(theme).texture;
  const texKey = `${kind}|${mode}`;
  if (applied.texture !== texKey) {
    applied.texture = texKey;
    void rasterTexture(kind, mode === 'dark').then((url) => {
      if (applied.texture === texKey) root.style.setProperty('--m-tex', url);
    });
  }
}

/** Elegir un tema aplica sus ejes por defecto. */
export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme === DEFAULT_THEME ? null : theme);
  write(AXES_KEY, null);
  notify();
}

export function setMode(mode: Mode): void {
  write(MODE_KEY, mode === 'system' ? null : mode);
  notify();
}

export function setAxis<K extends AxisKey>(key: K, value: Axes[K]): void {
  const preset = themeOf(getTheme()).preset as Axes;
  const next: Record<string, string> = { ...overrides() };
  if (preset[key] === value) delete next[key];
  else next[key] = value;
  write(AXES_KEY, Object.keys(next).length ? JSON.stringify(next) : null);
  notify();
}

/** «Restablecer tema»: vuelve a los ejes del tema. */
export function resetAxes(): void {
  write(AXES_KEY, null);
  notify();
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

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
  const mode = useSyncExternalStore(subscribe, getMode, () => 'system' as Mode);
  const resolvedMode = useSyncExternalStore(subscribe, () => resolveMode(), () => 'dark' as ResolvedMode);
  const axes = useSyncExternalStore(subscribe, getAxes, () => themeOf(DEFAULT_THEME).preset as Axes);
  const preset = themeOf(theme).preset as Axes;
  const dirty = AXES.some((a) => axes[a.key] !== preset[a.key]);
  return { theme, mode, resolvedMode, axes, dirty, setTheme, setMode, setAxis, resetAxes };
}

/** Solo los ejes (la mesa: dados y resultado). */
export function useAxes(): Axes {
  return useSyncExternalStore(subscribe, getAxes, () => themeOf(DEFAULT_THEME).preset as Axes);
}
