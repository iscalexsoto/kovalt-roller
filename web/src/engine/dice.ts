import { EngineError } from './errors';
import { MAX_DICE_LIMIT } from './types';

/** Fuente de d6. Se inyecta para poder tener tiradas deterministas en tests. */
export interface DiceSource {
  /** Devuelve un valor entre 1 y 6. */
  d6(): number;
}

const U64 = (1n << 64n) - 1n;
/** Zona sin sesgo de módulo para 64 bits. */
const ZONE64 = U64 - (U64 % 6n);

/** Generador SplitMix64: rápido, sin dependencias y reproducible con semilla (el mismo que el motor en Rust). */
export class SeededDice implements DiceSource {
  private state: bigint;

  constructor(seed: bigint | number) {
    this.state = BigInt(seed) & U64;
  }

  private nextU64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & U64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
    return z ^ (z >> 31n);
  }

  d6(): number {
    // Muestreo por rechazo para evitar sesgo de módulo.
    for (;;) {
      const v = this.nextU64();
      if (v < ZONE64) return Number(v % 6n) + 1;
    }
  }
}

/** Zona sin sesgo para 32 bits: 2^32 - (2^32 mod 6). */
const ZONE32 = 0x1_0000_0000 - (0x1_0000_0000 % 6);

/** Dados de verdad: `crypto.getRandomValues` con muestreo por rechazo (sin sesgo de módulo). */
export class CryptoDice implements DiceSource {
  private readonly buf = new Uint32Array(1);

  d6(): number {
    for (;;) {
      crypto.getRandomValues(this.buf);
      const v = this.buf[0]!;
      if (v < ZONE32) return (v % 6) + 1;
    }
  }
}

/** Dados guionizados para tests. Lanza si se agotan. */
export class FixedDice implements DiceSource {
  private readonly values: number[];

  constructor(values: Iterable<number>) {
    this.values = [...values];
  }

  d6(): number {
    const v = this.values.shift();
    if (v === undefined) throw new Error('FixedDice sin valores');
    return v;
  }
}

/** Tirada validada: entre 1 y `maxDice` dados, cada uno entre 1 y 6. Inmutable. */
export class DiceRoll {
  readonly dice: readonly number[];

  private constructor(dice: number[]) {
    this.dice = Object.freeze(dice);
  }

  /** Construye una tirada a partir de valores ya conocidos (p. ej. leídos de Firestore). */
  static fromValues(dice: readonly number[], maxDice: number): DiceRoll {
    if (dice.length === 0 || dice.length > Math.min(maxDice, MAX_DICE_LIMIT)) {
      throw new EngineError({ kind: 'DiceCountOutOfRange', got: dice.length, max: maxDice });
    }
    const bad = dice.find((d) => !Number.isInteger(d) || d < 1 || d > 6);
    if (bad !== undefined) throw new EngineError({ kind: 'InvalidDieValue', value: bad });
    return new DiceRoll([...dice]);
  }

  get length(): number {
    return this.dice.length;
  }

  total(): number {
    return this.dice.reduce((a, d) => a + d, 0);
  }

  allSixes(): boolean {
    return this.dice.every((d) => d === 6);
  }

  nonSixes(): number {
    return this.dice.filter((d) => d !== 6).length;
  }
}

/** Tira `count` d6. */
export function roll(count: number, maxDice: number, source: DiceSource): DiceRoll {
  const values = Array.from({ length: Math.max(0, count) }, () => source.d6());
  return DiceRoll.fromValues(values, maxDice);
}
