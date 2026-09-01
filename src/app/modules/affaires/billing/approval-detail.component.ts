import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';
import {
  BillingService, TauxDetailDto, JalonDetailDto, LineDetailDto, EntityAuditLogDto,
} from './billing.service';
import { AffaireService } from '../affaire.service';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

type DetailType = 'taux' | 'jalon' | 'line';

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
    RouterLink, FormsModule, TranslatePipe, DataTableComponent, DafCellDirective,
    DisplayCurrencyPipe,
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

  type = signal<DetailType>('taux');
  id   = signal(0);

  loading  = signal(true);
  errorMsg = signal<string | null>(null);

  taux  = signal<TauxDetailDto | null>(null);
  jalon = signal<JalonDetailDto | null>(null);
  line  = signal<LineDetailDto | null>(null);

  affaire       = signal<AffaireDetail | null>(null);
  siblingTaux   = signal<TauxDetailDto[]>([]);
  siblingJalons = signal<JalonDetailDto[]>([]);
  siblingLines  = signal<LineDetailDto[]>([]);
  auditTrail    = signal<EntityAuditLogDto[]>([]);

  actioning   = signal(false);
  actionError = signal<string | null>(null);

  showRefuseModal = signal(false);
  refuseMotif = '';
  showReturnModal = signal(false);
  returnMotif = '';

  readonly canAct = computed(() => {
    switch (this.type()) {
      case 'taux':  return this.taux()?.statut === 'EN_ATTENTE';
      case 'jalon': return this.jalon()?.statut === 'EN_ATTENTE_VALIDATION';
      case 'line':  return this.line()?.statut === 'EN_ATTENTE_DF';
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

  // ── Actions ──────────────────────────────────────────────────────────────

  validateTaux(): void {
    this.runAction(this.svc.validateTaux(this.id()));
  }

  openRefuseModal(): void {
    this.refuseMotif = '';
    this.showRefuseModal.set(true);
  }

  confirmRefuse(): void {
    if (!this.refuseMotif.trim()) return;
    const motif = this.refuseMotif.trim();
    this.showRefuseModal.set(false);
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

  openReturnModal(): void {
    this.returnMotif = '';
    this.showReturnModal.set(true);
  }

  confirmReturn(): void {
    if (!this.returnMotif.trim()) return;
    const motif = this.returnMotif.trim();
    this.showReturnModal.set(false);
    this.runAction(this.svc.returnDF(this.id(), motif));
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
