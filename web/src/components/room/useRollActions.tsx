import { useCallback, useState, type ReactNode } from 'react';
import {
  CryptoDice,
  advancementOption,
  allowedActions,
  fixedOpposition,
  roll as rollDice,
  type AdvancementChoice,
  type FlowAction,
  type FlowActionKind,
  modifierOf,
  type Opposition,
  type SkillRef,
  type Status,
} from '../../engine';
import type { RollDoc } from '../../data/models';
import { act, applyAdvance, outcomeOf } from '../../data/rolls';
import { toast, toastError } from '../../state/toast';
import { useDialogs } from '../dialogs';
import { useRoom } from './context';
import { revealDuration } from './Dice';
import { VERDICT_BEAT_MS } from './Duel';
import { skillLabel, statusLabel } from './labels';
import { AdvancementDialog, CounterOfferDialog, DeclareDialog } from './RollDialogs';

const dice = new CryptoDice();

/** Cómo opone el DM: tirando `count` dados o con un objetivo fijo. */
export type OppositionChoice = ({ count: number } | { target: number }) & { statuses?: Status[] };

/** Lo que tarda el sello en aparecer tras el reveal (--kv-duration-long) más un respiro antes de abrir un diálogo. */
const STAMP_MS = 320 + 300;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export interface RollActions {
  allowed: (roll: RollDoc) => FlowActionKind[];
  run: (roll: RollDoc, kind: FlowActionKind) => Promise<void>;
  /** El DM opone `count` dados o fija un objetivo (`target`): desde `declarada` aprueba y opone en un gesto;
   *  desde `aprobada` solo opone. */
  oppose: (roll: RollDoc, choice: OppositionChoice) => Promise<void>;
  busyId: string | null;
  dialogs: ReactNode;
}

// ---------- acciones ----------

/** Ejecuta las acciones del flujo de tirada desde la interfaz. Devuelve `run` y los diálogos a montar. */
export function useRollActions(): RollActions {
  const ctx = useRoom();
  const { confirm, prompt, dialogs: basic } = useDialogs();
  const [custom, setCustom] = useState<ReactNode>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Monta un diálogo propio y espera su resultado. */
  const ask = useCallback(
    <T,>(render: (done: (v: T | undefined) => void) => ReactNode) =>
      new Promise<T | undefined>((resolve) => {
        const done = (v: T | undefined) => {
          setCustom(null);
          resolve(v);
        };
        setCustom(render(done));
      }),
    [],
  );

  const allowed = useCallback((roll: RollDoc) => allowedActions(roll.record, ctx.actorFor(roll)), [ctx]);

  const perform = (roll: RollDoc, action: FlowAction) => act(ctx.room, roll, action, ctx.actorFor(roll), ctx.uid);

  /** Aplica XP y, si procede, pregunta por la habilidad nueva. */
  const settle = async (roll: RollDoc) => {
    const character = ctx.characterOf(roll.characterId);
    if (!character) return;
    const { record } = roll;
    const option = advancementOption(character.sheet, ctx.room.settings, record.playerRoll!, outcomeOf(roll, ctx.room.settings), record.skill.index);

    let choice: AdvancementChoice | null = null;
    if (option) {
      const picked = await ask<AdvancementChoice | null>((done) => (
        <AdvancementDialog option={option} sheet={character.sheet} forDm={ctx.isDm} onDone={(p) => done(p === undefined ? undefined : p)} />
      ));
      if (picked === undefined) return; // Decidir más tarde: el avance queda pendiente.
      choice = picked;
    }
    const result = await applyAdvance(ctx.room, roll, character, choice, ctx.actorFor(roll), ctx.uid);
    if (result.newSkill) toast(`Nueva habilidad: ${skillLabel(result.newSkill)}`);
    else if (result.xpGained > 0) toast(`+${result.xpGained} XP`);
  };

  const resolveRoll = (roll: RollDoc) => perform(roll, { kind: 'resolve', tieWinner: ctx.room.settings.tieWinner });

  const guarded = async (roll: RollDoc, work: () => Promise<void>) => {
    setBusyId(roll.id);
    try {
      await work();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const run = (roll: RollDoc, kind: FlowActionKind) =>
    guarded(roll, async () => {
      switch (kind) {
        case 'approve':
        case 'acceptCounterOffer':
          await perform(roll, { kind });
          break;
        case 'withdraw':
          if (await confirm('Retirar la declaración', 'La tirada queda en el registro como retirada.', { okLabel: 'Retirar', danger: true })) {
            await perform(roll, { kind });
          }
          break;
        case 'reject': {
          const note = await prompt('Rechazar declaración', 'Motivo (opcional)', { okLabel: 'Rechazar' });
          if (note !== null) await perform(roll, { kind, note });
          break;
        }
        case 'narrate': {
          const narration = await prompt('Resolver sin tirada', '¿Qué ocurre?', { okLabel: 'Narrar', multiline: true, required: true, maxLength: 4000 });
          if (narration !== null) await perform(roll, { kind, narration });
          break;
        }
        case 'counterOffer': {
          const sheet = ctx.characterOf(roll.characterId)?.sheet;
          if (!sheet) return;
          const res = await ask<{ skill: SkillRef; note: string }>((done) => (
            <CounterOfferDialog sheet={sheet} current={roll.record.skill.index} onClose={() => done(undefined)} onSubmit={(skill, note) => done({ skill, note })} />
          ));
          if (res) await perform(roll, { kind, skill: res.skill, note: res.note || null });
          break;
        }
        case 'redeclare': {
          const sheet = ctx.characterOf(roll.characterId)?.sheet;
          if (!sheet) return;
          const res = await ask<{ action: string; purpose: string | null; skill: SkillRef }>((done) => (
            <DeclareDialog
              sheet={sheet}
              initialAction={roll.record.action}
              initialPurpose={roll.record.purpose ?? ''}
              initialSkill={roll.record.skill.index}
              onClose={() => done(undefined)}
              onSubmit={(action, purpose, skill) => done({ action, purpose, skill })}
            />
          ));
          if (res) await perform(roll, { kind, action: res.action, purpose: res.purpose, skill: res.skill });
          break;
        }
        case 'rollOpposition':
          await perform(roll, { kind, opposition: { kind: 'dice', dice: rollDice(roll.record.skill.level, ctx.room.settings.maxDice, dice) } });
          break;
        case 'rollPlayer': {
          const rolled = await perform(roll, { kind, dice: rollDice(roll.record.skill.level, ctx.room.settings.maxDice, dice) });
          const resolved = await resolveRoll(rolled);
          // El diálogo de avance espera a que caigan los dados y el sello.
          await sleep(revealDuration(roll.record.skill.level) + VERDICT_BEAT_MS + STAMP_MS);
          await settle(resolved);
          break;
        }
        case 'resolve':
          await settle(await resolveRoll(roll));
          break;
        case 'applyAdvance':
          await settle(roll);
          break;
      }
    });

  const oppose = (roll: RollDoc, choice: OppositionChoice) =>
    guarded(roll, async () => {
      const opposition: Opposition = 'target' in choice ? fixedOpposition(choice.target) : { kind: 'dice', dice: rollDice(choice.count, ctx.room.settings.maxDice, dice) };
      const statuses = choice.statuses ?? [];
      const approved = roll.record.state === 'declarada' ? await perform(roll, { kind: 'approve' }) : roll;
      await perform(approved, { kind: 'rollOpposition', opposition, modifier: modifierOf(statuses), modifierNote: statuses.map(statusLabel).join(', ') || null });
    });

  return {
    allowed,
    run,
    oppose,
    busyId,
    dialogs: (
      <>
        {basic}
        {custom}
      </>
    ),
  };
}
