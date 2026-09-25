import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { GameIcon } from '../../icons/GameIcon';

export type ButtonVariant = 'primary' | 'tonal' | 'panel' | 'outlined' | 'text' | 'destructive' | 'success';

/** Botón del catálogo. Outlined y Panel llevan su rim en un wrapper (el corte recortaría un `border`). */
export function Button({
  variant = 'outlined',
  icon,
  quiet = false,
  block = false,
  dense = false,
  onSurface = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: string;
  /** Text button en `on-surface-variant` (descartar en diálogos). */
  quiet?: boolean;
  block?: boolean;
  dense?: boolean;
  /** Outlined dentro de un panel: fondo `surface` en vez de `bg`. */
  onSurface?: boolean;
}) {
  const cls = [
    'kv-btn',
    `kv-btn--${variant}`,
    quiet ? 'kv-btn--quiet' : '',
    block ? 'kv-btn--block' : '',
    dense ? 'kv-btn--dense' : '',
    onSurface ? 'kv-btn--on-surface' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const button = (
    <button type="button" className={cls} {...rest}>
      {icon && <GameIcon name={icon} />}
      {children}
    </button>
  );
  if (variant === 'outlined') return <span className={`kv-rim kv-rim--strong${block ? ' kv-rim--flex' : ''}`}>{button}</span>;
  if (variant === 'panel') return <span className={`kv-rim${block ? ' kv-rim--flex' : ''}`}>{button}</span>;
  return button;
}

/** Botón de ícono 44×44 (36 en `small`). `label` es obligatorio: es el nombre accesible. */
export function IconButton({
  icon,
  label,
  variant = 'standard',
  small = false,
  pressed,
  onSurface = false,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: string;
  label: string;
  variant?: 'standard' | 'outlined' | 'tonal' | 'metal';
  small?: boolean;
  pressed?: boolean;
  onSurface?: boolean;
}) {
  const cls = ['kv-icon-btn', variant !== 'standard' ? `kv-icon-btn--${variant}` : '', small ? 'kv-icon-btn--small' : '', onSurface ? 'kv-icon-btn--on-surface' : '', className]
    .filter(Boolean)
    .join(' ');
  const button = (
    <button type="button" className={cls} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <GameIcon name={icon} />
    </button>
  );
  return variant === 'outlined' ? <span className="kv-rim kv-rim--strong">{button}</span> : button;
}

export function Fab({ icon, label, small = false, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; small?: boolean }) {
  return (
    <button type="button" className={`kv-fab${small ? ' kv-fab--small' : ''}`} aria-label={label} title={label} {...rest}>
      <GameIcon name={icon} />
    </button>
  );
}

/** Segmented single-select (cambia cómo se ve la misma información). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <span className="kv-rim kv-rim--strong kv-rim--flex">
      <div className="kv-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className="kv-seg__opt" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.icon && <GameIcon name={o.icon} />}
            {o.label}
          </button>
        ))}
      </div>
    </span>
  );
}

export function Chip({
  icon,
  iconColor,
  selected,
  count,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; iconColor?: string; selected: boolean; count?: number; children: ReactNode }) {
  return (
    <span className="kv-chip-rim">
      <button type="button" className="kv-chip" aria-pressed={selected} {...rest}>
        {icon && <GameIcon name={icon} color={iconColor} />}
        {children}
        {count !== undefined && count > 0 && <span className="kv-chip__count">{count}</span>}
      </button>
    </span>
  );
}
