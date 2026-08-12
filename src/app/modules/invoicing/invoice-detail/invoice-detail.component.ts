import {
  Component, OnInit, TemplateRef, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, ButtonOptions, DafCellDirective, DataTableComponent,
  FormFieldComponent, MetricCardComponent, ModalService, PageComponent,
  PageHeaderComponent, SectionCardComponent, TabsComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, MetricCardOptions, MetricDelta, PageHeaderBadge,
  TabItem, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';

import { InvoiceService } from '../invoice.service';
import {
  InvoiceDetail, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS, CONDITIONS_PAIEMENT,
} from '../invoice.model';
import { STATUT_BADGE_VARIANT } from '../invoice-display';
import { PaymentModalComponent } from '../payment-modal.component';
import { CreditNoteModalComponent } from './credit-note-modal.component';
import { RemindersPanelComponent } from './reminders-panel.component';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/** L'action de cycle de vie proposée pour le statut courant. */
interface PrimaryAction {
  options: ButtonOptions;
  run:     () => void;
}

/**
 * Fiche facture — refondue sur le squelette de la fiche affaire.
 *
 * Ce qui a disparu : la page `.detail-page` et ses 743 lignes de SCSS, l'en-tête maison
 * `app-page-header`, la grille d'indicateurs à la main, la table des lignes dupliquée en
 * version « mobile », et la barre de cycle de vie en `daf-stepper`.
 *
 * Le rail d'étapes est remplacé par des actions NOMMÉES en pied de carte : il indiquait
 * la position dans le parcours — ce que disent déjà la pastille de statut et la tuile de
 * progression — mais son bouton « Suivant » ne disait pas ce qu'il allait déclencher, et
 * son bouton « Précédent » ne faisait rien (voir `openReturnModal`).
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [
    TranslatePipe, DisplayCurrencyPipe,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ButtonComponent, FormFieldComponent,
    DataTableComponent, DafCellDirective,
    PaymentModalComponent, CreditNoteModalComponent, RemindersPanelComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './invoice-detail.component.html',
})
export class InvoiceDetailComponent implements OnInit {
  private readonly svc       = inject(InvoiceService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly modals    = inject(ModalService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  private readonly commentTpl = viewChild.required<TemplateRef<unknown>>('commentTpl');

  id = input<string>();

  invoice     = signal<InvoiceDetail | null>(null);
  loading     = signal(false);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);
  saving      = signal(false);

  showPaymentModal = signal(false);
  showCreditNote   = signal(false);

  activeTab = signal<string>('lines');

  /** Texte partagé par les trois modales à commentaire (retour, litige, résolution). */
  readonly commentText = signal('');
  private commentFieldKey = signal('INVOICING.LIFECYCLE.COMMENT');

  // ═══ Statut ═══════════════════════════════════════════════════════════════

  readonly statut = computed(() => this.invoice()?.statut ?? '');

  private statutLabel(): string {
    const key = INVOICE_STATUT_CONFIG[this.statut()]?.label;
    return key ? this.translate.instant(key) : this.statut();
  }

  readonly isOverdue = computed(() => {
    const inv = this.invoice();
    if (!inv || !OVERDUE_STATUTS.has(inv.statut)) return false;
    if (!inv.dateEcheance) return false;
    return new Date(inv.dateEcheance) < new Date();
  });

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerSubtitle = computed(() => {
    const inv = this.invoice();
    if (!inv) return '';
    return [inv.clientNom, inv.affaireRef].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();

    const badges: PageHeaderBadge[] = [{
      label:   this.statutLabel(),
      variant: STATUT_BADGE_VARIANT[inv.statut] ?? 'neutral',
      dot:     true,
    }];

    if (this.isOverdue()) {
      badges.push({
        label:   this.translate.instant('INVOICING.DETAIL.OVERDUE'),
        variant: 'danger',
        icon:    'schedule',
      });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('INVOICING.DETAIL.BACK'), link: ['..'] },
      { label: this.invoice()?.invoiceNumber ?? this.translate.instant('INVOICING.DETAIL.DRAFT_TITLE') },
    ];
  });

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const fields: DetailField[] = [
      { label: 'INVOICING.DETAIL.INFO.CLIENT', value: inv.clientNom },
    ];
    if (inv.affaireRef) {
      fields.push({
        label: 'INVOICING.DETAIL.INFO.AFFAIRE',
        value: [inv.affaireRef, inv.affaireIntitule].filter(Boolean).join(' — '),
      });
    }
    if (inv.tsRef) {
      fields.push({ label: 'INVOICING.DETAIL.INFO.TS', value: inv.tsRef });
    }
    return fields;
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const fields: DetailField[] = [
      { label: 'INVOICING.DETAIL.INFO.TYPE',       value: inv.invoiceType ?? '—' },
      { label: 'INVOICING.DETAIL.INFO.CURRENCY',   value: inv.devise },
      { label: 'INVOICING.DETAIL.INFO.ISSUE_DATE', value: this.formatDate(inv.dateEmission) },
      { label: 'INVOICING.DETAIL.INFO.DUE_DATE',   value: this.formatDate(inv.dateEcheance) },
    ];
    if (inv.conditionsPaiement) {
      fields.push({ label: 'INVOICING.DETAIL.INFO.CONDITIONS', value: this.conditionLabel(inv.conditionsPaiement) });
    }
    if (inv.bonDeCommande) {
      fields.push({ label: 'INVOICING.DETAIL.INFO.BDC', value: inv.bonDeCommande });
    }
    return fields;
  });

  readonly traceFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const fields: DetailField[] = [
      { label: 'INVOICING.DETAIL.INFO.CREATED_AT', value: this.formatDate(inv.createdAt) },
    ];
    if (inv.updatedAt)         fields.push({ label: 'INVOICING.DETAIL.INFO.UPDATED_AT', value: this.formatDate(inv.updatedAt) });
    if (inv.dateEmission)      fields.push({ label: 'INVOICING.DETAIL.INFO.ISSUE_DATE', value: this.formatDate(inv.dateEmission) });
    if (inv.dateEcheance)      fields.push({ label: 'INVOICING.DETAIL.INFO.DUE_DATE',   value: this.formatDate(inv.dateEcheance) });
    if (inv.datePaiementFinal) fields.push({ label: 'INVOICING.DETAIL.INFO.PAID_ON',    value: this.formatDate(inv.datePaiementFinal) });
    return fields;
  });

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  readonly billingProgress = computed(() => {
    const map: Record<string, number> = {
      DRAFT: 5, SUBMITTED: 15, RETURNED: 10, APPROVED: 30,
      EMITTED: 50, SENT: 65, PARTIALLY_PAID: 75, PAID: 100,
      DISPUTED: 40, CANCELLED: 0, CREDIT_NOTED: 80,
    };
    return map[this.statut()] ?? 0;
  });

  /**
   * ⚠️ Le reste dû d'une facture partiellement payée est une ESTIMATION à la moitié du
   * TTC : l'API ne renvoie pas le cumul encaissé sur la facture. La tuile le dit,
   * plutôt que de présenter un chiffre inventé comme un solde exact.
   */
  readonly montantRestant = computed(() => {
    const inv = this.invoice();
    if (!inv) return 0;
    if (inv.statut === 'PAID') return 0;
    if (inv.statut === 'PARTIALLY_PAID') return inv.montantTtc / 2;
    return inv.montantTtc;
  });

  readonly kpiTiles = computed<KpiTile[]>(() => {
    const inv = this.invoice();
    this.translate.currentLang();
    const devise = inv?.devise ?? 'TND';
    return [
      {
        label: 'INVOICING.DETAIL.KPI.BILLING_PROGRESS',
        value: `${this.billingProgress()} %`,
        delta: { value: this.statutLabel(), direction: 'neutral' },
        options: { icon: 'trending_up', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'INVOICING.DETAIL.KPI.BUDGET_TOTAL',
        value: this.currency.transform(inv?.montantTtc ?? null, devise),
        delta: {
          value: `${this.translate.instant('INVOICING.DETAIL.KPI.HT_PREFIX')} ${this.currency.transform(inv?.montantHt ?? null, devise)}`,
          direction: 'neutral',
        },
        options: { icon: 'account_balance_wallet', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: 'INVOICING.DETAIL.KPI.REMAINING',
        value: this.currency.transform(this.montantRestant(), devise),
        delta: { value: this.dueLabel(), direction: this.isOverdue() ? 'down' : 'neutral' },
        options: { icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10', valueColor: 'text-primary' },
      },
    ];
  });

  dueLabel(): string {
    const inv = this.invoice();
    return inv?.dateEcheance
      ? `${this.translate.instant('INVOICING.DETAIL.KPI.DUE_PREFIX')} ${this.formatDate(inv.dateEcheance)}`
      : this.translate.instant('INVOICING.DETAIL.KPI.NO_DUE');
  }

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'lines',     label: t('INVOICING.DETAIL.LINES.TITLE'), count: this.invoice()?.lines.length ?? 0 },
      { id: 'reminders', label: t('INVOICING.DETAIL.TABS.REMINDERS') },
      { id: 'trace',     label: t('INVOICING.DETAIL.TABS.TRACE') },
    ];
  });

  // ═══ Table des lignes ═════════════════════════════════════════════════════

  readonly lineTableColumns = computed((): TableColumn[] => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'description', label: t('INVOICING.DETAIL.LINES.DESC'),       type: 'custom' },
      { key: 'quantity',    label: t('INVOICING.DETAIL.LINES.QTY'),        type: 'number', align: 'right' },
      { key: 'unitRate',    label: t('INVOICING.DETAIL.LINES.UNIT_PRICE'), type: 'custom', align: 'right' },
      { key: 'vatRatePct',  label: t('INVOICING.DETAIL.LINES.VAT'),        type: 'custom', align: 'right' },
      { key: 'lineTotal',   label: t('INVOICING.DETAIL.LINES.TOTAL_HT'),   type: 'custom', align: 'right' },
      { key: 'lineTtc',     label: t('INVOICING.DETAIL.LINES.TOTAL_TTC'),  type: 'custom', align: 'right' },
    ];
    // La colonne « statut » de ligne et le bouton crayon ont disparu : le bouton
    // n'était relié à rien (aucune API de mise à jour ligne à ligne) et le statut
    // d'une ligne est toujours celui de sa facture, déjà affiché en tête de page.
  });

  readonly lineTableConfig = computed((): TableConfig => ({
    showHeader:   false,
    hoverable:    true,
    emptyMessage: this.translate.instant('INVOICING.DETAIL.LINES.EMPTY'),
  }));

  readonly lineTableRows = computed(() => {
    const inv = this.invoice();
    if (!inv) return [];
    return inv.lines.map((line, idx) => ({
      id:          line.id ?? idx,
      description: line.description,
      quantity:    line.quantity,
      unitRate:    line.unitRate,
      vatRatePct:  line.vatRatePct,
      lineTotal:   line.lineTotal,
      lineTtc:     this.lineTtc(line),
    }));
  });

  // ═══ Cycle de vie ═════════════════════════════════════════════════════════

  /**
   * L'action principale du statut courant — la même correspondance que l'ancien
   * `onStepperNext`, mais NOMMÉE sur le bouton au lieu d'être cachée derrière « Suivant ».
   */
  readonly primaryAction = computed<PrimaryAction | null>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const btn = (label: string, icon: string): ButtonOptions => ({
      variant: 'teal', size: 'sm', fullWidth: true, iconStart: icon, label,
      loading: this.saving(), disabled: this.saving(),
    });

    switch (this.statut()) {
      case 'DRAFT':          return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.SUBMIT'),   'send'),        run: () => this.submitForReview() };
      case 'RETURNED':       return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.RESUBMIT'), 'send'),        run: () => this.submitForReview() };
      case 'SUBMITTED':      return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.CONFIRM'),  'check_circle'), run: () => this.approve('APPROVE') };
      case 'APPROVED':       return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.EMIT'),     'outbox'),      run: () => this.emit() };
      case 'EMITTED':        return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.MARK_SENT'), 'mark_email_read'), run: () => this.markSent() };
      case 'SENT':
      case 'PARTIALLY_PAID': return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.RECORD_PAYMENT'), 'payments'), run: () => this.showPaymentModal.set(true) };
      case 'DISPUTED':       return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.RESOLVE'),  'gavel'),       run: () => this.openResolveModal() };
      case 'PAID':           return { options: btn(t('INVOICING.LIFECYCLE.ACTIONS.EMIT_CREDIT'), 'receipt_long'), run: () => this.showCreditNote.set(true) };
      // CANCELLED et CREDIT_NOTED sont terminaux : aucune action à proposer.
      default: return null;
    }
  });

  runPrimaryAction(): void { this.primaryAction()?.run(); }

  /** Retour à l'émetteur : seulement quand la facture est en attente de validation. */
  readonly canReturn  = computed(() => this.statut() === 'SUBMITTED');
  /** Ouverture d'un litige : une facture partie chez le client et non soldée. */
  readonly canDispute = computed(() => ['SENT', 'PARTIALLY_PAID'].includes(this.statut()));

  readonly commentFieldOptions = computed(() => {
    this.translate.currentLang();
    return {
      type: 'textarea' as const, rows: 3, maxLength: 500, fullWidth: true,
      label: this.translate.instant(this.commentFieldKey()),
    };
  });

  /**
   * « Retourner » appelle bien l'API — l'ancien bouton « Précédent » du rail se
   * contentait de positionner `approvalDecision = 'RETURN'` sans jamais appeler
   * `approve()` : il ne se passait rien.
   */
  openReturnModal(): void {
    this.openCommentModal('INVOICING.LIFECYCLE.RETURN_TITLE', 'INVOICING.LIFECYCLE.RETURN_COMMENT',
      () => this.approve('RETURN'));
  }

  openDisputeModal(): void {
    this.openCommentModal('INVOICING.LIFECYCLE.DISPUTE_TITLE', 'INVOICING.LIFECYCLE.DISPUTE_REASON',
      () => this.submitDispute(), true);
  }

  private openResolveModal(): void {
    this.openCommentModal('INVOICING.LIFECYCLE.RESOLVE_TITLE', 'INVOICING.LIFECYCLE.RESOLVE_NOTES',
      () => this.submitResolve());
  }

  private openCommentModal(titleKey: string, fieldKey: string, run: () => void, required = false): void {
    this.commentText.set('');
    this.commentFieldKey.set(fieldKey);
    const ref = this.modals.open({
      title: this.translate.instant(titleKey),
      size:  'md',
      body:  this.commentTpl(),
      buttons: [
        { label: this.translate.instant('INVOICING.DETAIL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('INVOICING.DETAIL.CONFIRM'),
          variant: 'primary',
          action: () => {
            // Un motif de litige vide n'a aucune valeur pour qui lira le dossier ensuite.
            if (required && !this.commentText().trim()) return;
            ref.close();
            run();
          },
        },
      ],
    });
  }

  // ═══ Appels ═══════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const numId = Number(this.id());
    if (!numId) return;
    this.load(numId);
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getInvoice(id).subscribe({
      next:  inv => { this.invoice.set(inv); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('INVOICING.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  refresh(): void {
    const numId = Number(this.id());
    if (numId) this.load(numId);
  }

  private run(call: (id: number) => { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void }): void {
    const inv = this.invoice();
    if (!inv) return;
    this.saving.set(true);
    this.actionError.set(null);
    call(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: (err: unknown) => {
        this.saving.set(false);
        const e = err as { error?: { detail?: string; message?: string } };
        this.actionError.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('INVOICING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  submitForReview(): void { this.run(id => this.svc.submit(id)); }
  emit():            void { this.run(id => this.svc.emit(id)); }
  markSent():        void { this.run(id => this.svc.markSent(id)); }

  approve(decision: 'APPROVE' | 'RETURN' | 'REJECT'): void {
    const comment = this.commentText().trim() || null;
    this.run(id => this.svc.approve(id, { decision, comment }));
  }

  submitDispute(): void {
    const reason = this.commentText().trim();
    if (!reason) return;
    this.run(id => this.svc.openDispute(id, { reason }));
  }

  submitResolve(): void {
    const notes = this.commentText().trim() || null;
    this.run(id => this.svc.resolveDispute(id, notes));
  }

  onPaymentClosed(saved: boolean): void    { this.showPaymentModal.set(false); if (saved) this.refresh(); }
  onCreditNoteClosed(saved: boolean): void { this.showCreditNote.set(false);   if (saved) this.refresh(); }

  /** La facture porte son affaire : on y va directement plutôt que par la liste. */
  goToAffaire(): void {
    const affaireId = this.invoice()?.affaireId;
    if (!affaireId) return;
    this.router.navigate(['../../affaires', affaireId], { relativeTo: this.route });
  }

  // ═══ Rendu ════════════════════════════════════════════════════════════════

  lineTtc(l: { quantity: number; unitRate: number; vatRatePct: number }): number {
    return l.quantity * l.unitRate * (1 + l.vatRatePct / 100);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  conditionLabel(code: string): string {
    return CONDITIONS_PAIEMENT[code as keyof typeof CONDITIONS_PAIEMENT] ?? code;
  }
}
