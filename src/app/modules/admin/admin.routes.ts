import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-list.component').then(m => m.AdminListComponent),
  },
  {
    path: 'roles',
    loadComponent: () =>
      import('./roles/fact-roles-admin.component').then(m => m.FactRolesAdminComponent),
  },
];
