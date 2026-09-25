import { useState } from 'react';
import type { RoomSettings } from '../../engine';
import { useLiveQuery } from '../../data/hooks';
import { catalogQuery, deleteCatalogItem, saveCatalogItem } from '../../data/items';
import { itemFrom, type ItemDoc } from '../../data/models';
import { rotateCode, updateRoom } from '../../data/rooms';
import { useBusy } from '../../hooks/useBusy';
import { toast } from '../../state/toast';
import { useDialogs } from '../dialogs';
import { Button, IconButton, Segmented } from '../kv/Button';
import { Field } from '../kv/Field';
import { EmptyState, GroupedList, KickerDivider, ListItem } from '../kv/Layout';
import { CharacterSheet, NoCharacter } from './CharacterSheet';
import { useRoom } from './context';
import { GiveItemDialog, ItemEditDialog } from './ItemDialogs';
import { RoomCode } from './RoomCode';
import { SettingsForm } from './SettingsForm';

type Tab = 'character' | 'catalog' | 'room';

function Catalog() {
  const ctx = useRoom();
  const catalog = useLiveQuery(`catalog/${ctx.room.id}`, catalogQuery(ctx.room.id), itemFrom);
  const [editing, setEditing] = useState<ItemDoc | 'new' | null>(null);
  const [giving, setGiving] = useState<string | null>(null);
  const items = catalog.data ?? [];

  return (
    <div className="rl-panel-body">
      <div className="rl-row">
        <p className="rl-hint rl-grow">Tu catálogo es privado: los jugadores solo ven las copias que les entregas.</p>
        <Button variant="tonal" icon="plus" dense onClick={() => setEditing('new')}>
          Objeto
        </Button>
      </div>
      {catalog.data !== undefined && items.length === 0 ? (
        <EmptyState register="empty" icon="package" title="Catálogo vacío" body="Crea objetos para entregarlos a los personajes." />
      ) : (
        <GroupedList>
          {items.map((item) => (
            <li key={item.id}>
              <ListItem
                as="div"
                lead="package"
                headline={item.name}
                support={[item.description, item.value !== null ? `Valor ${item.value}` : '', `×${item.quantity}`].filter(Boolean).join(' · ')}
                trail={
                  <span className="rl-row">
                    <IconButton icon="gift" small label={`Entregar ${item.name}`} onClick={() => setGiving(item.id)} />
                    <IconButton icon="pencil" small label={`Editar ${item.name}`} onClick={() => setEditing(item)} />
                  </span>
                }
              />
            </li>
          ))}
        </GroupedList>
      )}
      {editing && (
        <ItemEditDialog
          title={editing === 'new' ? 'Nuevo objeto' : 'Editar objeto'}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(item) => saveCatalogItem(ctx.room.id, item, editing === 'new' ? undefined : editing.id)}
          onDelete={editing === 'new' ? undefined : () => deleteCatalogItem(ctx.room.id, editing.id)}
        />
      )}
      {giving && <GiveItemDialog catalog={items} characters={ctx.characters} initialItem={giving} onClose={() => setGiving(null)} />}
    </div>
  );
}

function RoomSettingsTab() {
  const ctx = useRoom();
  const { room } = ctx;
  const [name, setName] = useState(room.name);
  const [settings, setSettings] = useState<RoomSettings>(room.settings);
  const [busy, run] = useBusy();
  const { confirm, dialogs } = useDialogs();
  const dirty = name.trim() !== room.name || JSON.stringify(settings) !== JSON.stringify(room.settings);

  const newCode = async () => {
    if (!(await confirm('Nuevo código', 'El código actual deja de servir para unirse. Quien ya está en la sala sigue dentro.', { okLabel: 'Cambiar código' }))) return;
    await run(async () => {
      await rotateCode(room);
      toast('Código cambiado');
    });
  };

  return (
    <div className="rl-panel-body kv-form">
      <div className="rl-row">
        <RoomCode code={room.code} revealable />
        <Button variant="text" icon="refresh-cw" dense disabled={busy} onClick={() => void newCode()}>
          Nuevo código
        </Button>
      </div>
      <Field label="Nombre de la sala" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <KickerDivider>Reglas de la mesa</KickerDivider>
      <SettingsForm value={settings} onChange={setSettings} />
      <Button variant="primary" icon="check" disabled={!dirty || !name.trim() || busy} onClick={() => void run(() => updateRoom(room, name, settings))}>
        Guardar cambios
      </Button>
      {dialogs}
    </div>
  );
}

/** Panel del DM: la ficha del jugador elegido, el catálogo y los ajustes de la sala. */
export function DmPanel({ selected }: { selected: string | null }) {
  const ctx = useRoom();
  const [tab, setTab] = useState<Tab>('character');
  const member = ctx.members.find((m) => m.uid === selected);
  const character = selected ? ctx.characterOf(selected) : undefined;

  return (
    <section className="rl-dm" aria-label="Panel del DM">
      <Segmented<Tab>
        label="Panel del DM"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'character', label: 'Personaje', icon: 'user-round' },
          { value: 'catalog', label: 'Catálogo', icon: 'package' },
          { value: 'room', label: 'Sala', icon: 'settings' },
        ]}
      />
      {tab === 'character' &&
        (character ? (
          <CharacterSheet character={character} />
        ) : member ? (
          <NoCharacter name={member.displayName} />
        ) : (
          <EmptyState register="results" icon="users" title="Elige a un jugador" body="Toca a alguien en la lista de la sala para ver su ficha." />
        ))}
      {tab === 'catalog' && <Catalog />}
      {tab === 'room' && <RoomSettingsTab key={ctx.room.code} />}
    </section>
  );
}
