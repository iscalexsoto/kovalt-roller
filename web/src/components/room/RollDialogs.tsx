import { useState } from 'react';
import { skillRefFrom, type AdvancementChoice, type AdvancementOption, type Character, type SkillRef } from '../../engine';
import { Button } from '../kv/Button';
import { Field, Stepper, TextArea } from '../kv/Field';
import { Dialog } from '../kv/Overlay';
import { Select } from '../kv/Select';
import { skillLabel, skillLabelText, skillOptions } from './labels';

/* Diálogos del flujo de tirada (useRollActions.tsx los monta y espera su resultado). */

/** Declarar (o volver a declarar) una acción: texto + habilidad. */
export function DeclareDialog({
  sheet,
  initialAction = '',
  initialSkill = 0,
  onClose,
  onSubmit,
}: {
  sheet: Character;
  initialAction?: string;
  initialSkill?: number;
  onClose: () => void;
  onSubmit: (action: string, skill: SkillRef) => void;
}) {
  const [action, setAction] = useState(initialAction);
  const [skill, setSkill] = useState(initialSkill < sheet.skills.length ? initialSkill : 0);
  const valid = action.trim() !== '';
  return (
    <Dialog
      title="Declarar acción"
      icon="pencil"
      narrow={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSubmit(action.trim(), skillRefFrom(sheet, skill))}>
            Declarar
          </Button>
        </>
      }
    >
      <div className="kv-form">
        <TextArea label="¿Qué intentas hacer?" value={action} maxLength={500} rows={3} autoFocus onChange={(e) => setAction(e.target.value)} />
        <Select label="Habilidad" value={String(skill)} options={skillOptions(sheet)} onChange={(v) => setSkill(Number(v))} />
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

export function OppositionDialog({ initial, max, onClose, onSubmit }: { initial: number; max: number; onClose: () => void; onSubmit: (count: number) => void }) {
  const [count, setCount] = useState(Math.min(Math.max(1, initial), max));
  return (
    <Dialog
      title="Dados de oposición"
      icon="shield"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="dices" onClick={() => onSubmit(count)}>
            Tirar {count}d6
          </Button>
        </>
      }
    >
      <div className="kv-form rl-opposition">
        <Stepper value={count} min={1} max={max} label="Dados" onChange={(v) => setCount(Math.round(v))} />
        <p className="rl-hint">El resultado será visible para el jugador antes de su tirada.</p>
      </div>
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
