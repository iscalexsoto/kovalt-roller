import type { CSSProperties } from 'react';
import { iconPaths } from './keys';

/** Ícono Lucide del set compartido (docs/ICONS.md): trazo 2, extremos redondeados, `currentColor`.
 *  Sin `size` mide lo que diga el CSS del contexto (`.kv-icon`, 20px); con `size` manda el tamaño. */
export function GameIcon({
  name,
  size,
  className,
  title,
  color,
  strokeWidth = 2,
}: {
  name: string;
  size?: number | string;
  className?: string;
  title?: string;
  color?: string;
  strokeWidth?: number;
}) {
  const style: CSSProperties | undefined = size !== undefined || color ? { width: size, height: size, color } : undefined;
  return (
    <svg
      className={className ? `kv-icon ${className}` : 'kv-icon'}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {iconPaths(name).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
