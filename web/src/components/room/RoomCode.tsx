import { Button } from '../kv/Button';
import { copy } from './invite';

/** Copia el código de la sala sin mostrarlo en pantalla (p. ej. si la partida se transmite). */
export function RoomCode({ code }: { code: string }) {
  return (
    <Button variant="text" icon="copy" dense onClick={() => void copy(code, 'Código copiado')}>
      Copiar código
    </Button>
  );
}
