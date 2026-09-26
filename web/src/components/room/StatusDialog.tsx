import { useState } from 'react';
import { MAX_STATUS_NAME_LEN, MAX_STATUS_RATING, removeStatus, setStatus, type Character } from '../../engine';
import { useBusy } from '../../hooks/useBusy';
import { Button } from '../kv/Button';
import { Field, Stepper } from '../kv/Field';
import { Dialog } from '../kv/Overlay';
import { signed, statusLabel } from './labels';

/** El DM pone un estado («−4 Lloviendo») o corrige/quita uno. Con `index` edita; con `null`, añade. */
export function StatusDialog({ sheet, index, onClose, onSave }: { sheet: Character; index: number | null; onClose: () => void; onSave: (updated: Character) => Promise<void> }) {
  const current = index === null ? null : (sheet.statuses[index] ?? null);
  const [name, setName] = useState(current?.name ?? '');
  const [rating, setRating] = useState(current?.rating ?? -1);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, run] = useBusy();
  const valid = name.trim() !== '';

  const commit = (compute: () => Character) =>
    void run(async () => {
      await onSave(compute());
      onClose();
    });
  const save = () => valid && !busy && commit(() => setStatus(sheet, index, name, rating));

  return (
    <Dialog
      title={current ? `Editar ${statusLabel(current)}` : 'Nuevo estado'}
      icon="activity"
      onClose={onClose}
      actions={
        <>
          {index !== null &&
            (confirmRemove ? (
              <Button variant="destructive" disabled={busy} onClick={() => commit(() => removeStatus(sheet, index))}>
                ¿Quitar? Sí
              </Button>
            ) : (
              <Button variant="text" icon="trash-2" className="rl-danger-text" disabled={busy} onClick={() => setConfirmRemove(true)}>
                Quitar
              </Button>
            ))}
          <span className="rl-grow" />
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={save}>
            {current ? 'Guardar' : 'Poner'}
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <div className="rl-settings__row">
          <span className="rl-settings__label">Valor</span>
          <Stepper value={rating} min={-MAX_STATUS_RATING} max={MAX_STATUS_RATING} onChange={(v) => setRating(Math.round(v))} />
        </div>
        <Field
          label="Nombre"
          value={name}
          maxLength={MAX_STATUS_NAME_LEN}
          placeholder="Lloviendo"
          autoFocus
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <p className="rl-hint">
          Se escribe «{signed(rating)} {name.trim() || 'Nombre'}». Al oponer, eliges qué estados aplican y su suma modifica el total de {sheet.name}; el avance sigue
          saliendo de los dados. Con 0 es solo narrativo.
        </p>
      </div>
    </Dialog>
  );
}
