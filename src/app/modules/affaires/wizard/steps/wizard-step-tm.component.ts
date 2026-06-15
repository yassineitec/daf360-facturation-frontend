import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AffaireService }    from '../../affaire.service';
import { FactListService }   from '../../../../core/fact-list.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { UserRefDto }        from '../../affaire.model';
import { ListValueDto }      from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-tm',
  standalone: true,
  imports: [FormsModule],
  template: `
<div class="space-y-4">

  <div class="p-4 bg-[#f0f4ff] rounded-xl flex gap-2 text-sm">
    <span class="material-symbols-outlined text-[#4648d4] text-base flex-shrink-0">info</span>
    <p class="text-[#1d2b3e]">
      Sélectionnez les collaborateurs et définissez leurs taux de facturation.
      Les taux seront verrouillés après la première facturation.
    </p>
  </div>

  @for (r of draft.ressources; track $index; let i = $index) {
    <div class="p-4 bg-white rounded-xl border border-[#eceef0]">
      <div class="flex justify-between items-center mb-3">
        <span class="text-xs font-bold text-[#1a6b7c] uppercase tracking-wide">
          Ressource {{ i + 1 }}
        </span>
        <button type="button" (click)="removeRessource(i)"
          class="p-1.5 hover:bg-[#fee2e2] rounded-lg text-[#ba1a1a] transition-colors">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <!-- Collaborateur -->
        <div class="col-span-2">
          <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">Collaborateur *</label>
          <select [(ngModel)]="r.userId" (ngModelChange)="onUserChange(r, $event)"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none">
            <option [value]="0">Sélectionner...</option>
            @for (u of users(); track u.id) {
              <option [value]="u.id">{{ u.fullName }}</option>
            }
          </select>
        </div>
        <!-- Type -->
        <div>
          <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">Type</label>
          <select [(ngModel)]="r.resourceType"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none">
            <option value="INTERNAL">Interne</option>
            <option value="EXTERNAL">Externe</option>
          </select>
        </div>
        <!-- Type taux -->
        <div>
          <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">Type taux</label>
          <select [(ngModel)]="r.rateType"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none">
            <option value="DAILY">Journalier (JH)</option>
            <option value="HOURLY">Horaire (H)</option>
          </select>
        </div>
        <!-- Taux facturation -->
        <div>
          <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">Taux facturation *</label>
          <input type="number" step="0.01" min="0"
            [(ngModel)]="r.rateAmount"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
        </div>
        <!-- Devise -->
        <div>
          <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">Devise</label>
          <select [(ngModel)]="r.rateCurrency"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none">
            @for (c of currencies(); track c.id) {
              <option [value]="c.code">{{ c.code }}</option>
            }
            @if (!currencies().length) {
              <option value="EUR">EUR</option>
              <option value="TND">TND</option>
            }
          </select>
        </div>
        <!-- Coût interne (D3-75) -->
        <div class="col-span-3">
          <div class="p-3 bg-[#f7f9fb] rounded-lg flex items-start gap-3">
            <span class="material-symbols-outlined text-[#44474c] text-base mt-1">euro</span>
            <div class="flex-1">
              <label class="text-xs text-[#44474c] font-semibold uppercase block mb-1">
                Coût interne (optionnel)
              </label>
              <input type="number" step="0.01" min="0"
                [(ngModel)]="r.costAmount"
                placeholder="Coût journalier / horaire interne"
                class="w-full bg-white border-none rounded-lg py-2 px-3 text-sm outline-none"/>
            </div>
            <p class="text-xs text-[#75777d] max-w-[200px] mt-1">
              Utilisé pour le calcul de rentabilité interne. Non communiqué au client.
            </p>
          </div>
        </div>
      </div>
    </div>
  }

  <button type="button" (click)="addRessource()"
    class="w-full py-3 rounded-xl border-2 border-dashed border-[#c5c6cd] text-sm
           text-[#44474c] hover:border-[#1a6b7c] hover:text-[#1a6b7c] transition-colors
           flex items-center justify-center gap-2">
    <span class="material-symbols-outlined text-base">person_add</span>
    Ajouter une ressource
  </button>

</div>
  `,
})
export class WizardStepTmComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc = inject(AffaireService);
  private readonly listSvc    = inject(FactListService);

  users     = signal<UserRefDto[]>([]);
  currencies = signal<ListValueDto[]>([]);

  ngOnInit(): void {
    this.affaireSvc.getUsers().subscribe(u => this.users.set(u));
    const paysId = Number(this.draft.paysId);
    if (paysId) {
      this.listSvc.getListValues('CURRENCY', paysId).subscribe(c => this.currencies.set(c));
    }
  }

  addRessource(): void {
    this.draft.ressources = [...this.draft.ressources, {
      userId: 0,
      resourceType: 'INTERNAL',
      rateType: 'DAILY',
      rateAmount: 0,
      rateCurrency: this.currencies()[0]?.code ?? 'EUR',
    }];
    this.emit();
  }

  removeRessource(index: number): void {
    this.draft.ressources = this.draft.ressources.filter((_, i) => i !== index);
    this.emit();
  }

  onUserChange(r: AffaireDraftState['ressources'][0], userId: number): void {
    const user = this.users().find(u => u.id === Number(userId));
    r.userName = user?.fullName;
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, ressources: [...this.draft.ressources] });
  }
}
