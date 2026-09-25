import { useDialogs } from '../dialogs';
import { removeMember } from '../../data/rooms';
import { toastError } from '../../state/toast';
import { IconButton } from '../kv/Button';
import { Avatar, KickerDivider } from '../kv/Layout';
import { useRoom } from './context';

/** Quién está en la sala: DM primero y luego por nombre, con indicador de conexión. */
export function PlayersPanel({ selected, onSelect }: { selected: string | null; onSelect?: (uid: string) => void }) {
  const ctx = useRoom();
  const { confirm, dialogs } = useDialogs();
  const members = [...ctx.members].sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName, 'es') : a.role === 'dm' ? -1 : 1));

  const kick = async (uid: string, name: string) => {
    if (!(await confirm(`Expulsar a ${name}`, 'Sale de la sala y su personaje se conserva. Podría volver con el código si no lo cambias.', { okLabel: 'Expulsar', danger: true }))) return;
    removeMember(ctx.room.id, uid).catch(toastError);
  };

  return (
    <section className="rl-players" aria-label="En la sala">
      <KickerDivider mark>En la sala</KickerDivider>
      <ul className="rl-players__list">
        {members.map((m) => {
          const character = ctx.characterOf(m.uid);
          const online = ctx.online.has(m.uid);
          const selectable = ctx.isDm && m.role !== 'dm' && onSelect;
          const body = (
            <>
              <span className="rl-presence-wrap">
                <Avatar icon={m.role === 'dm' ? 'crown' : 'user-round'} size={32} />
                <span className={`rl-presence${online ? ' rl-presence--on' : ''}`} aria-label={online ? 'Conectado' : 'Desconectado'} />
              </span>
              <span className="rl-player__text">
                <span className="rl-player__name">{m.role === 'dm' ? `${m.displayName} (DM)` : (character?.sheet.name ?? m.displayName)}</span>
                <span className="rl-player__support">
                  {m.role === 'dm' ? 'Dirige la partida' : character ? `${m.displayName} · ${character.sheet.xp} XP` : `${m.displayName} · sin personaje`}
                </span>
              </span>
            </>
          );
          return (
            <li key={m.uid} className={`rl-player${selected === m.uid ? ' rl-player--selected' : ''}`}>
              {selectable ? (
                <button type="button" className="rl-player__main kv-state" onClick={() => onSelect(m.uid)}>
                  {body}
                </button>
              ) : (
                <div className="rl-player__main">{body}</div>
              )}
              {ctx.isDm && m.role !== 'dm' && <IconButton icon="user-round-x" small label={`Expulsar a ${m.displayName}`} onClick={() => void kick(m.uid, m.displayName)} />}
            </li>
          );
        })}
      </ul>
      {dialogs}
    </section>
  );
}
