import type { DiceRoll } from './dice';
import type { TieWinner } from './types';

export type Outcome = 'success' | 'failure';

export interface RollOutcome {
  outcome: Outcome;
  playerTotal: number;
  oppositionTotal: number;
  tieWinner: TieWinner;
  /** 1 si la tirada falla, 0 si tiene éxito. */
  xpGained: number;
}

/** Compara la tirada del jugador con la oposición del DM. */
export function resolve(player: DiceRoll, opposition: DiceRoll, tieWinner: TieWinner): RollOutcome {
  const playerTotal = player.total();
  const oppositionTotal = opposition.total();
  const success = playerTotal > oppositionTotal || (playerTotal === oppositionTotal && tieWinner === 'player');
  const outcome: Outcome = success ? 'success' : 'failure';
  return { outcome, playerTotal, oppositionTotal, tieWinner, xpGained: outcome === 'failure' ? 1 : 0 };
}
