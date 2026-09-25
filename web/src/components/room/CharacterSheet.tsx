import { useState } from 'react';
import { skillLabel, slotUsage } from '../../engine';
import { dmUpdateSheet, updateCharacterTexts } from '../../data/characters';
import { useLiveQuery } from '../../data/hooks';
import { catalogQuery, inventoryQuery, removeFromInventory, setQuantity, updateInventoryItem } from '../../data/items';
import { itemFrom, type CharacterDoc, type ItemDoc } from '../../data/models';
import { useBusy } from '../../hooks/useBusy';
import { toastError } from '../../state/toast';
import { Button, IconButton } from '../kv/Button';
import { Field, TextArea } from '../kv/Field';
import { EmptyState, KickerDivider } from '../kv/Layout';
import { Dialog } from '../kv/Overlay';
import { useRoom } from './context';
import { GiveItemDialog, ItemEditDialog } from './ItemDialogs';

function EditSheetDialog({ character, onClose }: { character: CharacterDoc; onClose: () => void }) {
  const ctx = useRoom();
  const [name, setName] = useState(character.sheet.name);
  const [description, setDescription] = useState(character.sheet.description);
  const [notes, setNotes] = useState(character.sheet.notes);
  const [busy, run] = useBusy();
  return (
    <Dialog
      title="Editar personaje"
      icon="pencil"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || busy}
            onClick={() =>
              void run(async () => {
                await updateCharacterTexts(ctx.room.id, character.id, { name, description, notes });
                onClose();
              })
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <Field label="Nombre" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Descripción" value={description} maxLength={4000} rows={3} onChange={(e) => setDescription(e.target.value)} />
        <TextArea label="Notas" value={notes} maxLength={20000} rows={5} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

function Inventory({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const isOwner = character.id === ctx.uid;
  const inv = useLiveQuery(`inv/${ctx.room.id}/${character.id}`, inventoryQuery(ctx.room.id, character.id), itemFrom);
  const catalog = useLiveQuery(ctx.isDm ? `catalog/${ctx.room.id}` : null, ctx.isDm ? catalogQuery(ctx.room.id) : null, itemFrom);
  const [editing, setEditing] = useState<ItemDoc | null>(null);
  const [giving, setGiving] = useState(false);

  const change = (item: ItemDoc, delta: number) => {
    const next = item.quantity + delta;
    if (next < 0) return;
    setQuantity(ctx.room.id, character.id, item.id, next).catch(toastError);
  };

  return (
    <>
      <KickerDivider className="rl-sheet__kicker">Inventario</KickerDivider>
      {inv.data === undefined ? null : inv.data.length === 0 ? (
        <p className="rl-hint">Sin objetos.</p>
      ) : (
        <ul className="rl-items">
          {inv.data.map((item) => (
            <li key={item.id} className={`rl-item${item.quantity === 0 ? ' rl-item--empty' : ''}`}>
              <div className="rl-item__text">
                <span className="rl-item__name">{item.name}</span>
                {item.description && <span className="rl-item__desc">{item.description}</span>}
                {item.value !== null && <span className="rl-item__desc">Valor: {item.value}</span>}
              </div>
              {(isOwner || ctx.isDm) && (
                <span className="rl-qty">
                  <IconButton icon="minus" small label="Uno menos" disabled={item.quantity === 0} onClick={() => change(item, -1)} />
                  <span className="rl-qty__value kv-num">{item.quantity}</span>
                  <IconButton icon="plus" small label="Uno más" onClick={() => change(item, 1)} />
                </span>
              )}
              {ctx.isDm && <IconButton icon="pencil" small label={`Editar ${item.name}`} onClick={() => setEditing(item)} />}
            </li>
          ))}
        </ul>
      )}
      {ctx.isDm && (
        <Button variant="text" icon="gift" dense onClick={() => setGiving(true)}>
          Entregar objeto
        </Button>
      )}
      {editing && (
        <ItemEditDialog
          title="Editar objeto entregado"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(item) => updateInventoryItem(ctx.room.id, character.id, editing.id, item)}
          onDelete={() => removeFromInventory(ctx.room.id, character.id, editing.id)}
        />
      )}
      {giving && catalog.data && <GiveItemDialog catalog={catalog.data} characters={[character]} initialCharacter={character.id} onClose={() => setGiving(false)} />}
    </>
  );
}

/** Hoja del personaje: XP, habilidades, inventario y notas. */
export function CharacterSheet({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const { sheet } = character;
  const isOwner = character.id === ctx.uid;
  const usage = slotUsage(sheet, ctx.room.settings);
  const [editing, setEditing] = useState(false);
  const [busy, run] = useBusy();

  return (
    <section className="rl-sheet" aria-label={`Ficha de ${sheet.name}`}>
      <header className="rl-sheet__head">
        <div className="rl-grow">
          <h2 className="rl-sheet__name">{sheet.name}</h2>
          <span className="rl-sheet__player">Jugador: {ctx.displayNameOf(character.ownerUid)}</span>
        </div>
        {isOwner && <IconButton icon="pencil" label="Editar personaje" onClick={() => setEditing(true)} />}
      </header>
      {sheet.description && <p className="rl-sheet__desc">{sheet.description}</p>}

      <div className="rl-xp">
        <span className="rl-xp__label">XP</span>
        {ctx.isDm && <IconButton icon="minus" small label="Quitar 1 XP" disabled={busy || sheet.xp === 0} onClick={() => void run(() => dmUpdateSheet(ctx.room.id, character.id, sheet.xp - 1, sheet.skills))} />}
        <span className="rl-xp__value kv-num">{sheet.xp}</span>
        {ctx.isDm && <IconButton icon="plus" small label="Dar 1 XP" disabled={busy} onClick={() => void run(() => dmUpdateSheet(ctx.room.id, character.id, sheet.xp + 1, sheet.skills))} />}
      </div>

      <KickerDivider className="rl-sheet__kicker">
        Habilidades · {usage.used}/{usage.capacity} slots
      </KickerDivider>
      <ul className="rl-skills">
        {sheet.skills.map((s, i) => (
          <li key={i} className={`rl-skill${s.permanent ? ' rl-skill--base' : ''}`}>
            <span className="rl-skill__level kv-num">{s.level}</span>
            <span className="rl-skill__text">
              <span className="rl-skill__name">{s.name}</span>
              <span className="rl-skill__from">{s.permanent ? 'Permanente' : s.derivedFrom ? `De ${s.derivedFrom}` : skillLabel(s)}</span>
            </span>
          </li>
        ))}
      </ul>

      <Inventory character={character} />

      {sheet.notes && (
        <>
          <KickerDivider className="rl-sheet__kicker">Notas</KickerDivider>
          <p className="rl-sheet__notes">{sheet.notes}</p>
        </>
      )}
      {editing && <EditSheetDialog character={character} onClose={() => setEditing(false)} />}
    </section>
  );
}

export function NoCharacter({ name }: { name: string }) {
  return <EmptyState register="empty" icon="user-round" title={`${name} aún no tiene personaje`} body="Aparecerá aquí en cuanto lo cree." />;
}
