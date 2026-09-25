import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GameIcon } from '../../icons/GameIcon';
import { Button } from './Button';
import { Sheet } from './Overlay';
import { PAD_DECIMAL as DECIMAL, padText } from '../../utils/numeric';

/** Pad numérico (input-pickers.md § 3): la única superficie de entrada numérica de la suite.
 *  Bottom sheet con corte 6/2 arriba; kicker con la etiqueta del campo; display de campo relleno;
 *  teclas 48 Corte S; borrar en Veta (mantener presionado vacía); "Listo" metal solo cierra.
 *  El valor se escribe en vivo: no hay borrador. Con teclado físico, los dígitos, la coma o el
 *  punto, Retroceso, Enter y Esc hacen lo mismo que las teclas. */
export function NumericPad({
  label,
  value,
  unit,
  integerOnly = false,
  maxLength = 9,
  onValue,
  onClose,
}: {
  label: string;
  value: string;
  /** Prefijo / unidad al lado del valor ("$", "kg"). */
  unit?: string;
  integerOnly?: boolean;
  /** Dígitos máximos (sin contar el separador); de más se rechazan con una sacudida. */
  maxLength?: number;
  onValue: (text: string) => void;
  onClose: () => void;
}) {
  const [shake, setShake] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const cleared = useRef(false);
  const text = padText(value, integerOnly);

  const commit = (next: string) => {
    if (next.replace(DECIMAL, '').length > maxLength) {
      setShake(true);
      return;
    }
    onValue(next);
  };
  const digit = (d: string) => commit(text === '0' ? d : text + d);
  const decimal = () => {
    if (integerOnly || text.includes(DECIMAL)) return;
    commit(text ? text + DECIMAL : '0.');
  };
  const backspace = () => commit(text.slice(0, -1));
  const clear = () => onValue('');

  useEffect(() => {
    if (!shake) return;
    const t = window.setTimeout(() => setShake(false), 160);
    return () => window.clearTimeout(t);
  }, [shake]);
  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') digit(e.key);
    else if (e.key === DECIMAL || e.key === ',') decimal();
    else if (e.key === 'Backspace') backspace();
    else if (e.key === 'Delete') clear();
    else if (e.key === 'Enter') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const holdStart = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    cleared.current = false;
    holdTimer.current = window.setTimeout(() => {
      cleared.current = true;
      clear();
    }, 500);
  };
  const holdEnd = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <Sheet label={label} onClose={onClose} className="kv-sheet--pad" onKeyDown={onKey}>
      <div className="kv-pad">
        <span className="kv-kicker">{label}</span>
        <div className={`kv-pad__display kv-num${shake ? ' kv-pad__display--shake' : ''}`} aria-live="polite">
          {unit && <span className="kv-pad__unit">{unit}</span>}
          <span className="kv-pad__value">{text || '0'}</span>
        </div>
        <div className="kv-pad__keys">
          {keys.map((k) => (
            <span key={k} className="kv-rim">
              <button type="button" className="kv-pad__key kv-state" onClick={() => digit(k)}>
                {k}
              </button>
            </span>
          ))}
          {integerOnly ? (
            <span aria-hidden="true" />
          ) : (
            <span className="kv-rim">
              <button type="button" className="kv-pad__key kv-state" onClick={decimal} aria-label="Decimal">
                {DECIMAL}
              </button>
            </span>
          )}
          <span className="kv-rim">
            <button type="button" className="kv-pad__key kv-state" onClick={() => digit('0')}>
              0
            </button>
          </span>
          <button
            type="button"
            className="kv-pad__key kv-pad__key--back kv-state"
            aria-label="Borrar"
            title="Borrar (mantén para vaciar)"
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onClick={() => {
              if (!cleared.current) backspace();
            }}
          >
            <GameIcon name="delete" />
          </button>
        </div>
        <Button variant="primary" block onClick={onClose} className="kv-pad__done">
          Listo
        </Button>
      </div>
    </Sheet>
  );
}

/** Input de solo lectura para el IME que abre el pad al tocarlo (regla 0.1 de input-pickers.md).
 *  Es el control desnudo; `NumberField` lo envuelve en la anatomía de campo. */
export function PadInput({
  value,
  onChange,
  label,
  unit,
  integerOnly = false,
  className = '',
  placeholder,
  disabled = false,
  style,
  id,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Kicker del pad y nombre accesible del control. */
  label: string;
  unit?: string;
  integerOnly?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const close = () => {
    setOpen(false);
    ref.current?.focus();
  };
  return (
    <>
      <input
        ref={ref}
        id={id}
        className={className}
        value={value}
        readOnly
        inputMode="none"
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        style={style}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || (e.key >= '0' && e.key <= '9')) {
            e.preventDefault();
            setOpen(true);
            if (e.key >= '0' && e.key <= '9') onChange(padText(value + e.key, integerOnly));
          } else if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onChange(e.key === 'Delete' ? '' : value.slice(0, -1));
          }
        }}
        onChange={() => undefined}
      />
      {open && <NumericPad label={label} value={value} unit={unit} integerOnly={integerOnly} onValue={onChange} onClose={close} />}
    </>
  );
}
