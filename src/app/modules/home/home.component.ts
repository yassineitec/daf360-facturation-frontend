import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe }   from '@angular/common';
import { Router }          from '@angular/router';
import { PaymentService }  from '../payments/payment.service';
import { PaymentsDashboardStats } from '../payments/payment.model';
import { UserStore }       from '../../core/user.store';

interface ModuleDef {
  path:        string;
  label:       string;
  description: string;
  icon:        string;
  iconVariant: string;
  stat:        string;
  statClass:   string;
  permission:  string | null;
  wide?:       boolean;
}

const MODULE_DEFS: ModuleDef[] = [
  { path: '/fact/clients',        label: 'Clients',             icon: 'groups',                 iconVariant: 'primary',   stat: '1 284 Clients',           statClass: 'stat--primary',   description: 'Référentiel clients, contrats et conditions de paiement.', permission: null },
  { path: '/fact/fournisseurs',   label: 'Fournisseurs',        icon: 'inventory_2',            iconVariant: 'secondary', stat: '412 Actifs',              statClass: 'stat--secondary', description: 'Admin, banques et historique des achats.',                  permission: null },
  { path: '/fact/affaires',       label: 'Affaires',            icon: 'business_center',        iconVariant: 'tertiary',  stat: '86 En cours',             statClass: 'stat--tertiary',  description: 'Gestion de projets, budgets et jalons de facturation.',    permission: 'FACT_CREATE_AFFAIRE' },
  { path: '/fact/invoicing',      label: 'Facturation',         icon: 'receipt_long',           iconVariant: 'fact',      stat: '',                        statClass: '',                description: 'Création, validation et cycle de vie des factures.',       permission: 'FACT_CREATE_INVOICE' },
  { path: '/fact/payments',       label: 'Paiements',           icon: 'payments',               iconVariant: 'pay',       stat: '98% Réconcilié',          statClass: 'stat--pay',       description: 'Rapprochement bancaire et suivi des soldes.',              permission: 'FACT_BANK_RECONCILIATION' },
  { path: '/fact/recouvrement',   label: 'Recouvrement',        icon: 'assignment_late',        iconVariant: 'error',     stat: 'Litiges critiques',       statClass: 'stat--error',     description: 'Relances, campagnes et gestion des litiges.',              permission: null },
  { path: '/fact/tresorerie',     label: 'Gestion de Trésorerie', icon: 'account_balance_wallet', iconVariant: 'primary', stat: '',                        statClass: '',                description: 'Flux de trésorerie, comptes bancaires et prévisions financières.', permission: null, wide: true },
  { path: '/fact/subcontracting', label: 'Sous-traitance',      icon: 'handshake',              iconVariant: 'slate',     stat: '24 Contrats',             statClass: 'stat--slate',     description: 'Gestion des sous-traitants, commandes et coûts.',          permission: 'FACT_MANAGE_ST' },
  { path: '/fact/cost',           label: 'Coûts',               icon: 'trending_down',          iconVariant: 'amber',     stat: '-2.4% vs Budget',         statClass: 'stat--amber',     description: 'Coûts opérationnels, variances et CAPEX/OPEX.',            permission: null },
  { path: '/fact/reporting',      label: 'Reporting',           icon: 'monitoring',             iconVariant: 'primary',   stat: 'Nouveau rapport prêt',    statClass: 'stat--primary',   description: 'Dashboards financiers, KPIs et analyse de profitabilité.',  permission: 'FACT_VIEW_KPIS' },
  { path: '/fact/admin',          label: 'Administration',      icon: 'admin_panel_settings',   iconVariant: 'outline',   stat: 'Paramètres sécurisés',    statClass: 'stat--muted',     description: 'Réglages système, devises et workflows de validation.',     permission: 'FACT_VALIDER_BUDGET' },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly svc    = inject(PaymentService);
  private readonly router = inject(Router);
  readonly store          = inject(UserStore);

  stats        = signal<PaymentsDashboardStats | null>(null);
  loadingStats = signal(true);

  readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  readonly firstName = computed(() => {
    const name = this.store.user()?.fullName ?? '';
    return name.split(' ')[0];
  });

  readonly visibleModules = computed((): ModuleDef[] => {
    const perms = this.store.permissions();
    return MODULE_DEFS.filter(m => !m.permission || perms.includes(m.permission));
  });

  ngOnInit(): void {
    this.svc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });
  }

  navigateTo(path: string): void { this.router.navigate([path]); }

  fmt(v: number | undefined | null, devise = 'TND'): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
