import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
  PageComponent, PageHeaderComponent, CardComponent, BreadcrumbItem,
  ButtonComponent, StatusBadgeComponent, BadgeVariant, FormFieldComponent,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';
import {
  BillingService, TauxDetailDto, JalonDetailDto, LineDetailDto, EntityAuditLogDto,
} from './billing.service';
import { AffaireService } from '../affaire.service';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { LivrableBatchDto } from '../livrable.model';
type DetailType = 'taux' | 'jalon' | 'line' | 'livrable';

interface HistoryRow {
  id: number;
  period: string;
  label: string;
  value: number;
  statut: string;
  isCurrent: boolean;
}

@Component({
  selector: 'app-approval-detail',
  standalone: true,
  imports: [
    TranslatePipe, DataTableComponent, DafCellDirective, DisplayCurrencyPipe,
    PageComponent, PageHeaderComponent, CardComponent,
    ButtonComponent, StatusBadgeComponent, FormFieldComponent,
  ],
  templateUrl: './approval-detail.component.html',
  styleUrl: './approval-detail.component.scss',
})
export class ApprovalDetailComponent implements OnInit {
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly svc        = inject(BillingService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);
  private readonly modal      = inject(ModalService);

  @ViewChild('refuseTpl') private refuseTpl!: TemplateRef<unknown>;
  @ViewChild('returnTpl') private returnTpl!: TemplateRef<unknown>;

  type = signal<DetailType>('taux');
  id   = signal(0);

  loading  = signal(true);
  errorMsg = signal<string | null>(null);

  taux  = signal<TauxDetailDto | null>(null);
  jalon = signal<JalonDetailDto | null>(null);
  line  = signal<LineDetailDto | null>(null);
  livrableBatch = signal<LivrableBatchDto | null>(null);

  affaire       = signal<AffaireDetail | null>(null);
  siblingTaux   = signal<TauxDetailDto[]>([]);
  siblingJalons = signal<JalonDetailDto[]>([]);
  siblingLines  = signal<LineDetailDto[]>([]);
  auditTrail    = signal<EntityAuditLogDto[]>([]);

  actioning   = signal(false);
  actionError = signal<string | null>(null);

  refuseMotif = signal('');
  refuseError = signal<string | null>(null);
  private refuseRef?: ModalRef;

  returnMotif = signal('');
  returnError = signal<string | null>(null);
  private returnRef?: ModalRef;

  readonly pageTitle = computed(() => {
    const a = this.affaire();
    return a?.intitule || a?.reference || '';
  });

  /** Translated label for the item type — used both as the breadcrumb's current
   * (non-link) crumb and as each "this item" card's heading. */
  readonly detailTypeLabel = computed(() => {
    this.translate.currentLang();
    const key: Record<DetailType, string> = {
      taux:     'AFFAIRES.billing.approval.detail.title_taux',
      jalon:    'AFFAIRES.billing.approval.detail.title_jalon',
      line:     'AFFAIRES.billing.approval.detail.title_line',
      livrable: 'AFFAIRES.billing.approval.detail.title_livrable',
    };
    return this.translate.instant(key[this.type()]);
  });

  /** Approbations > {référence affaire} > {type d'élément}. The middle crumb is the
   * only real navigation target here — back to the affaire itself. */
  readonly breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    const a = this.affaire();
    if (!a) return [];
    return [
      { label: this.translate.instant('AFFAIRES.billing.approval.title'), link: '/finance/billing/approval' },
      { label: a.reference, link: ['/fact/affaires', a.id] },
      { label: this.detailTypeLabel() },
    ];
  });

  readonly canAct = computed(() => {
    switch (this.type()) {
      case 'taux':     return this.taux()?.statut === 'EN_ATTENTE';
      case 'jalon':    return this.jalon()?.statut === 'EN_ATTENTE_VALIDATION';
      case 'line':     return this.line()?.statut === 'EN_ATTENTE_DF';
      case 'livrable': return this.livrableBatch()?.statut === 'EN_ATTENTE_DF';
    }
  });

  /** Unifies taux/jalon/line history into one shape so a single table can render whichever applies. */
  readonly historyRows = computed<HistoryRow[]>(() => {
    const currentId = this.id();
    switch (this.type()) {
      case 'taux':
        return this.siblingTaux().map(t => ({
          id: t.id,
          period: `${this.fmtDate(t.periodDateFrom)} – ${this.fmtDate(t.periodDateTo)}`,
          label: `${t.tauxSaisi}%`,
          value: t.montantIncremental,
          statut: t.statut,
          isCurrent: t.id === currentId,
        }));
      case 'jalon':
        return this.siblingJalons().map(j => ({
          id: j.id,
          period: this.fmtDate(j.datePrevisionnelle),
          label: j.label,
          value: j.montant,
          statut: j.statut,
          isCurrent: j.id === currentId,
        }));
      case 'line':
        return this.siblingLines().map(l => ({
          id: l.id,
          period: `${String(l.periodMonth).padStart(2, '0')}/${l.periodYear}`,
          label: l.billingMode,
          value: l.montantHt,
          statut: l.statut,
          isCurrent: l.id === currentId,
        }));
      case 'livrable':
        return [];
    }
  });

  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'period',  label: this.translate.instant('AFFAIRES.billing.approval.col_periode'), type: 'text' },
      { key: 'label',   label: this.translate.instant('AFFAIRES.billing.approval.detail.item'), type: 'custom' },
      { key: 'value',   label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right' },
      { key: 'statut',  label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),  type: 'text' },
    ];
  });

  readonly auditColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'timestampUtc', label: this.translate.instant('AFFAIRES.billing.approval.col_date'),    type: 'custom' },
      { key: 'action',       label: this.translate.instant('AFFAIRES.billing.approval.col_action'),  type: 'text' },
      { key: 'transition',   label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),  type: 'custom' },
      { key: 'actorRole',    label: this.translate.instant('AFFAIRES.billing.approval.col_user'),    type: 'text' },
      { key: 'commentaire',  label: this.translate.instant('AFFAIRES.billing.approval.col_comment'), type: 'text' },
    ];
  });

  // ── daf-data-table: livrable batch entries ───────────────────────────────────
  readonly livrableEntryColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'document',     label: this.translate.instant('AFFAIRES.WIP.COL_DOCUMENT'), type: 'text' },
      { key: 'pctPrecedent', label: this.translate.instant('AFFAIRES.billing.approval.detail.taux_precedent'), type: 'custom', align: 'right' },
      { key: 'pctSaisi',     label: this.translate.instant('AFFAIRES.billing.approval.col_taux'), type: 'custom', align: 'right' },
      { key: 'montant',      label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right' },
    ];
  });

  readonly livrableEntryRows = computed(() =>
    (this.livrableBatch()?.entries ?? []).map(e => ({
      id:           e.billingLineId,
      document:     e.documentNom ?? '—',
      pctPrecedent: e.pctPrecedent,
      pctSaisi:     e.pctSaisi,
      montant:      e.montantHt,
    }))
  );

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: false }));

  ngOnInit(): void {
    const type = this.route.snapshot.paramMap.get('type') as DetailType;
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.type.set(type);
    this.id.set(id);
    this.loadItem();
  }

  private loadItem(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    const id = this.id();

    switch (this.type()) {
      case 'taux':
        this.svc.getTauxDetail(id).subscribe({
          next: t => { this.taux.set(t); this.loading.set(false); this.loadContext(t.affaireId, 'TAUX_AVANCEMENT'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
      case 'jalon':
        this.svc.getJalonDetail(id).subscribe({
          next: j => { this.jalon.set(j); this.loading.set(false); this.loadContext(j.affaireId, 'JALON'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
      case 'line':
        this.svc.getLineDetail(id).subscribe({
          next: l => { this.line.set(l); this.loading.set(false); this.loadContext(l.affaireId, 'BILLING_LINE'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
      case 'livrable':
        this.svc.getLivrableBatchDetail(id).subscribe({
          next: b => { this.livrableBatch.set(b); this.loading.set(false); this.loadContext(b.affaireId, 'BILLING_LINE'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
    }
  }

  private loadContext(affaireId: number, entityType: string): void {
    this.affaireSvc.getAffaire(affaireId).subscribe({ next: a => this.affaire.set(a) });
    this.svc.getAuditByEntity(entityType, this.id()).subscribe({ next: a => this.auditTrail.set(a) });
    if (this.type() === 'taux')  this.svc.getTauxHistoryDetailed(affaireId).subscribe({ next: h => this.siblingTaux.set(h) });
    if (this.type() === 'jalon') this.svc.getJalonsDetailed(affaireId).subscribe({ next: h => this.siblingJalons.set(h) });
    if (this.type() === 'line')  this.svc.getBillingLinesDetailed(affaireId).subscribe({ next: h => this.siblingLines.set(h) });
  }

  back(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  fmtDate(d: string | null | undefined): string {
    if (!d) return '—';
    // Date-only strings (e.g. "2026-08-01", as sent for periodDateFrom/periodDateTo) are
    // parsed by `new Date(...)` as UTC midnight — in a negative-UTC-offset browser that
    // shifts the displayed day back by one. Parsed as local calendar components instead,
    // same as full timestamps (which already carry an offset/zone and aren't affected).
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const date = dateOnly
      ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
      : new Date(d);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fmtDateTime(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  /** Coarse status → badge color, from the shared prefix/value conventions across
   * taux/jalon/line/livrable statuses (EN_ATTENTE*, VALIDE*, FACTURE, RETOURNE, REFUSE/ANNULE). */
  statusBadgeVariant(statut: string | null | undefined): BadgeVariant {
    if (!statut) return 'neutral';
    if (statut.startsWith('EN_ATTENTE')) return 'warning';
    if (statut.startsWith('VALIDE'))     return 'info';
    if (statut === 'FACTURE')            return 'success';
    if (statut === 'RETOURNE')           return 'secondary';
    if (statut === 'REFUSE' || statut === 'ANNULE') return 'danger';
    return 'neutral';
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  validateTaux(): void {
    // AV taux validation is now a DF action — it creates the draft invoice server-side in
    // one shot (ProgressBillingService.validateTaux), so jump straight into the edit
    // stepper, same as validateLine() does for billing lines.
    this.actioning.set(true);
    this.actionError.set(null);
    this.svc.validateTaux(this.id()).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit']);
        } else {
          this.actioning.set(false);
          this.loadItem();
        }
      },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }

  openRefuseModal(): void {
    this.refuseMotif.set('');
    this.refuseError.set(null);
    this.refuseRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_title'),
      body: this.refuseTpl,
      size: 'sm',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),     variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_btn'), variant: 'primary',   action: () => this.confirmRefuse() },
      ],
    });
  }

  confirmRefuse(): void {
    const motif = this.refuseMotif().trim();
    if (!motif) {
      this.refuseError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    this.refuseRef?.close();
    if (this.type() === 'taux') this.runAction(this.svc.refuseTaux(this.id(), motif));
    if (this.type() === 'jalon') this.runAction(this.svc.refuseJalon(this.id(), motif));
  }

  validateJalon(): void {
    this.runAction(this.svc.validateJalon(this.id()));
  }

  validateLine(): void {
    this.actioning.set(true);
    this.actionError.set(null);
    this.svc.validateDF(this.id()).subscribe({
      next: line => {
        // DF validation creates the draft invoice server-side (DFValidationService) —
        // jump straight into its edit stepper instead of leaving the user on this page,
        // since there's nothing left for them to check here once the invoice exists.
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit']);
        } else {
          this.actioning.set(false);
          this.loadItem();
        }
      },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }

  validateLivrableBatch(): void {
    // Same as validateLine() above — the batch's shared invoice is created as a DRAFT
    // (LivrableBillingService → DFValidationService.generateFromBillingLines), so the
    // edit stepper is where DF reviews it, not the read-only detail page.
    this.actioning.set(true);
    this.actionError.set(null);
    this.svc.validateLivrableBatch(this.id()).subscribe({
      next: batch => {
        if (batch.invoiceId) {
          this.router.navigate(['/finance/invoicing', batch.invoiceId, 'edit']);
        } else {
          this.actioning.set(false);
          this.loadItem();
        }
      },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }

  openReturnModal(): void {
    this.returnMotif.set('');
    this.returnError.set(null);
    this.returnRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_return_title'),
      body: this.returnTpl,
      size: 'sm',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_confirm'), variant: 'primary',   action: () => this.confirmReturn() },
      ],
    });
  }

  confirmReturn(): void {
    const motif = this.returnMotif().trim();
    if (!motif) {
      this.returnError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    this.returnRef?.close();
    const request$ = this.type() === 'livrable'
      ? this.svc.returnLivrableBatch(this.id(), motif)
      : this.svc.returnDF(this.id(), motif);
    this.runAction(request$);
  }

  private runAction(obs: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void }): void {
    this.actioning.set(true);
    this.actionError.set(null);
    obs.subscribe({
      next: () => { this.actioning.set(false); this.loadItem(); },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }
}
