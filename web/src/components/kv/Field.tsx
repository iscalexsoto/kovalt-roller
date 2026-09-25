import { useEffect, useRef, useState, type InputHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { formatQty, qtyIsPositive, roundQty } from '../../domain/quantities';
import { GameIcon } from '../../icons/GameIcon';
import { NumericPad, PadInput } from './NumericPad';

interface FieldFrame {
  label?: string;
  support?: string;
  error?: boolean;
  dense?: boolean;
  className?: string;
}

function Frame({ label, support, error, dense, className = '', kind, children }: FieldFrame & { kind?: string; children: ReactNode }) {
  const cls = ['kv-field', error ? 'kv-field--error' : '', dense ? 'kv-field--dense' : '', kind ? `kv-field--${kind}` : '', className].filter(Boolean).join(' ');
  return (
    <label className={cls}>
      {label && <span className="kv-field__label">{label}</span>}
      {children}
      {support && <span className="kv-field__support">{support}</span>}
    </label>
  );
}

/** Campo de texto Outlined: etiqueta arriba, caja Corte M con rim en el wrapper, un solo sufijo. */
export function Field({
  label,
  support,
  error,
  dense,
  className,
  lead,
  unit,
  suffix,
  onClear,
  ref,
  ...input
}: InputHTMLAttributes<HTMLInputElement> &
  FieldFrame & {
    ref?: Ref<HTMLInputElement>;
    /** Ícono decorativo al inicio (18px). */
    lead?: string;
    /** Texto estático de unidad al final ("kg", "MXN"). */
    unit?: string;
    /** Sufijo propio (un botón o ícono estático). */
    suffix?: ReactNode;
    /** Sufijo "limpiar" (aparece solo con valor). */
    onClear?: () => void;
  }) {
  const hasValue = input.value !== undefined && input.value !== '';
  return (
    <Frame label={label} support={support} error={error} dense={dense} className={className}>
      <span className={`kv-rim kv-rim--flex${error ? ' kv-rim--error' : ''}`}>
        <span className="kv-field__box">
          {lead && <GameIcon name={lead} className="kv-field__lead" />}
          <input ref={ref} className="kv-field__control" {...input} />
          {unit && (
            <>
              <span className="kv-field__sep" />
              <span className="kv-field__unit">{unit}</span>
            </>
          )}
          {error ? (
            <GameIcon name="circle-alert" className="kv-field__suffix-icon" />
          ) : onClear && hasValue ? (
            <button type="button" className="kv-field__suffix" aria-label="Limpiar" onClick={onClear} tabIndex={-1}>
              <GameIcon name="x" />
            </button>
          ) : (
            suffix
          )}
        </span>
      </span>
    </Frame>
  );
}

/** Campo de cantidad o monto (input-pickers.md § 0.1): nunca abre el teclado del sistema. El input
 *  es de solo lectura para el IME y al tocarlo (o con Enter / un dígito) se abre el pad numérico,
 *  que escribe el valor en vivo. Mismo marco que `Field`, con unidad opcional al final. */
export function NumberField({
  label,
  support,
  error,
  dense,
  className,
  value,
  onChange,
  unit,
  placeholder,
  integerOnly = false,
  disabled = false,
  'aria-label': ariaLabel,
}: FieldFrame & {
  value: string;
  onChange: (text: string) => void;
  unit?: string;
  placeholder?: string;
  integerOnly?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <Frame label={label} support={support} error={error} dense={dense} className={className} kind="number">
      <span className={`kv-rim kv-rim--flex${error ? ' kv-rim--error' : ''}`}>
        <span className="kv-field__box">
          <PadInput className="kv-field__control kv-num" value={value} onChange={onChange} label={label ?? ariaLabel ?? 'Cantidad'} unit={unit} integerOnly={integerOnly} placeholder={placeholder} disabled={disabled} />
          {unit && (
            <>
              <span className="kv-field__sep" />
              <span className="kv-field__unit">{unit}</span>
            </>
          )}
          {error && <GameIcon name="circle-alert" className="kv-field__suffix-icon" />}
        </span>
      </span>
    </Frame>
  );
}

export function TextArea({ label, support, error, dense, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldFrame) {
  return (
    <Frame label={label} support={support} error={error} dense={dense} className={className}>
      <span className={`kv-rim kv-rim--flex${error ? ' kv-rim--error' : ''}`}>
        <span className="kv-field__box kv-field__box--textarea">
          <textarea className="kv-field__control" rows={2} {...rest} />
        </span>
      </span>
    </Frame>
  );
}

export function Checkbox({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={`kv-check-label ${className}`}>
      <input type="checkbox" className="kv-checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

const HOLD_DELAY = 400;
const HOLD_INTERVAL = 125; // 8/s

/** Stepper (input-pickers.md § 4): riel Corte M en `bg` con rim fuerte, teclas Corte S; `+` es la
 *  única superficie metal; el valor es un botón que abre el pad numérico. Compacto (filas de lista):
 *  riel Corte S, teclas 30 Corte XS, 34 de alto con zona táctil de 44. Mantener presionada una tecla
 *  repite tras 400 ms a 8/s. En los límites la tecla se apaga; nunca hay estado de error.
 *  Las cantidades del inventario admiten 3 decimales, así que el pad no es solo de enteros. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  label,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Unidad mostrada junto al riel y kicker del pad. */
  label?: string;
  compact?: boolean;
}) {
  const [pad, setPad] = useState(false);
  const [text, setText] = useState<string | null>(null);
  // Lo último que ve el mantener-presionado (corre fuera del render).
  const latest = useRef({ value, step, min, max, onChange });
  useEffect(() => {
    latest.current = { value, step, min, max, onChange };
  });
  const hold = useRef<{ timeout: number | null; interval: number | null }>({ timeout: null, interval: null });

  const clamp = (v: number) => {
    const m = latest.current;
    return roundQty(Math.min(m.max ?? Number.POSITIVE_INFINITY, Math.max(m.min, v)));
  };
  const nudge = (dir: 1 | -1) => {
    const m = latest.current;
    m.onChange(clamp(m.value + dir * m.step));
  };

  const stopHold = () => {
    if (hold.current.timeout) window.clearTimeout(hold.current.timeout);
    if (hold.current.interval) window.clearInterval(hold.current.interval);
    hold.current = { timeout: null, interval: null };
  };
  const startHold = (dir: 1 | -1) => (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopHold();
    hold.current.timeout = window.setTimeout(() => {
      hold.current.interval = window.setInterval(() => nudge(dir), HOLD_INTERVAL);
    }, HOLD_DELAY);
  };
  useEffect(() => stopHold, []);

  const canDec = qtyIsPositive(value - min);
  const canInc = max === undefined || qtyIsPositive(max - value);
  const shown = text ?? (Number.isNaN(value) ? '' : formatQty(value));
  const name = label ?? 'Cantidad';

  const key = (dir: 1 | -1, enabled: boolean) => (
    <button
      type="button"
      className={`kv-stepper__key kv-state${dir > 0 ? ' kv-stepper__key--inc' : ''}`}
      aria-label={dir > 0 ? 'Más' : 'Menos'}
      disabled={!enabled}
      onClick={() => nudge(dir)}
      onPointerDown={startHold(dir)}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
    >
      <GameIcon name={dir > 0 ? 'plus' : 'minus'} size={18} strokeWidth={2.4} />
    </button>
  );

  return (
    <span className={`kv-stepper-wrap${compact ? ' kv-stepper-wrap--compact' : ''}`}>
      <span className={`kv-rim${compact ? '' : ' kv-rim--strong'}`}>
        <span className={`kv-stepper${compact ? ' kv-stepper--compact' : ''}`} role="group" aria-label={name}>
          {compact ? <span className="kv-stepper__hit">{key(-1, canDec)}</span> : key(-1, canDec)}
          <button
            type="button"
            className="kv-stepper__value kv-state kv-num"
            aria-label={`${name}: ${shown}`}
            aria-haspopup="dialog"
            onClick={() => {
              setText(shown);
              setPad(true);
            }}
          >
            {shown}
          </button>
          {compact ? <span className="kv-stepper__hit">{key(1, canInc)}</span> : key(1, canInc)}
        </span>
      </span>
      {label && !compact && <span className="kv-stepper__label">{label}</span>}
      {pad && (
        <NumericPad
          label="Cantidad"
          unit={label}
          value={text ?? shown}
          onValue={(t) => {
            setText(t);
            const n = Number(t);
            if (t !== '' && !Number.isNaN(n)) onChange(clamp(n));
            else if (t === '') onChange(clamp(0));
          }}
          onClose={() => {
            setPad(false);
            setText(null);
          }}
        />
      )}
    </span>
  );
}
