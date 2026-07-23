import {
  Component, Input, Output, EventEmitter,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { LivrableService }       from '../../livrable.service';
import { CollaborateurTauxDto }  from '../../livrable.model';
import { UserRefDto }            from '../../affaire.model';

@Component({
  selector: 'app-tm-rate-modal',
  standalone: true,
  imports: [FormsModule, ButtonComponent, TranslatePipe],
  templateUrl: './tm-rate-modal.component.html',
  styleUrl: './tm-rate-modal.component.scss',
})
export class TmRateModalComponent {

  @Input() affaireId!: number;
  @Input() paysId!: number;
  @Input() availableUsers: UserRefDto[] = [];
  /** Emits confirmed rates — parent updates draft.ressources */
  @Output() confirmed = new EventEmitter<CollaborateurTauxDto[]>();
  @Output() closed    = new EventEmitter<void>();

  private readonly svc = inject(LivrableService);
  private readonly translate = inject(TranslateService);

  step             = signal<1 | 2>(1);
  selectedUserIds  = signal<Set<number>>(new Set());
  calculatedTaux   = signal<CollaborateurTauxDto[]>([]);
  editedCouts      = signal<Map<number, number>>(new Map());
  rateType         = signal<'DAILY' | 'HOURLY'>('DAILY');
  isCalculating    = signal(false);
  serverError      = signal<string | null>(null);

  // ── Étape 1 ───────────────────────────────────────────────────────────────

  toggleUser(userId: number): void {
    const set = new Set(this.selectedUserIds());
    set.has(userId) ? set.delete(userId) : set.add(userId);
    this.selectedUserIds.set(set);
  }

  calculerTaux(): void {
    if (this.selectedUserIds().size === 0) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.tm.modal.err_select')); return;
    }
    this.isCalculating.set(true);
    this.serverError.set(null);
    this.svc.calculateTaux(
      this.affaireId,
      this.paysId,
      Array.from(this.selectedUserIds()),
    ).subscribe({
      next: taux => {
        this.calculatedTaux.set(taux);
        this.editedCouts.set(new Map());
        this.isCalculating.set(false);
        this.step.set(2);
      },
      error: err => {
        this.isCalculating.set(false);
        this.serverError.set(err.error?.message ?? this.translate.instant('AFFAIRES.wizard.tm.modal.err_calc'));
      },
    });
  }

  // ── Étape 2 ───────────────────────────────────────────────────────────────

  setCout(userId: number, value: number): void {
    const map = new Map(this.editedCouts());
    map.set(userId, value);
    this.editedCouts.set(map);
  }

  getCout(t: CollaborateurTauxDto): number {
    return this.editedCouts().get(t.userId) ?? t.coutReel;
  }

  recomputedTauxVente(t: CollaborateurTauxDto): number {
    const cout = this.getCout(t);
    return Math.round(cout * (1 + t.pctHqCost + t.pctMargin) * 1000) / 1000;
  }

  recomputedTauxInterco(t: CollaborateurTauxDto): number {
    const cout = this.getCout(t);
    return Math.round(cout * (1 + t.pctHqCost) * 1000) / 1000;
  }

  valider(): void {
    // Émettre les taux recalculés vers le parent — pas de sauvegarde backend
    // Le wizard appellera configureTM sur "Suivant"
    const result = this.calculatedTaux().map(t => ({
      ...t,
      coutReel:        this.getCout(t),
      tauxIntercompany: this.recomputedTauxInterco(t),
      tauxVente:        this.recomputedTauxVente(t),
    }));
    this.confirmed.emit(result);
  }

  fmtNumber(v: number, decimals = 3): string {
    return new Intl.NumberFormat('fr-TN',
      { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  }

  pctLabel(v: number): string {
    return (v * 100).toFixed(1) + ' %';
  }
}
