/* Capa medieval de Kovalt (kovalt-medieval-skill/references/themes.md): la geometría de las Esquinas y las texturas
 * procedurales. Lo que es solo color vive en styles/medieval.css; aquí va lo que se calcula. */

export type Shape = 'tallada' | 'muesca' | 'concava';
export type TextureKind = 'parchment' | 'wood' | 'stone' | 'moss' | 'grain' | 'none';

/** Un corte C por tamaño, igual en las cuatro esquinas (px al 100 %). */
export const CUTS = { xs: 3, s: 4, m: 5, l: 7, xl: 9 } as const;
export type CutSize = keyof typeof CUTS;

/** Puntos por arco de la Cóncava (N + 1 vértices por esquina). */
const ARC_STEPS = 6;

const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (n: number) => (r2(n) === 0 ? '0' : `${r2(n)}px`);
const far = (n: number) => (r2(n) === 0 ? '100%' : `calc(100% - ${r2(n)}px)`);

type Pt = [number, number];

/** La esquina superior izquierda como lista de puntos (dx, dy) desde sus dos bordes, del borde izquierdo al de
 *  arriba. Las otras tres esquinas se obtienen reflejándola. */
function corner(shape: Shape, c: number): Pt[] {
  if (shape === 'muesca') {
    const a = Math.max(3, c);
    return [
      [0, a],
      [a, a],
      [a, 0],
    ];
  }
  if (shape === 'concava') {
    const b = Math.max(4, c);
    return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
      const t = (i / ARC_STEPS) * (Math.PI / 2);
      return [b * Math.sin(t), b * Math.cos(t)] as Pt;
    });
  }
  return [
    [0, c],
    [c, 0],
  ];
}

/** La misma esquina desplazada 1px hacia dentro: el borde interior del ring. */
function innerCorner(shape: Shape, c: number): Pt[] {
  if (shape === 'muesca') {
    const a = Math.max(3, c) + 1;
    return [
      [1, a],
      [a, a],
      [a, 1],
    ];
  }
  if (shape === 'concava') {
    // Arco de radio b + 1 con el mismo centro, recortado por las rectas x = 1 e y = 1.
    const r = Math.max(4, c) + 1;
    const t0 = Math.asin(1 / r);
    return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
      const t = t0 + (i / ARC_STEPS) * (Math.PI / 2 - 2 * t0);
      return [r * Math.sin(t), r * Math.cos(t)] as Pt;
    });
  }
  // Desplazar 1px una recta a 45° mueve su vértice √2 − 1.
  return [
    [1, c + Math.SQRT2],
    [c + Math.SQRT2, 1],
  ];
}

type Corners = { tl: boolean; tr: boolean; br: boolean; bl: boolean };
const ALL: Corners = { tl: true, tr: true, br: true, bl: true };
const SQUARE: Pt[] = [[0, 0]];
const SQUARE_IN: Pt[] = [[1, 1]];

/** Los vértices de un lazo, en sentido horario desde la esquina superior izquierda. `open` deja el borde inferior
 *  fuera (el ring de una superficie que toca el borde de la pantalla). */
function loop(tl: Pt[], tr: Pt[], br: Pt[], bl: Pt[], open = false): string[] {
  const out: string[] = [];
  tl.forEach(([x, y]) => out.push(`${near(x)} ${near(y)}`));
  [...tr].reverse().forEach(([x, y]) => out.push(`${far(x)} ${near(y)}`));
  br.forEach(([x, y]) => out.push(`${far(x)} ${open ? '100%' : far(y)}`));
  [...bl].reverse().forEach(([x, y]) => out.push(`${near(x)} ${open ? '100%' : far(y)}`));
  return out;
}

/** `clip-path` de un elemento cortado. */
export function cut(shape: Shape, c: number, corners: Corners = ALL): string {
  const k = (on: boolean) => (on ? corner(shape, c) : SQUARE);
  return `polygon(${loop(k(corners.tl), k(corners.tr), k(corners.br), k(corners.bl)).join(', ')})`;
}

/** Ring: el borde de 1px que sigue el corte, como `polygon(evenodd, exterior…, interior…)`. Cada lazo repite su
 *  primer vértice para que el lado izquierdo no pierda el borde. */
export function ring(shape: Shape, c: number, corners: Corners = ALL, open = false): string {
  const k = (on: boolean) => (on ? corner(shape, c) : SQUARE);
  const ki = (on: boolean) => (on ? innerCorner(shape, c) : SQUARE_IN);
  const outer = loop(k(corners.tl), k(corners.tr), k(corners.br), k(corners.bl));
  const inner = loop(ki(corners.tl), ki(corners.tr), ki(corners.br), ki(corners.bl), open);
  return `polygon(evenodd, ${[...outer, outer[0], ...inner, inner[0]].join(', ')})`;
}

const TOP: Corners = { tl: true, tr: true, br: false, bl: false };

/** Todas las formas que usan las primitivas `kv-*` y la sala, para la Esquina elegida. Los tamaños de la base sin
 *  equivalente van al más cercano (`xsc` → xs, `thumb` → s). */
export function shapeTokens(shape: Shape): Record<string, string> {
  const t: Record<string, string> = {};
  for (const [size, c] of Object.entries(CUTS)) {
    t[`--m-cut-${size}`] = cut(shape, c);
    t[`--kv-cut-${size}`] = t[`--m-cut-${size}`]!;
  }
  t['--kv-cut-xsc'] = t['--m-cut-xs']!;
  t['--kv-cut-thumb'] = t['--m-cut-s']!;
  t['--kv-cut-xsc-top'] = cut(shape, CUTS.xs, TOP);
  t['--kv-cut-m-top'] = cut(shape, CUTS.m, TOP);
  t['--kv-cut-l-top'] = cut(shape, CUTS.l, TOP);
  t['--kv-cut-xl-top'] = cut(shape, CUTS.xl, TOP);
  t['--kv-cut-m-start'] = cut(shape, CUTS.m, { tl: true, tr: false, br: false, bl: true });
  t['--kv-cut-m-end'] = cut(shape, CUTS.m, { tl: false, tr: true, br: true, bl: false });
  for (const size of ['xs', 's', 'm', 'l'] as const) t[`--kv-ring-${size}`] = ring(shape, CUTS[size]);
  t['--kv-ring-xsc'] = t['--kv-ring-xs']!;
  t['--kv-ring-xsc-top'] = ring(shape, CUTS.xs, TOP, true);
  return t;
}

/* ---------- Textura ---------- */

type Rgb = [number, number, number];

function noise([r, g, b]: Rgb, freq: string, octaves: number, alpha: number, type: 'fractalNoise' | 'turbulence' = 'fractalNoise'): string {
  // Una frecuencia de dos valores ('0.004 0.16') lleva espacio: un id con espacio rompe url(#…) y el rect sale negro.
  const id = `f${freq.replace(/[^0-9]/g, '_')}`;
  const c = (v: number) => (v / 255).toFixed(3);
  return (
    `<filter id='${id}'><feTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${octaves}' seed='7' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${c(r)} 0 0 0 0 ${c(g)} 0 0 0 0 ${c(b)} 0 0 0 ${alpha} 0'/></filter>` +
    `<rect width='260' height='260' filter='url(#${id})'/>`
  );
}

export const TILE = 260;

/** El SVG (260 × 260, sin fondo) de una textura: la capa del material y el grano encima. */
export function textureSvg(kind: Exclude<TextureKind, 'none'>, dark: boolean): string {
  const black: Rgb = [0, 0, 0];
  const grain = noise(dark ? [255, 236, 205] : [70, 45, 20], '0.85', 2, dark ? 0.09 : 0.13);
  const layer = {
    grain: '',
    parchment: noise(dark ? black : [120, 80, 30], '0.011', 3, dark ? 0.35 : 0.22),
    wood: noise(dark ? black : [90, 55, 20], '0.004 0.16', 3, dark ? 0.45 : 0.24, 'turbulence'),
    stone: noise(dark ? black : [40, 45, 50], '0.035', 4, dark ? 0.4 : 0.2),
    moss: noise(dark ? black : [30, 60, 20], '0.05', 3, dark ? 0.42 : 0.2) + noise(dark ? [120, 170, 80] : [60, 90, 30], '0.012', 2, dark ? 0.12 : 0.1),
  }[kind];
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'>${layer}${grain}</svg>`;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** La textura como `url(data:image/png…)`. Se rasteriza una vez por tipo × modo: un `feTurbulence` vivo de fondo se
 *  recalcula en cada pintado. Sin canvas (o si falla), `none`. */
export function rasterTexture(kind: TextureKind, dark: boolean): Promise<string> {
  if (kind === 'none' || typeof document === 'undefined') return Promise.resolve('none');
  const key = `${kind}|${dark ? 'dark' : 'light'}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(key);
  if (running) return running;
  const job = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = TILE;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(`url(${canvas.toDataURL('image/png')})`);
      } catch {
        resolve('none');
      }
    };
    img.onerror = () => resolve('none');
    img.src = `data:image/svg+xml,${encodeURIComponent(textureSvg(kind, dark))}`;
  }).then((url) => {
    cache.set(key, url);
    pending.delete(key);
    return url;
  });
  pending.set(key, job);
  return job;
}
