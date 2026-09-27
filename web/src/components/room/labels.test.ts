import { describe, expect, it } from 'vitest';
import { modifierSteps } from './labels';

describe('modifierSteps', () => {
  it('sin modificador no hay estados', () => {
    expect(modifierSteps(0, null)).toEqual([]);
  });
  it('lee un chip por estado de la nota', () => {
    expect(modifierSteps(0 - 1 + 2, '−1 Herido, +2 Sigiloso')).toEqual([
      { label: '−1 Herido', delta: -1 },
      { label: '+2 Sigiloso', delta: 2 },
    ]);
  });
  it('si la nota no cuadra, un solo chip con el total', () => {
    expect(modifierSteps(-3, '−1 Herido, cansado')).toEqual([{ label: '−3 · −1 Herido, cansado', delta: -3 }]);
    expect(modifierSteps(2, null)).toEqual([{ label: '+2', delta: 2 }]);
  });
});
