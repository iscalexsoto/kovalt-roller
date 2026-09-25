import { useState } from 'react';
import type { RoomSettings } from '../../engine';
import { useLiveQuery } from '../../data/hooks';
import { catalogQuery, deleteCatalogItem, give, saveCatalogItem } from '../../data/items';
import { catalogFrom, type CatalogDoc, type CharacterDoc } from '../../data/models';
import { rotateCode, updateRoom } from '../../data/rooms';
import { useBusy } from '../../hooks/useBusy';
import { GameIcon } from '../../icons/GameIcon';
import { toast, toastError } from '../../state/toast';
import { useDialogs } from '../dialogs';
import { Button, Segmented } from '../kv/Button';
import { Field } from '../kv/Field';
import { EmptyState, GroupedList, KickerDivider } from '../kv/Layout';
import { CharacterSheet, NoCharacter } from './CharacterSheet';
import { useRoom } from './context';
import { useDropTarget } from './drag';
import { DragHandle } from './DragUI';
import { ItemEditDialog } from './ItemDialogs';
import { DmOffers } from './Offers';
import { RoomCode } from './RoomCode';
import { SettingsForm } from './SettingsForm';

type Tab = 'character' | 'catalog' | 'room';

/** Destino para entregar al personaje una unidad del objeto soltado. */
function GivePad({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const target = useDropTarget(`pad:${character.id}`, ({ item }) => {
    give(ctx.room.id, character.id, item, 1, ctx.uid)
      .then(() => toast(`${item.name} → ${character.sheet.name}`))
      .catch(toastError);
  });
  return (
    <span {...target.props} className={`rl-pad ${target.props.className}`}>
      <GameIcon name="user-round" />
      {character.sheet.name}
    </span>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function Catalog() {
  const ctx = useRoom();
  const catalog = useLiveQuery(`catalog/${ctx.room.id}`, catalogQuery(ctx.room.id), catalogFrom);
  const [editing, setEditing] = useState<CatalogDoc | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const items = catalog.data ?? [];
  const needle = fold(search.trim());
  const shown = needle ? items.filter((i) => fold(`${i.name} ${i.description}`).includes(needle)) : items;

  return (
    <div className="rl-panel-body">
      <DmOffers />
      <KickerDivider>Catálogo</KickerDivider>
      <div className="rl-row">
        <p className="rl-hint rl-grow">Privado. Arrastra un objeto (o tócalo por el ícono y luego el destino) a un jugador, a su ficha o a un botín o tienda.</p>
        <Button variant="tonal" icon="plus" dense onClick={() => setEditing('new')}>
          Objeto
        </Button>
      </div>
      {ctx.characters.length > 0 && (
        <div className="rl-pads" aria-label="Entregar a">
          {ctx.characters.map((c) => (
            <GivePad key={c.id} character={c} />
          ))}
        </div>
      )}
      {items.length > 0 && <Field lead="search" placeholder="Buscar en el catálogo" aria-label="Buscar en el catálogo" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} dense />}
      {catalog.data !== undefined && items.length === 0 ? (
        <EmptyState register="empty" icon="package" title="Catálogo vacío" body="Crea objetos para entregarlos o ponerlos en un botín o una tienda." />
      ) : shown.length === 0 && catalog.data !== undefined ? (
        <EmptyState register="results" icon="search-x" title="Sin resultados" body={`Nada coincide con «${search.trim()}».`} />
      ) : (
        <GroupedList>
          {shown.map((item) => (
            <li key={item.id} className="rl-catalog-row">
              <DragHandle payload={{ item }} label={`Arrastrar ${item.name}`} />
              <button type="button" className="rl-catalog-row__main kv-state" onClick={() => setEditing(item)}>
                <span className="kv-list-item__headline">{item.name}</span>
                {(item.description || item.value !== null) && (
                  <span className="kv-list-item__support">{[item.value !== null ? `${item.value} monedas` : '', item.description].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
        </GroupedList>
      )}
      {editing && (
        <ItemEditDialog
          title={editing === 'new' ? 'Nuevo objeto' : 'Editar objeto'}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(item) => saveCatalogItem(ctx.room.id, { name: item.name, description: item.description, value: item.value, icon: item.icon, color: item.color }, editing === 'new' ? undefined : editing.id)}
          onDelete={editing === 'new' ? undefined : () => deleteCatalogItem(ctx.room.id, editing.id)}
        />
      )}
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
