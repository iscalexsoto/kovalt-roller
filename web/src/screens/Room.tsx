import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AccountMenu } from '../components/AccountMenu';
import { Button, IconButton } from '../components/kv/Button';
import { EmptyState } from '../components/kv/Layout';
import { TopBar } from '../components/kv/Nav';
import { Loading } from '../components/Gate';
import { CharacterCreate } from '../components/room/CharacterCreate';
import { CharacterSheet } from '../components/room/CharacterSheet';
import { buildRoomCtx, RoomContext } from '../components/room/context';
import { DmPanel } from '../components/room/DmPanel';
import { DragLayer } from '../components/room/DragUI';
import { PlayerOffers } from '../components/room/Offers';
import { PlayersPanel } from '../components/room/PlayersPanel';
import { RollLog } from '../components/room/RollLog';
import { copyInvite } from '../components/room/invite';
import { RoomCode } from '../components/room/RoomCode';
import { charactersQuery } from '../data/characters';
import { isPermissionDenied } from '../data/errors';
import { useLiveDoc, useLiveQuery, useOnline } from '../data/hooks';
import { characterFrom, memberFrom, roomFrom } from '../data/models';
import { goOnline } from '../data/presence';
import { membersQuery, roomRef } from '../data/rooms';
import { useSession } from '../firebase/session';
import { EXPANDED, useMediaQuery } from '../hooks/useMediaQuery';
import { GameIcon } from '../icons/GameIcon';

type View = 'table' | 'players' | 'side';

/** Navegación inferior en compacto (navigation-patterns.md § Navigation bar), con botones en lugar de rutas. */
function BottomNav({ view, onChange, sideLabel, sideIcon }: { view: View; onChange: (v: View) => void; sideLabel: string; sideIcon: string }) {
  const items: { value: View; label: string; icon: string }[] = [
    { value: 'table', label: 'Mesa', icon: 'dices' },
    { value: 'players', label: 'Jugadores', icon: 'users' },
    { value: 'side', label: sideLabel, icon: sideIcon },
  ];
  return (
    <nav className="kv-nav-bar kv-float-1" aria-label="Secciones de la sala">
      {items.map((it) => (
        <button key={it.value} type="button" className="kv-nav-item" aria-current={view === it.value ? 'page' : undefined} onClick={() => onChange(it.value)}>
          <span className="kv-nav-item__ind">
            <GameIcon name={it.icon} />
          </span>
          <span className="kv-nav-item__label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Room() {
  const { id = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const wide = useMediaQuery(EXPANDED);
  const [view, setView] = useState<View>('table');
  const [selected, setSelected] = useState<string | null>(null);

  const room = useLiveDoc(roomRef(id), roomFrom);
  const members = useLiveQuery(`members/${id}`, membersQuery(id), memberFrom);
  const characters = useLiveQuery(`characters/${id}`, charactersQuery(id), characterFrom);
  const online = useOnline(id);

  const me = members.data?.find((m) => m.uid === session.uid);
  const ctx = useMemo(
    () => (room.data && me && members.data && characters.data ? buildRoomCtx(room.data, session.uid, me, members.data, characters.data, online) : null),
    [room.data, me, members.data, characters.data, online, session.uid],
  );

  // Presencia: conectado mientras la sala esté abierta y siga siendo miembro.
  const isMember = Boolean(me);
  const myName = me?.displayName ?? session.name;
  useEffect(() => {
    if (!isMember) return;
    return goOnline(id, session.uid, myName);
  }, [id, isMember, session.uid, myName]);

  const back = session.guest ? undefined : () => navigate('/');
  const error = room.error ?? members.error ?? characters.error;

  if (error) {
    const gone = isPermissionDenied(error);
    return (
      <div className="rl-page">
        <TopBar title="Sala" onBack={back} actions={<AccountMenu />} />
        <EmptyState
          register="error"
          icon={gone ? 'door-open' : undefined}
          title={gone ? 'Ya no formas parte de esta sala' : 'No se puede abrir la sala'}
          body={gone ? 'Quizá te expulsaron o la sala ya no existe.' : 'Revisa tu conexión y vuelve a intentarlo.'}
          actions={!session.guest && <Button variant="outlined" onClick={() => navigate('/')}>Volver al inicio</Button>}
        />
      </div>
    );
  }
  if (room.data === null) {
    return (
      <div className="rl-page">
        <TopBar title="Sala" onBack={back} actions={<AccountMenu />} />
        <EmptyState register="results" icon="door-open" title="Sala no encontrada" />
      </div>
    );
  }
  if (members.data && !me) {
    return (
      <div className="rl-page">
        <TopBar title={room.data?.name ?? 'Sala'} onBack={back} actions={<AccountMenu />} />
        <EmptyState register="results" icon="door-open" title="Fuera de la sala" body="No estás en esta sala. Entra con su código." />
      </div>
    );
  }
  if (!ctx) return <Loading label="Abriendo la sala…" />;

  const { isDm, myCharacter } = ctx;
  const needsCharacter = !isDm && !myCharacter;
  // Si el elegido ya no está en la sala (lo expulsaron o se fue), se pasa al primer jugador.
  const stillHere = selected !== null && ctx.members.some((m) => m.uid === selected);
  const selectedUid = (stillHere ? selected : null) ?? ctx.members.find((m) => m.role !== 'dm')?.uid ?? null;
  const side = isDm ? <DmPanel selected={selectedUid} /> : myCharacter ? <CharacterSheet character={myCharacter} /> : null;
  const players = (
    <PlayersPanel
      selected={isDm ? selectedUid : null}
      onSelect={(uid) => {
        setSelected(uid);
        if (!wide) setView('side');
      }}
    />
  );

  return (
    <RoomContext.Provider value={ctx}>
      <div className="rl-page rl-room">
        <TopBar
          title={
            <span className="rl-room__title">
              <span className="rl-room__name">{ctx.room.name}</span>
              <span className="rl-room__role">{isDm ? `DM · ${ctx.me.displayName}` : (myCharacter?.sheet.name ?? ctx.me.displayName)}</span>
            </span>
          }
          onBack={back}
          actions={
            <>
              <RoomCode code={ctx.room.code} />
              {isDm && <IconButton icon="link" label="Copiar enlace de invitación" onClick={() => copyInvite(ctx.room.code)} />}
              <AccountMenu />
            </>
          }
        />
        {needsCharacter ? (
          <CharacterCreate />
        ) : wide ? (
          <div className="rl-table">
            <aside className="rl-table__players">{players}</aside>
            <div className="rl-table__log">
              {!isDm && <PlayerOffers />}
              <RollLog />
            </div>
            <aside className="rl-table__side">{side}</aside>
          </div>
        ) : (
          <>
            <div className="rl-compact">
              {view === 'table' && (
                <>
                  {!isDm && <PlayerOffers />}
                  <RollLog />
                </>
              )}
              {view === 'players' && players}
              {view === 'side' && side}
            </div>
            <BottomNav view={view} onChange={setView} sideLabel={isDm ? 'DM' : 'Ficha'} sideIcon={isDm ? 'crown' : 'scroll-text'} />
          </>
        )}
        {isDm && <DragLayer />}
      </div>
    </RoomContext.Provider>
  );
}
