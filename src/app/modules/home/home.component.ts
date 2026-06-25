import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe }   from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Store }           from '@ngrx/store';
import { toSignal }        from '@angular/core/rxjs-interop';
import { selectCurrentUser, selectUserPermissions } from '@khalilrebhiitec/daf360';
import { PaymentService }  from '../payments/payment.service';
import { PaymentsDashboardStats } from '../payments/payment.model';
import { InvoiceService }  from '../invoicing/invoice.service';
import { InvoiceListItem, INVOICE_STATUT_CONFIG } from '../invoicing/invoice.model';

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

export interface ActivityItem {
  icon:      string;
  iconClass: string;
  title:     string;
  sub:       string;
  amount:    string | null;
  invoice:   InvoiceListItem;
}

// Paths are relative route names matching app.routes.ts children.
const MODULE_DEFS: ModuleDef[] = [
  { path: 'clients',        label: 'Clients',                 icon: 'groups',                 iconVariant: 'primary',   stat: '1 284 Clients',        statClass: 'stat--primary',   description: 'Référentiel clients, contrats et conditions de paiement.',               permission: null },
  { path: 'fournisseurs',   label: 'Fournisseurs',            icon: 'inventory_2',            iconVariant: 'secondary', stat: '412 Actifs',           statClass: 'stat--secondary', description: 'Admin, banques et historique des achats.',                               permission: null },
  { path: 'affaires',       label: 'Affaires',                icon: 'business_center',        iconVariant: 'tertiary',  stat: '86 En cours',          statClass: 'stat--tertiary',  description: 'Gestion de projets, budgets et jalons de facturation.',                 permission: null },
  { path: 'invoicing',      label: 'Facturation',             icon: 'receipt_long',           iconVariant: 'fact',      stat: '',                     statClass: '',                description: 'Création, validation et cycle de vie des factures.',                    permission: null },
  { path: 'payments',       label: 'Paiements',               icon: 'payments',               iconVariant: 'pay',       stat: '98% Réconcilié',       statClass: 'stat--pay',       description: 'Rapprochement bancaire et suivi des soldes.',                           permission: null },
  { path: 'recouvrement',   label: 'Recouvrement',            icon: 'assignment_late',        iconVariant: 'error',     stat: 'Litiges critiques',    statClass: 'stat--error',     description: 'Relances, campagnes et gestion des litiges.',                           permission: null },
  { path: 'tresorerie',     label: 'Gestion de Trésorerie',  icon: 'account_balance_wallet', iconVariant: 'primary',   stat: '',                     statClass: '',                description: 'Flux de trésorerie, comptes bancaires et prévisions financières.',      permission: null, wide: true },
  { path: 'subcontracting', label: 'Sous-traitance',          icon: 'handshake',              iconVariant: 'slate',     stat: '24 Contrats',          statClass: 'stat--slate',     description: 'Gestion des sous-traitants, commandes et coûts.',                       permission: null },
  { path: 'cost',           label: 'Coûts',                   icon: 'trending_down',          iconVariant: 'amber',     stat: '-2.4% vs Budget',      statClass: 'stat--amber',     description: 'Coûts opérationnels, variances et CAPEX/OPEX.',                        permission: null },
  { path: 'reporting',      label: 'Reporting',               icon: 'monitoring',             iconVariant: 'primary',   stat: 'Nouveau rapport prêt', statClass: 'stat--primary',   description: 'Dashboards financiers, KPIs et analyse de profitabilité.',              permission: null },
  { path: 'admin',          label: 'Administration',          icon: 'admin_panel_settings',   iconVariant: 'outline',   stat: 'Paramètres sécurisés', statClass: 'stat--muted',     description: 'Réglages système, devises et workflows de validation.',                 permission: null },
];

const ACTIVITY_CONFIG: Record<string, { icon: string; cls: string }> = {
  PAID:           { icon: 'check_circle',   cls: 'act--green'  },
  APPROVED:       { icon: 'verified',       cls: 'act--green'  },
  EMITTED:        { icon: 'send',           cls: 'act--blue'   },
  SENT:           { icon: 'mark_email_read',cls: 'act--blue'   },
  PARTIALLY_PAID: { icon: 'payments',       cls: 'act--teal'   },
  SUBMITTED:      { icon: 'hourglass_top',  cls: 'act--amber'  },
  RETURNED:       { icon: 'undo',           cls: 'act--amber'  },
  DRAFT:          { icon: 'edit_note',      cls: 'act--slate'  },
  DISPUTED:       { icon: 'gavel',          cls: 'act--red'    },
  CANCELLED:      { icon: 'cancel',         cls: 'act--red'    },
  CREDIT_NOTED:   { icon: 'receipt',        cls: 'act--slate'  },
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly paymentSvc     = inject(PaymentService);
  private readonly invoiceSvc     = inject(InvoiceService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly ngrx           = inject(Store);

  private readonly currentUser  = toSignal(this.ngrx.select(selectCurrentUser));
  private readonly permissions  = toSignal(this.ngrx.select(selectUserPermissions), { initialValue: [] as string[] });

  stats           = signal<PaymentsDashboardStats | null>(null);
  loadingStats    = signal(true);
  recentActivity  = signal<ActivityItem[]>([]);
  loadingActivity = signal(true);

  readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  readonly firstName = computed(() => {
    const full = this.currentUser()?.fullName ?? '';
    return full.split(' ')[0];
  });

  readonly visibleModules = computed((): ModuleDef[] => {
    const perms = this.permissions();
    return MODULE_DEFS.filter(m => !m.permission || perms.includes(m.permission));
  });

  ngOnInit(): void {
    this.paymentSvc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });

    this.invoiceSvc.getInvoices({ page: 0, size: 6, statut: null, from: null, to: null, search: null }).subscribe({
      next: res => {
        const items: ActivityItem[] = res.content.map(inv => {
          const cfg = ACTIVITY_CONFIG[inv.statut] ?? { icon: 'receipt_long', cls: 'act--slate' };
          const statutLabel = INVOICE_STATUT_CONFIG[inv.statut]?.label ?? inv.statut;
          return {
            icon:      cfg.icon,
            iconClass: cfg.cls,
            title:     `Facture ${inv.invoiceNumber ?? '(brouillon)'} — ${inv.clientNom ?? '—'}`,
            sub:       `${statutLabel}${inv.dateEmission ? ' · ' + this.fmtDate(inv.dateEmission) : ''}`,
            amount:    inv.montantTtc ? this.fmt(inv.montantTtc, inv.devise) : null,
            invoice:   inv,
          };
        });
        this.recentActivity.set(items);
        this.loadingActivity.set(false);
      },
      error: () => this.loadingActivity.set(false),
    });
  }

  navigateTo(path: string):      void { this.router.navigate(['../', path],       { relativeTo: this.activatedRoute }); }
  navigateToInvoice(id: number): void { this.router.navigate(['../', 'invoicing', id], { relativeTo: this.activatedRoute }); }

  fmt(v: number | undefined | null, devise = 'TND'): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  fmtDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
