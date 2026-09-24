import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, DafCellDirective, DataTableComponent,
  FormFieldComponent, MetricCardComponent, PageComponent, PageHeaderComponent,
  SectionCardComponent, TabsComponent,
  tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  BadgeVariant, BreadcrumbItem, MetricCardOptions, MetricDelta, PageHeaderBadge,
  TabItem, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { InvoiceService } from '../../invoicing/invoice.service';
import {
  InvoiceDetail, InvoicePaymentDto, ReminderDto, PAYMENT_MODES,
  INVOICE_STATUT_CONFIG, OVERDUE_STATUTS,
} from '../../invoicing/invoice.model';
import { STATUT_BADGE_VARIANT } from '../../invoicing/invoice-display';
import { PaymentModalComponent } from '../../invoicing/payment-modal.component';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { PermissionDirective } from '../../../shared/permission.directive';
import { daysPastDue, formatDate, offsetLabel, retardVariant } from '../payments-display';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Fiche de recouvrement d'une facture — `/finance/payments/:id`.
 *
 * Elle répond à une question que la fiche de facturation (`/finance/invoicing/:id`) ne
 * pose pas : **où en est l'encaissement**. D'où le partage :
 *
 * | Fiche facture              | Fiche recouvrement (ici)                 |
 * |----------------------------|------------------------------------------|
 * | lignes, TVA, totaux        | reste dû, retard, ancienneté             |
 * | cycle de vie du document   | échéancier de relances, envois effectués |
 * | avoir, litige, émission    | encaissements reçus, suspension relances |
 *
 * Aucune donnée n'est dupliquée : les trois appels (`getInvoice`, `getReminders`,
 * `getPayments`) sont les endpoints existants du service facturation. `getPayments`
 * n'avait jamais été appelé côté front — l'écran de recouvrement est son premier
 * consommateur.
 *
 * Squelette identique à la fiche facture et à la fiche affaire (UI-PLAYBOOK) : deux
 * colonnes en **flex inline**, jamais `grid` ni classes de point de rupture, parce que
 * le `styles.css` d'un remote ne contient que les classes que Tailwind a déjà vues.
 */
@Component({
  selector: 'app-recouvrement-detail',
  // `DisplayCurrencyPipe` n'est plus dans `imports` : depuis que le pied de tableau passe
  // par `paymentTotals()`, plus aucune expression du gabarit ne l'utilise. Il reste dans
  // `providers` — il est injecté comme service et mis en forme en TypeScript.
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ButtonComponent, FormFieldComponent,
    DataTableComponent, DafCellDirective, PaymentModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './recouvrement-detail.component.html',
})
export class RecouvrementDetailComponent implements OnInit {
  private readonly svc       = inject(InvoiceService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  /**
   * Lu sur `paramMap` plutôt que par `input()` lié à la route : ce remote est monté par
   * le routeur du shell, et `withComponentInputBinding()` est une option du *routeur
   * hôte*. Le paramètre d'URL, lui, est toujours là.
   */
  private readonly invoiceId = Number(this.route.snapshot.paramMap.get('id'));

  invoice     = signal<InvoiceDetail | null>(null);
  reminders   = signal<ReminderDto[]>([]);
  payments    = signal<InvoicePaymentDto[]>([]);

  loading = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);

  private readonly paymentModal = viewChild.required<PaymentModalComponent>('paymentModal');
  showSuspendForm  = signal(false);
  suspendReason    = signal('');

  /** Adossé au paramètre d'URL — voir tabParam : survit au rechargement et au précédent. */
  activeTab = tabParam(computed(() => this.tabs().map(t => t.id)), 'reminders');

  // ═══ Dérivés métier ═══════════════════════════════════════════════════════

  /** Total encaissé — la somme des règlements, pas un champ de la facture. */
  readonly collected = computed(() =>
    this.payments().reduce((sum, p) => sum + (p.amountLocal ?? 0), 0));

  /** Reste dû, plancher à zéro : un trop-perçu n'est pas une dette négative. */
  readonly outstanding = computed(() =>
    Math.max(0, (this.invoice()?.montantTtc ?? 0) - this.collected()));

  /**
   * Jours de retard, recalculés ici : la fiche facture ne porte pas ce champ.
   *
   * En **jours de calendrier** (`daysPastDue`), comme les compte le serveur pour la liste
   * — les deux écrans annonçaient sinon un jour d'écart selon le fuseau du navigateur.
   */
  readonly daysLate = computed(() =>
    this.isOverdue() ? Math.max(0, daysPastDue(this.invoice()?.dateEcheance)) : 0);

  readonly isOverdue = computed(() => {
    const inv = this.invoice();
    if (!inv || !OVERDUE_STATUTS.has(inv.statut)) return false;
    return daysPastDue(inv.dateEcheance) > 0;
  });

  /**
   * L'échéancier est actif tant qu'il reste au moins une relance ni envoyée ni
   * suspendue. Déduit de la liste plutôt que lu sur `invoice.remindersActive` : c'est
   * la même source que ce que l'onglet affiche, donc la pastille ne peut pas contredire
   * les lignes juste en dessous.
   */
  readonly remindersActive = computed(() =>
    this.reminders().some(r => !r.isSent && !r.isSuspended));

  /** Il n'y a rien à réactiver si aucune relance en attente n'est suspendue. */
  readonly hasSuspended = computed(() =>
    this.reminders().some(r => !r.isSent && r.isSuspended));

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerSubtitle = computed(() => {
    const inv = this.invoice();
    return inv ? [inv.clientNom, inv.affaireRef].filter(Boolean).join(' · ') : '';
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();

    const badges: PageHeaderBadge[] = [{
      label:   this.statutLabel(inv.statut),
      variant: STATUT_BADGE_VARIANT[inv.statut] ?? 'neutral',
      dot:     true,
    }];

    if (this.isOverdue()) {
      badges.push({
        label:   this.translate.instant('PAYMENTS.DASHBOARD.DAYS', { n: this.daysLate() }),
        variant: retardVariant(this.daysLate()) as BadgeVariant,
        icon:    'schedule',
      });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('PAYMENTS.DETAIL.BACK'), link: ['..'] },
      { label: this.invoice()?.invoiceNumber ?? this.translate.instant('PAYMENTS.COMMON.DRAFT') },
    ];
  });

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const fields: DetailField[] = [
      { label: 'PAYMENTS.DETAIL.INFO.CLIENT', value: inv.clientNom },
    ];
    if (inv.affaireRef) {
      fields.push({
        label: 'PAYMENTS.DETAIL.INFO.AFFAIRE',
        value: [inv.affaireRef, inv.affaireIntitule].filter(Boolean).join(' — '),
      });
    }
    return fields;
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const lang = this.translate.currentLang();
    return [
      { label: 'PAYMENTS.DETAIL.INFO.ISSUE_DATE', value: formatDate(inv.dateEmission, lang) },
      { label: 'PAYMENTS.DETAIL.INFO.DUE_DATE',   value: formatDate(inv.dateEcheance, lang) },
      { label: 'PAYMENTS.DETAIL.INFO.CURRENCY',   value: inv.devise },
      {
        label: 'PAYMENTS.DETAIL.INFO.REMINDERS_STATE',
        value: this.translate.instant(
          this.remindersActive()
            ? 'PAYMENTS.DETAIL.REMINDERS.ACTIVE'
            : 'PAYMENTS.DETAIL.REMINDERS.SUSPENDED'),
      },
      {
        label: 'PAYMENTS.DETAIL.INFO.LAST_SENT',
        value: formatDate(this.lastSentAt(), lang),
      },
    ];
  });

  private readonly lastSentAt = computed<string | null>(() => {
    const sent = this.reminders().filter(r => r.isSent && r.sentAt);
    if (!sent.length) return null;
    return sent.reduce((a, b) => (a.sentAt! > b.sentAt! ? a : b)).sentAt;
  });

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  readonly kpiTiles = computed<KpiTile[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();

    const paidPct = inv.montantTtc > 0
      ? Math.round((this.collected() / inv.montantTtc) * 100)
      : 0;

    return [
      {
        label: 'PAYMENTS.DETAIL.KPI.AMOUNT',
        value: this.currency.transform(inv.montantTtc, inv.devise),
        delta: null,
        options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'PAYMENTS.DETAIL.KPI.COLLECTED',
        value: this.currency.transform(this.collected(), inv.devise),
        // « 0 % » ne monte pas. `direction: 'up'` était inconditionnel et peignait donc en
        // vert le taux de recouvrement d'une facture dont rien n'a été encaissé ; ce n'est
        // d'ailleurs pas une variation mais une part, d'où `deltaColor` explicite plutôt
        // qu'une direction. Le libellé dit de quoi c'est la part — un « 42 % » nu sous un
        // montant encaissé pouvait tout aussi bien être lu comme une évolution.
        delta: {
          value: this.translate.instant('PAYMENTS.DETAIL.KPI.COLLECTED_PCT', { pct: paidPct }),
        },
        options: {
          icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10',
          deltaColor: paidPct > 0 ? 'text-teal' : 'text-on-surface-variant',
        },
      },
      {
        label: 'PAYMENTS.DETAIL.KPI.OUTSTANDING',
        value: this.currency.transform(this.outstanding(), inv.devise),
        delta: null,
        options: this.outstanding() > 0
          ? { icon: 'account_balance_wallet', iconColor: 'text-warning', iconBg: 'bg-warning/10', valueColor: 'text-warning' }
          : { icon: 'task_alt', iconColor: 'text-teal', iconBg: 'bg-teal/10', valueColor: 'text-teal' },
      },
      {
        label: 'PAYMENTS.DETAIL.KPI.DAYS_LATE',
        value: this.isOverdue()
          ? this.translate.instant('PAYMENTS.DASHBOARD.DAYS', { n: this.daysLate() })
          : this.translate.instant('PAYMENTS.DETAIL.KPI.ON_TIME'),
        delta: null,
        options: this.isOverdue()
          ? { icon: 'schedule', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
          : { icon: 'schedule', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
    ];
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      // `count: null` plutôt qu'omis : l'espace du compteur est réservé dès le premier
      // rendu, donc le libellé ne se décale pas quand les listes arrivent.
      { id: 'reminders', label: this.translate.instant('PAYMENTS.DETAIL.TABS.REMINDERS'), count: this.reminders().length || null },
      { id: 'payments',  label: this.translate.instant('PAYMENTS.DETAIL.TABS.PAYMENTS'),  count: this.payments().length  || null },
    ];
  });

  // ── Échéancier de relances ────────────────────────────────────────────────

  readonly reminderColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'type',      label: t('PAYMENTS.DETAIL.REMINDERS.COL_TYPE'),      type: 'custom' },
      { key: 'scheduled', label: t('PAYMENTS.DETAIL.REMINDERS.COL_SCHEDULED'), type: 'text'   },
      { key: 'sent',      label: t('PAYMENTS.DETAIL.REMINDERS.COL_SENT'),      type: 'text'   },
      { key: 'state',     label: t('PAYMENTS.DETAIL.REMINDERS.COL_STATUS'),    type: 'custom' },
    ];
  });

  readonly reminderRows = computed<TableRow[]>(() => {
    const lang = this.translate.currentLang();
    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);

    return this.reminders().map(r => {
      // Le libellé vient de la règle : les paliers sont configurables, leur liste n'est
      // plus connue à la compilation. Sans règle, la relance vient d'un échéancier retiré
      // depuis — elle est nommée comme telle, avec son code en second plan, plutôt
      // qu'affichée sous la forme brute « J_PLUS_30 » ou effacée de l'historique.
      const label = lang === 'en' ? r.labelEn : r.labelFr;
      return {
        id: r.id,
        _label:   label ?? t('PAYMENTS.DETAIL.REMINDERS.RETIRED_STAGE'),
        _code:    label ? '' : r.reminderType,
        _offset:  offsetLabel(r.offsetDays, t),
        scheduled: formatDate(r.scheduledDate, lang),
        sent:      formatDate(r.sentAt, lang),
        // Rendus par le gabarit projeté : la pastille et son motif de suspension.
        _state:  r.isSent ? 'sent' : r.isSuspended ? 'suspended' : 'pending',
        _reason: r.suspensionReason ?? '',
      };
    });
  });

  readonly reminderConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('PAYMENTS.DETAIL.REMINDERS.EMPTY'),
    };
  });

  // ── Encaissements reçus ───────────────────────────────────────────────────

  /**
   * Quatre colonnes plutôt que cinq : la référence bancaire glisse sous le mode de
   * règlement (elle ne se lit jamais sans lui), et la date de saisie sous la date de
   * valeur. Cela laisse une colonne pleine aux **notes**, que la table n'affichait pas
   * du tout — c'est pourtant la seule trace écrite de ce qui a été convenu avec le client
   * (« virement annoncé », « chèque reçu, à déposer »), et le recouvrement la cherche.
   */
  readonly paymentColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'date',   label: t('PAYMENTS.DETAIL.PAYMENTS.COL_DATE'),   type: 'custom' },
      { key: 'method', label: t('PAYMENTS.DETAIL.PAYMENTS.COL_METHOD'), type: 'custom' },
      { key: 'notes',  label: t('PAYMENTS.DETAIL.PAYMENTS.COL_NOTES'),  type: 'text'   },
      { key: 'amount', label: t('PAYMENTS.DETAIL.PAYMENTS.COL_AMOUNT'), type: 'text', align: 'right' },
    ];
  });

  readonly paymentRows = computed<TableRow[]>(() => {
    const lang   = this.translate.currentLang();
    const devise = this.invoice()?.devise ?? '';
    return this.payments().map(p => ({
      id:     p.id,
      notes:  p.notes?.trim() || '—',
      amount: this.currency.transform(p.amountLocal, p.currency || devise),
      // Rendus par les gabarits projetés : chacun une valeur et sa précision en dessous.
      _date:       formatDate(p.paymentDate, lang),
      _recordedAt: p.recordedAt
        ? this.translate.instant('PAYMENTS.DETAIL.PAYMENTS.RECORDED_AT',
            { date: formatDate(p.recordedAt, lang) })
        : '',
      _method: this.paymentModeLabel(p.paymentMethod),
      _ref:    p.bankReference?.trim() || '',
    }));
  });

  /**
   * Le pied de l'onglet « encaissements » : facturé − encaissé = reste dû, dans l'ordre
   * du calcul. Chaque montant porte son propre libellé au-dessus de lui — l'ancien pied
   * en alignait un seul, « TOTAL », deux éléments avant la valeur qu'il nommait.
   */
  readonly paymentTotals = computed<{ label: string; value: string; tone: string }[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    return [
      { label: 'PAYMENTS.DETAIL.KPI.AMOUNT',
        value: this.currency.transform(inv.montantTtc, inv.devise), tone: 'text-on-surface' },
      { label: 'PAYMENTS.DETAIL.PAYMENTS.TOTAL',
        value: this.currency.transform(this.collected(), inv.devise), tone: 'text-teal' },
      { label: 'PAYMENTS.DETAIL.KPI.OUTSTANDING',
        value: this.currency.transform(this.outstanding(), inv.devise),
        // Classes littérales et complètes (§3). Un reste dû nul est une facture soldée,
        // pas un avertissement.
        tone: this.outstanding() > 0 ? 'text-warning' : 'text-on-surface-variant' },
    ];
  });

  readonly paymentConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('PAYMENTS.DETAIL.PAYMENTS.EMPTY'),
    };
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (!this.invoiceId) {
      this.loading.set(false);
      this.error.set(this.translate.instant('PAYMENTS.DETAIL.LOAD_ERROR'));
      return;
    }
    this.load();
  }

  /**
   * Un seul `forkJoin` : les trois listes composent une même lecture, et les afficher
   * l'une après l'autre ferait sauter les indicateurs (le reste dû dépend des
   * encaissements). `getReminders` / `getPayments` avalent déjà leurs erreurs et
   * renvoient `[]`, donc seule la facture peut faire échouer l'écran.
   */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      invoice:   this.svc.getInvoice(this.invoiceId),
      reminders: this.svc.getReminders(this.invoiceId),
      payments:  this.svc.getPayments(this.invoiceId),
    }).subscribe({
      next: ({ invoice, reminders, payments }) => {
        this.invoice.set(invoice);
        this.reminders.set(reminders);
        this.payments.set(payments);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('PAYMENTS.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  /** Rechargement partiel après une action — la page reste affichée pendant. */
  private refresh(): void {
    forkJoin({
      invoice:   this.svc.getInvoice(this.invoiceId),
      reminders: this.svc.getReminders(this.invoiceId),
      payments:  this.svc.getPayments(this.invoiceId),
    }).subscribe({
      next: ({ invoice, reminders, payments }) => {
        this.invoice.set(invoice);
        this.reminders.set(reminders);
        this.payments.set(payments);
      },
      error: () => this.actionError.set(this.translate.instant('PAYMENTS.DETAIL.LOAD_ERROR')),
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  openPaymentModal(): void {
    this.actionError.set(null);
    const inv = this.invoice();
    if (inv) this.paymentModal().open(inv, () => this.refresh());
  }

  openSuspend(): void {
    this.actionError.set(null);
    this.suspendReason.set('');
    this.showSuspendForm.set(true);
  }

  confirmSuspend(): void {
    this.svc.suspendReminders(this.invoiceId, this.suspendReason().trim() || null).subscribe({
      next:  () => { this.showSuspendForm.set(false); this.refresh(); },
      error: err => this.actionError.set(err?.error?.message
        ?? this.translate.instant('PAYMENTS.DETAIL.ACTION_ERROR')),
    });
  }

  reactivate(): void {
    this.actionError.set(null);
    this.svc.reactivateReminders(this.invoiceId).subscribe({
      next:  () => this.refresh(),
      error: err => this.actionError.set(err?.error?.message
        ?? this.translate.instant('PAYMENTS.DETAIL.ACTION_ERROR')),
    });
  }

  /** La fiche du **document** — l'autre moitié de l'histoire (lignes, TVA, avoir). */
  goToInvoice(): void {
    this.router.navigate(['../../invoicing', this.invoiceId], { relativeTo: this.route });
  }

  goToAffaire(): void {
    const affaireId = this.invoice()?.affaireId;
    if (affaireId) this.router.navigate(['../../affaires', affaireId], { relativeTo: this.route });
  }

  // ═══ Libellés ═════════════════════════════════════════════════════════════

  private statutLabel(statut: string): string {
    const key = INVOICE_STATUT_CONFIG[statut]?.label;
    return key ? this.translate.instant(key) : statut;
  }

  private paymentModeLabel(mode: string | null): string {
    if (!mode) return '—';
    const key = PAYMENT_MODES[mode];
    return key ? this.translate.instant(key) : mode;
  }
}
