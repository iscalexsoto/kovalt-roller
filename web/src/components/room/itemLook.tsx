import { ITEM_ICON_KEYS, type ItemLook } from '../../engine';
import { GameIcon } from '../../icons/GameIcon';

/* Íconos de objeto (kovalt-medieval-skill § Iconos): Lucide en una sola tinta; la identidad de un objeto es su glifo y
 * su nombre. El `color` del catálogo se conserva en los datos, pero la capa medieval no lo pinta. */

export function ItemGlyph({ look, size, className }: { look: Pick<ItemLook, 'icon'>; size?: number; className?: string }) {
  return <GameIcon name={look.icon} size={size} className={className} />;
}

/** El glifo dentro del marco de icono del eje Iconos (Tinta, Grabado o Medallón). */
export function ItemFramed({ look, big = false }: { look: Pick<ItemLook, 'icon'>; big?: boolean }) {
  return (
    <span className={`rl-icf${big ? ' rl-icf--big' : ''}`}>
      <ItemGlyph look={look} className="rl-icf__icon" />
    </span>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="rl-picker rl-picker--icons" role="listbox" aria-label="Ícono">
      {ITEM_ICON_KEYS.map((key) => (
        <button key={key} type="button" role="option" className="kv-icon-btn kv-icon-btn--40" aria-selected={value === key} aria-pressed={value === key} aria-label={key} title={key} onClick={() => onChange(key)}>
          <GameIcon name={key} />
        </button>
      ))}
    </div>
  );
}
