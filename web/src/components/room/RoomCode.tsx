import { GameIcon } from '../../icons/GameIcon';
import { copy } from './invite';

/** Chip con el código de la sala en Cascadia Mono; al tocarlo se copia. */
export function RoomCode({ code }: { code: string }) {
  return (
    <button type="button" className="rl-code kv-state" title="Copiar código" onClick={() => void copy(code, 'Código copiado')}>
      <span className="kv-code rl-code__value">{code.slice(0, 3)}·{code.slice(3)}</span>
      <GameIcon name="copy" size={16} />
    </button>
  );
}
