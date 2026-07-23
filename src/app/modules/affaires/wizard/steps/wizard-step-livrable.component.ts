import {
  Component, Input, Output, EventEmitter,
  OnInit, inject, signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { ButtonComponent, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { AffaireDraftState }  from '../../affaire-wizard.model';
import { LivrableService }    from '../../livrable.service';
import {
  DisciplineExtDto, WbsExtDto, DocumentExtDto, AffaireLivrableDto,
} from '../../livrable.model';

interface DiscGroup {
  label: string;
  ids: string[];
  montant: number;
}

@Component({
  selector: 'app-wizard-step-livrable',
  standalone: true,
  imports: [FormsModule, ButtonComponent, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-livrable.component.html',
  styleUrl: './wizard-step-livrable.component.scss',
})
export class WizardStepLivrableComponent implements OnInit {

  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly svc = inject(LivrableService);
  private readonly translate = inject(TranslateService);

  // ── Données ODS ───────────────────────────────────────────────────────────
  disciplines     = signal<DisciplineExtDto[]>([]);
  selectedDisc    = signal<DiscGroup | null>(null);
  wbsList         = signal<WbsExtDto[]>([]);
  selectedWbs     = signal<WbsExtDto | null>(null);
  documents       = signal<DocumentExtDto[]>([]);
  allDocsByDisc   = signal<DocumentExtDto[]>([]);

  discGroups = computed<DiscGroup[]>(() => {
    const map = new Map<string, DiscGroup>();
    for (const d of this.disciplines()) {
      const baseName = d.label.includes(' - ')
        ? d.label.substring(0, d.label.lastIndexOf(' - '))
        : d.label;
      const existing = map.get(baseName);
      if (existing) {
        existing.ids.push(d.id);
        existing.montant += d.montant ?? 0;
      } else {
        map.set(baseName, { label: baseName, ids: [d.id], montant: d.montant ?? 0 });
      }
    }
    return Array.from(map.values());
  });

  private readonly wbsDisciplineMap = new Map<string, string>();

  // ── Mode d'affectation ────────────────────────────────────────────────────
  modeAffectation = signal<'MANUEL' | 'AUTO'>('MANUEL');

  // ── Sélection MANUEL ──────────────────────────────────────────────────────
  selectedDocs  = signal<Set<string>>(new Set());
  budgetsMap    = signal<Map<string, number>>(new Map());

  // ── Sélection AUTO ────────────────────────────────────────────────────────
  budgetGlobal     = signal<number | null>(null);
  selectedDocsAuto = signal<Set<string>>(new Set());

  // ── État ──────────────────────────────────────────────────────────────────
  isLoadingDisc  = signal(false);
  isLoadingWbs   = signal(false);
  isLoadingDocs  = signal(false);
  isSaving       = signal(false);
  serverError    = signal<string | null>(null);
  savedLivrables = signal<AffaireLivrableDto[]>([]);

  // ── Computed ──────────────────────────────────────────────────────────────
  totalBudgetManuel = computed(() => {
    let total = 0;
    this.budgetsMap().forEach(v => total += v || 0);
    return total;
  });

  budgetParDocAuto = computed(() => {
    const nb     = this.selectedDocsAuto().size;
    const global = this.budgetGlobal() || 0;
    if (!nb || !global) return 0;
    return Math.round((global / nb) * 1000) / 1000;
  });

  ngOnInit(): void {
    const id = this.draft.id;
    if (!id) return;

    const hasRef = !!(this.draft.reference?.trim());
    if (!hasRef) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.livrable.err_no_ref'));
      return;
    }

    this.loadDisciplines(id);
    this.svc.getLivrables(id).subscribe({ next: l => this.savedLivrables.set(l) });
  }

  // ── Disciplines ───────────────────────────────────────────────────────────

  private loadDisciplines(id: number): void {
    this.isLoadingDisc.set(true);
    this.svc.getDisciplines(id).subscribe({
      next: d => { this.disciplines.set(d); this.isLoadingDisc.set(false); },
      error: err => {
        this.isLoadingDisc.set(false);
        this.serverError.set(err.error?.detail ?? err.error?.message ?? this.translate.instant('AFFAIRES.wizard.livrable.err_disc_load'));
      },
    });
  }

  selectDiscipline(group: DiscGroup): void {
    if (this.locked) return;
    this.selectedDisc.set(group);
    this.selectedWbs.set(null);
    this.documents.set([]);
    this.wbsDisciplineMap.clear();
    this.resetSelection();

    const affaireId = this.draft.id!;
    this.isLoadingWbs.set(true);

    forkJoin(group.ids.map(discId => this.svc.getWbs(affaireId, discId))).subscribe({
      next: results => {
        const seen = new Set<string>();
        const unique: WbsExtDto[] = [];
        results.forEach((wbsList, i) => {
          const discId = group.ids[i];
          for (const wbs of wbsList) {
            if (!seen.has(wbs.id)) {
              seen.add(wbs.id);
              unique.push(wbs);
              this.wbsDisciplineMap.set(wbs.id, discId);
            }
          }
        });
        this.wbsList.set(unique);
        this.isLoadingWbs.set(false);
      },
      error: () => this.isLoadingWbs.set(false),
    });

    forkJoin(group.ids.map(discId => this.svc.getAllDocsByDiscipline(affaireId, discId))).subscribe({
      next: results => {
        const seen = new Set<string>();
        const unique = results.flat().filter(d => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        });
        this.allDocsByDisc.set(unique);
      },
      error: () => {},
    });
  }

  // ── WBS ───────────────────────────────────────────────────────────────────

  selectWbs(wbs: WbsExtDto): void {
    if (this.locked) return;
    this.selectedWbs.set(wbs);
    this.isLoadingDocs.set(true);
    this.svc.getDocumentsByWbs(this.draft.id!, wbs.id).subscribe({
      next: d => { this.documents.set(d); this.isLoadingDocs.set(false); },
      error: () => this.isLoadingDocs.set(false),
    });
  }

  // ── Mode MANUEL ───────────────────────────────────────────────────────────

  isDocSelectedManuel(docId: string): boolean {
    return this.selectedDocs().has(docId);
  }

  toggleDocManuel(doc: DocumentExtDto): void {
    const set = new Set(this.selectedDocs());
    if (set.has(doc.id)) {
      set.delete(doc.id);
      const map = new Map(this.budgetsMap());
      map.delete(doc.id);
      this.budgetsMap.set(map);
    } else {
      set.add(doc.id);
    }
    this.selectedDocs.set(set);
  }

  setBudget(docId: string, value: number): void {
    const map = new Map(this.budgetsMap());
    map.set(docId, value);
    this.budgetsMap.set(map);
  }

  getBudget(docId: string): number | null {
    return this.budgetsMap().get(docId) ?? null;
  }

  saveManuel(): void {
    const group = this.selectedDisc();
    const wbs   = this.selectedWbs();
    if (!group || !wbs) return;

    const discId = this.wbsDisciplineMap.get(wbs.id) ?? group.ids[0];

    const affectations = this.documents()
      .filter(d => this.selectedDocs().has(d.id))
      .map(d => ({
        extDocumentId: d.id,
        extWbsId:      wbs.id,
        documentNom:   d.nom,
        wbsTitre:      wbs.titre,
        budgetHoraireExt: d.budgetHoraire,
        budget: this.budgetsMap().get(d.id) ?? 0,
      }));

    if (affectations.length === 0) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.livrable.err_select_doc')); return;
    }
    const invalid = affectations.find(a => !a.budget || a.budget <= 0);
    if (invalid) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.livrable.err_budget_positive', { name: invalid.documentNom })); return;
    }

    this.isSaving.set(true);
    this.serverError.set(null);
    this.svc.affecterManuel(this.draft.id!, discId, affectations).subscribe({
      next: result => {
        this.isSaving.set(false);
        this.savedLivrables.update(l => [...l, ...result]);
        this.resetSelection();
        this.emitSaved();
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(err.error?.detail ?? err.error?.message ?? this.translate.instant('AFFAIRES.wizard.livrable.err_save'));
      },
    });
  }

  // ── Mode AUTO ─────────────────────────────────────────────────────────────

  /** daf-form-field bridge: coerce string|number|null → number|null for budgetGlobal signal. */
  onBudgetGlobalChange(v: string | number | null): void {
    this.budgetGlobal.set(v === null || v === '' ? null : Number(v));
  }

  isDocSelectedAuto(docId: string): boolean {
    return this.selectedDocsAuto().has(docId);
  }

  toggleDocAuto(doc: DocumentExtDto): void {
    const set = new Set(this.selectedDocsAuto());
    set.has(doc.id) ? set.delete(doc.id) : set.add(doc.id);
    this.selectedDocsAuto.set(set);
  }

  toggleAllDocsAuto(): void {
    if (this.selectedDocsAuto().size === this.allDocsByDisc().length) {
      this.selectedDocsAuto.set(new Set());
    } else {
      this.selectedDocsAuto.set(new Set(this.allDocsByDisc().map(d => d.id)));
    }
  }

  saveAuto(): void {
    const group = this.selectedDisc();
    if (!group) return;
    if (!this.budgetGlobal() || this.budgetGlobal()! <= 0) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.livrable.err_global_budget')); return;
    }
    if (this.selectedDocsAuto().size === 0) {
      this.serverError.set(this.translate.instant('AFFAIRES.wizard.livrable.err_select_doc')); return;
    }

    this.isSaving.set(true);
    this.serverError.set(null);
    this.svc.affecterAuto(
      this.draft.id!,
      group.ids[0],
      this.budgetGlobal()!,
      Array.from(this.selectedDocsAuto()),
    ).subscribe({
      next: result => {
        this.isSaving.set(false);
        this.savedLivrables.update(l => [...l, ...result]);
        this.selectedDocsAuto.set(new Set());
        this.budgetGlobal.set(null);
        this.emitSaved();
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(err.error?.detail ?? err.error?.message ?? this.translate.instant('AFFAIRES.wizard.livrable.err_save'));
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resetSelection(): void {
    this.selectedDocs.set(new Set());
    this.budgetsMap.set(new Map());
    this.selectedDocsAuto.set(new Set());
    this.budgetGlobal.set(null);
    this.serverError.set(null);
  }

  private emitSaved(): void {
    this.draftChange.emit({ ...this.draft, livrablesSaved: true });
  }

  fmtCurrency(v: number): string {
    return new Intl.NumberFormat('fr-TN',
      { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
  }
}
