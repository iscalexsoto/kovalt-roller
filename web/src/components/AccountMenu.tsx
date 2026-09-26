import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutEverywhere, useSession } from '../firebase/session';
import { setSoundEnabled, useSound } from '../state/sound';
import { toastError } from '../state/toast';
import { useDialogs } from './dialogs';
import { IconButton } from './kv/Button';
import { Menu } from './kv/Overlay';
import { ThemePicker } from './ThemePicker';

/** Botón de cuenta del top bar: nombre, tema y cerrar sesión. */
export function AccountMenu() {
  const session = useSession();
  const navigate = useNavigate();
  const { confirm, dialogs } = useDialogs();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<DOMRect | null>(null);
  const sound = useSound();

  const signOut = async () => {
    const ok = session.guest
      ? await confirm('Salir de la mesa', 'Como invitado, para volver necesitarás el código de la sala y entrarás con un personaje nuevo.', { okLabel: 'Salir', danger: true })
      : await confirm('Cerrar sesión', 'Se cierra tu sesión de Kovalt en este navegador (también en las otras apps de la suite).', { okLabel: 'Cerrar sesión' });
    if (!ok) return;
    try {
      await signOutEverywhere();
      navigate('/entrar', { replace: true });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <IconButton icon={session.guest ? 'user-round' : 'crown'} label={`Cuenta: ${session.name}`} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} />
      {anchor && (
        <Menu
          title={session.guest ? `${session.name} · invitado` : session.name}
          anchor={anchor}
          items={[
            { key: 'theme', label: 'Tema', icon: 'palette' },
            { key: 'sound', label: 'Sonido de la mesa', icon: sound ? 'volume-2' : 'volume-x', checked: sound },
            { key: 'out', label: session.guest ? 'Salir de la mesa' : 'Cerrar sesión', icon: 'log-out', destructive: true },
          ]}
          onClose={() => setAnchor(null)}
          onPick={(key) => {
            const rect = anchor;
            setAnchor(null);
            if (key === 'theme') setThemeAnchor(rect);
            if (key === 'sound') setSoundEnabled(!sound);
            if (key === 'out') void signOut();
          }}
        />
      )}
      {themeAnchor && <ThemePicker anchor={themeAnchor} onClose={() => setThemeAnchor(null)} />}
      {dialogs}
    </>
  );
}
