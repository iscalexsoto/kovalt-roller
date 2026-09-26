import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DIFFICULTIES, MAX_FIXED_TARGET, isTerminal, oppositionTotal } from '../../engine';
import type { RollDoc } from '../../data/models';
import { GameIcon } from '../../icons/GameIcon';
import { playStamp } from '../../state/sound';
import { Button, Chip, Segmented } from '../kv/Button';
import { Stepper } from '../kv/Field';
import { Avatar, Tag } from '../kv/Layout';
import { useRoom } from './context';
import { DiceTray, prefersReducedMotion } from './Dice';
import { ACTION_ICON, DIFFICULTY_LABEL, STATE_LABEL, STATE_TONE, actionLabel, isPrimaryAction, oppositionLabel, skillLabel } from './labels';
import type { RollActions } from './useRollActions';

/* Una tirada como duelo: el jugador a la izquierda, el DM a la derecha y una gema en medio que decide. La misma
 * tirada se muestra completa (en la mesa) o plegada en una fila del registro; `RollItem` elige y conserva el estado
 * del reveal aunque cambie de sitio. */

/** Pausa con los dos totales a la vista antes del veredicto, y cuánto sigue abierta una tirada recién resuelta. */
export const VERDICT_BEAT_MS = 400;
const HOLD_OPEN_MS = 8000;

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

const allSix = (dice: readonly number[] | undefined) => Boolean(dice && dice.length > 0 && dice.every((d) => d === 6));

/** La frase de la tirada: «X intenta [acción] para [propósito]» y, resuelta, cómo acabó. */
function Sentence({ roll, who, decided = true }: { roll: RollDoc; who: string; decided?: boolean }) {
  const { record } = roll;
  const core = (
    <>
      <b>{record.action}</b>
      {record.purpose && (
        <>
          {' '}
          para <b>{record.purpose}</b>
        </>
      )}
    </>
  );
  const name = <b>{who}</b>;
  if (record.state === 'retirada') {
    return (
      <p className="rl-duel__sentence">
        {name} retiró: {core}.
      </p>
    );
  }
  if (record.state === 'resuelta' && decided) {
    return (
      <p className="rl-duel__sentence">
        {name} intentó {core}
        {record.result === 'exito' && (
          <>
            {' '}
            y <span className="rl-win">lo consiguió</span>
            {allSix(record.playerRoll?.dice) ? ' con todos 6' : ''}
          </>
        )}
        {record.result === 'fallo' && (
          <>
            {' '}
            y <span className="rl-lose">no lo consiguió</span>
          </>
        )}
        .
      </p>
    );
  }
  return (
    <p className="rl-duel__sentence">
      {name} intenta {core}.
    </p>
  );
}

/** El lado del DM cuando no tira: un objetivo fijo en lugar de dados. */
function FixedTarget({ target, live }: { target: number; live: boolean }) {
  return (
    <span className="rl-pool">
      <span className={`rl-fixed${live ? ' rl-fixed--live' : ''}`} aria-label={`objetivo fijo ${target}`}>
        <GameIcon name="crosshair" strokeWidth={1.8} />
        Objetivo
      </span>
      <span className="rl-total kv-num">{target}</span>
    </span>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <span className="rl-waiting">
      <span className="rl-pulse" />
      {children}
    </span>
  );
}

/** Estado del reveal de una tirada: qué animar y cuándo mostrar el veredicto. Solo anima lo que cambia mientras la
 *  sala está abierta; lo que ya estaba al entrar se pinta quieto. */
function useReveal(roll: RollDoc) {
  const { record } = roll;
  const prevOpp = useRef(Boolean(record.opposition));
  const prevRoll = useRef(Boolean(record.playerRoll));
  const [dmKey, setDmKey] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);
  const [waitingVerdict, setWaitingVerdict] = useState(false);
  const [verdictLive, setVerdictLive] = useState(false);
  const [holding, setHolding] = useState(false);
  const hold = useRef<number | null>(null);

  const hasOpp = Boolean(record.opposition);
  const hasRoll = Boolean(record.playerRoll);
  useEffect(() => {
    if (hasOpp && !prevOpp.current) setDmKey((k) => k + 1);
    if (hasRoll && !prevRoll.current) {
      setPlayerKey((k) => k + 1);
      setWaitingVerdict(true);
      setVerdictLive(true);
      setHolding(true);
    }
    prevOpp.current = hasOpp;
    prevRoll.current = hasRoll;
  }, [hasOpp, hasRoll]);
  useEffect(() => () => {
    if (hold.current) window.clearTimeout(hold.current);
  }, []);

  const onPlayerDone = () => {
    window.setTimeout(() => setWaitingVerdict(false), prefersReducedMotion() ? 0 : VERDICT_BEAT_MS);
    hold.current = window.setTimeout(() => setHolding(false), HOLD_OPEN_MS);
  };
  return { dmKey, playerKey, waitingVerdict, verdictLive, holding, onPlayerDone };
}

type Reveal = ReturnType<typeof useReveal>;

/** La carta completa. */
function Duel({ roll, actions, reveal, compact = false, onDismiss }: { roll: RollDoc; actions: RollActions; reveal: Reveal | null; compact?: boolean; onDismiss?: () => void }) {
  const ctx = useRoom();
  const { record } = roll;
  const character = ctx.characterOf(roll.characterId);
  const who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);
  const dmName = ctx.displayNameOf(ctx.room.dmUid);
  const actor = ctx.actorFor(roll);
  const allowed = actions.allowed(roll);
  const busy = actions.busyId === roll.id;
  const max = ctx.room.settings.maxDice;
  const maxTarget = Math.min(MAX_FIXED_TARGET, max * 6);
  // Lo que el DM prepara: dados a tirar o un objetivo fijo (tabla de dificultad o a mano).
  const [count, setCount] = useState(Math.min(max, Math.max(1, record.skill.level)));
  const [target, setTarget] = useState(Math.min(maxTarget, Math.max(1, record.skill.level * 3)));
  const [mode, setMode] = useState<'dice' | 'fixed'>('dice');

  const opp = record.opposition;
  const oppTotal = opp ? oppositionTotal(opp) : null;
  const mine = record.playerRoll;
  const waiting = reveal?.waitingVerdict ?? false;
  const decided = record.state === 'resuelta' && (record.result === 'exito' || record.result === 'fallo') && !waiting;
  const won = decided && record.result === 'exito';
  const tie = Boolean(oppTotal !== null && mine && oppTotal === mine.total());
  const need = oppTotal !== null ? (ctx.room.settings.tieWinner === 'player' ? oppTotal : oppTotal + 1) : null;
  const sixes = allSix(mine?.dice);
  const faded = record.state === 'rechazada' || record.state === 'retirada';

  // El sello suena una vez por reveal, cuando aparece en vivo.
  const stamped = useRef(0);
  const live = decided && Boolean(reveal?.verdictLive);
  const playerKey = reveal?.playerKey ?? 0;
  useEffect(() => {
    if (!live || stamped.current === playerKey) return;
    stamped.current = playerKey;
    playStamp(won ? (sixes ? 'seis' : 'exito') : 'fallo');
  }, [live, playerKey, won, sixes]);

  // Botones de la fila: lo que no vive dentro de un lado.
  // Mientras caen los dados no hay nada que decidir.
  const rowActions = waiting ? [] : allowed.filter((k) => k !== 'approve' && k !== 'rollOpposition' && k !== 'rollPlayer');

  const playerCta = (() => {
    if (record.state !== 'oposicion' || !need) return null;
    if (actor === 'owner') {
      return (
        <>
          <Button variant="primary" icon="dices" className="rl-cta" disabled={busy} onClick={() => void actions.run(roll, 'rollPlayer')}>
            Tirar {record.skill.level}d6
          </Button>
          <span className="rl-need">
            Necesitas <b>{need}</b>
            {ctx.room.settings.tieWinner === 'player' ? ' · empate a tu favor' : ''}
          </span>
        </>
      );
    }
    return (
      <>
        <Waiting>Le toca a {who}</Waiting>
        <span className="rl-need">
          Necesita <b>{need}</b>
        </span>
      </>
    );
  })();

  const dmCta = (() => {
    if (record.state === 'declarada' || record.state === 'aprobada') {
      if (actor === 'dm') {
        const oppose = record.state === 'declarada';
        const fixed = mode === 'fixed';
        const value = fixed ? target : count;
        const preset = DIFFICULTIES.find((d) => (fixed ? d.target === target : d.dice === count));
        return (
          <>
            <div className="rl-chips rl-difficulty" role="group" aria-label="Dificultad">
              {DIFFICULTIES.map((d) => (
                <Chip
                  key={d.key}
                  selected={preset?.key === d.key}
                  disabled={!fixed && d.dice > max}
                  onClick={() => {
                    setCount(Math.min(max, d.dice));
                    setTarget(Math.min(maxTarget, d.target));
                  }}
                >
                  {DIFFICULTY_LABEL[d.key]} · {fixed ? d.target : `${d.dice}d6`}
                </Chip>
              ))}
            </div>
            <div className="rl-oppose">
              <Segmented
                label="Cómo oponer"
                value={mode}
                options={[
                  { value: 'dice', label: 'Tirar', icon: 'dices' },
                  { value: 'fixed', label: 'Fijo', icon: 'crosshair' },
                ]}
                onChange={setMode}
              />
              <Stepper
                value={value}
                min={1}
                max={fixed ? maxTarget : max}
                compact
                label={fixed ? 'objetivo' : 'dados'}
                onChange={(v) => (fixed ? setTarget(Math.round(v)) : setCount(Math.round(v)))}
              />
            </div>
            <Button
              variant="primary"
              icon={fixed ? 'crosshair' : 'shield'}
              className="rl-cta"
              disabled={busy}
              onClick={() => void actions.oppose(roll, fixed ? { target } : { count })}
            >
              {fixed ? `${oppose ? 'Oponer' : 'Fijar'} objetivo ${target}` : `${oppose ? 'Oponer' : 'Tirar'} ${count}d6`}
            </Button>
          </>
        );
      }
      return <Waiting>{record.state === 'declarada' ? (actor === 'owner' ? 'El DM revisa tu acción' : 'El DM revisa la acción') : 'El DM prepara la oposición'}</Waiting>;
    }
    if (record.state === 'tirada') return <Waiting>Resolviendo…</Waiting>;
    return null;
  })();

  const note = record.counterOffer ? (
    <p className="rl-duel__note">
      <GameIcon name="undo-2" /> El DM propone {skillLabel(record.counterOffer)}
      {record.dmNote ? `: ${record.dmNote}` : '.'}
    </p>
  ) : record.dmNote ? (
    <p className="rl-duel__note">
      <GameIcon name="message-square" /> {record.dmNote}
    </p>
  ) : null;

  return (
    <article className={`rl-duel${compact ? ' rl-duel--compact' : ''}${faded ? ' rl-duel--faded' : ''}`} aria-busy={busy}>
      {!compact && <Sentence roll={roll} who={who} decided={!waiting} />}
      {note}
      <div className="rl-arena">
        <section className={`rl-side${decided ? (won ? ' rl-side--won' : ' rl-side--lost') : ''}`} aria-label={who}>
          <div className="rl-side__head">
            <Avatar initials={initials(who)} size={compact ? 32 : 40} />
            <span className="rl-side__who">
              <span className="rl-side__name">{who}</span>
              <span className="rl-side__skill">
                {skillLabel(record.skill)} · {record.skill.level}d6
              </span>
            </span>
          </div>
          <DiceTray dice={mine?.dice ?? null} count={record.skill.level} animateKey={reveal?.playerKey ?? 0} onDone={reveal?.onPlayerDone} />
          {playerCta && <div className="rl-side__cta">{playerCta}</div>}
        </section>
        <div className={`rl-vs${decided ? (won ? ' rl-vs--exito' : ' rl-vs--fallo') : ''}${decided && reveal?.verdictLive ? ' rl-vs--live' : ''}`} aria-hidden>
          <GameIcon name={decided ? (won ? 'check' : 'x') : 'swords'} />
        </div>
        <section className={`rl-side${decided ? (won ? ' rl-side--lost' : ' rl-side--won') : ''}`} aria-label="DM">
          <div className="rl-side__head">
            <Avatar icon="crown" iconColor="var(--kv-color-warning-text)" size={compact ? 32 : 40} />
            <span className="rl-side__who">
              <span className="rl-side__name">{dmName}</span>
              <span className="rl-side__skill">{opp ? oppositionLabel(opp) : 'Oposición'}</span>
            </span>
          </div>
          {opp?.kind === 'fixed' ? (
            <FixedTarget target={opp.target} live={Boolean(reveal?.dmKey)} />
          ) : (
            <DiceTray dice={opp?.dice.dice ?? null} count={opp ? opp.dice.length : mode === 'fixed' ? 0 : count} muted animateKey={reveal?.dmKey ?? 0} />
          )}
          {dmCta && <div className="rl-side__cta">{dmCta}</div>}
        </section>
      </div>

      {record.narration && <p className="rl-duel__narration">{record.narration}</p>}

      {decided && (
        <div className={`rl-verdict rl-verdict--${won ? 'exito' : 'fallo'}${reveal?.verdictLive ? ' rl-verdict--live' : ''}`} role="status">
          <span className="rl-verdict__main">
            <GameIcon name={won ? 'check' : 'x'} />
            {sixes && won ? '¡Todos 6!' : won ? 'Éxito' : 'Fallo'}
          </span>
          {record.result === 'fallo' && (
            <span className="rl-verdict__extra">
              <GameIcon name="trending-up" /> +1 XP
            </span>
          )}
          {record.applied?.newSkill && (
            <span className="rl-verdict__extra rl-verdict__extra--six">
              <GameIcon name="sparkles" /> {skillLabel(record.applied.newSkill)}
              {record.applied.xpSpent > 0 ? ` (−${record.applied.xpSpent} XP)` : ''}
            </span>
          )}
          {record.advance === 'pendiente' && (
            <span className="rl-verdict__extra rl-verdict__extra--pending">
              <GameIcon name="hourglass" /> avance pendiente
            </span>
          )}
          {tie && <span className="rl-verdict__extra">Empate · {ctx.room.settings.tieWinner === 'player' ? 'gana el jugador' : 'gana la oposición'}</span>}
        </div>
      )}

      {(rowActions.length > 0 || (onDismiss && decided)) && (
        <div className="rl-duel__actions">
          {onDismiss && decided && (
            <Button variant="text" quiet dense icon="x" className="rl-duel__dismiss" onClick={onDismiss}>
              Quitar de la mesa
            </Button>
          )}
          {rowActions.map((k) => (
            <Button
              key={k}
              variant={isPrimaryAction(k) ? 'primary' : 'text'}
              quiet={k === 'withdraw' || k === 'reject'}
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

/** Etiqueta de estado de una fila plegada: el resultado cuando lo hay, el estado si no. */
function stateTag(roll: RollDoc) {
  const { record } = roll;
  if (record.state === 'resuelta') {
    if (record.result === 'exito') return { label: 'Éxito', tone: 'success' as const };
    if (record.result === 'fallo') return { label: 'Fallo', tone: 'error' as const };
    return { label: 'Narrada', tone: 'neutral' as const };
  }
  return { label: STATE_LABEL[record.state], tone: STATE_TONE[record.state] };
}

/** Una tirada del registro: plegada en una fila o abierta como duelo. */
/** `hero`: va completa en la mesa. `onDismiss`: es la escena que se queda por ser la última resuelta y se puede plegar
 *  a mano. */
export function RollItem({ roll, actions, hero, onDismiss }: { roll: RollDoc; actions: RollActions; hero: boolean; onDismiss?: () => void }) {
  const ctx = useRoom();
  const reveal = useReveal(roll);
  const [open, setOpen] = useState(false);
  const { record } = roll;
  const character = ctx.characterOf(roll.characterId);
  const who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);

  if (hero || reveal.holding) return <Duel roll={roll} actions={actions} reveal={reveal} onDismiss={hero ? onDismiss : undefined} />;

  const tag = stateTag(roll);
  const faded = record.state === 'rechazada' || record.state === 'retirada';
  const opp = record.opposition;
  const mine = record.playerRoll;
  const won = record.result === 'exito';
  return (
    <div className={`rl-entry${faded ? ' rl-entry--faded' : ''}`} aria-expanded={open}>
      <button type="button" className="rl-entry__main kv-state" onClick={() => setOpen((o) => !o)}>
        <Avatar initials={initials(who)} size={32} />
        <span className="rl-entry__text">
          <Sentence roll={roll} who={who} />
        </span>
        {opp && mine && (
          <span className="rl-entry__score kv-num">
            <span className={won ? 'rl-entry__win' : ''}>{mine.total()}</span> vs <span className={won ? '' : 'rl-entry__win'}>{oppositionTotal(opp)}</span>
          </span>
        )}
        {record.applied?.newSkill ? (
          <Tag small veta icon="sparkles">
            {skillLabel(record.applied.newSkill)}
          </Tag>
        ) : (
          <Tag small veta={tag.tone === 'veta'} className={`rl-tone rl-tone--${tag.tone}`}>
            {tag.label}
          </Tag>
        )}
        <GameIcon name="chevron-down" className="rl-entry__chev" />
      </button>
      <div className="rl-entry__detail">
        <div>{open && <Duel roll={roll} actions={actions} reveal={null} compact />}</div>
      </div>
    </div>
  );
}

/** Qué tiradas van completas en la mesa: las vivas (o con avance pendiente). Si no hay ninguna, la tirada más
 *  reciente se queda como escena mientras esté resuelta y nadie la haya quitado; una rechazada o retirada posterior
 *  ya no la trae de vuelta. `scene` es esa escena, para ofrecer quitarla. */
export function tableRolls(rolls: readonly RollDoc[], dismissed: string | null): { hero: Set<string>; scene: string | null } {
  const hero = new Set(rolls.filter((r) => !isTerminal(r.record.state) || r.record.advance === 'pendiente').map((r) => r.id));
  const last = rolls[0];
  if (hero.size === 0 && last && last.record.state === 'resuelta' && last.id !== dismissed) {
    hero.add(last.id);
    return { hero, scene: last.id };
  }
  return { hero, scene: null };
}
