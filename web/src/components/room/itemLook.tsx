import type { CSSProperties } from 'react';
import { ITEM_COLOR_KEYS, ITEM_ICON_KEYS, type ItemLook } from '../../engine';
import { COLOR_NAMES, itemColor } from './itemColors';
import { GameIcon } from '../../icons/GameIcon';

export function ItemGlyph({ look, size, className }: { look: ItemLook; size?: number; className?: string }) {
  return <GameIcon name={look.icon} color={itemColor(look.color)} size={size} className={className} />;
}

export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  return (
    <div className="rl-picker rl-picker--icons" role="listbox" aria-label="Ícono">
      {ITEM_ICON_KEYS.map((key) => (
        <button key={key} type="button" role="option" className="kv-icon-btn kv-icon-btn--40" aria-selected={value === key} aria-pressed={value === key} aria-label={key} title={key} onClick={() => onChange(key)}>
          <GameIcon name={key} color={itemColor(color)} />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="rl-picker" role="listbox" aria-label="Color">
      {ITEM_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="option"
          className="kv-icon-btn kv-icon-btn--40 rl-swatch"
          aria-selected={value === key}
          aria-pressed={value === key}
          aria-label={COLOR_NAMES[key]}
          title={COLOR_NAMES[key]}
          style={{ '--rl-item': itemColor(key) } as CSSProperties}
          onClick={() => onChange(key)}
        >
          <span className="rl-swatch__dot" />
        </button>
      ))}
    </div>
  );
}
