import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Authenticated routes: client-side only — the server has no cookies, so SSR would
  // render an unauthenticated state and cause a hydration mismatch on the browser.
  {
    path: 'fact/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'auth/callback',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
