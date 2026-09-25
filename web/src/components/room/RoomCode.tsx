import { useState } from 'react';
import { GameIcon } from '../../icons/GameIcon';
import { IconButton } from '../kv/Button';
import { copy } from './invite';

/** Chip con el código de la sala en Cascadia Mono; al tocarlo se copia. Va oculto para que no se filtre en pantalla
 *  (p. ej. en un stream); con `revealable` se puede mostrar un momento. */
export function RoomCode({ code, revealable = false }: { code: string; revealable?: boolean }) {
  const [shown, setShown] = useState(false);
  const value = shown ? `${code.slice(0, 3)}·${code.slice(3)}` : '•••·•••';
  return (
    <span className="rl-code-wrap">
      <button type="button" className="rl-code kv-state" title="Copiar código" aria-label="Copiar código de la sala" onClick={() => void copy(code, 'Código copiado')}>
        <span className="kv-code rl-code__value">{value}</span>
        <GameIcon name="copy" size={16} />
      </button>
      {revealable && <IconButton icon={shown ? 'eye-off' : 'eye'} small label={shown ? 'Ocultar código' : 'Mostrar código'} onClick={() => setShown(!shown)} />}
    </span>
  );
}
