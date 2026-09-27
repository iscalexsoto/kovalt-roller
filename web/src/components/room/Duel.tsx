import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DIFFICULTIES, MAX_FIXED_TARGET, modifierOf, oppositionTotal, type Status } from '../../engine';
import type { RollDoc } from '../../data/models';
import { GameIcon } from '../../icons/GameIcon';
import { playDice, playSeal, playTick } from '../../state/sound';
import { useAxes } from '../../state/theme';
import { Button, Chip, Segmented } from '../kv/Button';
import { Stepper } from '../kv/Field';
import { Avatar, Tag } from '../kv/Layout';
import { Frame } from '../Frame';
import { useRoom } from './context';
import { DiceRow } from './Dice';
import * as R from './reveal';
import { StatusPickDialog } from './RollDialogs';
import { SealMark, VerdictLine, type Outcome } from './Verdict';
import { ACTION_ICON, DIFFICULTY_LABEL, STATE_LABEL, STATE_TONE, actionLabel, isPrimaryAction, modifierSteps, oppositionLabel, signed, skillLabel, statusLabel } from './labels';
import type { RollActions } from './useRollActions';

/* Una tirada como duelo: la carta del jugador, el centro (el sello) y la carta del DM. Cada carta lleva sus dados con
 * la suma cruda y, debajo, los estados aplicados y el TOTAL final, el número protagonista. La misma tirada se muestra
 * completa (en la mesa, dentro del Marco) o plegada en una fila del registro; `RollItem` elige y conserva el estado
 * del reveal aunque cambie de sitio. */

/** Cuánto sigue abierta una tirada recién resuelta. */
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

/** Con más estados que esto, el DM los elige en un diálogo en lugar de chips. */
const MAX_STATUS_CHIPS = 4;

const allSix = (dice: readonly number[] | undefined) => Boolean(dice && dice.length > 0 && dice.every((d) => d === 6));
const sum = (dice: readonly number[]) => dice.reduce((x, y) => x + y, 0);

/** La frase de la tirada, como una línea de crónica: «X intentó [acción] para [propósito] y lo consiguió». Los
 *  conectores van en cursiva. */
function Sentence({ roll, who, decided = true }: { roll: RollDoc; who: string; decided?: boolean }) {
  const { record } = roll;
  const core = (
    <>
      {record.action}
      {record.purpose && (
        <>
          {' '}
          <em>para</em> {record.purpose}
        </>
      )}
    </>
  );
  const name = <b>{who}</b>;
  if (record.state === 'retirada') {
    return (
      <p className="rl-duel__sentence">
        {name} <em>retiró</em> {core}.
      </p>
    );
  }
  if (record.state === 'resuelta' && decided) {
    return (
      <p className="rl-duel__sentence">
        {name} <em>intentó</em> {core}
        {record.result === 'exito' && (
          <>
            {' '}
            <em>y</em> <span className="rl-win">lo consiguió</span>
            {allSix(record.playerRoll?.dice) ? ' con todos 6' : ''}
          </>
        )}
        {record.result === 'fallo' && (
          <>
            {' '}
            <em>y</em> <span className="rl-lose">no lo consiguió</span>
          </>
        )}
        {record.result === 'empate' && (
          <>
            {' '}
            <em>y</em> <span className="rl-tie">lo consiguió a medias</span>
          </>
        )}
        .
      </p>
    );
  }
  return (
    <p className="rl-duel__sentence">
      {name} <em>intenta</em> {core}.
    </p>
  );
}

/** «Esperando a…»: rombo que late y tres puntos que se encienden por turno. */
function Waiting({ children }: { children: ReactNode }) {
  return (
    <span className="rl-waiting">
      <span className="rl-pulse" />
      <span>
        {children}
        <span className="rl-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

/** Estado del reveal de una tirada. Solo anima lo que cambia mientras la sala está abierta: lo que ya estaba al entrar
 *  se pinta quieto. Las claves suben en el mismo render en que llega el cambio (nunca un fotograma con el resultado
 *  antes de tiempo); `settled` es falso mientras la coreografía del jugador no llega al veredicto. */
function useReveal(roll: RollDoc) {
  const hasOpp = Boolean(roll.record.opposition);
  const hasRoll = Boolean(roll.record.playerRoll);
  const [seen, setSeen] = useState({ opp: hasOpp, roll: hasRoll });
  const [dmKey, setDmKey] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);
  const [settled, setSettled] = useState(true);
  const [holding, setHolding] = useState(false);
  const hold = useRef<number | null>(null);

  if (seen.opp !== hasOpp || seen.roll !== hasRoll) {
    if (hasOpp && !seen.opp) setDmKey((k) => k + 1);
    if (hasRoll && !seen.roll) {
      setPlayerKey((k) => k + 1);
      setSettled(false);
      setHolding(true);
    }
    setSeen({ opp: hasOpp, roll: hasRoll });
  }
  useEffect(
    () => () => {
      if (hold.current) window.clearTimeout(hold.current);
    },
    [],
  );

  /** El veredicto cae: se pinta el resultado y la tirada sigue abierta un rato. */
  const settle = () => {
    setSettled(true);
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => setHolding(false), HOLD_OPEN_MS);
  };
  return { dmKey, playerKey, settled, holding, settle };
}

type Reveal = ReturnType<typeof useReveal>;

/** La carta completa. */
function Duel({ roll, actions, reveal, compact = false, onDismiss }: { roll: RollDoc; actions: RollActions; reveal: Reveal | null; compact?: boolean; onDismiss?: () => void }) {
  const ctx = useRoom();
  const axes = useAxes();
  const { record } = roll;
  const character = ctx.characterOf(roll.characterId);
  const who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);
  const dmName = ctx.displayNameOf(ctx.room.dmUid);
  const actor = ctx.actorFor(roll);
  const allowed = actions.allowed(roll);
  const busy = actions.busyId === roll.id;
  const max = ctx.room.settings.maxDice;
  const maxTarget = Math.min(MAX_FIXED_TARGET, max * 6);
  const mine = record.playerRoll;
  // Lo que el DM prepara: dados a tirar o un objetivo fijo (tabla de dificultad o a mano).
  const [count, setCount] = useState(Math.min(max, Math.max(1, record.skill.level)));
  const [target, setTarget] = useState(Math.min(maxTarget, Math.max(1, record.skill.level * 3)));
  const [mode, setMode] = useState<'dice' | 'fixed'>('dice');
  // Estados del personaje que el DM aplica a esta tirada (por índice en la ficha).
  const statuses = character?.sheet.statuses ?? [];
  const [applied, setApplied] = useState<number[]>([]);
  const [picking, setPicking] = useState(false);
  const chosen = applied.map((i) => statuses[i]).filter((s): s is Status => Boolean(s));
  const pendingMod = modifierOf(chosen);

  const opp = record.opposition;
  const modifier = record.modifier;
  const steps = modifierSteps(modifier, record.modifierNote);
  const raw = mine ? sum(mine.dice) : null;
  const mineTotal = raw !== null ? raw + modifier : null;
  const oppTotal = opp ? oppositionTotal(opp) : null;

  const settled = reveal?.settled ?? true;
  const outcome: Outcome | null = record.state === 'resuelta' && record.result && record.result !== 'narrado' && settled ? record.result : null;
  const decided = outcome !== null;
  const won = outcome === 'exito';
  const drawn = outcome === 'empate';
  const tie = Boolean(oppTotal !== null && mineTotal !== null && oppTotal === mineTotal);
  const tieRule = ctx.room.settings.tieWinner;
  // Lo que deben sumar los dados, ya descontado el modificador.
  const need = oppTotal !== null ? (tieRule === 'player' ? oppTotal : oppTotal + 1) - modifier : null;
  const sixes = allSix(mine?.dice);
  const faded = record.state === 'rechazada' || record.state === 'retirada';
  const side = (s: 'player' | 'dm') => (!decided || drawn ? '' : (s === 'player') === won ? 'won' : 'lost');

  /* ---------- Reveal ---------- */
  const panel = useRef<HTMLElement>(null);
  const pDice = useRef<HTMLSpanElement>(null);
  const pRaw = useRef<HTMLSpanElement>(null);
  const pTotal = useRef<HTMLSpanElement>(null);
  const pNum = useRef<HTMLSpanElement>(null);
  const pStates = useRef<HTMLSpanElement>(null);
  const dDice = useRef<HTMLSpanElement>(null);
  const dRaw = useRef<HTMLSpanElement>(null);
  const dTotal = useRef<HTMLSpanElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  // El total del jugador mientras se aplican los estados (null = el final).
  const [shown, setShown] = useState<number | null>(null);
  const [tone, setTone] = useState<'neg' | 'pos' | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // La oposición llega: ruedan los dados del DM y entran su suma y su total.
  const dmKey = reveal?.dmKey ?? 0;
  useLayoutEffect(() => {
    if (!dmKey || R.prefersReducedMotion()) return;
    const dice = dDice.current ? [...dDice.current.children] : [];
    const end = R.tumbleEnd(dice.length);
    R.tumble(dice);
    R.fadeIn(dRaw.current, end);
    R.popIn(dTotal.current, dice.length ? end + 120 : 0);
    if (dice.length) playDice();
  }, [dmKey]);

  // El jugador tira: sus dados, la suma, el total sembrado con la suma y cada estado por turno. Al final, el veredicto.
  const playerKey = reveal?.playerKey ?? 0;
  const settle = reveal?.settle;
  useLayoutEffect(() => {
    if (!playerKey || !mine || !settle) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    R.cancelAll(panel.current);
    if (R.prefersReducedMotion()) {
      settle();
      return;
    }
    const dice = pDice.current ? [...pDice.current.children] : [];
    const chips = pStates.current ? [...pStates.current.children] : [];
    const end = R.tumbleEnd(dice.length);
    R.tumble(dice);
    playDice();
    R.fadeIn(pRaw.current, end);
    R.popIn(pTotal.current, end + 120);
    let running = sum(mine.dice);
    setShown(running);
    let t = end + R.STATES_AFTER;
    steps.forEach((step, i) => {
      R.slideIn(chips[i], t);
      const dir = Math.sign(step.delta);
      for (let s = 0; s < Math.abs(step.delta); s++) {
        running += dir;
        const value = running;
        later(t + R.STEP_LEAD + s * R.STEP_MS, () => {
          setShown(value);
          setTone(dir < 0 ? 'neg' : 'pos');
          R.punch(pNum.current);
          playTick();
        });
      }
      t += R.STEP_LEAD + Math.abs(step.delta) * R.STEP_MS + R.STATE_PAUSE;
    });
    later(t + R.VERDICT_AFTER, () => {
      setShown(null);
      setTone(null);
      settle();
    });
    // Los pasos no cambian una vez escrita la tirada: solo una clave nueva reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerKey]);

  // El veredicto cae (una vez por tirada, nunca al volver a pintar).
  const fell = useRef(0);
  useLayoutEffect(() => {
    if (!decided || !playerKey || fell.current === playerKey) return;
    fell.current = playerKey;
    if (R.prefersReducedMotion()) return;
    R.fall(mark.current, 0);
    R.fall(verdict.current, 100, 1.3);
    R.jolt(panel.current, R.IMPACT_AT);
    later(R.IMPACT_AT, playSeal);
    later(R.IMPACT_AT + 400, () => R.cancelAll(panel.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided, playerKey]);

  // Botones de la fila: lo que no vive dentro de una carta. Mientras ruedan los dados no hay nada que decidir.
  const rowActions = !settled ? [] : allowed.filter((k) => k !== 'approve' && k !== 'rollOpposition' && k !== 'rollPlayer');

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
            {tieRule === 'player' ? ' · empate a tu favor' : tieRule === 'partial' ? ` · con ${(need ?? 0) - 1}, a medias` : ''}
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

  const dmPrepare = (() => {
    if (!(record.state === 'declarada' || record.state === 'aprobada') || actor !== 'dm') return null;
    const oppose = record.state === 'declarada';
    const fixed = mode === 'fixed';
    const value = fixed ? target : count;
    const preset = DIFFICULTIES.find((d) => (fixed ? d.target === target : d.dice === count));
    return (
      <div className="rl-prepare">
        <div className="rl-oppose__mode">
          <Segmented
            label="Cómo oponer"
            value={mode}
            options={[
              { value: 'dice', label: 'Tirar dados', icon: 'dices' },
              { value: 'fixed', label: 'Objetivo fijo', icon: 'crosshair' },
            ]}
            onChange={setMode}
          />
        </div>
        {/* Un solo stepper recorre la tabla de dificultad (1d6…4d6 o 3, 6, 9, 12); tocar el número permite
            cualquier valor. El nombre de la dificultad acompaña al número cuando coincide con la tabla. */}
        <div className="rl-oppose">
          <span className="rl-oppose__level">
            <b>{preset ? DIFFICULTY_LABEL[preset.key] : 'A medida'}</b>
            <span>{fixed ? `Objetivo ${target}` : `${count} ${count === 1 ? 'dado' : 'dados'}`}</span>
          </span>
          <Stepper
            value={value}
            min={1}
            max={fixed ? maxTarget : max}
            step={fixed ? 3 : 1}
            compact
            label={fixed ? 'objetivo' : 'dados'}
            onChange={(v) => (fixed ? setTarget(Math.round(v)) : setCount(Math.round(v)))}
          />
        </div>
        {statuses.length > MAX_STATUS_CHIPS && (
          <div className="rl-apply rl-apply--summary">
            <Button variant="tonal" dense icon="activity" onClick={() => setPicking(true)}>
              Estados · {applied.length} de {statuses.length}
              {pendingMod !== 0 ? ` · ${signed(pendingMod)}` : ''}
            </Button>
            {chosen.length > 0 && <span className="rl-apply__list">{chosen.map(statusLabel).join(', ')}</span>}
          </div>
        )}
        {picking && <StatusPickDialog statuses={statuses} applied={applied} onClose={() => setPicking(false)} onChange={setApplied} />}
        {statuses.length > 0 && statuses.length <= MAX_STATUS_CHIPS && (
          <div className="rl-chips rl-apply" role="group" aria-label="Estados que aplican">
            {statuses.map((s, i) => (
              <Chip
                key={i}
                selected={applied.includes(i)}
                icon={s.rating < 0 ? 'trending-down' : s.rating > 0 ? 'trending-up' : 'minus'}
                iconColor={applied.includes(i) ? undefined : s.rating < 0 ? 'var(--c-error)' : s.rating > 0 ? 'var(--c-success)' : undefined}
                onClick={() => setApplied((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))}
              >
                {statusLabel(s)}
              </Chip>
            ))}
          </div>
        )}
        <Button
          variant="primary"
          icon={fixed ? 'crosshair' : 'shield'}
          className="rl-cta"
          disabled={busy}
          onClick={() => void actions.oppose(roll, { ...(fixed ? { target } : { count }), statuses: chosen })}
        >
          {fixed ? `${oppose ? 'Oponer' : 'Fijar'} objetivo ${target}` : `${oppose ? 'Oponer' : 'Tirar'} ${count}d6`}
          {pendingMod !== 0 ? ` (${signed(pendingMod)})` : ''}
        </Button>
      </div>
    );
  })();

  const dmCta = (() => {
    if (dmPrepare) return null;
    if (record.state === 'declarada' || record.state === 'aprobada') {
      return <Waiting>{record.state === 'declarada' ? (actor === 'owner' ? 'El DM está revisando tu acción' : 'El DM está revisando la acción') : 'El DM está preparando la oposición'}</Waiting>;
    }
    if (record.state === 'tirada') return <Waiting>Resolviendo</Waiting>;
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

  const word = sixes && won ? '¡Todos 6!' : won ? 'Éxito' : drawn ? 'Empate' : 'Fallo';
  const extras: ReactNode[] = [];
  if (drawn) extras.push(<span key="drawn">a medias · sin XP</span>);
  if (outcome === 'fallo') extras.push(<span key="xp" className="rl-verdict__xp">+1 XP</span>);
  if (record.applied?.newSkill)
    extras.push(
      <span key="skill" className="rl-verdict__six">
        <GameIcon name="sparkles" /> {skillLabel(record.applied.newSkill)}
        {record.applied.xpSpent > 0 ? ` (−${record.applied.xpSpent} XP)` : ''}
      </span>,
    );
  if (record.advance === 'pendiente')
    extras.push(
      <span key="pending" className="rl-verdict__pending">
        <GameIcon name="hourglass" /> avance pendiente
      </span>,
    );
  if (tie && decided && !drawn) extras.push(<span key="tie">Empate · {tieRule === 'player' ? 'gana el jugador' : 'gana la oposición'}</span>);

  const playerNum = shown ?? mineTotal;

  return (
    <article ref={panel} className={`rl-duel${compact ? ' rl-duel--compact' : ''}${faded ? ' rl-duel--faded' : ''}`} aria-busy={busy}>
      {!compact && <Sentence roll={roll} who={who} decided={settled} />}
      {note}
      <div className="rl-arena">
        <div className={`rl-side-rim rl-side-rim--player${side('player') ? ` rl-side-rim--${side('player')}` : ''}`}>
          <section className={`rl-side${side('player') ? ` rl-side--${side('player')}` : ''}`} aria-label={who}>
            <div className="rl-side__head">
              <Avatar initials={initials(who)} size={compact ? 32 : 40} />
              <span className="rl-side__who">
                <span className="rl-side__name">{who}</span>
                <span className="rl-side__skill">
                  {skillLabel(record.skill)} · {record.skill.level}d6
                </span>
              </span>
            </div>
            <div className="rl-roll">
              <DiceRow ref={pDice} dice={mine?.dice ?? null} count={record.skill.level} style={axes.dice} />
              {raw !== null && (
                <span ref={pRaw} className="rl-raw kv-num">
                  = {raw}
                </span>
              )}
            </div>
            <div className="rl-tally">
              <span ref={pStates} className="rl-tally__states">
                {steps.map((s, i) => (
                  <span key={i} className={`rl-status ${s.delta < 0 ? 'rl-status--neg' : 'rl-status--pos'}`}>
                    {s.label}
                  </span>
                ))}
              </span>
              <span ref={pTotal} className="rl-tally__total">
                <span className="rl-tally__kicker">Total</span>
                <span ref={pNum} className={`rl-tally__num kv-num${playerNum === null ? ' rl-tally__num--empty' : ''}${tone ? ` rl-tally__num--${tone}` : ''}`}>
                  {playerNum ?? <i className="rl-tally__none" aria-label="sin tirar" />}
                </span>
              </span>
            </div>
            {playerCta && <div className="rl-side__cta">{playerCta}</div>}
          </section>
        </div>
        <SealMark ref={mark} outcome={outcome} style={axes.seal} small={compact} />
        <div className={`rl-side-rim${side('dm') ? ` rl-side-rim--${side('dm')}` : ''}`}>
          <section className={`rl-side rl-side--dm${side('dm') ? ` rl-side--${side('dm')}` : ''}`} aria-label="DM">
            <div className="rl-side__head">
              <Avatar icon="crown" size={compact ? 32 : 40} />
              <span className="rl-side__who">
                <span className="rl-side__name">{dmName}</span>
                <span className="rl-side__skill">{opp ? oppositionLabel(opp) : 'Oposición'}</span>
              </span>
            </div>
            <div className="rl-roll">
              {opp?.kind === 'fixed' ? (
                <span className="rl-fixed">
                  <GameIcon name="crosshair" />
                  Objetivo fijo
                </span>
              ) : (
                <>
                  <DiceRow ref={dDice} dice={opp?.dice.dice ?? null} count={opp ? opp.dice.length : mode === 'fixed' ? 0 : count} style={axes.dice} dm />
                  {opp && (
                    <span ref={dRaw} className="rl-raw kv-num">
                      = {oppTotal}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="rl-tally">
              <span className="rl-tally__states" />
              <span ref={dTotal} className="rl-tally__total">
                <span className="rl-tally__kicker">{opp?.kind === 'fixed' ? 'Objetivo' : 'Total'}</span>
                <span className={`rl-tally__num kv-num${oppTotal === null ? ' rl-tally__num--empty' : ''}`}>{oppTotal ?? <i className="rl-tally__none" aria-label="sin tirar" />}</span>
              </span>
            </div>
            {(dmCta || dmPrepare) && <div className="rl-side__cta">{dmCta ?? dmPrepare}</div>}
          </section>
        </div>
      </div>

      {record.narration && <p className="rl-duel__narration">{record.narration}</p>}

      {outcome && (
        <VerdictLine ref={verdict} outcome={outcome} word={word} style={axes.seal} small={compact}>
          {extras.length > 0 ? extras : null}
        </VerdictLine>
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
    if (record.result === 'empate') return { label: 'Empate', tone: 'warning' as const };
    return { label: 'Narrada', tone: 'neutral' as const };
  }
  return { label: STATE_LABEL[record.state], tone: STATE_TONE[record.state] };
}

/** Una tirada del registro: plegada en una fila o abierta como duelo. */
/** `hero`: va completa en la mesa, dentro del Marco. `onDismiss`: es la escena que se queda por ser la última
 *  resuelta y se puede plegar a mano. */
export function RollItem({ roll, actions, hero, onDismiss }: { roll: RollDoc; actions: RollActions; hero: boolean; onDismiss?: () => void }) {
  const ctx = useRoom();
  const reveal = useReveal(roll);
  const [open, setOpen] = useState(false);
  const { record } = roll;
  const character = ctx.characterOf(roll.characterId);
  const who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);

  if (hero || reveal.holding) {
    return (
      <Frame className="rl-duel-frame">
        <Duel roll={roll} actions={actions} reveal={reveal} onDismiss={hero ? onDismiss : undefined} />
      </Frame>
    );
  }

  const tag = stateTag(roll);
  const faded = record.state === 'rechazada' || record.state === 'retirada';
  const opp = record.opposition;
  const mine = record.playerRoll;
  const won = record.result === 'exito';
  const drawn = record.result === 'empate';
  const mineTotal = mine ? sum(mine.dice) + record.modifier : null;
  return (
    <div className={`rl-entry${faded ? ' rl-entry--faded' : ''}`} aria-expanded={open}>
      <button type="button" className="rl-entry__main kv-state" onClick={() => setOpen((o) => !o)}>
        <Avatar initials={initials(who)} size={32} />
        <span className="rl-entry__text">
          <Sentence roll={roll} who={who} />
        </span>
        {opp && mine && (
          <span className="rl-entry__score kv-num">
            <span className={won ? 'rl-entry__win' : ''}>{mineTotal}</span> <em>contra</em> <span className={won || drawn ? '' : 'rl-entry__win'}>{oppositionTotal(opp)}</span>
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
