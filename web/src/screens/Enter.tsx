import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/kv/Button';
import { CodeField } from '../components/kv/CodeField';
import { Field } from '../components/kv/Field';
import { BrandMark, Card, FormError, KickerDivider } from '../components/kv/Layout';
import { Loading } from '../components/Gate';
import { errorMessage } from '../data/errors';
import { normalizeCode } from '../data/rooms';
import { IS_EMULATOR } from '../firebase/app';
import { devSignIn, enterAsGuest, signInWithSuite, suiteAuth, useSessionState } from '../firebase/session';
import { cameFromLogin, loginUrl } from '../suite/loginUrl';

/** Solo rutas internas: `volver` nunca manda fuera de Roller. */
function safeBack(volver: string | null): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';
}

/** `/entrar` y `/unirse/:codigo`: cuenta de Kovalt (lista blanca de la suite) o invitado con el código de la sala. */
export function Enter() {
  const state = useSessionState();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const back = safeBack(search.get('volver'));

  const [code, setCode] = useState(normalizeCode(params.codigo ?? '').slice(0, 6));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'suite' | 'guest' | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devName, setDevName] = useState('');

  if (state.status === 'loading') return <Loading />;
  // Con sesión: a la sala del enlace (si es de una cuenta), a su sala (invitado) o a donde iba.
  if (state.status === 'signed-in' && busy === null) {
    const s = state.session;
    if (s.guest) return <Navigate to={`/sala/${s.room}`} replace />;
    return <Navigate to={params.codigo ? `/?codigo=${encodeURIComponent(code)}` : back} replace />;
  }

  const denied = state.status === 'signed-out' ? state.reason : undefined;
  const looped = !suiteAuth.token && cameFromLogin(document.referrer);

  const withSuite = async () => {
    setError(null);
    if (!suiteAuth.token) {
      window.location.assign(loginUrl(window.location.href));
      return;
    }
    setBusy('suite');
    try {
      await signInWithSuite();
      navigate(back, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // `c` llega de `onComplete` con el código recién escrito o pegado: el estado `code` aún no se actualizó.
  const asGuest = async (c = code) => {
    setError(null);
    setBusy('guest');
    try {
      const roomId = await enterAsGuest(c, name);
      navigate(`/sala/${roomId}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const asDev = async () => {
    setBusy('dev');
    try {
      await devSignIn(devName);
      navigate(back, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const guestReady = normalizeCode(code).length === 6 && name.trim() !== '';

  return (
    <main className="kv-onboard rl-enter">
      <div className="kv-onboard__brand">
        <BrandMark size={72} />
        <div className="rl-wordmark">
          Kovalt <span className="rl-wordmark__dot">·</span> <span className="rl-wordmark__app">Roller</span>
        </div>
      </div>
      <div className="kv-onboard__copy">
        <h1>La mesa está servida</h1>
        <p>Roll For Shoes con tus amigos, directo en el navegador.</p>
      </div>

      <div className="kv-onboard__panel">
        <Card>
          <h2 className="kv-card__title">Entrar como invitado</h2>
          <p className="kv-card__body">Pídele a quien dirige la partida el código de la sala.</p>
          <Field label="Tu nombre" value={name} maxLength={40} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          <CodeField
            label="Código de sala"
            length={6}
            alphanumeric
            value={code}
            onChange={setCode}
            onComplete={(c) => {
              if (name.trim()) void asGuest(c);
            }}
            disabled={busy !== null}
          />
          <Button variant="primary" icon="door-open" block disabled={!guestReady || busy !== null} onClick={() => void asGuest()}>
            {busy === 'guest' ? 'Entrando…' : 'Entrar a la mesa'}
          </Button>
        </Card>
      </div>

      <div className="kv-onboard__panel">
        <KickerDivider>¿Tienes cuenta de Kovalt?</KickerDivider>
        <div className="rl-enter__suite">
          <Button variant="outlined" icon="log-in" block disabled={busy !== null} onClick={() => void withSuite()}>
            {busy === 'suite' ? 'Abriendo tu sesión…' : 'Iniciar sesión con Kovalt'}
          </Button>
          <p className="rl-hint">Para dirigir partidas (crear salas) necesitas una cuenta de Kovalt autorizada.</p>
        </div>
        {looped && !error && <FormError>No encontramos tu sesión de Kovalt. Si tu navegador bloquea cookies, permítelas para kovalt.mx.</FormError>}
        {(error ?? denied) && <FormError>{error ?? denied}</FormError>}
      </div>

      {IS_EMULATOR && (
        <div className="kv-onboard__panel">
          <Card variant="outlined">
            <h2 className="kv-card__title">Desarrollo (emuladores)</h2>
            <p className="kv-card__body">Entra como una cuenta sin pasar por la suite. El mismo nombre da el mismo usuario.</p>
            <Field label="Nombre" value={devName} maxLength={40} onChange={(e) => setDevName(e.target.value)} />
            <Button variant="tonal" icon="crown" disabled={!devName.trim() || busy !== null} onClick={() => void asDev()}>
              Entrar como cuenta (dev)
            </Button>
          </Card>
        </div>
      )}
    </main>
  );
}
