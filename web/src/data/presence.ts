import { onDisconnect, onValue, ref, remove, serverTimestamp, set } from 'firebase/database';
import { rtdb } from '../firebase/app';

/* Presencia en RTDB: la entrada `presence/{roomId}/{uid}` existe mientras la pestaña esté conectada. El servidor
 * la borra solo al cortarse la conexión (`onDisconnect`), y `.info/connected` la vuelve a escribir al reconectar. */

const path = (roomId: string, uid: string) => `presence/${roomId}/${uid}`;

/** Marca al usuario como conectado en la sala. Devuelve la función que lo desconecta. */
export function goOnline(roomId: string, uid: string, name: string): () => void {
  const mine = ref(rtdb, path(roomId, uid));
  const stop = onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    void onDisconnect(mine)
      .remove()
      .then(() => set(mine, { state: 'online', name: name.slice(0, 40), lastChanged: serverTimestamp() }))
      .catch(() => {
        /* expulsado o sin permiso: simplemente no aparece conectado */
      });
  });
  return () => {
    stop();
    void onDisconnect(mine).cancel().catch(() => {});
    void remove(mine).catch(() => {});
  };
}

/** Uids conectados ahora mismo en la sala. */
export function watchOnline(roomId: string, onChange: (online: Set<string>) => void): () => void {
  return onValue(
    ref(rtdb, `presence/${roomId}`),
    (snap) => {
      const value = snap.val() as Record<string, unknown> | null;
      onChange(new Set(value ? Object.keys(value) : []));
    },
    () => onChange(new Set()),
  );
}
