import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MEDIUM, useMediaQuery } from '../../hooks/useMediaQuery';
import { GameIcon } from '../../icons/GameIcon';
import { Button } from './Button';
import { KickerDivider } from './Layout';
import { Dialog, Portal, Sheet } from './Overlay';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  iconColor?: string;
}

/** Select Kovalt (component-catalog.md § Select). El disparador es siempre la caja Outlined con rim fuerte;
 *  la lista tiene dos anatomías, elegidas por tamaño de ventana: en medio+ un menú anclado (filas Corte S,
 *  Veta + `check` en la elegida, flechas / Enter / Esc); en compacto un selector modal: bottom sheet con 6+
 *  opciones (filas de 52) o diálogo con radios para 2–5 (Aceptar / Cancelar). Nunca el `<select>` nativo. */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Elige…',
  lead,
  dense = false,
  onSurface = false,
  className = '',
  support,
  error = false,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ícono al inicio cuando la opción elegida no trae el suyo. */
  lead?: string;
  dense?: boolean;
  onSurface?: boolean;
  className?: string;
  support?: string;
  error?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const medium = useMediaQuery(MEDIUM);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);
  const name = label ?? ariaLabel ?? 'Opciones';
  const icon = selected?.icon ?? lead;
  const iconColor = selected?.icon ? selected.iconColor : undefined;

  const openList = () => {
    setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const cls = ['kv-field', 'kv-field--select', error ? 'kv-field--error' : '', dense ? 'kv-field--dense' : '', onSurface ? 'kv-field--on-surface' : '', className].filter(Boolean).join(' ');
  const mode: 'menu' | 'sheet' | 'dialog' = medium ? 'menu' : options.length >= 6 ? 'sheet' : 'dialog';

  return (
    <div className={cls}>
      {label && <span className="kv-field__label">{label}</span>}
      <span className={`kv-rim kv-rim--strong kv-rim--flex${error ? ' kv-rim--error' : ''}`}>
        <button
          ref={triggerRef}
          type="button"
          className="kv-field__box kv-select"
          aria-haspopup={mode === 'menu' ? 'listbox' : 'dialog'}
          aria-expanded={open}
          aria-label={label ? undefined : ariaLabel}
          disabled={disabled}
          onClick={openList}
        >
          {icon && <GameIcon name={icon} className="kv-field__lead" color={iconColor} />}
          <span className={`kv-select__value${selected ? '' : ' kv-select__value--empty'}`}>{selected?.label ?? placeholder}</span>
          <GameIcon name="chevron-down" className="kv-field__suffix-icon kv-select__chevron" />
        </button>
      </span>
      {support && <span className="kv-field__support">{support}</span>}

      {open && mode === 'menu' && <AnchoredList name={name} options={options} value={value} anchor={anchor} onPick={pick} onClose={close} />}
      {open && mode === 'sheet' && (
        <Sheet label={name} onClose={close}>
          <KickerDivider>{name}</KickerDivider>
          <div role="listbox" aria-label={name} className="kv-sheet__opts">
            {options.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} className="kv-sheet__opt" onClick={() => pick(o.value)}>
                <span className="kv-row kv-grow">
                  {o.icon && <GameIcon name={o.icon} color={o.iconColor} size={18} />}
                  <span className="kv-truncate">{o.label}</span>
                </span>
                {o.value === value && <GameIcon name="check" size={16} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {open && mode === 'dialog' && <RadioDialog name={name} options={options} value={value} onPick={pick} onClose={close} />}
    </div>
  );
}

function AnchoredList({ name, options, value, anchor, onPick, onClose }: { name: string; options: SelectOption[]; value: string; anchor: DOMRect | null; onPick: (v: string) => void; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(Math.max(0, options.findIndex((o) => o.value === value)));
  const style = useMemo<CSSProperties>(() => {
    if (!anchor) return {};
    const height = Math.min(320, options.length * 44 + 12);
    const below = anchor.bottom + 4 + height <= window.innerHeight - 8;
    return { left: Math.min(anchor.left, window.innerWidth - Math.max(anchor.width, 180) - 8), top: below ? anchor.bottom + 4 : Math.max(8, anchor.top - 4 - height), minWidth: anchor.width };
  }, [anchor, options.length]);

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[active]?.focus({ preventScroll: false });
  }, [active]);

  return (
    <Portal>
      <div className="kv-scrim kv-scrim--clear" onClick={onClose}>
        <div
          className="kv-rim kv-rim--lift kv-menu-anchor"
          style={style}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <div ref={listRef} className="kv-menu kv-menu--select" role="listbox" aria-label={name}>
            {options.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} className="kv-menu__item" onClick={() => onPick(o.value)} tabIndex={-1}>
                {o.icon && <GameIcon name={o.icon} color={o.iconColor} />}
                <span className="kv-truncate kv-grow">{o.label}</span>
                {o.value === value && <GameIcon name="check" size={16} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function RadioDialog({ name, options, value, onPick, onClose }: { name: string; options: SelectOption[]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const [pending, setPending] = useState(value);
  return (
    <Dialog
      title={name}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" quiet onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onPick(pending)}>
            Aceptar
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={name} className="kv-radio-group">
        {options.map((o) => (
          <label key={o.value} className="kv-radio-row">
            <input type="radio" className="kv-radio" name={name} value={o.value} checked={pending === o.value} onChange={() => setPending(o.value)} />
            {o.icon && <GameIcon name={o.icon} color={o.iconColor} size={18} />}
            <span className="kv-truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}
