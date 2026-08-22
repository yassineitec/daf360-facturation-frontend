import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, FormFieldComponent } from '@khalilrebhiitec/daf360';
import { WipService } from './wip.service';
import { WipTauxDto, WipTmPreviewDto } from './wip.model';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { WipTmDetailTableComponent } from './wip-tm-detail-table.component';

@Component({
  selector: 'app-affaire-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, FormFieldComponent,
    DisplayCurrencyPipe, WipTmDetailTableComponent,
  ],
  templateUrl: './affaire-wip-tab.component.html',
})
export class AffaireWipTabComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc = inject(WipService);
  private readonly translate = inject(TranslateService);

  private readonly now = new Date();
  periodYear = this.now.getFullYear();
  periodMonth = this.now.getMonth() + 1;

  // ── AV ──────────────────────────────────────────────────────────────────
  tauxHistory   = signal<WipTauxDto[]>([]);
  loadingTaux   = signal(false);
  newTauxValue: number | null = null;
  tauxComment   = '';
  tauxError     = signal<string | null>(null);
  submittingTaux= signal(false);

  readonly lastValidatedTaux = computed(() => {
    const vals = this.tauxHistory().filter(t => t.statut === 'VALIDE');
    return vals.length > 0 ? Math.max(...vals.map(t => t.tauxSaisi)) : 0;
  });

  readonly canSubmitTaux = computed(() =>
    this.newTauxValue !== null && this.newTauxValue > this.lastValidatedTaux() && this.newTauxValue <= 100
  );

  readonly avWipPreview = computed<number | null>(() => {
    if (this.newTauxValue === null || !this.affaire.contractAmount) return null;
    return (this.newTauxValue / 100) * this.affaire.contractAmount;
  });

  // ── TM ──────────────────────────────────────────────────────────────────
  tmPreview     = signal<WipTmPreviewDto | null>(null);
  loadingTm     = signal(false);
  tmError       = signal<string | null>(null);
  validatingTm  = signal(false);
  showTmDetails = signal(false);

  ngOnInit(): void {
    if (this.affaire.billingMode === 'AV') this.loadTauxHistory();
    if (this.affaire.billingMode === 'TM') this.loadTmPreview();
  }

  // ── AV actions ────────────────────────────────────────────────────────────

  loadTauxHistory(): void {
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(this.affaire.id).subscribe({
      next:  h => { this.tauxHistory.set(h); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  submitTaux(): void {
    const taux = this.newTauxValue;
    if (taux === null || !this.canSubmitTaux() || this.submittingTaux()) return;
    this.submittingTaux.set(true);
    this.tauxError.set(null);
    this.svc.submitTaux(this.affaire.id, {
      periodYear: this.periodYear,
      periodMonth: this.periodMonth,
      tauxSaisi: taux,
      commentaire: this.tauxComment.trim() || null,
    }).subscribe({
      next: () => {
        this.submittingTaux.set(false);
        this.newTauxValue = null;
        this.tauxComment = '';
        this.loadTauxHistory();
      },
      error: err => {
        this.submittingTaux.set(false);
        this.tauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.SUBMIT_ERROR'));
      },
    });
  }

  // ── TM actions ────────────────────────────────────────────────────────────

  loadTmPreview(): void {
    this.loadingTm.set(true);
    this.tmError.set(null);
    this.svc.previewTm(this.affaire.id, this.periodYear, this.periodMonth).subscribe({
      next:  p => { this.tmPreview.set(p); this.loadingTm.set(false); },
      error: err => {
        this.tmPreview.set(null);
        this.loadingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.LOAD_ERROR'));
      },
    });
  }

  validateTm(): void {
    if (this.validatingTm()) return;
    this.validatingTm.set(true);
    this.tmError.set(null);
    this.svc.validateTm(this.affaire.id, this.periodYear, this.periodMonth).subscribe({
      next: () => { this.validatingTm.set(false); this.showTmDetails.set(false); this.loadTmPreview(); },
      error: err => {
        this.validatingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.VALIDATE_ERROR'));
      },
    });
  }
}
