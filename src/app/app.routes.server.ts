import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Authenticated routes with dynamic params → server-side on demand (no prerender)
  {
    path: 'fact/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/callback',
    renderMode: RenderMode.Server,
  },
  // Static/shell routes → prerender
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
