import { isTerminal } from '../../engine';
import type { RollDoc } from '../../data/models';

/** Qué tiradas van completas en la mesa: las vivas (o con avance pendiente). Si no hay ninguna, la tirada más
 *  reciente se queda como escena mientras esté resuelta y nadie la haya quitado; una rechazada o retirada posterior
 *  ya no la trae de vuelta. `scene` es esa escena, para ofrecer quitarla. */
export function tableRolls(rolls: readonly RollDoc[], dismissed: string | null): { hero: Set<string>; scene: string | null } {
  const hero = new Set(rolls.filter((r) => !isTerminal(r.record.state) || r.record.advance === 'pendiente').map((r) => r.id));
  const last = rolls[0];
  if (hero.size === 0 && last && last.record.state === 'resuelta' && last.id !== dismissed) {
    hero.add(last.id);
    return { hero, scene: last.id };
  }
  return { hero, scene: null };
}
