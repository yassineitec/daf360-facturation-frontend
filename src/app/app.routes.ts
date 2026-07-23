import { Routes }                        from '@angular/router';
import { provideEnvironmentInitializer, inject } from '@angular/core';
import { of } from 'rxjs';
import { authGuard }                      from './core/auth.guard';
import { FactShellComponent }             from './layout/fact-shell.component';
import { permissionGuard, provideDafAccess } from '@khalilrebhiitec/daf360';
import { environment }                    from '../environments/environment';
import { TranslateService, TranslateLoader, TranslationObject, provideChildTranslateService } from '@ngx-translate/core';
import frTranslations from '../../public/i18n/fr.json';
import enTranslations from '../../public/i18n/en.json';

const I18N: Record<string, TranslationObject> = {
  fr: frTranslations as unknown as TranslationObject,
  en: enTranslations as unknown as TranslationObject,
};

// Loads facturation's bundled translations inline (no HTTP round-trip).
class InlineTranslateLoader implements TranslateLoader {
  getTranslation(lang: string) { return of(I18N[lang] ?? I18N['fr']); }
}

// Eagerly populate the isolated store so translate.instant() works before use() resolves.
function registerTranslations(): void {
  const translate = inject(TranslateService);
  translate.setTranslation('fr', I18N['fr'], true);
  translate.setTranslation('en', I18N['en'], true);
  if (!translate.getCurrentLang()) translate.use('fr');
}

export const routes: Routes = [
  {
    path: '',
    component: FactShellComponent,
    canActivate: [authGuard],
    providers: [
      // Feeds the lib permission guard: unauthenticated → shell login; a permission
      // denial → the shell's /forbidden page (federation shares one Router).
      ...provideDafAccess({
        loginRedirect: () => { window.location.href = environment.shellUrl || '/'; },
        forbiddenRoute: '/forbidden',
      }),
      // Isolated TranslateService for the whole facturation subtree: keeps its own
      // translation store (finance keys never overwrite the shell host's) while
      // use()/currentLang delegate to the root so it still follows the shell's active
      // language. Replaces the old merge-on-langChange workaround.
      ...provideChildTranslateService({
        loader: { provide: TranslateLoader, useClass: InlineTranslateLoader },
      }),
      provideEnvironmentInitializer(() => registerTranslations()),
    ],
    children: [
      {
        path: 'affaires',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_AFFAIRE', 'FACT_MANAGE_AFFAIRE'] },
        loadChildren: () =>
          import('./modules/affaires/affaires.routes').then(m => m.AFFAIRES_ROUTES),
      },
      {
        path: 'invoicing',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'] },
        loadChildren: () =>
          import('./modules/invoicing/invoicing.routes').then(m => m.INVOICING_ROUTES),
      },
      {
        path: 'payments',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_PAYMENT', 'FACT_MANAGE_PAYMENT'] },
        loadChildren: () =>
          import('./modules/payments/payments.routes').then(m => m.PAYMENTS_ROUTES),
      },
      {
        path: 'subcontracting',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_AFFAIRE', 'FACT_MANAGE_AFFAIRE'] },
        loadChildren: () =>
          import('./modules/subcontracting/subcontracting.routes').then(m => m.SUBCONTRACTING_ROUTES),
      },
      {
        path: 'cost',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST', 'FACT_ADMIN_COST'] },
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
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_INVOICING', 'FACT_MANAGE_INVOICING'] },
        loadChildren: () =>
          import('./modules/clients/clients.routes').then(m => m.CLIENTS_ROUTES),
      },
      {
        path: 'admin',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_SUPER_ADMIN', 'FACT_ADMIN_COST'] },
        loadChildren: () =>
          import('./modules/admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      {
        path: 'billing',
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_BILLING', 'FACT_MANAGE_BILLING'] },
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
        canActivate: [permissionGuard],
        data: { permissions: ['FACT_VIEW_COST', 'FACT_MANAGE_COST'] },
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
