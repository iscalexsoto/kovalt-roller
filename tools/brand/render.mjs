// Rasteriza La Piedra de Roller (kovalt-skill/assets/brand/roller.svg y roller-mono.svg) a todos los
// entregables de `Kovalt Design/brand/*/roller` (brand-and-iconography.md § App icons) y, con
// `--install`, copia los de web a web/public de este repo (Roller no tiene app nativa).
//
//   node render.mjs            → escribe en D:\Proyectos\Kovalt Design\brand
//   node render.mjs --install  → además copia a los clientes
//
// Texto (lockups y banners) con Amaranth y Nunito Sans desde Kovalt Design/fonts (resvg no ve las
// fuentes del sistema en Windows si no están instaladas).
import { Resvg } from '@resvg/resvg-js';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'roller';
const NAME = 'Roller';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const design = resolve(repo, '..', 'Kovalt Design');
const skill = join(design, 'kovalt-skill', 'assets', 'brand');
const out = join(design, 'brand');
const install = process.argv.includes('--install');

const SURFACE = '#0C1628';
const BG = '#050D1E';
const VETA = '#0D327A';
const ON_SURFACE = '#EEF2F9';
const ON_SURFACE_VARIANT = '#A7B2C5';
const INK = '#0C0D12';

const nunitoDir = join(design, 'fonts', 'Nunito_Sans');
const nunito = readdirSync(nunitoDir).find((f) => f.toLowerCase().endsWith('.ttf') && !f.includes('Italic'));
const fonts = {
  fontFiles: [
    join(design, 'fonts', 'Amaranth', 'Amaranth-Bold.ttf'),
    join(design, 'fonts', 'Amaranth', 'Amaranth-Regular.ttf'),
    join(nunitoDir, nunito),
  ],
  loadSystemFonts: false,
  defaultFontFamily: 'Amaranth',
};

const stripMeta = (svg) => svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, '').replace(/\s+xmlns:c2pa="[^"]*"/g, '');
const stone = stripMeta(readFileSync(join(skill, `${APP}.svg`), 'utf8'));
const mono = stripMeta(readFileSync(join(skill, `${APP}-mono.svg`), 'utf8'));
/** Cuerpo del SVG (sin la etiqueta raíz) para anidarlo. */
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const monoWith = (color) => mono.replace(/currentColor/g, color);

/** Piedra anidada: `size` = lado del viewBox 204 en px de destino; `x`, `y` = esquina. */
const nested = (svg, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 204 204">${inner(svg)}</svg>`;

function png(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: fonts });
  return r.render().asPng();
}

function write(rel, buf) {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
  console.log('  ', rel);
}

/** Piedra sola, transparente, a `size` px (viewBox completo, margen de 10/204). */
const stoneAt = (size) => png(stone.replace('viewBox="0 0 204 204"', `viewBox="0 0 204 204" width="${size}" height="${size}"`), size);
const monoAt = (size, color) => png(monoWith(color).replace('viewBox="0 0 204 204"', `viewBox="0 0 204 204" width="${size}" height="${size}"`), size);

/** Piedra centrada sobre un cuadrado plano `fill` (o transparente), ocupando `ratio` del lado. */
function tile(size, ratio, fill, which = stone) {
  const s = Math.round(size * ratio);
  const o = Math.round((size - s) / 2);
  const bg = fill ? `<rect width="${size}" height="${size}" fill="${fill}"/>` : '';
  const body = s > 0 ? nested(which, o, o, s) : '';
  return png(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${body}</svg>`, size);
}

/** ICO con entradas PNG (Windows y favicon). */
function ico(sizes) {
  const entries = sizes.map((s) => ({ s, data: stoneAt(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.s >= 256 ? 0 : e.s, 0);
    d.writeUInt8(e.s >= 256 ? 0 : e.s, 1);
    d.writeUInt8(0, 2);
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.data.length;
    dir.push(d);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]);
}

const wordmark = (x, y, size, color, dot, appColor) =>
  `<text x="${x}" y="${y}" font-family="Amaranth" font-size="${size}" fill="${color}" letter-spacing="0.5"><tspan font-weight="700">Kovalt</tspan><tspan fill="${dot}" font-weight="400"> · </tspan><tspan fill="${appColor}" font-weight="400">${NAME}</tspan></text>`;

function lockupHorizontal(color, dot) {
  const W = 840;
  const H = 128;
  // Piedra de 102 de alto (viewBox 10..194 → 184 unidades) a la izquierda, texto a 64.
  const s = Math.round((102 / 184) * 204);
  const y = Math.round((H - s) / 2);
  return png(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${nested(stone, 14, y, s)}${wordmark(150, 88, 64, color, dot, color)}</svg>`, W);
}

function lockupVertical() {
  const W = 480;
  const H = 400;
  const s = Math.round((220 / 184) * 204);
  return png(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${nested(stone, (W - s) / 2, 6, s)}<text x="${W / 2}" y="318" text-anchor="middle" font-family="Amaranth" font-weight="700" font-size="52" fill="${ON_SURFACE}" letter-spacing="0.5">Kovalt</text><text x="${W / 2}" y="368" text-anchor="middle" font-family="Amaranth" font-weight="400" font-size="22" fill="${ON_SURFACE_VARIANT}" letter-spacing="6">${NAME.toUpperCase()}</text></svg>`, W);
}

function banner(W, H, subtitle) {
  const s = Math.round(((H * 0.5) / 184) * 204);
  const cx = Math.round(W * 0.21);
  const cy = Math.round(H / 2);
  const glow = `<defs><radialGradient id="g" cx="0.2" cy="0.15" r="0.75"><stop offset="0" stop-color="${VETA}" stop-opacity="0.9"/><stop offset="0.55" stop-color="${VETA}" stop-opacity="0.25"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient></defs>`;
  const tx = Math.round(W * 0.44);
  const size = Math.round(H * 0.15);
  const ty = subtitle ? cy + Math.round(size * 0.15) : cy + Math.round(size * 0.35);
  const sub = subtitle
    ? `<text x="${tx}" y="${ty + Math.round(size * 0.85)}" font-family="Nunito Sans" font-weight="600" font-size="${Math.round(size * 0.3)}" fill="${ON_SURFACE_VARIANT}">${subtitle}</text>`
    : '';
  return png(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${glow}<rect width="${W}" height="${H}" fill="${BG}"/><rect width="${W}" height="${H}" fill="url(#g)"/>${nested(stone, cx - s / 2, cy - s / 2, s)}${wordmark(tx, ty, size, ON_SURFACE, ON_SURFACE_VARIANT, ON_SURFACE)}${sub}</svg>`, W);
}

console.log(`Renderizando ${APP} en ${out}`);

// png/<app>/<app>-N.png y mono
for (const n of [16, 24, 32, 48, 64, 96, 128, 192, 256, 512, 1024]) write(`png/${APP}/${APP}-${n}.png`, stoneAt(n));
for (const n of [16, 24, 32, 48, 256]) {
  write(`png/${APP}-mono-dark/${APP}-mono-dark-${n}.png`, monoAt(n, INK));
  write(`png/${APP}-mono-white/${APP}-mono-white-${n}.png`, monoAt(n, '#FFFFFF'));
}
// svg masters sin metadatos
write(`svg/${APP}.svg`, Buffer.from(stone));
write(`svg/${APP}-mono.svg`, Buffer.from(mono));
// web / PWA
for (const n of [16, 32, 48]) write(`web/${APP}/favicon-${n}.png`, stoneAt(n));
write(`web/${APP}/favicon.ico`, ico([16, 32, 48]));
write(`web/${APP}/apple-touch-icon.png`, tile(180, 0.78, SURFACE));
write(`web/${APP}/icon-192.png`, tile(192, 0.78, SURFACE));
write(`web/${APP}/icon-512.png`, tile(512, 0.78, SURFACE));
write(`web/${APP}/icon-512-maskable.png`, tile(512, 0.62, SURFACE));
// Lockups y banners
write(`lockups/${APP}/lockup-horizontal-dark.png`, lockupHorizontal(ON_SURFACE, ON_SURFACE_VARIANT));
write(`lockups/${APP}/lockup-horizontal-light.png`, lockupHorizontal(INK, '#5B6B85'));
write(`lockups/${APP}/lockup-vertical-dark.png`, lockupVertical());
write(`banners/${APP}/og-1200x630.png`, banner(1200, 630, null));

if (install) {
  console.log('Copiando a los clientes');
  const webPublic = join(repo, 'web', 'public');
  for (const f of ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
    copyFileSync(join(out, 'web', APP, f), join(webPublic, f));
    console.log('  ', join('web/public', f));
  }
  // Vista previa de los enlaces de invitación (WhatsApp, Discord…).
  copyFileSync(join(out, 'banners', APP, 'og-1200x630.png'), join(webPublic, 'og.png'));
  console.log('  ', 'web/public/og.png');
}
console.log('Listo.');
