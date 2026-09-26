import { useState } from 'react';
import { skillRefFrom } from '../../engine';
import { useLiveQuery } from '../../data/hooks';
import { rollFrom, type RollDoc } from '../../data/models';
import { declareRoll, rollsQuery } from '../../data/rolls';
import { useBusy } from '../../hooks/useBusy';
import { GameIcon } from '../../icons/GameIcon';
import { Button } from '../kv/Button';
import { TextArea } from '../kv/Field';
import { Avatar, EmptyState, KickerDivider, Tag } from '../kv/Layout';
import { Select } from '../kv/Select';
import { useRoom } from './context';
import { DiceRow } from './Dice';
import { ACTION_ICON, STATE_LABEL, STATE_TONE, actionLabel, isPrimaryAction, skillLabel, skillOptions } from './labels';
import { useRollActions } from './useRollActions';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

function RollCard({ roll, actions }: { roll: RollDoc; actions: ReturnType<typeof useRollActions> }) {
  const ctx = useRoom();
  const { record } = roll;
  const character = ctx.characterOf(roll.characterId);
  const who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);
  const allowed = actions.allowed(roll);
  const busy = actions.busyId === roll.id;
  const faded = record.state === 'rechazada' || record.state === 'retirada';
  const tone = STATE_TONE[record.state];
  const applied = record.applied;

  return (
    <article className={`rl-roll${faded ? ' rl-roll--faded' : ''}`} aria-busy={busy}>
      <header className="rl-roll__head">
        <Avatar initials={initials(who)} size={32} />
        <div className="rl-roll__who">
          <span className="rl-roll__name">{who}</span>
          <span className="rl-roll__skill">con {skillLabel(record.skill)}</span>
        </div>
        <Tag small veta={tone === 'veta'} className={`rl-tone rl-tone--${tone}`}>
          {STATE_LABEL[record.state]}
        </Tag>
      </header>

      <p className="rl-roll__action">“{record.action}”</p>

      {record.counterOffer && (
        <p className="rl-roll__note">
          <GameIcon name="undo-2" /> El DM propone {skillLabel(record.counterOffer)}
          {record.dmNote ? `: ${record.dmNote}` : '.'}
        </p>
      )}
      {!record.counterOffer && record.dmNote && (
        <p className="rl-roll__note">
          <GameIcon name="message-square" /> {record.dmNote}
        </p>
      )}
      {record.narration && <p className="rl-roll__narration">{record.narration}</p>}

      {(record.opposition || record.playerRoll) && (
        <div className="rl-roll__dice">
          {record.opposition && <DiceRow label="Oposición" roll={record.opposition} muted />}
          {record.playerRoll && <DiceRow label="Tirada" roll={record.playerRoll} />}
        </div>
      )}

      {(record.result === 'exito' || record.result === 'fallo') && (
        <div className={`rl-result rl-result--${record.result}`}>
          <GameIcon name={record.result === 'exito' ? 'check' : 'x'} />
          <span className="rl-result__main">{record.result === 'exito' ? 'Éxito' : 'Fallo'}</span>
          {record.result === 'fallo' && <span className="rl-result__extra">+1 XP</span>}
          {applied?.newSkill && (
            <span className="rl-result__extra">
              <GameIcon name="sparkles" /> {skillLabel(applied.newSkill)}
              {applied.xpSpent > 0 ? ` (−${applied.xpSpent} XP)` : ''}
            </span>
          )}
          {record.advance === 'pendiente' && (
            <span className="rl-result__extra rl-result__pending">
              <GameIcon name="hourglass" /> avance pendiente
            </span>
          )}
        </div>
      )}

      {allowed.length > 0 && (
        <div className="rl-roll__actions">
          {allowed.map((k) => (
            <Button
              key={k}
              variant={isPrimaryAction(k) ? 'primary' : k === 'withdraw' || k === 'reject' ? 'text' : 'outlined'}
              dense
              icon={ACTION_ICON[k]}
              disabled={busy}
              onClick={() => void actions.run(roll, k)}
            >
              {actionLabel(k, roll)}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/** Barra para declarar una acción (solo jugadores con personaje). */
function DeclareBar() {
  const ctx = useRoom();
  const sheet = ctx.myCharacter?.sheet;
  const [action, setAction] = useState('');
  const [skill, setSkill] = useState('0');
  const [busy, run] = useBusy();
  if (!sheet) return null;
  const submit = () =>
    void run(async () => {
      await declareRoll(ctx.room.id, ctx.uid, action, null, skillRefFrom(sheet, Number(skill)));
      setAction('');
    });
  return (
    <div className="rl-declare">
      <TextArea
        label="¿Qué intentas hacer?"
        dense
        rows={2}
        value={action}
        maxLength={500}
        onChange={(e) => setAction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && action.trim()) submit();
        }}
      />
      <div className="rl-declare__row">
        <Select label="Habilidad" dense value={skill} options={skillOptions(sheet)} onChange={setSkill} className="rl-grow" />
        <Button variant="primary" icon="dices" disabled={!action.trim() || busy} onClick={submit}>
          Declarar
        </Button>
      </div>
    </div>
  );
}

/** Registro de tiradas en vivo: lo que me toca arriba, el resto debajo. */
export function RollLog() {
  const ctx = useRoom();
  const actions = useRollActions();
  const rolls = useLiveQuery(`rolls/${ctx.room.id}/${ctx.room.dmUid}`, rollsQuery(ctx.room.id), (id, data) => rollFrom(id, data, ctx.room.dmUid));
  const list = rolls.data ?? [];
  const mine = list.filter((r) => actions.allowed(r).some(isPrimaryAction));
  const rest = list.filter((r) => !mine.includes(r));

  return (
    <section className="rl-log" aria-label="Tiradas">
      {!ctx.isDm && <DeclareBar />}
      {rolls.data === undefined && rolls.error ? (
        <EmptyState register="error" title="No pudimos cargar las tiradas" body="Revisa tu conexión." />
      ) : rolls.data !== undefined && list.length === 0 ? (
        <EmptyState
          register="empty"
          icon="dices"
          title="La mesa está en silencio"
          body={ctx.isDm ? 'Cuando alguien declare una acción, aparecerá aquí para que la apruebes.' : 'Declara qué intenta tu personaje y el DM decidirá.'}
        />
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <KickerDivider mark>Te toca</KickerDivider>
              {mine.map((r) => (
                <RollCard key={r.id} roll={r} actions={actions} />
              ))}
            </>
          )}
          {rest.length > 0 && (
            <>
              <KickerDivider>Registro</KickerDivider>
              {rest.map((r) => (
                <RollCard key={r.id} roll={r} actions={actions} />
              ))}
            </>
          )}
        </>
      )}
      {actions.dialogs}
    </section>
  );
}
