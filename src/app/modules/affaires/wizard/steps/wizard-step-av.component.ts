import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ButtonComponent, SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState }  from '../../affaire-wizard.model';
import { ListValueDto }       from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-av',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonComponent, SelectComponent, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-av.component.html',
  styleUrl: './wizard-step-av.component.scss',
})
export class WizardStepAvComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly listSvc   = inject(FactListService);
  private readonly translate = inject(TranslateService);

  repartitionTypes = signal<ListValueDto[]>([]);

  /** Message d'échec du chargement du référentiel — null tant que tout va bien. */
  readonly loadError = signal<string | null>(null);

  // daf-select option list for the repartition type picker.
  readonly repartitionTypeOptions = computed<SelectOption[]>(() =>
    this.repartitionTypes().map(t => ({ value: String(t.id), label: t.labelFr })));

  // daf-select emits string[]; bridge back to the numeric model + total recompute.
  onTypeChange(r: AffaireDraftState['repartitions'][0], values: string[]): void {
    r.repartitionTypeId = values[0] ? Number(values[0]) : 0;
    // Le libellé est mémorisé avec l'id : le récapitulatif n'a pas le référentiel sous la
    // main et affichait « Type #3 » à la place de « CTR ». En relecture d'un brouillon il
    // arrive déjà résolu par le backend (AffaireDraftDto.ContactAllocationDto.label) — ici on
    // couvre le cas création.
    r.label = this.repartitionTypes().find(t => t.id === r.repartitionTypeId)?.labelFr;
    this.updateTotal();
  }

  // daf-form-field emits string | number | null; keep the numeric model + total recompute.
  onPercentageChange(r: AffaireDraftState['repartitions'][0], v: string | number | null): void {
    r.percentage = v === null || v === '' ? 0 : Number(v);
    this.updateTotal();
  }

  /**
   * Le référentiel des types de répartition est celui du PAYS DU CLIENT
   * (`clients.country_id`), décision du 2026-09-17 : la répartition contractuelle est une
   * donnée du contrat, elle suit le client et non l'entité ITEC qui le facture. Un client
   * marocain facturé depuis l'entité AE voit donc les types du Maroc.
   *
   * <p>Retombe sur `paysId` — l'entité de l'affaire — quand le client n'a pas de pays connu
   * (`country_id` est nul pour une partie du parc, voir `Client`) : mieux vaut proposer le
   * référentiel de l'entité qu'une liste vide.
   *
   * <p>Un pays sans valeurs propres reçoit les valeurs globales (CTR/BPE/TQC/OTHER) : la
   * requête serveur ne rend les valeurs d'un pays qu'en remplacement des globales de même
   * code, elle ne vide jamais la liste.
   */
  private scopePaysId(): number {
    return Number(this.draft.clientCountryId) || Number(this.draft.paysId);
  }

  ngOnInit(): void {
    const paysId = this.scopePaysId();
    if (paysId) {
      this.listSvc.getListValuesOrFail('AFFAIRE_REPARTITION_TYPE', paysId)
        .subscribe({
          next: t => {
            this.loadError.set(null);
            this.repartitionTypes.set(t);
            this.dropTypesOutsideScope(t);
          },
          // Un échec de chargement rendait une liste vide, indiscernable d'un pays sans
          // paramétrage : la liste déroulante s'ouvrait sur rien, sans un mot d'explication.
          // Le message du serveur est repris tel quel quand il y en a un — `message` pour une
          // règle métier, `error` pour le refus brut du garde d'isolation.
          error: err => {
            this.repartitionTypes.set([]);
            this.loadError.set(
              err?.error?.message
              ?? err?.error?.error
              ?? this.translate.instant('AFFAIRES.wizard.av.load_error'));
          },
        });
    }
    if (!this.draft.repartitions.length) {
      this.addRow();
    } else {
      this.updateTotal();
    }
  }

  /**
   * Revenir à l'étape 2 pour changer de client change le référentiel : les types retenus
   * sous le client précédent peuvent ne plus exister ici. `daf-select` les afficherait
   * comme une sélection vide tout en gardant l'id derrière, et le serveur refusait
   * l'enregistrement sans que rien à l'écran n'explique pourquoi. On les remet donc à
   * « non choisi », en gardant la ligne et son pourcentage — le total reste juste, il n'y a
   * que le type à re-choisir.
   */
  private dropTypesOutsideScope(available: ListValueDto[]): void {
    const ids = new Set(available.map(t => t.id));
    if (!this.draft.repartitions.some(r => r.repartitionTypeId && !ids.has(r.repartitionTypeId))) {
      return;
    }
    this.draft.repartitions = this.draft.repartitions.map(r =>
      r.repartitionTypeId && !ids.has(r.repartitionTypeId)
        ? { ...r, repartitionTypeId: 0, label: undefined }
        : r);
    this.emit();
  }

  addRow(): void {
    this.draft.repartitions = [...this.draft.repartitions, { repartitionTypeId: 0, percentage: 0 }];
    this.updateTotal();
  }

  removeRow(index: number): void {
    this.draft.repartitions = this.draft.repartitions.filter((_, i) => i !== index);
    this.updateTotal();
  }

  updateTotal(): void {
    this.draft.repartitionTotal = Math.round(
      this.draft.repartitions.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) * 10,
    ) / 10;
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, repartitions: [...this.draft.repartitions] });
  }
}
