import { FirebaseError } from 'firebase/app';
import { EngineError } from '../engine';

/** Error pensado para enseñarse tal cual al usuario. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function isPermissionDenied(e: unknown): boolean {
  return e instanceof FirebaseError && e.code.endsWith('permission-denied');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Texto para la interfaz a partir de cualquier error. */
export function errorMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  if (e instanceof EngineError) return `${capitalize(e.message)}.`;
  if (e instanceof FirebaseError) {
    if (e.code.endsWith('permission-denied')) return 'No tienes permiso para hacer eso.';
    if (e.code.endsWith('unavailable') || e.code === 'auth/network-request-failed') return 'Sin conexión con el servidor. Inténtalo de nuevo.';
    return `Algo falló (${e.code}).`;
  }
  return e instanceof Error && e.message ? e.message : 'Algo falló.';
}
