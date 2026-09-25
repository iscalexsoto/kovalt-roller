/** El panel no tiene login propio: manda a la puerta de la suite (`kovalt.mx/entrar`), que regresa
 *  aquí por `?volver=`. La landing solo acepta destinos `*.kovalt.mx` (o localhost desde
 *  localhost), y `admin.kovalt.mx` lo es. */

const env = (import.meta as { env?: Record<string, string | undefined> }).env;

export const HOME_URL = (env?.VITE_HOME_URL || 'https://kovalt.mx').replace(/\/+$/, '');

export function loginUrl(returnTo: string, home: string = HOME_URL): string {
  return `${home}/entrar?volver=${encodeURIComponent(returnTo)}`;
}

/** Si acabamos de volver de `/entrar` y seguimos sin sesión, redirigir otra vez sería un bucle
 *  (cookies bloqueadas, login cancelado): ahí se enseña un botón en vez de saltar. */
export function cameFromLogin(referrer: string, home: string = HOME_URL): boolean {
  try {
    const ref = new URL(referrer);
    return ref.origin === new URL(home).origin && ref.pathname.startsWith('/entrar');
  } catch {
    return false;
  }
}
