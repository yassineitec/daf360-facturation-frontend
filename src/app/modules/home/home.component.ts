import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe }   from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Store }           from '@ngrx/store';
import { toSignal }        from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CardComponent, CardOptions, selectCurrentUser, selectUserPermissions } from '@khalilrebhiitec/daf360';
import { PaymentService }  from '../payments/payment.service';
import { PaymentsDashboardStats } from '../payments/payment.model';
import { InvoiceService }  from '../invoicing/invoice.service';
import { InvoiceListItem, INVOICE_STATUT_CONFIG } from '../invoicing/invoice.model';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';

interface ModuleDef {
  path:        string;
  labelKey:    string;
  descKey:     string;
  icon:        string;
  iconVariant: string;
  statKey:     string;
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

const ICON_VARIANTS: Record<string, { bg: string; clr: string; hbg: string }> = {
  primary:   { bg: 'icon-bg--primary',   clr: 'icon-clr--primary',   hbg: 'icon-hbg--primary'   },
  secondary: { bg: 'icon-bg--secondary', clr: 'icon-clr--secondary', hbg: 'icon-hbg--secondary' },
  tertiary:  { bg: 'icon-bg--tertiary',  clr: 'icon-clr--tertiary',  hbg: 'icon-hbg--tertiary'  },
  fact:      { bg: 'icon-bg--fact',      clr: 'icon-clr--fact',      hbg: 'icon-hbg--fact'      },
  pay:       { bg: 'icon-bg--pay',       clr: 'icon-clr--pay',       hbg: 'icon-hbg--pay'       },
  error:     { bg: 'icon-bg--error',     clr: 'icon-clr--error',     hbg: 'icon-hbg--error'     },
  slate:     { bg: 'icon-bg--slate',     clr: 'icon-clr--slate',     hbg: 'icon-hbg--slate'     },
  amber:     { bg: 'icon-bg--amber',     clr: 'icon-clr--amber',     hbg: 'icon-hbg--amber'     },
  outline:   { bg: 'icon-bg--outline',   clr: 'icon-clr--outline',   hbg: 'icon-hbg--outline'   },
};

const MODULE_DEFS: ModuleDef[] = [
  { path: 'clients',        labelKey: 'HOME.MODULES.CLIENTS.LABEL',       descKey: 'HOME.MODULES.CLIENTS.DESC',       icon: 'groups',                 iconVariant: 'primary',   statKey: 'HOME.MODULES.CLIENTS.STAT',       statClass: 'stat--primary',   permission: null },
  { path: 'fournisseurs',   labelKey: 'HOME.MODULES.SUPPLIERS.LABEL',     descKey: 'HOME.MODULES.SUPPLIERS.DESC',     icon: 'inventory_2',            iconVariant: 'secondary', statKey: 'HOME.MODULES.SUPPLIERS.STAT',     statClass: 'stat--secondary', permission: null },
  { path: 'affaires',       labelKey: 'HOME.MODULES.PROJECTS.LABEL',      descKey: 'HOME.MODULES.PROJECTS.DESC',      icon: 'business_center',        iconVariant: 'tertiary',  statKey: 'HOME.MODULES.PROJECTS.STAT',      statClass: 'stat--tertiary',  permission: null },
  { path: 'invoicing',      labelKey: 'HOME.MODULES.INVOICING.LABEL',     descKey: 'HOME.MODULES.INVOICING.DESC',     icon: 'receipt_long',           iconVariant: 'fact',      statKey: '',                                statClass: '',                permission: null },
  { path: 'payments',       labelKey: 'HOME.MODULES.PAYMENTS.LABEL',      descKey: 'HOME.MODULES.PAYMENTS.DESC',      icon: 'payments',               iconVariant: 'pay',       statKey: 'HOME.MODULES.PAYMENTS.STAT',      statClass: 'stat--pay',       permission: null },
  { path: 'recouvrement',   labelKey: 'HOME.MODULES.RECOVERY.LABEL',      descKey: 'HOME.MODULES.RECOVERY.DESC',      icon: 'assignment_late',        iconVariant: 'error',     statKey: 'HOME.MODULES.RECOVERY.STAT',      statClass: 'stat--error',     permission: null },
  { path: 'tresorerie',     labelKey: 'HOME.MODULES.TREASURY.LABEL',      descKey: 'HOME.MODULES.TREASURY.DESC',      icon: 'account_balance_wallet', iconVariant: 'primary',   statKey: '',                                statClass: '',                permission: null, wide: true },
  { path: 'subcontracting', labelKey: 'HOME.MODULES.SUBCONTRACTING.LABEL',descKey: 'HOME.MODULES.SUBCONTRACTING.DESC',icon: 'handshake',              iconVariant: 'slate',     statKey: 'HOME.MODULES.SUBCONTRACTING.STAT',statClass: 'stat--slate',     permission: null },
  { path: 'cost',           labelKey: 'HOME.MODULES.COSTS.LABEL',         descKey: 'HOME.MODULES.COSTS.DESC',         icon: 'trending_down',          iconVariant: 'amber',     statKey: 'HOME.MODULES.COSTS.STAT',         statClass: 'stat--amber',     permission: null },
  { path: 'reporting',      labelKey: 'HOME.MODULES.REPORTING.LABEL',     descKey: 'HOME.MODULES.REPORTING.DESC',     icon: 'monitoring',             iconVariant: 'primary',   statKey: 'HOME.MODULES.REPORTING.STAT',     statClass: 'stat--primary',   permission: null },
  { path: 'admin',          labelKey: 'HOME.MODULES.ADMIN.LABEL',         descKey: 'HOME.MODULES.ADMIN.DESC',         icon: 'admin_panel_settings',   iconVariant: 'outline',   statKey: 'HOME.MODULES.ADMIN.STAT',         statClass: 'stat--muted',     permission: null },
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
  imports: [TitleCasePipe, CardComponent, TranslatePipe, DisplayCurrencyPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  readonly kpiOpts = {
    collected: { variant: 'glass', padding: 'md', radius: 'xl', hoverable: true, fullHeight: true, icon: 'trending_up', iconFilled: false, iconBg: 'kpi-bg-green', iconColor: 'kpi-c-green', iconHoverBg: 'kpi-hbg-green', iconHoverColor: 'icon-hclr' } as CardOptions,
    pending:   { variant: 'glass', padding: 'md', radius: 'xl', hoverable: true, fullHeight: true, icon: 'schedule',    iconFilled: false, iconBg: 'kpi-bg-sec',   iconColor: 'kpi-c-sec',   iconHoverBg: 'kpi-hbg-sec',   iconHoverColor: 'icon-hclr' } as CardOptions,
    overdue:   { variant: 'glass', padding: 'md', radius: 'xl', hoverable: true, fullHeight: true, icon: 'warning',     iconFilled: false, iconBg: 'kpi-bg-red',   iconColor: 'kpi-c-red',   iconHoverBg: 'kpi-hbg-red',   iconHoverColor: 'icon-hclr' } as CardOptions,
    dso:       { variant: 'glass', padding: 'md', radius: 'xl', hoverable: true, fullHeight: true, icon: 'timer',       iconFilled: false, iconBg: 'kpi-bg-amber', iconColor: 'kpi-c-amber', iconHoverBg: 'kpi-hbg-amber', iconHoverColor: 'icon-hclr' } as CardOptions,
  };

  moduleCardOpts: Record<string, CardOptions> = {};
  private readonly paymentSvc     = inject(PaymentService);
  private readonly invoiceSvc     = inject(InvoiceService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly ngrx           = inject(Store);
  private readonly translate      = inject(TranslateService);

  private readonly currentUser  = toSignal(this.ngrx.select(selectCurrentUser));
  private readonly permissions  = toSignal(this.ngrx.select(selectUserPermissions), { initialValue: [] as string[] });

  stats           = signal<PaymentsDashboardStats | null>(null);
  loadingStats    = signal(true);
  recentActivity  = signal<ActivityItem[]>([]);
  loadingActivity = signal(true);
  pendingCount    = signal<number | null>(null);

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
    this.moduleCardOpts = Object.fromEntries(
      MODULE_DEFS.map(m => {
        const ic = ICON_VARIANTS[m.iconVariant] ?? ICON_VARIANTS['primary'];
        return [m.path, {
          variant:        'glass',
          padding:        'md',
          radius:         'xl',
          hoverable:      true,
          clickable:      true,
          fullHeight:     true,
          icon:           m.icon,
          iconFilled:     true,
          iconBg:         ic.bg,
          iconColor:      ic.clr,
          iconHoverBg:    ic.hbg,
          iconHoverColor: 'icon-hclr',
          title:          this.translate.instant(m.labelKey),
          description:    this.translate.instant(m.descKey),
        } as CardOptions];
      })
    );

    this.paymentSvc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });

    this.invoiceSvc.getInvoices({ page: 0, size: 1, statut: 'SUBMITTED', from: null, to: null, search: null }).subscribe({
      next:  res => this.pendingCount.set(res.totalElements),
      error: ()  => this.pendingCount.set(0),
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
