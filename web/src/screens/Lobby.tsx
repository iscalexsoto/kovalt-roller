import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AccountMenu } from '../components/AccountMenu';
import { Button } from '../components/kv/Button';
import { CodeField } from '../components/kv/CodeField';
import { Field } from '../components/kv/Field';
import { Card, EmptyState, GroupedList, KickerDivider, ListItem } from '../components/kv/Layout';
import { TopBar } from '../components/kv/Nav';
import { Dialog } from '../components/kv/Overlay';
import { SettingsForm } from '../components/room/SettingsForm';
import { defaultRoomSettings, type RoomSettings } from '../engine';
import { useLiveQuery } from '../data/hooks';
import { myRoomFrom } from '../data/models';
import { createRoom, joinByCode, myRoomsQuery, normalizeCode } from '../data/rooms';
import { useSession } from '../firebase/session';
import { useBusy } from '../hooks/useBusy';
import { GameIcon } from '../icons/GameIcon';

function CreateRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (roomId: string) => void }) {
  const session = useSession();
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<RoomSettings>(defaultRoomSettings());
  const [busy, run] = useBusy();
  const submit = () =>
    void run(async () => {
      const roomId = await createRoom(session.uid, session.name, name, settings);
      onCreated(roomId);
    });
  return (
    <Dialog
      title="Nueva sala"
      icon="dices"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? 'Creando…' : 'Crear sala'}
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <Field label="Nombre de la sala" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        <SettingsForm value={settings} onChange={setSettings} />
      </div>
    </Dialog>
  );
}

/** Inicio de una cuenta: unirse con código, crear sala y "Mis salas". */
export function Lobby() {
  const session = useSession();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [code, setCode] = useState(normalizeCode(search.get('codigo') ?? '').slice(0, 6));
  const [creating, setCreating] = useState(false);
  const [joining, run] = useBusy();
  const rooms = useLiveQuery(`myRooms/${session.uid}`, myRoomsQuery(session.uid), myRoomFrom);

  const join = (c = code) =>
    void run(async () => {
      const roomId = await joinByCode(session.uid, session.name, c);
      navigate(`/sala/${roomId}`);
    });

  return (
    <div className="rl-page">
      <TopBar brand title="Roller" actions={<AccountMenu />} />
      <main className="rl-wrap rl-lobby">
        <h1 className="rl-hello">Hola, {session.name}</h1>
        <div className="rl-lobby__cards">
          <Card>
            <h2 className="kv-card__title">Unirse con código</h2>
            <p className="kv-card__body">Seis caracteres, te los da quien dirige la partida.</p>
            <CodeField label="Código de sala" length={6} alphanumeric value={code} onChange={setCode} onComplete={(c) => join(c)} disabled={joining} />
            <Button variant="primary" icon="door-open" disabled={normalizeCode(code).length !== 6 || joining} onClick={() => join()}>
              {joining ? 'Entrando…' : 'Entrar'}
            </Button>
          </Card>
          <Card>
            <h2 className="kv-card__title">Dirigir una partida</h2>
            <p className="kv-card__body">Crea una sala: tú eres el DM y compartes el código o el enlace con tu grupo.</p>
            <Button variant="tonal" icon="plus" onClick={() => setCreating(true)}>
              Crear sala
            </Button>
          </Card>
        </div>

        <KickerDivider mark>Mis salas</KickerDivider>
        {rooms.data === undefined ? (
          rooms.error ? (
            <EmptyState register="error" title="No pudimos cargar tus salas" body="Revisa tu conexión y vuelve a intentarlo." />
          ) : null
        ) : rooms.data.length === 0 ? (
          <EmptyState register="empty" icon="dices" title="Todavía no hay mesas" body="Crea una sala o únete con un código y aparecerá aquí." />
        ) : (
          <GroupedList>
            {rooms.data.map((r) => (
              <li key={r.roomId}>
                <ListItem
                  as="button"
                  lead={r.role === 'dm' ? 'crown' : 'user-round'}
                  headline={r.name}
                  support={r.role === 'dm' ? 'Diriges esta mesa' : 'Juegas en esta mesa'}
                  trail={<GameIcon name="chevron-right" />}
                  onClick={() => navigate(`/sala/${r.roomId}`)}
                />
              </li>
            ))}
          </GroupedList>
        )}
      </main>
      {creating && <CreateRoomDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/sala/${id}`)} />}
    </div>
  );
}
