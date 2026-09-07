import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ButtonComponent, SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { AffaireService }        from '../../affaire.service';
import { LivrableService }       from '../../livrable.service';
import { FactListService }       from '../../../../core/fact-list.service';
import { AffaireDraftState }     from '../../affaire-wizard.model';
import { UserRefDto, AffaireWorkedHoursSummaryDto } from '../../affaire.model';
import { ListValueDto }          from '../../../cost/cost.model';
import { CollaborateurTauxDto }  from '../../livrable.model';
import { TmRateModalComponent, TmRateModalResult } from './tm-rate-modal.component';
import { deriveEmployeeCostFields, EmployeeCostDriverField } from '../../../cost/employee-costs/employee-cost.model';

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

  private readonly affaireSvc  = inject(AffaireService);
  private readonly livrableSvc = inject(LivrableService);
  private readonly listSvc     = inject(FactListService);
  private readonly translate   = inject(TranslateService);

  users       = signal<UserRefDto[]>([]);
  currencies  = signal<ListValueDto[]>([]);
  showRateModal = signal(false);
  /** Real Timesheet hours already logged on this affaire — passed to the bulk-add modal
   * so it can surface who actually worked here instead of a blind company directory.
   * Empty for a brand new affaire (no history yet), which the modal handles gracefully. */
  workedHours = signal<AffaireWorkedHoursSummaryDto[]>([]);

  // ── daf-select option lists ─────────────────────────────────────
  readonly userOptions = computed<SelectOption[]>(() =>
    this.users().map(u => ({ value: String(u.id), label: u.fullName })));

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
    if (this.draft.id) {
      this.affaireSvc.getRessourcesWorkedHours(this.draft.id).subscribe(h => this.workedHours.set(h));
    }
  }

  addRessource(): void {
    this.draft.ressources = [...this.draft.ressources, {
      userId: 0,
      rateType: 'HOURLY',
      rateAmount: 0,
      rateCurrency: 'EUR',
    }];
    this.emit();
  }

  removeRessource(index: number): void {
    this.draft.ressources = this.draft.ressources.filter((_, i) => i !== index);
    this.emit();
  }

  /** Same calculateTaux() call as the affaire detail page's Ressources tab and the bulk-add
   * modal — one cost/rate source across all three surfaces instead of this row editor's
   * previous separate getEmployeeCost(email) lookup. Populates tauxVente/tauxIntercompany
   * for the pill toggle below (see setRowRateSource) and defaults rateAmount to the
   * external rate, same default as everywhere else this pattern exists. */
  onUserChange(r: AffaireDraftState['ressources'][0], userId: number): void {
    const user = this.users().find(u => u.id === Number(userId));
    r.userName = user?.fullName;
    r.userEmail = user?.email;
    r.tauxIntercompany = undefined;
    r.tauxVente = undefined;
    r.rateSource = 'EXTERNAL';
    r.costDataMissing = false;
    // Reset synchronously, before the async lookup below resolves — otherwise a stale value
    // from whichever collaborator was previously selected on this row (including our own
    // costDataMissing=0 sentinel, set a few lines down) could leak into the fallback on
    // line "rates.tauxVente ?? r.rateAmount" if the newly-selected person's record happens
    // to have tauxVente=null. Resetting here means that fallback only ever falls back to a
    // clean 0, never to unrelated leftover data.
    r.rateAmount = 0;
    this.emit(); // propagate the name change immediately, even if no cost lookup follows
    if (!userId || !this.draft.id) return;
    this.livrableSvc.calculateTaux(this.draft.id, this.draft.paysId, [Number(userId)]).subscribe({
      next: results => {
        const t = results[0];
        if (!t || t.sourceCalcul === 'AUCUNE_DONNEE') {
          // No employee_costs row for this person yet — leave fields empty for manual
          // entry; saving this resource will write the entered value back (see
          // affaire-wizard.component.ts's saveStep3, TM branch).
          r.costDataMissing = true;
          r.costAmount = undefined;
          r.rateAmount = 0;
          r.tauxIntercompany = undefined;
          r.tauxVente = undefined;
          this.emit();
          return;
        }
        r.costDataMissing  = false;
        r.costAmount       = t.coutReel;
        r.tauxVente         = t.tauxVente;
        r.tauxIntercompany = t.tauxIntercompany;
        r.rateSource       = 'EXTERNAL';
        r.rateAmount       = t.tauxVente;
        this.emit();
      },
    });
  }

  /** Flips which calculated rate drives rateAmount — mirrors
   * affaire-ressources-tab.component.ts's setRateSource(). Only reachable once
   * calculateTaux() has actually returned a value for this row (see the template). */
  setRowRateSource(r: AffaireDraftState['ressources'][0], source: 'EXTERNAL' | 'INTERNAL'): void {
    r.rateSource = source;
    r.rateAmount = (source === 'EXTERNAL' ? r.tauxVente : r.tauxIntercompany) ?? 0;
    this.emit();
  }

  /** External/Internal selling cost were previously read-only text inside the pill
   * buttons — now directly editable. Updates the stored value, and additionally keeps
   * rateAmount in sync when the field being edited is the currently selected source
   * (2026-08-31: bulk-add already has editable Coût/Interco/Vente, this brings manual
   * add's Vente/Interco to the same level — Coût was made editable in the same change,
   * via onCostChange, already defined above but previously unused by the template). */
  onSellingRateChange(
    r: AffaireDraftState['ressources'][0],
    source: 'EXTERNAL' | 'INTERNAL',
    v: string | number | null,
  ): void {
    const value = v === null || v === '' ? 0 : Number(v);
    if (source === 'EXTERNAL') {
      r.tauxVente = value;
    } else {
      r.tauxIntercompany = value;
    }
    if ((r.rateSource ?? 'EXTERNAL') === source) {
      r.rateAmount = value;
    }
    this.emitChange();
  }

  /** Only reachable when r.costDataMissing is true (see template) — "Coût interne" is the
   * one field the template leaves enabled in that state (the natural thing to know first);
   * the other two are disabled and always derived from it via the fixed 1.1/1.2 formula, so
   * it's impossible to end up with numbers that don't satisfy that formula. The 'internal'/
   * 'external' driver branches below exist so the same derivation logic could drive from
   * either of those fields too, if the template ever enables them — today it never does. */
  onDerivedCostFieldChange(
    r: AffaireDraftState['ressources'][0],
    driver: EmployeeCostDriverField,
    v: string | number | null,
  ): void {
    if (v === null || v === '') {
      r.costAmount = undefined;
      r.tauxIntercompany = undefined;
      r.rateAmount = 0;
      this.emitChange();
      return;
    }
    const derived = deriveEmployeeCostFields(driver, Number(v));
    r.costAmount       = derived.basicCost;
    r.tauxIntercompany = derived.internalSellingCost;
    r.rateAmount        = derived.externalSellingCost;
    this.emitChange();
  }

  onRatesConfirmed(result: TmRateModalResult): void {
    this.showRateModal.set(false);
    const { taux, rateSource } = result;
    const rateAmountFor = (t: CollaborateurTauxDto) => rateSource === 'EXTERNAL' ? t.tauxVente : t.tauxIntercompany;
    // Pre-fill ressources from auto-calculated rates
    const existingIds = new Set(this.draft.ressources.map(r => r.userId));
    const newEntries = taux
      .filter(t => !existingIds.has(t.userId))
      .map(t => ({
        userId:           t.userId,
        userName:         t.fullName,
        rateType:         'HOURLY',
        rateAmount:       rateAmountFor(t),
        rateCurrency:     'EUR',
        costAmount:       t.coutReel,
        tauxVente:        t.tauxVente,
        tauxIntercompany: t.tauxIntercompany,
        rateSource,
      }));
    // Update existing entries + add new ones
    const updated = this.draft.ressources.map(r => {
      const match = taux.find(t => t.userId === r.userId);
      return match
        ? { ...r, rateAmount: rateAmountFor(match), costAmount: match.coutReel, tauxVente: match.tauxVente, tauxIntercompany: match.tauxIntercompany, rateSource }
        : r;
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
