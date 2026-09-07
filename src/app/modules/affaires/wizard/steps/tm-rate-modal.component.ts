import {
  Component, Input, Output, EventEmitter, OnInit,
  inject, signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { LivrableService }       from '../../livrable.service';
import { CollaborateurTauxDto }  from '../../livrable.model';
import { UserRefDto, AffaireWorkedHoursSummaryDto } from '../../affaire.model';

export interface TmRateModalResult {
  taux: CollaborateurTauxDto[];
  /** Which calculated rate becomes each entry's billing rateAmount — the caller decides,
   * this modal doesn't hardcode "always external" any more. */
  rateSource: 'EXTERNAL' | 'INTERNAL';
}

/** A user row enriched with real Timesheet hours on this affaire, when available — lets
 * step 1 surface who actually worked here instead of an alphabetical company directory. */
interface SelectableUser extends UserRefDto {
  hours: number | null;
}

@Component({
  selector: 'app-tm-rate-modal',
  standalone: true,
  imports: [FormsModule, ButtonComponent, TranslatePipe],
  templateUrl: './tm-rate-modal.component.html',
  styleUrl: './tm-rate-modal.component.scss',
})
export class TmRateModalComponent implements OnInit {

  @Input() affaireId!: number;
  @Input() paysId!: number;
  @Input() availableUsers: UserRefDto[] = [];
  /** Real worked-hours-on-this-affaire summary, same endpoint/shape as the affaire detail
   * page's Ressources tab (AffaireService.getRessourcesWorkedHours) — empty for a brand
   * new affaire with no Timesheet history yet, which just means every row below shows no
   * hours badge and the list falls back to being a plain directory, same as before this
   * existed. */
  @Input() workedHours: AffaireWorkedHoursSummaryDto[] = [];
  /** Emits confirmed rates plus which rate (external/intercompany) to bill at — parent
   * updates draft.ressources */
  @Output() confirmed = new EventEmitter<TmRateModalResult>();
  @Output() closed    = new EventEmitter<void>();

  private readonly svc = inject(LivrableService);
  private readonly translate = inject(TranslateService);

  step             = signal<1 | 2>(1);
  selectedUserIds  = signal<Set<number>>(new Set());
  calculatedTaux   = signal<CollaborateurTauxDto[]>([]);
  editedCouts      = signal<Map<number, number>>(new Map());
  /** Interco/Vente default to the cost-derived formula (see recomputedTauxInterco/Vente)
   * but become sticky manual overrides once the user types into them directly — same
   * override pattern as editedCouts, 2026-08-31 request to make all three columns
   * editable instead of just Coût. */
  editedInterco    = signal<Map<number, number>>(new Map());
  editedVente      = signal<Map<number, number>>(new Map());
  rateType         = signal<'DAILY' | 'HOURLY'>('DAILY');
  rateSource       = signal<'EXTERNAL' | 'INTERNAL'>('EXTERNAL');
  isCalculating    = signal(false);
  serverError      = signal<string | null>(null);

  // ── Étape 1 ───────────────────────────────────────────────────────────────
  searchQuery   = signal('');
  onlyWithHours = signal(false);

  /** Whether this affaire has any real Timesheet history to filter by — the whole reason
   * the "only with hours" toggle exists. Hidden/inert otherwise, so a brand new affaire
   * with nobody yet still shows the full directory instead of a permanently-empty list. */
  readonly hasWorkedHoursData = computed(() => this.workedHours.length > 0);

  ngOnInit(): void {
    // Defaults ON whenever this affaire actually has logged hours — that's the whole point
    // of surfacing them (narrow hundreds of company users down to the handful who really
    // worked here). A user can still switch it off to reach the full directory.
    this.onlyWithHours.set(this.hasWorkedHoursData());
  }

  /** availableUsers, each annotated with its real hours on this affaire (or null), sorted
   * hours-first — a manager bulk-adding resources sees who actually logged time here
   * before anyone who merely exists in the company directory. */
  readonly sortedUsers = computed<SelectableUser[]>(() => {
    const hoursByUserId = new Map(
      this.workedHours.filter(w => w.userId !== null).map(w => [w.userId as number, w.totalHours]));
    return [...this.availableUsers]
      .map(u => ({ ...u, hours: hoursByUserId.get(u.id) ?? null }))
      .sort((a, b) => {
        if (a.hours !== null && b.hours !== null) return b.hours - a.hours;
        if (a.hours !== null) return -1;
        if (b.hours !== null) return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  });

  /** What step 1 actually shows — sortedUsers narrowed by the hours toggle and the search
   * box, so "select all" below means all currently VISIBLE people, never the whole
   * hundreds-strong company directory by accident. */
  readonly filteredUsers = computed<SelectableUser[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const onlyHours = this.onlyWithHours();
    return this.sortedUsers().filter(u => {
      if (onlyHours && u.hours === null) return false;
      if (!q) return true;
      return u.fullName.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
    });
  });

  readonly allSelected = computed(() => {
    const visible = this.filteredUsers();
    return visible.length > 0 && visible.every(u => this.selectedUserIds().has(u.id));
  });

  readonly selectedVisibleCount = computed(() =>
    this.filteredUsers().filter(u => this.selectedUserIds().has(u.id)).length);

  toggleUser(userId: number): void {
    const set = new Set(this.selectedUserIds());
    set.has(userId) ? set.delete(userId) : set.add(userId);
    this.selectedUserIds.set(set);
  }

  /** Selects/deselects only the currently filtered/visible rows — selections made under a
   * different filter (e.g. someone picked one-by-one before switching the toggle) are left
   * untouched rather than wiped, since they're still valid choices even once hidden. */
  toggleSelectAll(): void {
    const visibleIds = this.filteredUsers().map(u => u.id);
    if (this.allSelected()) {
      const set = new Set(this.selectedUserIds());
      visibleIds.forEach(id => set.delete(id));
      this.selectedUserIds.set(set);
    } else {
      this.selectedUserIds.set(new Set([...this.selectedUserIds(), ...visibleIds]));
    }
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
        this.editedInterco.set(new Map());
        this.editedVente.set(new Map());
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

  setInterco(userId: number, value: number): void {
    const map = new Map(this.editedInterco());
    map.set(userId, value);
    this.editedInterco.set(map);
  }

  getInterco(t: CollaborateurTauxDto): number {
    return this.editedInterco().get(t.userId) ?? this.recomputedTauxInterco(t);
  }

  setVente(userId: number, value: number): void {
    const map = new Map(this.editedVente());
    map.set(userId, value);
    this.editedVente.set(map);
  }

  getVente(t: CollaborateurTauxDto): number {
    return this.editedVente().get(t.userId) ?? this.recomputedTauxVente(t);
  }

  valider(): void {
    // Émettre les taux recalculés vers le parent — pas de sauvegarde backend
    // Le wizard appellera configureTM sur "Suivant". getInterco/getVente respectent une
    // éventuelle saisie manuelle ; sinon ils retombent sur la formule calculée à partir
    // du coût (comportement inchangé).
    const taux = this.calculatedTaux().map(t => ({
      ...t,
      coutReel:        this.getCout(t),
      tauxIntercompany: this.getInterco(t),
      tauxVente:        this.getVente(t),
    }));
    this.confirmed.emit({ taux, rateSource: this.rateSource() });
  }

  fmtNumber(v: number, decimals = 3): string {
    return new Intl.NumberFormat('fr-TN',
      { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  }

  pctLabel(v: number): string {
    return (v * 100).toFixed(1) + ' %';
  }
}
