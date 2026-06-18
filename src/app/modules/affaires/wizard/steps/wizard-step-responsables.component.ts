import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { NgClass }     from '@angular/common';

import { AffaireService }     from '../../affaire.service';
import { AffaireWizardService } from '../../affaire-wizard.service';
import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, DisciplineDto, ResponsableItem } from '../../affaire-wizard.model';
import { UserRefDto } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-responsables',
  standalone: true,
  imports: [FormsModule, DecimalPipe, NgClass],
  templateUrl: './wizard-step-responsables.component.html',
  styleUrl: './wizard-step-responsables.component.scss',
})
export class WizardStepResponsablesComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc  = inject(AffaireService);
  private readonly wizardSvc   = inject(AffaireWizardService);
  private readonly listSvc     = inject(FactListService);

  allUsers        = signal<UserRefDto[]>([]);
  userResults     = signal<UserRefDto[]>([]);
  activites       = signal<ListValueDto[]>([]);
  disciplines     = signal<DisciplineDto[]>([]);
  isLoadingDisc   = signal(false);
  isDisciplineAvail = signal(true);

  userQuery = '';
  private userHideTimer?: ReturnType<typeof setTimeout>;

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

  ngOnInit(): void {
    this.affaireSvc.getUsers().subscribe(u => this.allUsers.set(u));
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

  // ── User typeahead ─────────────────────────────────────────────

  showAllUsers(): void {
    if (this.userHideTimer) { clearTimeout(this.userHideTimer); this.userHideTimer = undefined; }
    const selected = new Set(this.draft.responsables.map(r => r.userId));
    this.userResults.set(this.allUsers().filter(u => !selected.has(u.id)).slice(0, 8));
  }

  scheduleHideUsers(): void {
    this.userHideTimer = setTimeout(() => this.userResults.set([]), 150);
  }

  onUserInput(value: string): void {
    this.userQuery = value;
    if (this.userHideTimer) { clearTimeout(this.userHideTimer); this.userHideTimer = undefined; }
    const selected = new Set(this.draft.responsables.map(r => r.userId));
    const list = this.allUsers().filter(u => !selected.has(u.id));
    if (!value.trim()) { this.userResults.set(list.slice(0, 8)); return; }
    const q = value.toLowerCase();
    this.userResults.set(list.filter(u => u.fullName.toLowerCase().includes(q)).slice(0, 8));
  }

  addUser(user: UserRefDto): void {
    if (this.userHideTimer) { clearTimeout(this.userHideTimer); this.userHideTimer = undefined; }
    if (this.draft.responsables.some(r => r.userId === user.id)) return;
    const isFirst = this.draft.responsables.length === 0;
    // Auto-assign full budget to first, remaining to subsequent
    const defaultBudget = isFirst
      ? (this.draft.budgetPrevisionnel ?? 0)
      : Math.max(0, this.budgetRemaining());
    const updated: ResponsableItem[] = [
      ...this.draft.responsables,
      { userId: user.id, userName: user.fullName, isPrimary: isFirst, budgetAllocation: defaultBudget || undefined },
    ];
    this.userQuery = '';
    this.userResults.set([]);
    this.emit({ ...this.draft, responsables: updated });
  }

  removeUser(userId: number): void {
    const updated = this.draft.responsables.filter(r => r.userId !== userId);
    if (updated.length > 0 && !updated.some(r => r.isPrimary)) {
      updated[0] = { ...updated[0], isPrimary: true };
    }
    this.emit({ ...this.draft, responsables: updated });
  }

  setPrimary(userId: number): void {
    const updated = this.draft.responsables.map(r => ({ ...r, isPrimary: r.userId === userId }));
    this.emit({ ...this.draft, responsables: updated });
  }

  updateRole(userId: number, role: string): void {
    const updated = this.draft.responsables.map(r =>
      r.userId === userId ? { ...r, role } : r);
    this.emit({ ...this.draft, responsables: updated });
  }

  updateBudget(userId: number, val: string): void {
    const amount = val ? Number(val) : undefined;
    const updated = this.draft.responsables.map(r =>
      r.userId === userId ? { ...r, budgetAllocation: amount } : r);
    this.emit({ ...this.draft, responsables: updated });
  }

  // Distribute total budget evenly across all responsables
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

  // ── Field changes ──────────────────────────────────────────────

  onActiviteChange(val: string): void {
    this.emit({ ...this.draft, activiteId: val ? Number(val) : undefined });
  }

  onDisciplineChange(val: string): void {
    const discipline = this.disciplines().find(d => String(d.id) === val);
    this.emit({
      ...this.draft,
      disciplineId:           discipline?.id,
      disciplineLabel:        discipline?.levelLabel,
      disciplineServerRef:    this.draft.doc360ServerReference,
      disciplineLevelConcat:  discipline?.levelConcat,
    });
  }

  onFreeDisciplineChange(val: string): void {
    this.emit({
      ...this.draft,
      disciplineId:    undefined,
      disciplineLabel: val,
      disciplineServerRef: undefined,
      disciplineLevelConcat: undefined,
    });
  }

  getUserName(userId: number): string {
    return this.allUsers().find(u => u.id === userId)?.fullName ?? `#${userId}`;
  }

  private emit(state: AffaireDraftState): void {
    this.draftChange.emit(state);
  }
}
