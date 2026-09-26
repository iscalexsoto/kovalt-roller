import { useState } from 'react';
import { MAX_SKILL_NAME_LEN, editSkill, grantSkill, removeSkill, type Character, type RoomSettings } from '../../engine';
import { useBusy } from '../../hooks/useBusy';
import { Button } from '../kv/Button';
import { Field, Stepper } from '../kv/Field';
import { Dialog } from '../kv/Overlay';
import { skillLabel } from './labels';

/** El DM otorga una habilidad (inicial, de arquetipo o corrección) o edita/quita una ganada.
 *  Con `index` edita esa habilidad; sin él, otorga una nueva. Las invariantes las aplica el motor. */
export function SkillDialog({
  sheet,
  settings,
  index,
  onClose,
  onSave,
}: {
  sheet: Character;
  settings: RoomSettings;
  index?: number;
  onClose: () => void;
  onSave: (updated: Character) => Promise<void>;
}) {
  const current = index === undefined ? null : sheet.skills[index] ?? null;
  const [name, setName] = useState(current?.name ?? '');
  const [level, setLevel] = useState(current?.level ?? 2);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, run] = useBusy();
  const valid = name.trim() !== '';

  const commit = (compute: () => Character) =>
    void run(async () => {
      await onSave(compute());
      onClose();
    });
  const save = () => {
    if (!valid || busy) return;
    commit(() => (index === undefined ? grantSkill(sheet, settings, name, level) : editSkill(sheet, settings, index, name, level)));
  };

  return (
    <Dialog
      title={current ? `Editar ${skillLabel(current)}` : 'Otorgar habilidad'}
      icon={current ? 'pencil' : 'sparkles'}
      onClose={onClose}
      actions={
        <>
          {index !== undefined &&
            (confirmRemove ? (
              <Button variant="destructive" disabled={busy} onClick={() => commit(() => removeSkill(sheet, index))}>
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
            {current ? 'Guardar' : 'Otorgar'}
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <Field
          label="Nombre"
          value={name}
          maxLength={MAX_SKILL_NAME_LEN}
          placeholder="Trepar"
          autoFocus
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="rl-settings__row">
          <span className="rl-settings__label">Nivel (dados)</span>
          <Stepper value={level} min={1} max={settings.maxDice} label="Nivel" onChange={(v) => setLevel(Math.round(v))} />
        </div>
        <p className="rl-hint">
          {index === undefined
            ? `${sheet.name} tira ${level}d6 con esta habilidad. Ocupa un slot y no viene de ninguna tirada.`
            : 'Corrige el nombre o el nivel. El origen de la habilidad se conserva.'}
        </p>
      </div>
    </Dialog>
  );
}
