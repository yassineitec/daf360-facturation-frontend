import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FormFieldComponent, SelectComponent, SelectOption,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
  CardComponent, StatusBadgeComponent, AvatarComponent, ProgressBarComponent,
} from '@khalilrebhiitec/daf360';

import { AffaireService } from '../affaire.service';
import { LivrableService } from '../livrable.service';
import { CollaborateurTauxDto } from '../livrable.model';
import { AffaireDetail, AffaireRessourceManageDto, AffaireWorkedHoursSummaryDto, UserRefDto } from '../affaire.model';

type RateSource = 'EXTERNAL' | 'INTERNAL';

/** Where the (single, shared) add-resource form is currently rendered: `'top'` next to the
 * header button, a worked-hours row's email when opened via that row's "Ajouter" quick-add,
 * or `null` when closed. Keeps the form right next to whatever the user actually clicked
 * instead of always at the top of the tab — see AFFAIRES.RESSOURCES.EXPLAIN context. */
type AddFormAnchor = 'top' | string | null;

@Component({
  selector: 'app-affaire-ressources-tab',
  standalone: true,
  imports: [
    NgTemplateOutlet, TranslatePipe, ButtonComponent, FormFieldComponent, SelectComponent,
    DataTableComponent, DafCellDirective, CardComponent, StatusBadgeComponent,
    AvatarComponent, ProgressBarComponent,
  ],
  templateUrl: './affaire-ressources-tab.component.html',
  styleUrl: './affaire-ressources-tab.component.scss',
})
export class AffaireRessourcesTabComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc = inject(AffaireService);
  private readonly livrableSvc = inject(LivrableService);
  private readonly translate = inject(TranslateService);

  ressources    = signal<AffaireRessourceManageDto[]>([]);
  allUsers      = signal<UserRefDto[]>([]);
  loading       = signal(false);
  error         = signal<string | null>(null);

  // ── Real Timesheet hours on this affaire — cross-referenced against `ressources` so
  // "add" can be sourced from people who actually worked here instead of the whole
  // company directory. See AFFAIRES.RESSOURCES.WORKED_HOURS_EXPLAIN. ─────────────────
  workedHours        = signal<AffaireWorkedHoursSummaryDto[]>([]);
  loadingWorkedHours = signal(false);

  // ── Add form ────────────────────────────────────────────────────────────
  addFormAnchor = signal<AddFormAnchor>(null);
  newUserId     = signal<number | null>(null);
  newRate       = signal<number | null>(null);
  newRateType   = signal<'DAILY' | 'HOURLY'>('HOURLY');
  addingError   = signal<string | null>(null);
  submittingAdd = signal(false);

  // Taux suggéré depuis EmployeeCostService (même calcul que le wizard TM) — l'utilisateur
  // choisit vente externe (tauxVente, facturé au client) ou intercompany (tauxIntercompany),
  // et peut toujours corriger la valeur à la main ensuite.
  suggestedTaux   = signal<CollaborateurTauxDto | null>(null);
  loadingTaux     = signal(false);
  rateSource      = signal<RateSource>('EXTERNAL');

  // ── Inline rate edit ────────────────────────────────────────────────────
  editingId     = signal<number | null>(null);
  editRate      = signal<number | null>(null);
  editError     = signal<string | null>(null);
  savingEdit    = signal(false);

  // Only users not already an ACTIVE resource on this affaire — a deactivated
  // one still appears so re-adding them goes through addResource's reactivation path.
  readonly addableUsers = computed<UserRefDto[]>(() => {
    const activeIds = new Set(this.ressources().filter(r => r.isActive).map(r => r.userId));
    return this.allUsers().filter(u => !activeIds.has(u.id));
  });

  readonly userOptions = computed<SelectOption[]>(() =>
    this.addableUsers().map(u => ({ value: String(u.id), label: `${u.fullName} (${u.email})` })));

  readonly userSelectConfig = computed(() => {
    this.translate.currentLang();
    return { placeholder: this.translate.instant('AFFAIRES.RESSOURCES.SELECT_USER'), searchable: true, fullWidth: true };
  });

  readonly rateTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'DAILY',  label: this.translate.instant('AFFAIRES.RESSOURCES.RATE_DAILY') },
      { value: 'HOURLY', label: this.translate.instant('AFFAIRES.RESSOURCES.RATE_HOURLY') },
    ];
  });

  readonly rateTypeSelectConfig = computed(() => {
    this.translate.currentLang();
    return { fullWidth: true };
  });

  // ── daf-data-table: ressources actives + inactives ─────────────────────────
  readonly ressourcesColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'collaborateur', label: t('AFFAIRES.RESSOURCES.COL_NAME'),   type: 'custom' },
      { key: 'rate',          label: t('AFFAIRES.RESSOURCES.COL_RATE'),   type: 'custom', align: 'right' },
      { key: 'type',          label: t('AFFAIRES.RESSOURCES.COL_TYPE'),   type: 'custom' },
      { key: 'status',        label: t('AFFAIRES.RESSOURCES.COL_STATUS'), type: 'custom' },
      { key: '_actions',      label: '',                                  type: 'custom', align: 'right', width: '220px' },
    ];
  });

  readonly ressourcesRows = computed(() =>
    this.ressources().map(r => ({ id: r.id, isActive: r.isActive, _raw: r })));

  readonly ressourcesTableConfig = computed<TableConfig>(() => ({ hoverable: true }));

  // ── Worked-hours table: native <table>, not daf-data-table — an inline add-form row
  // needs to be spliced in right under whichever row triggered it, which means owning
  // <tr> rendering directly instead of going through the library's row list. ───────────

  /** Scales each row's inline bar relative to the busiest collaborator on this affaire —
   * an absolute Timesheet-hours axis would make everyone's bar look nearly empty next to
   * a full-time lead. Floors at 1 so a single-row list never divides by zero. */
  readonly maxWorkedHours = computed(() =>
    Math.max(1, ...this.workedHours().map(w => w.totalHours)));

  ngOnInit(): void {
    this.load();
    this.loadWorkedHours();
    this.svc.getUsers().subscribe(u => this.allUsers.set(u));
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getAllRessources(this.affaire.id).subscribe({
      next:  r => { this.ressources.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('AFFAIRES.RESSOURCES.LOAD_ERROR')); },
    });
  }

  loadWorkedHours(): void {
    this.loadingWorkedHours.set(true);
    this.svc.getRessourcesWorkedHours(this.affaire.id).subscribe({
      next:  h => { this.workedHours.set(h); this.loadingWorkedHours.set(false); },
      error: () => this.loadingWorkedHours.set(false),
    });
  }

  /** Pre-fills the add form from a real worked-hours row instead of the blind picker, and
   * anchors it right under that row instead of the top of the tab — the manager only needs
   * to type the rate and confirm without scrolling away from the person they just picked.
   * Clicking the same row's "Ajouter" again closes it, matching toggleAddForm(). */
  quickAddFromWorkedHours(row: AffaireWorkedHoursSummaryDto): void {
    if (row.userId === null || row.isRessource) return;
    if (this.addFormAnchor() === row.email) { this.closeAddForm(); return; }
    this.addFormAnchor.set(row.email);
    this.newUserId.set(row.userId);
    this.newRate.set(null);
    this.addingError.set(null);
    this.rateSource.set('EXTERNAL');
    this.fetchSuggestedTaux(row.userId);
  }

  // ── Add ─────────────────────────────────────────────────────────────────

  onUserSelect(values: string[]): void {
    const userId = values[0] ? Number(values[0]) : null;
    this.newUserId.set(userId);
    if (userId !== null) this.fetchSuggestedTaux(userId); else this.suggestedTaux.set(null);
  }

  /** Same EmployeeCostService-backed calculation the wizard's TM rate step uses — called
   * whenever the selected user changes, so the rate field starts from a real cost instead
   * of blank. Silent on failure: the field just stays manually editable, same as before
   * this existed. */
  private fetchSuggestedTaux(userId: number): void {
    this.loadingTaux.set(true);
    this.suggestedTaux.set(null);
    this.livrableSvc.calculateTaux(this.affaire.id, this.affaire.paysId, [userId]).subscribe({
      next: taux => {
        this.loadingTaux.set(false);
        const t = taux[0] ?? null;
        this.suggestedTaux.set(t);
        if (t && t.sourceCalcul === 'EMPLOYEE_COSTS') {
          this.newRate.set(this.rateSource() === 'EXTERNAL' ? t.tauxVente : t.tauxIntercompany);
        }
      },
      error: () => this.loadingTaux.set(false),
    });
  }

  setRateSource(source: RateSource): void {
    this.rateSource.set(source);
    const t = this.suggestedTaux();
    if (t && t.sourceCalcul === 'EMPLOYEE_COSTS') {
      this.newRate.set(source === 'EXTERNAL' ? t.tauxVente : t.tauxIntercompany);
    }
  }

  onRateTypeSelect(values: string[]): void {
    this.newRateType.set(values[0] === 'HOURLY' ? 'HOURLY' : 'DAILY');
  }

  /** Opens the header's blind-picker form at the top of the tab, or closes it — used only
   * by the top "Ajouter une ressource" button. Reopens at 'top' even if the form was
   * currently anchored to a worked-hours row, since that's an explicit request for the
   * full picker rather than a specific pre-selected person. */
  toggleAddForm(): void {
    if (this.addFormAnchor() === 'top') { this.closeAddForm(); return; }
    this.addFormAnchor.set('top');
    this.newUserId.set(null);
    this.newRate.set(null);
    this.newRateType.set('HOURLY');
    this.addingError.set(null);
    this.suggestedTaux.set(null);
    this.rateSource.set('EXTERNAL');
  }

  closeAddForm(): void {
    this.addFormAnchor.set(null);
    this.newUserId.set(null);
    this.newRate.set(null);
    this.newRateType.set('HOURLY');
    this.addingError.set(null);
    this.suggestedTaux.set(null);
    this.rateSource.set('EXTERNAL');
  }

  submitAdd(): void {
    const userId = this.newUserId();
    const rate = this.newRate();
    if (userId === null || rate === null || rate < 0 || this.submittingAdd()) return;
    this.submittingAdd.set(true);
    this.addingError.set(null);
    this.svc.addRessource(this.affaire.id, {
      userId, rateAmount: rate, rateType: this.newRateType(), rateCurrency: this.affaire.devise,
    }).subscribe({
      next: () => {
        this.submittingAdd.set(false);
        this.closeAddForm();
        this.load();
        this.loadWorkedHours();
      },
      error: err => {
        this.submittingAdd.set(false);
        this.addingError.set(err?.error?.detail ?? err?.error?.message ?? this.translate.instant('AFFAIRES.RESSOURCES.ADD_ERROR'));
      },
    });
  }

  // ── Rate edit ───────────────────────────────────────────────────────────

  startEdit(r: AffaireRessourceManageDto): void {
    this.editingId.set(r.id);
    this.editRate.set(r.rateAmount);
    this.editError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editRate.set(null);
    this.editError.set(null);
  }

  saveEdit(r: AffaireRessourceManageDto): void {
    const rate = this.editRate();
    if (rate === null || rate < 0 || this.savingEdit()) return;
    this.savingEdit.set(true);
    this.editError.set(null);
    this.svc.updateRessourceRate(this.affaire.id, r.id, { newRate: rate, rateCurrency: r.rateCurrency }).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.cancelEdit();
        this.load();
      },
      error: err => {
        this.savingEdit.set(false);
        this.editError.set(err?.error?.detail ?? err?.error?.message ?? this.translate.instant('AFFAIRES.RESSOURCES.EDIT_ERROR'));
      },
    });
  }

  // ── Deactivate ──────────────────────────────────────────────────────────

  deactivate(r: AffaireRessourceManageDto): void {
    if (!confirm(this.translate.instant('AFFAIRES.RESSOURCES.CONFIRM_DEACTIVATE', { name: r.userFullName }))) return;
    this.svc.deactivateRessource(this.affaire.id, r.id).subscribe({
      next: () => { this.load(); this.loadWorkedHours(); },
      error: () => this.error.set(this.translate.instant('AFFAIRES.RESSOURCES.DEACTIVATE_ERROR')),
    });
  }
}
