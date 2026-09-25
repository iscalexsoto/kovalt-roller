// Genera el set de íconos compartido a partir de lucide-static (licencia ISC).
// Entrada: keys.json (clave → nombre de ícono lucide). Salida: web/src/icons/paths.ts.
// Los íconos de app (favicon, PWA, launcher) NO salen de aquí: son los entregables de marca de
// `Kovalt Design/brand/` (tools/brand/render.mjs).
// Uso: cd tools/icons && pnpm install && node build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const keys = JSON.parse(readFileSync(resolve(here, 'keys.json'), 'utf8'));
const iconsDir = resolve(here, 'node_modules', 'lucide-static', 'icons');

/** Extrae los elementos de dibujo de un SVG de lucide como comandos de path.
 *  Lucide usa path, circle, rect, line, polyline y polygon; todo se convierte a
 *  path data para que el cliente solo tenga que parsear "d". */
function svgToPaths(svg) {
  const paths = [];
  const num = (s) => Number.parseFloat(s);
  const attrs = (tag) => {
    const out = {};
    for (const m of tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) out[m[1]] = m[2];
    return out;
  };
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon)\b([^>]*)\/?>/g)) {
    const kind = m[1];
    const a = attrs(m[2]);
    switch (kind) {
      case 'path':
        paths.push(a.d);
        break;
      case 'circle': {
        const cx = num(a.cx), cy = num(a.cy), r = num(a.r);
        paths.push(
          `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
        );
        break;
      }
      case 'rect': {
        const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
        const rx = a.rx ? num(a.rx) : 0;
        if (rx === 0) {
          paths.push(`M${x} ${y}h${w}v${h}h${-w}z`);
        } else {
          paths.push(
            `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${h - 2 * rx}` +
              `a${rx} ${rx} 0 0 1 ${-rx} ${rx}h${-(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}` +
              `v${-(h - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${-rx}z`,
          );
        }
        break;
      }
      case 'line':
        paths.push(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`);
        break;
      case 'polyline':
      case 'polygon': {
        const pts = a.points.trim().split(/[\s,]+/).map(Number);
        let d = `M${pts[0]} ${pts[1]}`;
        for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
        if (kind === 'polygon') d += 'z';
        paths.push(d);
        break;
      }
    }
  }
  return paths;
}

const all = keys;
const out = {};
const missing = [];
for (const [key, lucide] of Object.entries(all)) {
  const file = resolve(iconsDir, `${lucide}.svg`);
  if (!existsSync(file)) {
    missing.push(`${key} → ${lucide}`);
    continue;
  }
  out[key] = svgToPaths(readFileSync(file, 'utf8'));
}
if (missing.length) {
  console.error('Íconos de lucide no encontrados:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const header = 'Generado por tools/icons/build.mjs a partir de lucide-static (ISC). No editar a mano.';

const tsLines = [
  `// ${header}`,
  'export const ICON_PATHS: Record<string, readonly string[]> = {',
  ...Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
  '};',
  '',
];
const tsOut = resolve(root, 'web', 'src', 'icons', 'paths.ts');
mkdirSync(dirname(tsOut), { recursive: true });
writeFileSync(tsOut, tsLines.join('\n'));
console.log(`${Object.keys(out).length} íconos → web/src/icons/paths.ts`);
