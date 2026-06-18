import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';

import { AffaireWizardService } from '../../affaire-wizard.service';
import { AffaireDraftState, ExternalProjectResult } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-doc360',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './wizard-step-doc360.component.html',
  styleUrl: './wizard-step-doc360.component.scss',
})
export class WizardStepDoc360Component implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly wizardSvc = inject(AffaireWizardService);

  searchQuery = '';
  results     = signal<ExternalProjectResult[]>([]);
  isSearching = signal(false);
  showResults = signal(false);

  private readonly search$ = new Subject<string>();
  private hideTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2) { this.results.set([]); this.isSearching.set(false); return []; }
        this.isSearching.set(true);
        return this.wizardSvc.searchDoc360Projects(q);
      }),
    ).subscribe({
      next: list => { this.results.set(list); this.isSearching.set(false); this.showResults.set(true); },
      error: ()   => { this.results.set([]);   this.isSearching.set(false); },
    });
  }

  onInput(value: string): void {
    this.searchQuery = value;
    this.search$.next(value);
    if (!value) { this.results.set([]); this.showResults.set(false); }
  }

  scheduleHideResults(): void {
    this.hideTimer = setTimeout(() => this.showResults.set(false), 200);
  }

  showResultsNow(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    if (this.results().length) this.showResults.set(true);
  }

  selectProject(p: ExternalProjectResult): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    this.showResults.set(false);
    this.searchQuery = `${p.serverReference} — ${p.projectName}`;

    // Update intitulé if it is empty OR still matches the previous project name (not manually edited)
    const prevName   = this.draft.doc360ProjectName;
    const intitule   = (!this.draft.intitule?.trim() || this.draft.intitule === prevName)
        ? p.projectName
        : this.draft.intitule;

    this.draftChange.emit({
      ...this.draft,
      doc360ProjectName:     p.projectName,
      doc360ErpReference:    p.erpReference,
      doc360ServerReference: p.serverReference,
      doc360ClientName:      p.clientName,
      reference:             p.serverReference,
      intitule,
    });
  }

  clearSelection(): void {
    this.searchQuery = '';
    this.results.set([]);
    this.showResults.set(false);
    // Reset intitulé only if it was auto-filled (still matches the project name)
    const intitule = this.draft.intitule === this.draft.doc360ProjectName
        ? ''
        : this.draft.intitule;
    this.draftChange.emit({
      ...this.draft,
      doc360ProjectName:     undefined,
      doc360ErpReference:    undefined,
      doc360ServerReference: undefined,
      doc360ClientName:      undefined,
      reference:             undefined,
      intitule,
    });
  }
}
