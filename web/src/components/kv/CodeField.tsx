import { useEffect, useId, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { GameIcon } from '../../icons/GameIcon';

export type CodeStatus = 'idle' | 'error' | 'ok';

/** Campo de código (catálogo § Code field): una caja Corte S por carácter y **un solo input**
 *  transparente detrás de la fila (así funcionan pegar, el autocompletado `one-time-code` y los
 *  lectores de pantalla). Se envía solo al llenarse la última caja; en error la fila tiembla, se
 *  vacía y el foco vuelve a la primera caja; en éxito las cajas suben en cascada y queda de solo
 *  lectura. Ocho caracteres van en 4 + 4 separados por un rombo; seis, en 3 + 3. */
export function CodeField({
  value,
  onChange,
  onComplete,
  length = 8,
  alphanumeric = false,
  status = 'idle',
  message,
  support,
  label,
  dense = false,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Se llama una vez cuando la última caja se llena. */
  onComplete: (value: string) => void;
  length?: number;
  alphanumeric?: boolean;
  status?: CodeStatus;
  /** Texto de la línea de apoyo en error / éxito. */
  message?: string;
  /** Línea de apoyo en reposo (normalmente la acción "Reenviar"). */
  support?: ReactNode;
  label: string;
  dense?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const id = useId();
  const frozen = status === 'ok' || disabled;

  const clean = (raw: string): string => {
    const allowed = alphanumeric ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : raw.replace(/\D/g, '');
    return allowed.slice(0, length);
  };

  const commit = (next: string) => {
    if (next === value) return;
    onChange(next);
    if (next.length === length) onComplete(next);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    commit(clean(e.clipboardData.getData('text')));
  };

  // Error: tras el temblor (320 ms) y un respiro para leer (580 ms), se vacía y el foco vuelve al inicio.
  useEffect(() => {
    if (status !== 'error') return;
    const t = window.setTimeout(() => {
      onChange('');
      inputRef.current?.focus();
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const groupSize = length === 8 ? 4 : length % 3 === 0 ? 3 : length;
  const active = focused && !frozen ? Math.min(value.length, length - 1) : -1;
  const boxes: ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % groupSize === 0) boxes.push(<span key={`sep${i}`} className="kv-code__sep" aria-hidden="true" />);
    boxes.push(
      <span key={i} className="kv-code__rim" data-active={i === active || undefined}>
        <span className="kv-code__box" style={{ '--i': i } as React.CSSProperties}>
          {value[i] ?? ''}
          {i === active && <span className="kv-code__caret" aria-hidden="true" />}
        </span>
      </span>,
    );
  }

  return (
    <div className={`kv-code-field${dense ? ' kv-code-field--dense' : ''}`}>
      <label className="kv-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="kv-code" data-state={status} onClick={() => inputRef.current?.focus()}>
        {boxes}
        <input
          ref={inputRef}
          id={id}
          className="kv-code__input"
          value={value}
          onChange={(e) => commit(clean(e.target.value))}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode={alphanumeric ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize={alphanumeric ? 'characters' : 'off'}
          autoCorrect="off"
          spellCheck={false}
          maxLength={length}
          readOnly={frozen}
          autoFocus={autoFocus}
          aria-invalid={status === 'error' || undefined}
          aria-describedby={message ? `${id}-support` : undefined}
        />
      </div>
      <div id={`${id}-support`} className={`kv-code__support kv-code__support--${status}`} aria-live="polite">
        {status === 'error' && message ? (
          <>
            <GameIcon name="circle-alert" />
            <span>{message}</span>
          </>
        ) : status === 'ok' && message ? (
          <>
            <GameIcon name="check" />
            <span>{message}</span>
          </>
        ) : (
          support
        )}
      </div>
    </div>
  );
}
