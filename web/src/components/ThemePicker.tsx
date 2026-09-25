import { useEffect, useRef } from 'react';
import { GameIcon } from '../icons/GameIcon';
import { MODES, PALETTES, useTheme } from '../state/theme';
import { Segmented } from './kv/Button';
import { Portal } from './kv/Overlay';

const MODE_OPTIONS = MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }));
const WIDTH = 320;

/** Selector de tema (component-catalog.md § Selector de tema; el mismo de los ajustes de Notes) en un
 *  panel anclado al botón del top bar: dos controles, primero el modo (segmentado) y luego la paleta
 *  (una fila por paleta con su muestra Gema pintada en el modo en vigor). */
export function ThemePicker({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const { palette, mode, resolvedMode, setPalette, setMode } = useTheme();
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
            <div className="rl-theme__palettes" role="radiogroup" aria-label="Paleta">
              {PALETTES.map((p) => {
                const active = p.value === palette;
                return (
                  <button key={p.value} type="button" className="rl-theme__row" role="radio" aria-checked={active} onClick={() => setPalette(p.value)}>
                    <span className="rl-theme__swatch" data-theme={`${p.value}-${resolvedMode}`} aria-hidden />
                    <span className="rl-theme__text">
                      <span className="rl-theme__name">{p.label}</span>
                      <span className="rl-theme__desc">{p.description}</span>
                    </span>
                    {active && <GameIcon name="check" className="rl-theme__check" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
