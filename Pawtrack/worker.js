import { onRequest } from './functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const subPath = url.pathname.replace(/^\/api\/?/, '');
      return onRequest({
        request,
        env,
        ctx,
        params: { path: subPath }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
