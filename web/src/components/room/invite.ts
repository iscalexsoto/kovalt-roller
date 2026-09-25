import { toast, toastError } from '../../state/toast';

export async function copy(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch (e) {
    toastError(e);
  }
}

/** Enlace para entrar directo a la sala (como invitado o con cuenta). */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/unirse/${code}`;
}

export function copyInvite(code: string): void {
  void copy(inviteUrl(code), 'Enlace de invitación copiado');
}
