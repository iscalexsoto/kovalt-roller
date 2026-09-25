import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { GameIcon } from '../../icons/GameIcon';

/** Card nivel 1 (Panel). El rim va en el wrapper. */
export function Card({ variant = 'panel', className = '', children, ...rest }: HTMLAttributes<HTMLDivElement> & { variant?: 'panel' | 'veta' | 'outlined' | 'raised'; children: ReactNode }) {
  const rim = variant === 'veta' ? 'kv-rim--primary' : variant === 'outlined' ? 'kv-rim--strong' : '';
  return (
    <div className={`kv-rim kv-rim--block ${rim}`}>
      <div className={`kv-card${variant !== 'panel' ? ` kv-card--${variant}` : ''} ${className}`} {...rest}>
        {children}
      </div>
    </div>
  );
}

/** Lista agrupada: un solo panel con filas separadas por 1px `outline`. */
export function GroupedList({ children, raised = false, className = '' }: { children: ReactNode; raised?: boolean; className?: string }) {
  return (
    <div className="kv-rim kv-rim--block">
      <ul className={`kv-list--grouped${raised ? ' kv-list--raised' : ''} ${className}`}>{children}</ul>
    </div>
  );
}

/** Fila de lista (dentro de una `GroupedList` o suelta como panel). */
export function ListItem({
  lead,
  leadColor,
  avatar,
  headline,
  support,
  trail,
  selected = false,
  as = 'div',
  standalone = false,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  lead?: string;
  /** Color del trazo del ícono (color de grupo). */
  leadColor?: string;
  avatar?: ReactNode;
  headline: ReactNode;
  support?: ReactNode;
  trail?: ReactNode;
  selected?: boolean;
  as?: 'div' | 'button' | 'li';
  standalone?: boolean;
}) {
  const cls = `kv-list-item${selected ? ' kv-list-item--selected' : ''}${as === 'button' ? ' kv-state' : ''} ${className}`;
  const body = (
    <>
      {avatar ?? (lead && (
        <span className="kv-list-item__lead">
          <GameIcon name={lead} color={leadColor} />
        </span>
      ))}
      <span className="kv-list-item__text">
        <span className="kv-list-item__headline">{headline}</span>
        {support && <span className="kv-list-item__support">{support}</span>}
      </span>
      {trail && <span className="kv-list-item__trail">{trail}</span>}
    </>
  );
  const row =
    as === 'button' ? (
      <button type="button" className={cls} {...rest}>
        {body}
      </button>
    ) : as === 'li' ? (
      <li className={cls}>{body}</li>
    ) : (
      <div className={cls}>{body}</div>
    );
  return standalone ? <span className="kv-rim kv-rim--block">{row}</span> : row;
}

export function KickerDivider({ children, mark = false, className = '' }: { children: ReactNode; mark?: boolean; className?: string }) {
  return (
    <div className={`kv-kicker-divider ${className}`}>
      {mark && <span className="kv-rhombus" />}
      <span className="kv-kicker">{children}</span>
      <span className="kv-rule" />
    </div>
  );
}

export function Tag({ veta = false, small = false, icon, className = '', children }: { veta?: boolean; small?: boolean; icon?: string; className?: string; children: ReactNode }) {
  return (
    <span className={`kv-tag${veta ? ' kv-tag--veta' : ''}${small ? ' kv-tag--small' : ''} ${className}`}>
      {icon && <GameIcon name={icon} />}
      {children}
    </span>
  );
}

export function Avatar({ initials, icon, iconColor, size = 40 }: { initials?: string; icon?: string; iconColor?: string; size?: 32 | 40 | 56 }) {
  return (
    <span className={`kv-avatar${size !== 40 ? ` kv-avatar--${size}` : ''}`} aria-hidden>
      {icon ? <GameIcon name={icon} color={iconColor} size={size === 56 ? 28 : size === 32 ? 16 : 20} /> : initials}
    </span>
  );
}

/** Marca: La Piedra de Roller (brand-and-iconography.md § Brand mark / App icons; master
 *  `kovalt-skill/assets/brand/roller.svg`). Hexágono partido en cuatro caras por tres grietas que forman una K;
 *  en Roller la cara izquierda lleva un d6 que muestra cinco, cizallado al borde de la cara. Las caras son
 *  gradientes cobalto fijos: la piedra no cambia con el tema, y nunca va dentro de una Gema, círculo ni Corte.
 *  28 en la barra superior, 72 en la entrada. */
export function BrandMark({ size = 28 }: { size?: 28 | 40 | 72 }) {
  const id = useId();
  const g = (n: number) => `${id}s${n}`;
  return (
    <svg className="kv-brand" width={size} height={size} viewBox="0 0 204 204" aria-hidden focusable="false">
      <defs>
        <linearGradient id={g(1)} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#2D70F4" />
          <stop offset="1" stopColor="#0D327A" />
        </linearGradient>
        <linearGradient id={g(2)} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#93BEFF" />
          <stop offset="1" stopColor="#2D70F4" />
        </linearGradient>
        <linearGradient id={g(3)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4886FE" />
          <stop offset="1" stopColor="#0A3FA8" />
        </linearGradient>
        <linearGradient id={g(4)} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#0D327A" />
          <stop offset="1" stopColor="#050D1E" />
        </linearGradient>
        <linearGradient id={g(6)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93BEFF" />
          <stop offset="1" stopColor="#4886FE" />
        </linearGradient>
        <clipPath id={g(5)}>
          <polygon points="102,10 22,56 22,148 102,194 102,102" />
        </clipPath>
      </defs>
      <polygon points="102,10 182,56 182,148 102,194 22,148 22,56" fill="#0A54DD" />
      <polygon points="102,10 22,56 22,148 102,194 102,102" fill={`url(#${g(1)})`} />
      <polygon points="102,10 182,56 102,102" fill={`url(#${g(2)})`} />
      <polygon points="102,102 182,56 182,148" fill={`url(#${g(3)})`} />
      <polygon points="102,102 182,148 102,194" fill={`url(#${g(4)})`} />
      <g clipPath={`url(#${g(5)})`}>
        <g transform="matrix(1 -0.575 0 1 0 0)">
          <rect x="38" y="113.65" width="48" height="48" fill={`url(#${g(6)})`} />
          {[
            [50, 125.65],
            [74, 125.65],
            [62, 137.65],
            [50, 149.65],
            [74, 149.65],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5.5" fill="#0A3FA8" />
          ))}
        </g>
      </g>
    </svg>
  );
}

export function Progress({ value, width }: { value: number; width?: number }) {
  return (
    <div className="kv-progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} style={{ width }}>
      <div className="kv-progress__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export type EmptyRegister = 'empty' | 'results' | 'error';

/** Estado vacío: un componente, tres registros (catálogo § Empty state): ícono 44 → Headline Small → Body Medium →
 *  una acción, sin Gema ni kicker encima. `empty` = todavía no hay datos (voz kobold permitida, `pickaxe`); `results` =
 *  sin resultados (neutro, `search-x`); `error` = fallo (neutro, `cloud-off`). `kobold` es alias de `register="empty"`. */
export function EmptyState({
  register,
  kobold = false,
  icon,
  title,
  body,
  actions,
}: {
  register?: EmptyRegister;
  kobold?: boolean;
  icon?: string;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  const reg: EmptyRegister = register ?? (kobold ? 'empty' : 'results');
  const glyph = icon ?? (reg === 'empty' ? 'pickaxe' : reg === 'error' ? 'cloud-off' : 'search-x');
  return (
    <div className={`kv-empty kv-empty--${reg}`} role={reg === 'error' ? 'alert' : undefined}>
      <GameIcon name={glyph} className="kv-empty__icon" />
      <h2 className="kv-empty__title">{title}</h2>
      {body && <p className="kv-empty__body">{body}</p>}
      {actions && <div className="kv-empty__actions">{actions}</div>}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div className="kv-form__error" role="alert">
      <GameIcon name="circle-alert" />
      <span>{children}</span>
    </div>
  );
}
