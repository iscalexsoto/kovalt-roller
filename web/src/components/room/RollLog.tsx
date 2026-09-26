import type { ReactNode } from 'react';
import { useLiveQuery } from '../../data/hooks';
import { rollFrom } from '../../data/models';
import { rollsQuery } from '../../data/rolls';
import { EmptyState, KickerDivider } from '../kv/Layout';
import { useRoom } from './context';
import { RollItem, heroIds } from './Duel';
import { useRollActions } from './useRollActions';

/** La mesa: las tiradas vivas como duelo completo arriba y el resto plegado debajo. Todas son hijas del mismo
 *  contenedor para que una tirada conserve su estado (el reveal) al pasar de la mesa al registro. */
export function RollLog() {
  const ctx = useRoom();
  const actions = useRollActions();
  const rolls = useLiveQuery(`rolls/${ctx.room.id}/${ctx.room.dmUid}`, rollsQuery(ctx.room.id), (id, data) => rollFrom(id, data, ctx.room.dmUid));
  const list = rolls.data ?? [];
  const hero = heroIds(list);
  const onTable = list.filter((r) => hero.has(r.id));
  const rest = list.filter((r) => !hero.has(r.id));

  const children: ReactNode[] = [];
  if (onTable.length > 0) {
    children.push(
      <KickerDivider key="k-table" mark>
        En la mesa
      </KickerDivider>,
    );
    onTable.forEach((r) => children.push(<RollItem key={r.id} roll={r} actions={actions} hero />));
  }
  if (rest.length > 0) {
    children.push(<KickerDivider key="k-log">Registro</KickerDivider>);
    rest.forEach((r) => children.push(<RollItem key={r.id} roll={r} actions={actions} hero={false} />));
  }

  return (
    <section className="rl-log" aria-label="Tiradas">
      {rolls.data === undefined && rolls.error ? (
        <EmptyState register="error" title="No pudimos cargar las tiradas" body="Revisa tu conexión." />
      ) : rolls.data !== undefined && list.length === 0 ? (
        <EmptyState
          register="empty"
          icon="dices"
          title="La mesa está en silencio"
          body={ctx.isDm ? 'Cuando alguien actúe, su tirada aparecerá aquí para que la opongas.' : 'Actúa con una habilidad de tu ficha y el DM decidirá.'}
        />
      ) : (
        children
      )}
      {actions.dialogs}
    </section>
  );
}
