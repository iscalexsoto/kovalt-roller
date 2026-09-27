import { useEffect, useRef, useState } from 'react';
import { GameIcon } from '../icons/GameIcon';
import { playDice, playSeal, setSoundEnabled, useSound } from '../state/sound';
import { AXES, MODES, THEMES, useTheme, type AxisKey, type Axes } from '../state/theme';
import { Button, Segmented } from './kv/Button';
import { KickerDivider } from './kv/Layout';
import { Portal } from './kv/Overlay';
import { DiceRow } from './room/Dice';
import * as R from './room/reveal';
import { SealMark, VerdictLine } from './room/Verdict';

const MODE_OPTIONS = MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }));
const WIDTH = 360;
const SAMPLE = [5, 4];

/** Una tirada de muestra con los dados y el resultado elegidos; «Repetir tirada» la vuelve a jugar. */
function Preview({ axes, replay }: { axes: Axes; replay: number }) {
  const box = useRef<HTMLDivElement>(null);
  const dice = useRef<HTMLSpanElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!replay || R.prefersReducedMotion()) return;
    R.cancelAll(box.current);
    const d = dice.current ? [...dice.current.children] : [];
    const end = R.tumbleEnd(d.length) + R.VERDICT_AFTER;
    R.tumble(d);
    playDice();
    R.fall(mark.current, end);
    R.fall(verdict.current, end + 100, 1.3);
    R.jolt(box.current, end + R.IMPACT_AT);
    const t = window.setTimeout(playSeal, end + R.IMPACT_AT);
    return () => window.clearTimeout(t);
  }, [replay]);
  return (
    <div ref={box} className="rl-theme__preview" aria-hidden>
      <div className="rl-theme__sample">
        <DiceRow ref={dice} dice={SAMPLE} count={SAMPLE.length} style={axes.dice} />
        <span className="rl-raw kv-num">= 9</span>
        <SealMark ref={mark} outcome="exito" style={axes.seal} small />
      </div>
      <VerdictLine ref={verdict} outcome="exito" word="Éxito" style={axes.seal} small />
    </div>
  );
}

function ReplayablePreview({ axes }: { axes: Axes }) {
  const [replay, setReplay] = useState(0);
  return (
    <>
      <Preview axes={axes} replay={replay} />
      <Button variant="primary" dense icon="dices" className="rl-theme__replay" onClick={() => setReplay((n) => n + 1)}>
        Repetir tirada
      </Button>
    </>
  );
}

/** Selector de tema de Roller (kovalt-medieval-skill § Selector de tema), en un panel anclado al botón de cuenta:
 *  primero el modo, luego el tema (muestra Gema: su fondo fuera, su material dentro) y después un segmentado por eje.
 *  Al final la muestra, «Repetir tirada» y, si algún eje difiere del tema, «Restablecer tema». */
export function ThemePicker({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const { theme, mode, resolvedMode, axes, dirty, setTheme, setMode, setAxis, resetAxes } = useTheme();
  const sound = useSound();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, []);
  const style = { left: Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8)), top: anchor.bottom + 4 };
  const caption = mode === 'system' ? `Sigue al dispositivo: ahora ${resolvedMode === 'dark' ? 'oscuro' : 'claro'}.` : 'Fijo, sin importar el dispositivo.';
  return (
    <Portal>
      <div className="kv-scrim kv-scrim--clear" onClick={onClose}>
        <div
          className="kv-rim kv-rim--lift kv-menu-anchor"
          style={style}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            onClose();
          }}
        >
          <div ref={panel} className="rl-theme" role="dialog" aria-label="Tema">
            <div className="rl-theme__mode">
              <Segmented value={mode} options={MODE_OPTIONS} onChange={setMode} label="Apariencia" />
              <span className="rl-theme__caption">{caption}</span>
            </div>
            <KickerDivider>Tema</KickerDivider>
            <div className="rl-theme__list" role="radiogroup" aria-label="Tema">
              {THEMES.map((t) => {
                const active = t.value === theme;
                return (
                  <button key={t.value} type="button" className="rl-theme__row" role="radio" aria-checked={active} onClick={() => setTheme(t.value)}>
                    <span className="rl-theme__swatch" data-theme={`${t.value}-${resolvedMode}`} aria-hidden />
                    <span className="rl-theme__text">
                      <span className="rl-theme__name">{t.label}</span>
                      <span className="rl-theme__desc">{t.description}</span>
                    </span>
                    {active && <GameIcon name="check" className="rl-theme__check" />}
                  </button>
                );
              })}
            </div>
            <KickerDivider>Ejes</KickerDivider>
            <div className="rl-theme__axes">
              {AXES.map((axis) => (
                <div key={axis.key} className="rl-theme__axis">
                  <span className="rl-theme__axis-label">{axis.label}</span>
                  <Segmented
                    label={axis.label}
                    value={axes[axis.key]}
                    options={axis.options.map(([value, label]) => ({ value, label }))}
                    onChange={(v) => setAxis(axis.key as AxisKey, v as Axes[AxisKey])}
                  />
                </div>
              ))}
              <div className="rl-theme__axis">
                <span className="rl-theme__axis-label">Sonido</span>
                <Segmented
                  label="Sonido"
                  value={sound ? 'on' : 'off'}
                  options={[
                    { value: 'off', label: 'No' },
                    { value: 'on', label: 'Sí' },
                  ]}
                  onChange={(v) => setSoundEnabled(v === 'on')}
                />
              </div>
            </div>
            <ReplayablePreview axes={axes} />
            {dirty && (
              <Button variant="text" dense className="rl-theme__reset" onClick={resetAxes}>
                Restablecer tema
              </Button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
