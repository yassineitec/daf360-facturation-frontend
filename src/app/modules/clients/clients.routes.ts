import { Routes } from '@angular/router';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./client-list/client-list.component').then(m => m.ClientListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./client-new/client-new.component').then(m => m.ClientNewComponent),
  },
  // La modification réutilise l'assistant de création, comme pour les affaires : un seul
  // formulaire à faire évoluer, et l'édition n'est plus une modale de 8 champs empilés.
  // Déclarée AVANT `:id`, sinon `:id` capterait « 12/edit » comme un identifiant.
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./client-new/client-new.component').then(m => m.ClientNewComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./client-detail/client-detail.component').then(m => m.ClientDetailComponent),
  },
];
