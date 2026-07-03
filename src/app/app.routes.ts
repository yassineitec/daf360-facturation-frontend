import { Routes }                        from '@angular/router';
import { ENVIRONMENT_INITIALIZER, DestroyRef, inject } from '@angular/core';
import { authGuard }                      from './core/auth.guard';
import { FactShellComponent }             from './layout/fact-shell.component';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import frTranslations from '../../public/i18n/fr.json';
import enTranslations from '../../public/i18n/en.json';

const I18N: Record<string, TranslationObject> = {
  fr: frTranslations as unknown as TranslationObject,
  en: enTranslations as unknown as TranslationObject,
};

export const routes: Routes = [
  {
    path: '',
    component: FactShellComponent,
    canActivate: [authGuard],
    providers: [
      {
        provide: ENVIRONMENT_INITIALIZER,
        multi: true,
        useValue: () => {
          const translate  = inject(TranslateService, { optional: true });
          if (!translate) return;
          const destroyRef = inject(DestroyRef);

          const merge = () =>
            Object.entries(I18N).forEach(([lang, data]) =>
              translate.setTranslation(lang, data, true));

          merge(); // initial merge

          // Re-merge after every shell language-load so the HTTP loader never wipes our keys
          const sub = translate.onLangChange.subscribe(() => merge());
          destroyRef.onDestroy(() => sub.unsubscribe());
        },
      },
    ],
    children: [
      {
        path: 'affaires',
        loadChildren: () =>
          import('./modules/affaires/affaires.routes').then(m => m.AFFAIRES_ROUTES),
      },
      {
        path: 'invoicing',
        loadChildren: () =>
          import('./modules/invoicing/invoicing.routes').then(m => m.INVOICING_ROUTES),
      },
      {
        path: 'payments',
        loadChildren: () =>
          import('./modules/payments/payments.routes').then(m => m.PAYMENTS_ROUTES),
      },
      {
        path: 'subcontracting',
        loadChildren: () =>
          import('./modules/subcontracting/subcontracting.routes').then(m => m.SUBCONTRACTING_ROUTES),
      },
      {
        path: 'cost',
        loadChildren: () =>
          import('./modules/cost/cost.routes').then(m => m.COST_ROUTES),
      },
      {
        path: 'reporting',
        loadChildren: () =>
          import('./modules/reporting/reporting.routes').then(m => m.REPORTING_ROUTES),
      },
      {
        path: 'clients',
        loadChildren: () =>
          import('./modules/clients/clients.routes').then(m => m.CLIENTS_ROUTES),
      },
      {
        path: 'admin',
        loadChildren: () =>
          import('./modules/admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      {
        path: 'billing',
        children: [
          {
            path: 'approval',
            loadComponent: () =>
              import('./modules/affaires/billing/approval-queue.component').then(m => m.ApprovalQueueComponent),
          },
        ],
      },
      {
        path: 'suppliers',
        loadChildren: () =>
          import('./modules/suppliers/suppliers.routes').then(m => m.SUPPLIERS_ROUTES),
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./modules/home/home.component').then(m => m.HomeComponent),
      },
      { path: 'fournisseurs', redirectTo: 'suppliers', pathMatch: 'full' },
      { path: 'recouvrement', redirectTo: 'home',      pathMatch: 'full' },
      { path: 'tresorerie',   redirectTo: 'home',      pathMatch: 'full' },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
];
