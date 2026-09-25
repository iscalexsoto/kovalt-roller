import { onSnapshot, type DocumentData, type DocumentReference, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { watchOnline } from './presence';

/** Estado de un listener: `data` es `undefined` mientras carga. */
export interface Live<T> {
  data: T | undefined;
  error: unknown;
}

/** Documento en vivo. `ref` puede ser `null` para no escuchar nada; `key` identifica la suscripción. */
export function useLiveDoc<T>(ref: DocumentReference | null, map: (id: string, data: DocumentData) => T): Live<T | null> {
  const key = ref?.path ?? null;
  const [state, setState] = useState<{ key: string | null } & Live<T | null>>({ key, data: undefined, error: null });

  useEffect(() => {
    if (!ref) return;
    return onSnapshot(
      ref,
      (snap) => setState({ key: ref.path, data: snap.exists() ? map(snap.id, snap.data()) : null, error: null }),
      (error) => setState({ key: ref.path, data: undefined, error }),
    );
    // `ref` y `map` cambian de identidad en cada render; la suscripción depende solo de la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state : { data: undefined, error: null };
}

/** Consulta en vivo. `key` debe cambiar cuando cambie la consulta (la identidad de `q` no sirve). */
export function useLiveQuery<T>(key: string | null, q: Query | null, map: (id: string, data: DocumentData) => T): Live<T[]> {
  const [state, setState] = useState<{ key: string | null } & Live<T[]>>({ key, data: undefined, error: null });

  useEffect(() => {
    if (!q || key === null) return;
    return onSnapshot(
      q,
      (snap) => setState({ key, data: snap.docs.map((d) => map(d.id, d.data())), error: null }),
      (error) => setState({ key, data: undefined, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state : { data: undefined, error: null };
}

/** Uids conectados en la sala. */
export function useOnline(roomId: string | null): Set<string> {
  const [online, setOnline] = useState<{ roomId: string | null; uids: Set<string> }>({ roomId, uids: new Set() });
  useEffect(() => {
    if (!roomId) return;
    return watchOnline(roomId, (uids) => setOnline({ roomId, uids }));
  }, [roomId]);
  return online.roomId === roomId ? online.uids : new Set();
}
