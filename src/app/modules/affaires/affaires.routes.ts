import { Routes } from '@angular/router';

export const AFFAIRES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./affaires-list.component').then(m => m.AffairesListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./wizard/affaire-wizard.component').then(m => m.AffaireWizardComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./affaire-detail.component').then(m => m.AffaireDetailComponent),
  },
];
