import { Routes } from '@angular/router';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./supplier-list/supplier-list.component').then(m => m.SupplierListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./supplier-new/supplier-new.component').then(m => m.SupplierNewComponent),
  },
  // La modification réutilise l'assistant de création, comme les clients et les
  // affaires : un seul formulaire à faire évoluer. Déclarée AVANT `:id` par convention
  // (`clients.routes.ts` fait de même) — l'ordre n'est pas strictement requis ici,
  // `:id/edit` faisant deux segments contre un à `:id`, et Angular exigeant une
  // correspondance exacte du nombre de segments restants.
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./supplier-new/supplier-new.component').then(m => m.SupplierNewComponent),
  },
  // Après `new` : `:id` capterait le segment sinon.
  {
    path: ':id',
    loadComponent: () =>
      import('./supplier-detail/supplier-detail.component').then(m => m.SupplierDetailComponent),
  },
];
