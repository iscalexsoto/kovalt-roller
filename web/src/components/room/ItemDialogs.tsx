import { useState } from 'react';
import type { Item } from '../../engine';
import type { CharacterDoc, ItemDoc } from '../../data/models';
import { give } from '../../data/items';
import { useBusy } from '../../hooks/useBusy';
import { toast } from '../../state/toast';
import { Button } from '../kv/Button';
import { Field, TextArea } from '../kv/Field';
import { Dialog } from '../kv/Overlay';
import { Select } from '../kv/Select';
import { useRoom } from './context';

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9);

/** Crear o editar un objeto (del catálogo o una copia entregada). */
export function ItemEditDialog({
  title,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  initial?: Item;
  onClose: () => void;
  onSave: (item: Item) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [value, setValue] = useState(initial?.value === null || initial?.value === undefined ? '' : String(initial.value));
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, run] = useBusy();

  const save = () =>
    void run(async () => {
      await onSave({ name: name.trim(), description: description.trim(), value: value === '' ? null : Number(value), quantity: Number(quantity || '0') });
      onClose();
    });

  return (
    <Dialog
      title={title}
      icon="package"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          {onDelete &&
            (confirmDelete ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onDelete();
                    onClose();
                  })
                }
              >
                ¿Quitar? Sí
              </Button>
            ) : (
              <Button variant="text" icon="trash-2" className="rl-danger-text" onClick={() => setConfirmDelete(true)}>
                Quitar
              </Button>
            ))}
          <span className="rl-grow" />
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <Field label="Nombre" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        <TextArea label="Descripción (y efecto, si es mágico)" value={description} maxLength={4000} rows={3} onChange={(e) => setDescription(e.target.value)} />
        <div className="rl-two">
          <Field label="Valor (opcional)" inputMode="numeric" value={value} onChange={(e) => setValue(digits(e.target.value))} />
          <Field label="Cantidad" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} />
        </div>
      </div>
    </Dialog>
  );
}

/** El DM entrega a un personaje una copia de un objeto del catálogo. */
export function GiveItemDialog({
  catalog,
  characters,
  initialItem,
  initialCharacter,
  onClose,
}: {
  catalog: ItemDoc[];
  characters: CharacterDoc[];
  initialItem?: string;
  initialCharacter?: string;
  onClose: () => void;
}) {
  const ctx = useRoom();
  const [cid, setCid] = useState(initialCharacter ?? characters[0]?.id ?? '');
  const [itemId, setItemId] = useState(initialItem ?? '');
  const [quantity, setQuantity] = useState(String(catalog.find((i) => i.id === initialItem)?.quantity ?? 1));
  const [busy, run] = useBusy();
  const item = catalog.find((i) => i.id === itemId);
  const target = characters.find((c) => c.id === cid);

  return (
    <Dialog
      title="Entregar objeto"
      icon="gift"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!item || !target || busy}
            onClick={() =>
              void run(async () => {
                await give(ctx.room.id, target!.id, item!, Number(quantity || '0'), ctx.uid);
                toast(`${item!.name} → ${target!.sheet.name}`);
                onClose();
              })
            }
          >
            Entregar
          </Button>
        </>
      }
    >
      {characters.length === 0 || catalog.length === 0 ? (
        <p>{characters.length === 0 ? 'Todavía no hay personajes en la sala.' : 'El catálogo está vacío: crea un objeto primero.'}</p>
      ) : (
        <div className="kv-form">
          <Select label="Personaje" value={cid} options={characters.map((c) => ({ value: c.id, label: c.sheet.name }))} onChange={setCid} />
          <Select
            label="Objeto"
            value={itemId}
            placeholder="Elige un objeto"
            options={catalog.map((i) => ({ value: i.id, label: i.name }))}
            onChange={(v) => {
              setItemId(v);
              setQuantity(String(catalog.find((i) => i.id === v)?.quantity ?? 1));
            }}
          />
          <Field label="Cantidad" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} />
        </div>
      )}
    </Dialog>
  );
}
