import { useState, type ReactNode } from 'react';
import { useLiveQuery } from '../../data/hooks';
import { rollFrom } from '../../data/models';
import { rollsQuery } from '../../data/rolls';
import { EmptyState, KickerDivider } from '../kv/Layout';
import { useRoom } from './context';
import { RollItem, tableRolls } from './Duel';
import { useRollActions } from './useRollActions';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin localStorage: solo esta sesión */
  }
}

/** La mesa: las tiradas vivas como duelo completo arriba y el resto plegado debajo. Todas son hijas del mismo
 *  contenedor para que una tirada conserve su estado (el reveal) al pasar de la mesa al registro. */
export function RollLog() {
  const ctx = useRoom();
  const actions = useRollActions();
  const rolls = useLiveQuery(`rolls/${ctx.room.id}/${ctx.room.dmUid}`, rollsQuery(ctx.room.id), (id, data) => rollFrom(id, data, ctx.room.dmUid));
  const list = rolls.data ?? [];
  // Quitar la escena de la mesa es una preferencia de quien mira: se recuerda por sala en este navegador.
  const dismissKey = `rl-dismissed:${ctx.room.id}`;
  const [dismissed, setDismissed] = useState<string | null>(() => read(dismissKey));
  const dismiss = (id: string) => {
    setDismissed(id);
    write(dismissKey, id);
  };
  const { hero, scene } = tableRolls(list, dismissed);
  const onTable = list.filter((r) => hero.has(r.id));
  const rest = list.filter((r) => !hero.has(r.id));

  const children: ReactNode[] = [];
  children.push(
    <KickerDivider key="k-table" mark>
      En la mesa
    </KickerDivider>,
  );
  if (onTable.length > 0) {
    onTable.forEach((r) => children.push(<RollItem key={r.id} roll={r} actions={actions} hero onDismiss={r.id === scene ? () => dismiss(r.id) : undefined} />));
  } else if (list.length > 0) {
    children.push(
      <div key="k-idle" className="rl-idle">
        <EmptyState register="empty" icon="hourglass" title="Esperando la siguiente acción" body={ctx.isDm ? 'Cuando alguien actúe, su tirada aparecerá aquí.' : 'Actúa con una habilidad de tu ficha cuando quieras.'} />
      </div>,
    );
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
