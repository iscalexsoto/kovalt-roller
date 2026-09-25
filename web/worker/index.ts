import { handleApi, type Env } from './sessions';

/** Worker de roller.kovalt.mx: `/api/*` emite sesiones de Firebase; todo lo demás son los assets de la SPA
 *  (`run_worker_first` en wrangler.jsonc hace que solo `/api/*` llegue aquí). */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
