import type { DiceRoll } from './dice';
import type { TieWinner } from './types';

/** `tie`: empate parcial (ajuste `partial`): se consigue a medias, sin XP. */
export type Outcome = 'success' | 'failure' | 'tie';

export interface RollOutcome {
  outcome: Outcome;
  playerTotal: number;
  oppositionTotal: number;
  tieWinner: TieWinner;
  /** 1 si la tirada falla, 0 si tiene éxito o empata a medias. */
  xpGained: number;
}

/** Compara la tirada del jugador (más el modificador de sus estados) con la oposición del DM: sus dados o un
 *  objetivo fijo (ya como total). `playerTotal` es el total efectivo; el avance mira los dados, no este número. */
export function resolve(player: DiceRoll, opposition: DiceRoll | number, tieWinner: TieWinner, modifier = 0): RollOutcome {
  const playerTotal = player.total() + modifier;
  const oppositionTotal = typeof opposition === 'number' ? opposition : opposition.total();
  const tied = playerTotal === oppositionTotal;
  const outcome: Outcome = playerTotal > oppositionTotal || (tied && tieWinner === 'player') ? 'success' : tied && tieWinner === 'partial' ? 'tie' : 'failure';
  return { outcome, playerTotal, oppositionTotal, tieWinner, xpGained: outcome === 'failure' ? 1 : 0 };
}
