import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { NgClass }     from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { AffaireService }     from '../../affaire.service';
import { AffaireWizardService } from '../../affaire-wizard.service';
import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, DisciplineDto, ResponsableItem } from '../../affaire-wizard.model';
import { UserRefDto } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-responsables',
  standalone: true,
  imports: [FormsModule, DecimalPipe, NgClass, SelectComponent, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-responsables.component.html',
  styleUrl: './wizard-step-responsables.component.scss',
})
export class WizardStepResponsablesComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc  = inject(AffaireService);
  private readonly wizardSvc   = inject(AffaireWizardService);
  private readonly listSvc     = inject(FactListService);
  private readonly translate   = inject(TranslateService);

  allUsers          = signal<UserRefDto[]>([]);
  activites         = signal<ListValueDto[]>([]);
  disciplines       = signal<DisciplineDto[]>([]);
  isLoadingDisc     = signal(false);
  isDisciplineAvail = signal(true);

  // ── Budget tracking ────────────────────────────────────────────
  totalAllocated = computed(() =>
    this.draft.responsables.reduce((sum, r) => sum + (r.budgetAllocation ?? 0), 0)
  );

  budgetRemaining = computed(() =>
    (this.draft.budgetPrevisionnel ?? 0) - this.totalAllocated()
  );

  budgetMatchesProject = computed(() =>
    Math.abs(this.budgetRemaining()) < 0.001
  );

  barWidthPct = computed(() => {
    const budget = this.draft.budgetPrevisionnel ?? 0;
    if (!budget) return 0;
    return Math.min(100, (this.totalAllocated() / budget) * 100);
  });

  // ── daf-select option lists + config ───────────────────────────
  readonly userOptions = computed<SelectOption[]>(() =>
    this.allUsers().map(u => ({ value: String(u.id), label: u.fullName })));

  readonly activiteOptions = computed<SelectOption[]>(() =>
    this.activites().map(a => ({ value: a.id + '|' + a.labelFr, label: a.labelFr })));

  readonly disciplineOptions = computed<SelectOption[]>(() =>
    this.disciplines().map(d => ({ value: d.id + '|' + d.levelLabel, label: d.levelLabel })));

  readonly selectConfig = computed(() => {
    this.translate.currentLang();
    return { placeholder: this.translate.instant('AFFAIRES.wizard.responsables.select_placeholder'), searchable: true, fullWidth: true };
  });

  // daf-select emits string[]; bridge to the existing single-value handlers.
  onUserSelect(index: number, values: string[]): void {
    const v = values[0];
    if (!v) this.clearUser(index);
    else this.updateUser(index, Number(v));
  }

  onActiviteSelect(index: number, values: string[]): void {
    this.onActiviteChange(index, values[0] ?? '');
  }

  onDisciplineSelect(index: number, values: string[]): void {
    this.onDisciplineChange(index, values[0] ?? '');
  }

  ngOnInit(): void {
    this.affaireSvc.getResponsableUsers('Responsable Génie Civil').subscribe(u => {
      this.allUsers.set(u);
      if (this.draft.responsables.some(r => !r.userName || !r.role)) {
        const resolved = this.draft.responsables.map(r => {
          const found = u.find(u2 => u2.id === r.userId);
          return {
            ...r,
            userName: r.userName || found?.fullName || this.translate.instant('AFFAIRES.wizard.responsables.user_hash', { id: r.userId }),
            role: r.role || found?.roleName || '',
          };
        });
        this.emit({ ...this.draft, responsables: resolved });
      }
    });
    this.listSvc.getListValues('ACTIVITE', 0).subscribe(a => this.activites.set(a));
    if (this.draft.doc360ServerReference) {
      this.loadDisciplines(this.draft.doc360ServerReference);
    }
  }

  // ── Disciplines ────────────────────────────────────────────────

  loadDisciplines(serverRef: string): void {
    this.isLoadingDisc.set(true);
    this.wizardSvc.getDisciplines(serverRef).subscribe({
      next: discs => {
        this.disciplines.set(discs);
        this.isLoadingDisc.set(false);
        this.isDisciplineAvail.set(true);
      },
      error: () => {
        this.disciplines.set([]);
        this.isLoadingDisc.set(false);
        this.isDisciplineAvail.set(false);
      },
    });
  }

  // ── Row operations ─────────────────────────────────────────────

  addRow(): void {
    const isFirst = this.draft.responsables.length === 0;
    const defaultBudget = isFirst
      ? (this.draft.budgetPrevisionnel ?? 0)
      : Math.max(0, this.budgetRemaining());
    const newRow: ResponsableItem = {
      userId: 0, userName: '', isPrimary: isFirst,
      budgetAllocation: defaultBudget || undefined,
      activiteId: null, disciplineId: null,
    };
    this.emit({ ...this.draft, responsables: [...this.draft.responsables, newRow] });
  }

  removeRow(index: number): void {
    const updated = this.draft.responsables.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some(r => r.isPrimary)) {
      updated[0] = { ...updated[0], isPrimary: true };
    }
    this.emit({ ...this.draft, responsables: updated });
  }

  setPrimary(index: number): void {
    const updated = this.draft.responsables.map((r, i) => ({ ...r, isPrimary: i === index }));
    this.emit({ ...this.draft, responsables: updated });
  }

  updateUser(index: number, userId: number): void {
    const user = this.allUsers().find(u => u.id === userId);
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? {
        ...r,
        userId,
        userName: user?.fullName ?? '',
        role: user?.roleName ?? '',
      } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  clearUser(index: number): void {
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, userId: 0, userName: '', role: '' } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  updateRole(index: number, role: string): void {
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, role } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  updateBudget(index: number, val: string | number | null): void {
    const amount = val === null || val === '' ? undefined : Number(val);
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, budgetAllocation: amount } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  onActiviteChange(index: number, value: string): void {
    if (!value) {
      const updated = this.draft.responsables.map((r, i) =>
        i === index ? { ...r, activiteId: null, activiteLabel: undefined } : r
      );
      this.emit({ ...this.draft, responsables: updated });
      return;
    }
    const sep = value.indexOf('|');
    const id = Number(value.substring(0, sep));
    const label = value.substring(sep + 1);
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, activiteId: id, activiteLabel: label } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  onDisciplineChange(index: number, value: string): void {
    if (!value) {
      const updated = this.draft.responsables.map((r, i) =>
        i === index ? { ...r, disciplineId: null, disciplineLabel: undefined } : r
      );
      this.emit({ ...this.draft, responsables: updated });
      return;
    }
    const sep = value.indexOf('|');
    const id = Number(value.substring(0, sep));
    const label = value.substring(sep + 1);
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, disciplineId: id, disciplineLabel: label } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  onFreeDisciplineChange(index: number, text: string | number | null): void {
    const trimmed = (text === null ? '' : String(text)).trim();
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? {
        ...r,
        disciplineId: trimmed ? -1 : null,
        disciplineLabel: trimmed || undefined,
      } : r
    );
    this.emit({ ...this.draft, responsables: updated });
  }

  hasDuplicatePair(index: number): boolean {
    const r = this.draft.responsables[index];
    if (!r || !r.activiteId) return false;
    return this.draft.responsables.some(
      (other, i) => i !== index && other.userId === r.userId && other.activiteId === r.activiteId
    );
  }

  distributeEvenly(): void {
    const total = this.draft.budgetPrevisionnel ?? 0;
    const count = this.draft.responsables.length;
    if (count === 0 || total <= 0) return;
    const perPerson = Math.floor((total / count) * 1000) / 1000;
    const remainder = +(total - perPerson * (count - 1)).toFixed(3);
    const updated = this.draft.responsables.map((r, i) => ({
      ...r,
      budgetAllocation: i === count - 1 ? remainder : perPerson,
    }));
    this.emit({ ...this.draft, responsables: updated });
  }

  getBudgetPct(amount: number | undefined): number {
    const budget = this.draft.budgetPrevisionnel ?? 0;
    if (!budget || !amount) return 0;
    return Math.round((amount / budget) * 1000) / 10;
  }

  private emit(state: AffaireDraftState): void {
    this.draftChange.emit(state);
  }
}
