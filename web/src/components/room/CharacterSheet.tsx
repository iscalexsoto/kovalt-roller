import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { slotUsage } from '../../engine';
import { dmUpdateSheet, updateCharacterTexts } from '../../data/characters';
import type { CharacterDoc } from '../../data/models';
import { useBusy } from '../../hooks/useBusy';
import { Button, IconButton } from '../kv/Button';
import { Field, TextArea } from '../kv/Field';
import { EmptyState, KickerDivider } from '../kv/Layout';
import { useRoom } from './context';
import { Inventory } from './Inventory';
import { skillLabel, skillLabelText, skillName } from './labels';

type SheetTexts = { name: string; description: string; notes: string };

/** Sección de la hoja que su dueño edita en su sitio: lápiz → campo con Guardar y Cancelar.
 *  Enter guarda (Ctrl+Enter en textos largos) y Escape cancela. */
function InlineText({
  field,
  label,
  value,
  canEdit,
  multiline = false,
  rows,
  maxLength,
  addLabel,
  children,
}: {
  field: keyof SheetTexts;
  label: string;
  value: string;
  canEdit: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength: number;
  /** Texto del botón cuando la sección está vacía; sin él, la sección vacía no se muestra. */
  addLabel?: string;
  children: ReactNode;
}) {
  const ctx = useRoom();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const required = field === 'name';

  if (draft === null) {
    if (!value) {
      return canEdit && addLabel ? (
        <Button variant="text" icon="plus" dense className="rl-editable__add" onClick={() => setDraft('')}>
          {addLabel}
        </Button>
      ) : null;
    }
    return (
      <div className="rl-editable">
        <div className="rl-grow">{children}</div>
        {canEdit && <IconButton icon="pencil" small label={`Editar ${label.toLowerCase()}`} onClick={() => setDraft(value)} />}
      </div>
    );
  }

  const cancel = () => setDraft(null);
  const invalid = required && !draft.trim();
  const save = () => {
    if (busy || invalid) return;
    if (draft === value) return cancel();
    void run(() => updateCharacterTexts(ctx.room.id, ctx.uid, { [field]: draft })).then((ok) => ok && cancel());
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };
  const common = {
    'aria-label': label,
    value: draft,
    maxLength,
    autoFocus: true,
    disabled: busy,
    onKeyDown,
  };

  return (
    <div className="rl-editable rl-editable--open">
      {multiline ? (
        <TextArea {...common} rows={rows} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Field {...common} error={invalid} onChange={(e) => setDraft(e.target.value)} />
      )}
      <div className="rl-editable__actions">
        <Button variant="text" quiet dense onClick={cancel}>
          Cancelar
        </Button>
        <Button variant="primary" dense disabled={busy || invalid} onClick={save}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

/** Hoja del personaje: XP, habilidades, inventario y notas. */
export function CharacterSheet({ character }: { character: CharacterDoc }) {
  const ctx = useRoom();
  const { sheet } = character;
  const isOwner = character.id === ctx.uid;
  const usage = slotUsage(sheet, ctx.room.settings);
  const [busy, run] = useBusy();

  return (
    <section className="rl-sheet" aria-label={`Ficha de ${sheet.name}`}>
      <header className="rl-sheet__head">
        <InlineText field="name" label="Nombre" value={sheet.name} canEdit={isOwner} maxLength={60}>
          <h2 className="rl-sheet__name">{sheet.name}</h2>
        </InlineText>
        <span className="rl-sheet__player">Jugador: {ctx.displayNameOf(character.ownerUid)}</span>
      </header>
      <InlineText field="description" label="Descripción" value={sheet.description} canEdit={isOwner} multiline rows={3} maxLength={4000} addLabel="Añadir descripción">
        <p className="rl-sheet__desc">{sheet.description}</p>
      </InlineText>

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
              <span className="rl-skill__name">{skillName(s.name)}</span>
              <span className="rl-skill__from">{s.permanent ? 'Permanente' : s.derivedFrom ? `De ${skillLabelText(s.derivedFrom)}` : skillLabel(s)}</span>
            </span>
          </li>
        ))}
      </ul>

      <Inventory character={character} />

      {(sheet.notes || isOwner) && <KickerDivider className="rl-sheet__kicker">Notas</KickerDivider>}
      <InlineText field="notes" label="Notas" value={sheet.notes} canEdit={isOwner} multiline rows={6} maxLength={20000} addLabel="Añadir notas">
        <p className="rl-sheet__notes">{sheet.notes}</p>
      </InlineText>
    </section>
  );
}

export function NoCharacter({ name }: { name: string }) {
  return <EmptyState register="empty" icon="user-round" title={`${name} aún no tiene personaje`} body="Aparecerá aquí en cuanto lo cree." />;
}
