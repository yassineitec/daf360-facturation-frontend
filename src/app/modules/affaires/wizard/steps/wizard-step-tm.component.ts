import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ButtonComponent, SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { AffaireService }        from '../../affaire.service';
import { FactListService }       from '../../../../core/fact-list.service';
import { AffaireDraftState }     from '../../affaire-wizard.model';
import { UserRefDto }            from '../../affaire.model';
import { ListValueDto }          from '../../../cost/cost.model';
import { CollaborateurTauxDto }  from '../../livrable.model';
import { TmRateModalComponent }  from './tm-rate-modal.component';

@Component({
  selector: 'app-wizard-step-tm',
  standalone: true,
  imports: [FormsModule, ButtonComponent, SelectComponent, FormFieldComponent, TmRateModalComponent, TranslatePipe],
  templateUrl: './wizard-step-tm.component.html',
  styleUrl: './wizard-step-tm.component.scss',
})
export class WizardStepTmComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc = inject(AffaireService);
  private readonly listSvc    = inject(FactListService);
  private readonly translate  = inject(TranslateService);

  users      = signal<UserRefDto[]>([]);
  currencies = signal<ListValueDto[]>([]);
  showRateModal = signal(false);

  // ── daf-select option lists ─────────────────────────────────────
  readonly userOptions = computed<SelectOption[]>(() =>
    this.users().map(u => ({ value: String(u.id), label: u.fullName })));

  readonly resourceTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'INTERNAL', label: this.translate.instant('AFFAIRES.wizard.tm.internal') },
      { value: 'EXTERNAL', label: this.translate.instant('AFFAIRES.wizard.tm.external') },
    ];
  });

  readonly rateTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'DAILY',  label: this.translate.instant('AFFAIRES.wizard.tm.daily') },
      { value: 'HOURLY', label: this.translate.instant('AFFAIRES.wizard.tm.hourly') },
    ];
  });

  readonly currencyOptions = computed<SelectOption[]>(() =>
    this.currencies().length
      ? this.currencies().map(c => ({ value: c.code, label: c.code }))
      : [{ value: 'EUR', label: 'EUR' }, { value: 'TND', label: 'TND' }]);

  // ── daf-select / daf-form-field bridges (string[] | string|number|null → model) ──
  onUserSelect(r: AffaireDraftState['ressources'][0], values: string[]): void {
    const id = values[0] ? Number(values[0]) : 0;
    r.userId = id;
    this.onUserChange(r, id);
  }

  onRateAmountChange(r: AffaireDraftState['ressources'][0], v: string | number | null): void {
    r.rateAmount = v === null || v === '' ? 0 : Number(v);
    this.emitChange();
  }

  // NOTE: preserves original behaviour — intercompany input had no (ngModelChange), so it does NOT emit.
  onIntercoChange(r: AffaireDraftState['ressources'][0], v: string | number | null): void {
    r.tauxIntercompany = v === null || v === '' ? undefined : Number(v);
  }

  onCostChange(r: AffaireDraftState['ressources'][0], v: string | number | null): void {
    r.costAmount = v === null || v === '' ? undefined : Number(v);
    this.emitChange();
  }

  ngOnInit(): void {
    this.affaireSvc.getUsers().subscribe(u => this.users.set(u));
    const paysId = Number(this.draft.paysId);
    if (paysId) {
      this.listSvc.getListValues('CURRENCY', paysId).subscribe(c => this.currencies.set(c));
    }
  }

  addRessource(): void {
    this.draft.ressources = [...this.draft.ressources, {
      userId: 0,
      resourceType: 'INTERNAL',
      rateType: 'DAILY',
      rateAmount: 0,
      rateCurrency: this.currencies()[0]?.code ?? 'EUR',
    }];
    this.emit();
  }

  removeRessource(index: number): void {
    this.draft.ressources = this.draft.ressources.filter((_, i) => i !== index);
    this.emit();
  }

  onUserChange(r: AffaireDraftState['ressources'][0], userId: number): void {
    const user = this.users().find(u => u.id === Number(userId));
    r.userName = user?.fullName;
    r.tauxIntercompany = undefined;
    this.emit(); // propagate the name change immediately, even if no cost lookup follows
    if (!user?.email) return;
    this.affaireSvc.getEmployeeCost(user.email, this.draft.paysId).subscribe({
      next: rates => {
        if (!rates || rates.cost === null) return;
        r.costAmount       = rates.cost;
        r.rateAmount       = rates.tauxVente ?? r.rateAmount;
        r.tauxIntercompany = rates.tauxIntercompany ?? undefined;
        this.emit();
      },
    });
  }

  onRatesConfirmed(taux: CollaborateurTauxDto[]): void {
    this.showRateModal.set(false);
    // Pre-fill ressources from auto-calculated rates
    const existingIds = new Set(this.draft.ressources.map(r => r.userId));
    const newEntries = taux
      .filter(t => !existingIds.has(t.userId))
      .map(t => ({
        userId:           t.userId,
        userName:         t.fullName,
        resourceType:     'INTERNAL',
        rateType:         'DAILY',
        rateAmount:       t.tauxVente,
        rateCurrency:     this.currencies()[0]?.code ?? 'EUR',
        costAmount:       t.coutReel,
        tauxIntercompany: t.tauxIntercompany,
      }));
    // Update existing entries + add new ones
    const updated = this.draft.ressources.map(r => {
      const match = taux.find(t => t.userId === r.userId);
      return match ? { ...r, rateAmount: match.tauxVente, costAmount: match.coutReel, tauxIntercompany: match.tauxIntercompany } : r;
    });
    this.draft.ressources = [...updated, ...newEntries];
    this.emit();
  }

  /** Called on any field change so the parent draft signal (and step validation) updates. */
  emitChange(): void { this.emit(); }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, ressources: [...this.draft.ressources] });
  }
}
