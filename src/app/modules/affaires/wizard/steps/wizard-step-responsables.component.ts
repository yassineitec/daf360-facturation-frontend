import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { NgClass }     from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  SelectComponent, SelectOption, FormFieldComponent, ButtonComponent,
} from '@khalilrebhiitec/daf360';

import { AffaireService }     from '../../affaire.service';
import { AffaireWizardService } from '../../affaire-wizard.service';
import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, DisciplineDto, ResponsableItem } from '../../affaire-wizard.model';
import { UserRefDto } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-responsables',
  standalone: true,
  imports: [
    FormsModule, DecimalPipe, NgClass,
    SelectComponent, FormFieldComponent, ButtonComponent, TranslatePipe,
  ],
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
  /**
   * Vrai uniquement quand la liste affichée vient RÉELLEMENT de l'ODS.
   *
   * Le badge « DOC360 » se posait sur la seule présence d'une référence de projet, alors
   * qu'une référence dont l'ODS ne rend rien retombe désormais sur les disciplines locales :
   * le badge aurait annoncé une origine que la liste n'a pas.
   */
  disciplinesFromDoc360 = signal(false);

  // ── Budget tracking ────────────────────────────────────────────
  //
  // ⚠️ Des MÉTHODES, pas des `computed()`. `draft` est un `@Input()` — un objet nu,
  // pas un signal — donc un `computed()` qui le lit ne déclare AUCUNE dépendance
  // réactive : il s'évalue une seule fois et garde ce résultat pour toujours.
  // C'est ce qui faisait mentir tout le bloc budget de l'étape : `totalAllocated`
  // restait figé à sa première valeur (0, la liste étant encore vide au premier
  // rendu) et `budgetRemaining` au budget entier, donc la barre, le statut et les
  // libellés « alloué / restant » affichaient toujours moins que ce qui était saisi
  // — et `addRow()` redonnait le budget complet à chaque nouvelle ligne.
  // En méthode, la valeur est recalculée à chaque cycle de détection, ce qui est
  // exactement le comportement voulu ici.
  totalAllocated(): number {
    return this.draft.responsables.reduce((sum, r) => sum + (r.budgetAllocation ?? 0), 0);
  }

  budgetRemaining(): number {
    return (this.draft.budgetPrevisionnel ?? 0) - this.totalAllocated();
  }

  budgetMatchesProject(): boolean {
    return Math.abs(this.budgetRemaining()) < 0.001;
  }

  barWidthPct(): number {
    const budget = this.draft.budgetPrevisionnel ?? 0;
    if (!budget) return 0;
    return Math.min(100, (this.totalAllocated() / budget) * 100);
  }

  // ── daf-select option lists + config ───────────────────────────
  readonly userOptions = computed<SelectOption[]>(() =>
    this.allUsers().map(u => ({ value: String(u.id), label: u.fullName })));

  readonly activiteOptions = computed<SelectOption[]>(() =>
    this.activites().map(a => ({ value: a.id + '|' + a.labelFr, label: a.labelFr })));

  // `id|libellé`, l'identifiant pouvant être VIDE : une discipline déjà saisie librement
  // dans la base est reproposée sans identifiant DOC360, et `'null|Bridges'` partirait au
  // serveur comme la chaîne « null ». Le séparateur reste en place — c'est le libellé qui
  // suit, et c'est `substring` qui le récupère, pas un `split` qui casserait sur un libellé
  // contenant lui-même une barre.
  readonly disciplineOptions = computed<SelectOption[]>(() =>
    this.disciplines().map(d => ({
      value: (d.id ?? '') + '|' + d.levelLabel,
      label: d.levelLabel,
    })));

  readonly selectConfig = computed(() => {
    this.translate.currentLang();
    return { placeholder: this.translate.instant('AFFAIRES.wizard.responsables.select_placeholder'), searchable: true, fullWidth: true };
  });

  /**
   * `creatable` : la liste propose ce que la base connaît, et accepte le reste.
   *
   * L'ancien montage donnait l'un OU l'autre — un sélecteur quand DOC360 répondait, un
   * champ texte nu sinon — donc rien à réutiliser dans le cas précisément où le nom d'une
   * discipline est le plus susceptible d'être retapé de travers.
   */
  readonly disciplineConfig = computed(() => {
    this.translate.currentLang();
    const key = this.isDisciplineAvail()
      ? 'AFFAIRES.wizard.responsables.disc_ph'
      : 'AFFAIRES.wizard.responsables.doc360_unavailable_ph';
    return {
      placeholder: this.translate.instant(key),
      searchable:  true,
      creatable:   true,
      fullWidth:   true,
    };
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
    // Une liste dans TOUS les cas. Sans référence DOC360 il n'y en avait aucune, et
    // l'étape basculait en saisie libre intégrale : c'est ce qui a mis `bim&cad` et
    // `bridgs` en base à côté d'un `BIM & CAD` qui existait déjà avec son identifiant.
    if (this.draft.doc360ServerReference) {
      this.loadDisciplines(this.draft.doc360ServerReference);
    } else {
      this.loadKnownDisciplines();
    }
  }

  // ── Disciplines ────────────────────────────────────────────────

  loadDisciplines(serverRef: string): void {
    this.isLoadingDisc.set(true);
    this.wizardSvc.getDisciplines(serverRef).subscribe({
      next: discs => {
        this.isDisciplineAvail.set(true);
        // Une référence DOC360 qui ne rend aucune discipline vaut pas de liste du tout :
        // on retombe sur ce que la base connaît déjà plutôt que d'afficher un sélecteur
        // vide. Le compte ODS expiré passe par la branche `error`, celle-ci couvre le
        // projet réellement sans discipline.
        if (discs.length) {
          this.disciplines.set(discs);
          this.disciplinesFromDoc360.set(true);
          this.isLoadingDisc.set(false);
        } else {
          this.loadKnownDisciplines();
        }
      },
      error: () => {
        this.isDisciplineAvail.set(false);
        this.loadKnownDisciplines();
      },
    });
  }

  /**
   * Les disciplines déjà employées dans cette base — le repli quand l'ODS ne peut pas
   * répondre (pas de référence de projet, compte expiré, projet sans discipline).
   *
   * Une entrée garde son identifiant DOC360 quand elle en a un : la choisir raccroche une
   * affaire neuve à une vraie discipline, au lieu de n'en garder que le nom.
   */
  loadKnownDisciplines(): void {
    this.isLoadingDisc.set(true);
    this.disciplinesFromDoc360.set(false);
    this.wizardSvc.getKnownDisciplines().subscribe({
      next: discs => {
        this.disciplines.set(discs);
        this.isLoadingDisc.set(false);
      },
      // Le sélecteur reste utilisable sans liste : `creatable` accepte la saisie libre,
      // qui est exactement le comportement d'avant. Rien à signaler à l'utilisateur.
      error: () => {
        this.disciplines.set([]);
        this.isLoadingDisc.set(false);
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
      userId: 0, userName: '',
      budgetAllocation: defaultBudget || undefined,
      activiteId: null, disciplineId: null,
    };
    this.emit({ ...this.draft, responsables: [...this.draft.responsables, newRow] });
  }

  removeRow(index: number): void {
    const updated = this.draft.responsables.filter((_, i) => i !== index);
    this.emit({ ...this.draft, responsables: updated });
  }

  // `setPrimary` a disparu avec la notion de responsable principal : il n'y a plus de rang
  // à attribuer, donc plus d'étoile à cliquer dans l'en-tête de ligne.

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
      this.setDiscipline(index, null, undefined);
      return;
    }
    const sep = value.indexOf('|');
    const rawId = value.substring(0, sep);
    // Identifiant vide = discipline connue de la base mais sans équivalent DOC360.
    // `Number('')` vaut 0, pas NaN : sans ce test la ligne partirait avec `disciplineId: 0`,
    // que le serveur traite comme un identifiant absent — même résultat, mais par accident.
    this.setDiscipline(index, rawId ? Number(rawId) : null, value.substring(sep + 1));
  }

  /**
   * Une discipline que la liste ne contenait pas : on garde le libellé, jamais d'identifiant.
   *
   * Le sentinelle -1 qui tenait cette place se retrouvait écrit dans
   * `affaire_responsables.discipline_id`, qui référence la dimension DOC360 —
   * l'enregistrement de l'étape échouait sur la contrainte de clé étrangère.
   *
   * L'entrée rejoint la liste partagée par toutes les lignes : le deuxième responsable la
   * choisit au lieu de la retaper, ce qui est très exactement ce qui manquait.
   */
  onDisciplineCreated(index: number, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (!this.disciplines().some(d => d.levelLabel.toLowerCase() === trimmed.toLowerCase())) {
      this.disciplines.update(ds => [...ds, { id: null, levelLabel: trimmed }]);
    }
    this.setDiscipline(index, null, trimmed);
  }

  /** Le libellé de la ligne, encodé comme les options pour que `daf-select` le retrouve. */
  disciplineValue(resp: ResponsableItem): string[] {
    if (!resp.disciplineLabel) return [];
    return [(resp.disciplineId ?? '') + '|' + resp.disciplineLabel];
  }

  private setDiscipline(index: number, id: number | null, label: string | undefined): void {
    const updated = this.draft.responsables.map((r, i) =>
      i === index ? { ...r, disciplineId: id, disciplineLabel: label } : r
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
