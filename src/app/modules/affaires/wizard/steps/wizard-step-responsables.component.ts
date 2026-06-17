import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AffaireService }     from '../../affaire.service';
import { AffaireWizardService } from '../../affaire-wizard.service';
import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, DisciplineDto, ResponsableItem } from '../../affaire-wizard.model';
import { UserRefDto } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-responsables',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './wizard-step-responsables.component.html',
  styleUrl: './wizard-step-responsables.component.scss',
})
export class WizardStepResponsablesComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc  = inject(AffaireService);
  private readonly wizardSvc   = inject(AffaireWizardService);
  private readonly listSvc     = inject(FactListService);

  allUsers     = signal<UserRefDto[]>([]);
  userResults  = signal<UserRefDto[]>([]);
  activites    = signal<ListValueDto[]>([]);
  disciplines  = signal<DisciplineDto[]>([]);

  userQuery = '';
  private userHideTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.affaireSvc.getUsers().subscribe(u => this.allUsers.set(u));
    this.listSvc.getListValues('ACTIVITE', 0).subscribe(a => this.activites.set(a));
    if (this.draft.doc360ServerReference) {
      this.wizardSvc.getDisciplines(this.draft.doc360ServerReference)
        .subscribe(d => this.disciplines.set(d));
    }
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
    const updated: ResponsableItem[] = [
      ...this.draft.responsables,
      { userId: user.id, userName: user.fullName, isPrimary: isFirst },
    ];
    this.userQuery = '';
    this.userResults.set([]);
    this.emit({ ...this.draft, responsables: updated });
  }

  removeUser(userId: number): void {
    const updated = this.draft.responsables.filter(r => r.userId !== userId);
    if (updated.length > 0 && !updated.some(r => r.isPrimary)) {
      updated[0].isPrimary = true;
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

  // ── Field changes ──────────────────────────────────────────────

  onBudgetChange(val: string): void {
    this.emit({ ...this.draft, budgetPrevisionnel: val ? Number(val) : undefined });
  }

  onActiviteChange(val: string): void {
    this.emit({ ...this.draft, activiteId: val ? Number(val) : undefined });
  }

  onDisciplineChange(val: string): void {
    const discipline = this.disciplines().find(d => String(d.id) === val);
    this.emit({
      ...this.draft,
      disciplineId:        discipline?.id,
      disciplineLabel:     discipline?.label,
      disciplineServerRef: this.draft.doc360ServerReference,
    });
  }

  getUserName(userId: number): string {
    return this.allUsers().find(u => u.id === userId)?.fullName ?? `#${userId}`;
  }

  private emit(state: AffaireDraftState): void {
    this.draftChange.emit(state);
  }
}
