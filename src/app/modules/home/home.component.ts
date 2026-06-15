import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { RouterLink }                from '@angular/router';
import { DomSanitizer, SafeHtml }    from '@angular/platform-browser';
import { PaymentService }            from '../payments/payment.service';
import { PaymentsDashboardStats }    from '../payments/payment.model';
import { UserStore }                 from '../../core/user.store';

interface ModuleCard {
  path:        string;
  label:       string;
  description: string;
  icon:        SafeHtml;
  color:       string;
  permission:  string | null;
}

const MODULE_DEFS = [
  { path: '/fact/affaires',       label: 'Affaires',       color: '#0e7490', permission: 'FACT_CREATE_AFFAIRE',      description: 'Gérez les affaires, budgets, jalons et travaux supplémentaires.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>` },
  { path: '/fact/invoicing',      label: 'Factures',       color: '#7c3aed', permission: 'FACT_CREATE_INVOICE',      description: 'Créez, validez et suivez le cycle de vie complet de vos factures.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` },
  { path: '/fact/payments',       label: 'Paiements',      color: '#0f766e', permission: 'FACT_BANK_RECONCILIATION', description: 'Suivez les paiements, relances et rapprochements bancaires.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>` },
  { path: '/fact/subcontracting', label: 'Sous-traitance', color: '#b45309', permission: 'FACT_MANAGE_ST',           description: 'Gérez les sous-traitants, ordres et coûts de sous-traitance.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  { path: '/fact/cost',           label: 'Coûts',          color: '#be185d', permission: null,                       description: 'Enregistrez et analysez les coûts opérationnels et CAPEX.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>` },
  { path: '/fact/reporting',      label: 'Reporting',      color: '#1d4ed8', permission: 'FACT_VIEW_KPIS',           description: 'Visualisez les KPIs, tableaux de bord P&L et rapports budgétaires.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>` },
  { path: '/fact/admin',          label: 'Administration', color: '#475569', permission: 'FACT_VALIDER_BUDGET',       description: 'Configurez les références, séquences et validez les budgets.', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, DecimalPipe, TitleCasePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly svc       = inject(PaymentService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly store             = inject(UserStore);

  stats        = signal<PaymentsDashboardStats | null>(null);
  loadingStats = signal(true);

  readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  readonly firstName = computed(() => {
    const name = this.store.user()?.fullName ?? '';
    return name.split(' ')[0];
  });

  readonly visibleModules = computed((): ModuleCard[] => {
    const perms = this.store.permissions();
    return MODULE_DEFS
      .filter(m => !m.permission || perms.includes(m.permission))
      .map(m => ({ ...m, icon: this.sanitizer.bypassSecurityTrustHtml(m.svg) }));
  });

  ngOnInit(): void {
    this.svc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });
  }

  fmt(v: number | undefined | null, devise = 'TND'): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
