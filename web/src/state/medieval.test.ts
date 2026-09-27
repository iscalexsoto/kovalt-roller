import { describe, expect, it } from 'vitest';
import { CUTS, cut, ring, shapeTokens, textureSvg } from './medieval';

const points = (poly: string) => poly.replace(/^polygon\((evenodd, )?/, '').replace(/\)$/, '').split(/, (?![^(]*\))/);

describe('Esquinas', () => {
  it('Tallada es el Corte simétrico: ocho vértices, C en las cuatro esquinas', () => {
    expect(cut('tallada', 5)).toBe('polygon(0 5px, 5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px))');
  });

  it('Muesca muerde un escalón cuadrado de al menos 3px en cada esquina', () => {
    const p = points(cut('muesca', 2));
    expect(p).toHaveLength(12);
    expect(p.slice(0, 3)).toEqual(['0 3px', '3px 3px', '3px 0']);
  });

  it('Cóncava aproxima un cuarto de círculo (radio ≥ 4) con 7 puntos por esquina', () => {
    const p = points(cut('concava', 3));
    expect(p).toHaveLength(28);
    expect(p[0]).toBe('0 4px');
    expect(p[6]).toBe('4px 0');
  });

  it('el ring cierra sus dos lazos repitiendo el primer vértice', () => {
    for (const shape of ['tallada', 'muesca', 'concava'] as const) {
      const p = points(ring(shape, CUTS.m));
      const half = p.length / 2;
      expect(p[0]).toBe(p[half - 1]);
      expect(p[half]).toBe(p[p.length - 1]);
    }
  });

  it('el ring de Tallada desplaza el chaflán √2 − 1 hacia dentro', () => {
    expect(ring('tallada', 5)).toContain('1px 6.41px');
  });

  it('da una forma para cada token que usan las primitivas', () => {
    const t = shapeTokens('muesca');
    for (const k of ['--kv-cut-xsc', '--kv-cut-xs', '--kv-cut-s', '--kv-cut-m', '--kv-cut-l', '--kv-cut-xl', '--kv-cut-xsc-top', '--kv-cut-m-start', '--kv-ring-m', '--kv-ring-xsc-top', '--m-cut-l']) {
      expect(t[k]).toMatch(/^polygon\(/);
    }
    expect(t['--kv-ring-xsc-top']).toContain('calc(100% - 1px) 100%');
  });
});

describe('Textura', () => {
  it('los ids de filtro no llevan espacios (una frecuencia doble rompería url(#…))', () => {
    const svg = textureSvg('wood', true);
    expect(svg).toContain("baseFrequency='0.004 0.16'");
    expect(svg).not.toMatch(/id='[^']* /);
  });

  it('el grano va siempre encima, también en Grano solo', () => {
    expect(textureSvg('grain', false).match(/<filter/g)).toHaveLength(1);
    expect(textureSvg('moss', false).match(/<filter/g)).toHaveLength(3);
  });
});
