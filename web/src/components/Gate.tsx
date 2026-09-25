import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessionState } from '../firebase/session';

/** Pantalla de carga mientras se resuelve la sesión. */
export function Loading({ label = 'Preparando la mesa…' }: { label?: string }) {
  return (
    <div className="rl-loading" role="status">
      <span className="kv-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** La puerta de la app. Solo decide qué se enseña: la puerta de verdad son las Security Rules, que exigen una
 *  sesión emitida por el Worker (`kvExp`) y limitan a los invitados a su sala.
 *
 *  - Sin sesión → `/entrar?volver=<ruta>`.
 *  - Invitado → solo su sala. */
export function Gate() {
  const state = useSessionState();
  const { pathname, search } = useLocation();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signed-out') return <Navigate to={`/entrar?volver=${encodeURIComponent(pathname + search)}`} replace />;

  const { session } = state;
  if (session.guest) {
    const home = `/sala/${session.room}`;
    if (!pathname.startsWith(home)) return <Navigate to={home} replace />;
  }
  return <Outlet />;
}
