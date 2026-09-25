import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GameIcon } from '../../icons/GameIcon';

/** Los niveles 3 (diálogo, sheet, menú) se montan en `body`: un `filter` en un ancestro
 *  convertiría `position: fixed` en relativo (DESIGN.md v1.0.2). */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function useEscape(onClose: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
}

export function Dialog({
  title,
  icon,
  destructive = false,
  narrow = true,
  onClose,
  actions,
  children,
}: {
  title?: ReactNode;
  icon?: string;
  destructive?: boolean;
  narrow?: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const onKey = useEscape(onClose);
  return (
    <Portal>
      <div className="kv-scrim" onClick={onClose} onKeyDown={onKey}>
        <div className="kv-rim kv-rim--lift">
          <div className={`kv-dialog${narrow ? ' kv-dialog--narrow' : ''}`} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {title && (
              <h2 className="kv-dialog__title kv-dialog__title--compact">
                {icon && <GameIcon name={icon} color={destructive ? 'var(--kv-color-error)' : undefined} />}
                {title}
              </h2>
            )}
            {children && <div className="kv-dialog__body">{children}</div>}
            {actions && <div className="kv-dialog__actions">{actions}</div>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Bottom sheet modal: capa Veta traslúcida con borde `--kv-ring-xsc-top` (sin wrapper rim: un `filter` en un
 *  ancestro mataría el blur); corte mínimo arriba (6/2) porque abajo toca el borde de la pantalla. */
export function Sheet({
  label,
  onClose,
  className = '',
  onKeyDown,
  children,
}: {
  label: string;
  onClose: () => void;
  /** Variante del panel (p. ej. `kv-sheet--pad`, 320 de ancho máximo en medio+). */
  className?: string;
  /** Teclas propias del contenido (el pad numérico); Esc siempre cierra. */
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
}) {
  const onEsc = useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    onKeyDown?.(e);
    if (!e.defaultPrevented) onEsc(e);
  };
  return (
    <Portal>
      <div className="kv-scrim kv-scrim--sheet" onClick={onClose} onKeyDown={onKey}>
        <div className="kv-sheet-wrap">
          <div ref={ref} className={`kv-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="kv-sheet__handle" />
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  /** Opción de estado (modo activo): muestra `check` al final. */
  checked?: boolean;
}

/** Menú anclado a un rect (o centrado si no hay ancla): flechas, Enter, Esc. */
export function Menu({ title, items, anchor, onPick, onClose }: { title?: string; items: MenuItem[]; anchor?: DOMRect | null; onPick: (key: string) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const style = anchor
    ? {
        left: Math.min(anchor.left, window.innerWidth - 200),
        top: anchor.bottom + 4 + 220 > window.innerHeight ? Math.max(8, anchor.top - 4 - 44 * items.length - 40) : anchor.bottom + 4,
      }
    : undefined;
  return (
    <Portal>
      <div className="kv-scrim" style={{ background: 'transparent', display: 'block' }} onClick={onClose}>
        <div
          className={`kv-rim kv-rim--lift${anchor ? ' kv-menu-anchor' : ''}`}
          style={anchor ? style : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            const buttons = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
            const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              buttons[(i + 1) % buttons.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <div className="kv-menu" role="menu" aria-label={title}>
            {title && <div className="kv-menu__title">{title}</div>}
            {items.map((it, i) => (
              <button
                key={it.key}
                ref={i === 0 ? first : undefined}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                className={`kv-menu__item${it.destructive ? ' kv-menu__item--destructive' : ''}`}
                onClick={() => onPick(it.key)}
              >
                {it.icon && <GameIcon name={it.icon} />}
                <span className="kv-menu__label">{it.label}</span>
                {it.checked && <GameIcon name="check" className="kv-menu__check" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
