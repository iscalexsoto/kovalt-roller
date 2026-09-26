import { useState, type ReactNode } from 'react';
import { DEFAULT_ITEM_COLOR, DEFAULT_ITEM_ICON, type CatalogItem, type Item, type ItemLook } from '../../engine';
import { useBusy } from '../../hooks/useBusy';
import { GameIcon } from '../../icons/GameIcon';
import { Button } from '../kv/Button';
import { Checkbox, Field, TextArea } from '../kv/Field';
import { Tag } from '../kv/Layout';
import { Dialog } from '../kv/Overlay';
import { lookStyle } from './itemColors';
import { ColorPicker, IconPicker, ItemGlyph } from './itemLook';

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9);

/** Casilla de objeto, como en el inventario de un juego: ícono con el brillo de su color, nombre y contador. */
export function ItemTile({
  look,
  name,
  count,
  tag,
  dim = false,
  onClick,
  title,
}: {
  look: ItemLook;
  name: string;
  /** Contador de la esquina (cantidad o existencias). */
  count?: number;
  /** Etiqueta inferior (precio, "Agotado"). */
  tag?: ReactNode;
  dim?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <span className="rl-slot__body">
      <ItemGlyph look={look} className="rl-slot__icon" />
      <span className="rl-slot__name">{name}</span>
      {count !== undefined && <span className="rl-slot__count kv-num">{count}</span>}
      {tag && <span className="rl-slot__tag">{tag}</span>}
    </span>
  );
  const cls = `rl-slot${dim ? ' rl-slot--dim' : ''}`;
  return onClick ? (
    <button type="button" className={`${cls} kv-state`} style={lookStyle(look)} title={title ?? name} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls} style={lookStyle(look)} title={title ?? name}>
      {body}
    </div>
  );
}

/** Cuadrícula de casillas. Con columnas fijas rellena con casillas vacías hasta completar filas
 *  (mínimo `minSlots`); con `'auto'` se adapta al ancho y no rellena. */
export function ItemGrid({ children, count, columns = 4, minSlots = 8, label }: { children: ReactNode; count: number; columns?: number | 'auto'; minSlots?: number; label: string }) {
  const empty = columns === 'auto' ? 0 : Math.max(minSlots, Math.ceil(count / columns) * columns) - count;
  return (
    <div className={`rl-grid${columns === 'auto' ? ' rl-grid--auto' : ''}`} role="list" aria-label={label} style={columns === 'auto' ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {children}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`empty-${i}`} className="rl-slot rl-slot--empty" aria-hidden>
          <span className="rl-slot__body" />
        </span>
      ))}
    </div>
  );
}

/** Crear o editar un objeto del catálogo, o (con `quantity`) una copia ya entregada. */
export function ItemEditDialog({
  title,
  initial,
  withQuantity = false,
  onClose,
  onSave,
  onDelete,
  deleteLabel = 'Borrar',
}: {
  title: string;
  initial?: CatalogItem & { quantity?: number };
  withQuantity?: boolean;
  onClose: () => void;
  onSave: (item: Item) => Promise<void>;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [value, setValue] = useState(initial?.value === null || initial?.value === undefined ? '' : String(initial.value));
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [unique, setUnique] = useState(initial?.unique ?? false);
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_ITEM_ICON);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_ITEM_COLOR);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, run] = useBusy();

  const save = () =>
    void run(async () => {
      await onSave({ name: name.trim(), description: description.trim(), value: value === '' ? null : Number(value), unique, icon, color, quantity: unique ? 1 : Number(quantity || '0') });
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
                ¿{deleteLabel}? Sí
              </Button>
            ) : (
              <Button variant="text" icon="trash-2" className="rl-danger-text" onClick={() => setConfirmDelete(true)}>
                {deleteLabel}
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
        <div className="rl-item-head">
          <span className="rl-item-preview" style={lookStyle({ icon, color })}>
            <ItemGlyph look={{ icon, color }} size={32} />
          </span>
          <Field className="rl-grow" label="Nombre" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <TextArea label="Descripción (y efecto, si es mágico)" value={description} maxLength={4000} rows={2} onChange={(e) => setDescription(e.target.value)} />
        <div className="rl-two">
          <Field label="Valor (opcional)" inputMode="numeric" value={value} unit="monedas" onChange={(e) => setValue(digits(e.target.value))} />
          {withQuantity && !unique && <Field label="Cantidad" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} />}
        </div>
        <Checkbox label="Único" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
        <p className="rl-hint">De un objeto único solo hay uno: no se apila y su dueño no puede cambiar la cantidad.</p>
        <span className="kv-field__label">Color</span>
        <ColorPicker value={color} onChange={setColor} />
        <span className="kv-field__label">Ícono</span>
        <IconPicker value={icon} color={color} onChange={setIcon} />
      </div>
    </Dialog>
  );
}

/** Marca de objeto único; va donde los demás muestran la cantidad. */
export function UniqueTag() {
  return (
    <Tag small icon="gem" className="rl-unique">
      Único
    </Tag>
  );
}

/** Ficha de un objeto: ícono grande, descripción y lo que se puede hacer con él. */
export function ItemInfo({ item, extra }: { item: CatalogItem; extra?: ReactNode }) {
  return (
    <div className="rl-item-info">
      <span className="rl-item-preview rl-item-preview--big" style={lookStyle(item)}>
        <ItemGlyph look={item} size={40} />
      </span>
      <div className="rl-item-info__text">
        {item.description ? <p className="rl-item-info__desc">{item.description}</p> : <p className="rl-hint">Sin descripción.</p>}
        {item.value !== null && (
          <span className="rl-coins-inline">
            <GameIcon name="coins" size={16} /> Valor {item.value}
          </span>
        )}
        {extra}
      </div>
    </div>
  );
}
