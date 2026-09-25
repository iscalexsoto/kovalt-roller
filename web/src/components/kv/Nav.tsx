import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { GameIcon } from '../../icons/GameIcon';
import { IconButton } from './Button';
import { BrandMark } from './Layout';

export interface NavDestination {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

/** `true` mientras el usuario baja por la página (más de 64px desde arriba); vuelve a `false` al subir.
 *  Lo comparten la barra flotante (píldora) y el FAB (se oculta): navigation-patterns.md § Navigation bar. */
export function useScrollingDown(): boolean {
  const [down, setDown] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last.current;
      if (y < 64) setDown(false);
      else if (Math.abs(delta) > 6) setDown(delta > 0);
      last.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return down;
}

/** Top app bar Small (64): marca en pantallas raíz, `arrow-left` en hijas. Con scroll gana la regla
 *  `outline-strong` y el filo (nivel 1, opaca). */
export function TopBar({ title, brand = false, onBack, actions }: { title: ReactNode; brand?: boolean; onBack?: () => void; actions?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className="kv-top-bar" data-scrolled={scrolled}>
      {onBack && <IconButton icon="arrow-left" label="Volver" onClick={onBack} />}
      {brand ? (
        <div className="kv-top-bar__brand kv-grow">
          <BrandMark />
          <h1 className="kv-top-bar__title" style={{ margin: 0 }}>
            {title}
          </h1>
        </div>
      ) : (
        <h1 className="kv-top-bar__title">{title}</h1>
      )}
      {actions && <div className="kv-top-bar__actions">{actions}</div>}
    </header>
  );
}

function NavItem({ item }: { item: NavDestination }) {
  return (
    <NavLink to={item.to} end={item.end} className="kv-nav-item" aria-label={item.label}>
      <span className="kv-nav-item__ind">
        <GameIcon name={item.icon} />
      </span>
      <span className="kv-nav-item__label">{item.label}</span>
    </NavLink>
  );
}

/** Barra de navegación flotante (compacto): capa Veta traslúcida Corte L a 12px de los bordes con borde
 *  `--kv-ring-l`; al bajar se colapsa a una píldora de 48 sin etiquetas y vuelve al subir. */
export function NavBar({ items, collapsed = false }: { items: NavDestination[]; collapsed?: boolean }) {
  return (
    <nav className={`kv-nav-bar kv-float-1${collapsed ? ' kv-nav-bar--collapsed' : ''}`} aria-label="Principal">
      {items.map((it) => (
        <NavItem key={it.to} item={it} />
      ))}
    </nav>
  );
}

/** Riel de navegación (medio y expandido): panel opaco `surface` con rim, FAB pequeño arriba, mismos destinos. */
export function NavRail({ items, fab, bottom }: { items: NavDestination[]; fab?: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="kv-nav-rail-rim">
      <nav className="kv-nav-rail" aria-label="Principal">
        {fab && <div className="kv-nav-rail__top">{fab}</div>}
        {items.map((it) => (
          <NavItem key={it.to} item={it} />
        ))}
        {bottom && <div className="kv-nav-rail__bottom">{bottom}</div>}
      </nav>
    </div>
  );
}
