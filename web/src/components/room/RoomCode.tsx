import { Button } from '../kv/Button';
import { copy } from './invite';

/** Copia el código de la sala sin mostrarlo en pantalla (p. ej. si la partida se transmite). En un teléfono queda
 *  solo el ícono, para que el nombre de la sala quepa en la barra. */
export function RoomCode({ code }: { code: string }) {
  return (
    <Button variant="text" icon="copy" dense className="rl-roomcode" aria-label="Copiar código" title="Copiar código" onClick={() => void copy(code, 'Código copiado')}>
      <span className="rl-roomcode__label">Copiar código</span>
    </Button>
  );
}
