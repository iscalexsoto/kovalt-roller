import { useState } from 'react';
import { skillRefFrom, type AdvancementChoice, type AdvancementOption, type Character, type SkillRef } from '../../engine';
import { Button, Chip } from '../kv/Button';
import { Field } from '../kv/Field';
import { Dialog } from '../kv/Overlay';
import { Select } from '../kv/Select';
import { Tag } from '../kv/Layout';
import { skillLabel, skillLabelText, skillOptions } from './labels';

/* Diálogos del flujo de tirada (useRollActions.tsx y useDeclare.tsx los montan y esperan su resultado). */

export const MAX_ACTION_LEN = 500;
export const MAX_PURPOSE_LEN = 200;

/** Declarar (o volver a declarar) una acción completando la frase:
 *  «Nombre intenta [acción] para [propósito] con Habilidad N». */
export function DeclareDialog({
  sheet,
  initialAction = '',
  initialPurpose = '',
  initialSkill = 0,
  onClose,
  onSubmit,
}: {
  sheet: Character;
  initialAction?: string;
  initialPurpose?: string;
  initialSkill?: number;
  onClose: () => void;
  onSubmit: (action: string, purpose: string | null, skill: SkillRef) => void;
}) {
  const [action, setAction] = useState(initialAction);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [skill, setSkill] = useState(initialSkill < sheet.skills.length ? initialSkill : 0);
  const valid = action.trim() !== '';
  const chosen = sheet.skills[skill]!;
  const submit = () => valid && onSubmit(action.trim(), purpose.trim() || null, skillRefFrom(sheet, skill));

  const a = action.trim() || '…';
  const p = purpose.trim();
  const core = (
    <>
      <b>{a}</b>
      {p && (
        <>
          {' '}
          para <b>{p}</b>
        </>
      )}
    </>
  );

  return (
    <Dialog
      title="Actuar"
      icon="dices"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="dices" disabled={!valid} onClick={submit}>
            Declarar
          </Button>
        </>
      }
    >
      <div className="rl-declare">
        <div className="rl-chips" role="group" aria-label="Habilidad">
          {sheet.skills.map((s, i) => (
            <Chip key={i} selected={i === skill} onClick={() => setSkill(i)}>
              {skillLabel(s)} · {s.level}d6
            </Chip>
          ))}
        </div>
        <div className="rl-declare__line">
          <span className="rl-declare__who">{sheet.name}</span>
          <span className="rl-declare__fixed">intenta</span>
          <Field
            aria-label="Acción"
            className="rl-declare__field"
            dense
            value={action}
            maxLength={MAX_ACTION_LEN}
            placeholder="patear la puerta"
            autoFocus
            autoComplete="off"
            onChange={(e) => setAction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <span className="rl-declare__fixed">para</span>
          <Field
            aria-label="Propósito (opcional)"
            className="rl-declare__field"
            dense
            value={purpose}
            maxLength={MAX_PURPOSE_LEN}
            placeholder="entrar al almacén (opcional)"
            autoComplete="off"
            onChange={(e) => setPurpose(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <span className="rl-declare__fixed">con</span>
          <span className="rl-declare__who">{skillLabel(chosen)}</span>
        </div>
        <div className="rl-preview" aria-live="polite">
          <div className="rl-preview__row">
            <Tag small className="rl-tone rl-tone--info">
              Declarada
            </Tag>
            <span>
              <b>{sheet.name}</b> intenta {core}.
            </span>
          </div>
          <div className="rl-preview__row">
            <Tag small className="rl-tone rl-tone--success">
              Éxito
            </Tag>
            <span>
              <b>{sheet.name}</b> intentó {core} y <b>lo consiguió</b>.
            </span>
          </div>
          <div className="rl-preview__row">
            <Tag small className="rl-tone rl-tone--error">
              Fallo
            </Tag>
            <span>
              <b>{sheet.name}</b> intentó {core} y <b>no lo consiguió</b>.
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function CounterOfferDialog({ sheet, current, onClose, onSubmit }: { sheet: Character; current: number; onClose: () => void; onSubmit: (skill: SkillRef, note: string) => void }) {
  const options = skillOptions(sheet, current);
  const [skill, setSkill] = useState(options[0]?.value ?? '0');
  const [note, setNote] = useState('');
  return (
    <Dialog
      title="Proponer otra habilidad"
      icon="undo-2"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={options.length === 0} onClick={() => onSubmit(skillRefFrom(sheet, Number(skill)), note.trim())}>
            Proponer
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p>El personaje no tiene otra habilidad que proponer.</p>
      ) : (
        <div className="kv-form">
          <Select label="Habilidad" value={skill} options={options} onChange={setSkill} />
          <Field label="Nota para el jugador (opcional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </Dialog>
  );
}

/** `undefined` = decidir más tarde; `null` = renunciar a la habilidad nueva (el XP del fallo se aplica igual). */
export type AdvancementPick = AdvancementChoice | null | undefined;

export function AdvancementDialog({ option, sheet, forDm, onDone }: { option: AdvancementOption; sheet: Character; forDm: boolean; onDone: (pick: AdvancementPick) => void }) {
  const [name, setName] = useState('');
  const [replace, setReplace] = useState<string>('');
  const valid = name.trim() !== '' && (!option.slotsFull || replace !== '');
  const replaceOptions = sheet.skills.map((s, i) => ({ value: String(i), label: skillLabel(s) })).filter((o) => o.value !== '0');
  return (
    <Dialog
      title={option.natural ? '¡Todos 6!' : 'Puedes avanzar gastando XP'}
      icon="sparkles"
      narrow={false}
      onClose={() => onDone(undefined)}
      actions={
        <>
          <Button variant="text" quiet onClick={() => onDone(undefined)}>
            Decidir más tarde
          </Button>
          <Button variant="text" onClick={() => onDone(null)}>
            Renunciar
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onDone({ newSkillName: name.trim(), slot: option.slotsFull ? { kind: 'replace', index: Number(replace) } : { kind: 'append' } })
            }
          >
            {option.natural ? 'Aprender' : `Gastar ${option.xpCost} XP y aprender`}
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <p>
          {forDm ? 'Decides por el jugador. ' : ''}
          {option.natural
            ? `Ganas una habilidad nueva de nivel ${option.newLevel}, derivada de ${skillLabelText(option.sourceLabel)}.`
            : `Convierte ${option.xpCost} dado(s) en 6 gastando ${option.xpCost} XP (disponibles: ${option.xpAvailable}) y gana una habilidad de nivel ${option.newLevel} derivada de ${skillLabelText(option.sourceLabel)}. El resultado de la tirada no cambia.`}
        </p>
        <Field label="Nombre de la habilidad" value={name} maxLength={40} autoFocus unit={String(option.newLevel)} onChange={(e) => setName(e.target.value)} />
        {option.slotsFull && (
          <Select
            label="Todos los slots están ocupados: ¿cuál reemplazas?"
            value={replace}
            placeholder="Elige una habilidad"
            options={replaceOptions}
            onChange={setReplace}
          />
        )}
      </div>
    </Dialog>
  );
}
