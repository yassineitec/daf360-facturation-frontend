import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { AffaireService }        from '../../affaire.service';
import { FactListService }       from '../../../../core/fact-list.service';
import { AffaireDraftState }     from '../../affaire-wizard.model';
import { UserRefDto }            from '../../affaire.model';
import { ListValueDto }          from '../../../cost/cost.model';
import { CollaborateurTauxDto }  from '../../livrable.model';
import { TmRateModalComponent }  from './tm-rate-modal.component';

@Component({
  selector: 'app-wizard-step-tm',
  standalone: true,
  imports: [FormsModule, ButtonComponent, TmRateModalComponent],
  templateUrl: './wizard-step-tm.component.html',
  styleUrl: './wizard-step-tm.component.scss',
})
export class WizardStepTmComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc = inject(AffaireService);
  private readonly listSvc    = inject(FactListService);

  users      = signal<UserRefDto[]>([]);
  currencies = signal<ListValueDto[]>([]);
  showRateModal = signal(false);

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
    r.tauxIntercompany = undefined;
    if (!user?.email) return;
    this.affaireSvc.getEmployeeCost(user.email, this.draft.paysId).subscribe({
      next: rates => {
        if (!rates || rates.cost === null) return;
        r.costAmount       = rates.cost;
        r.rateAmount       = rates.tauxVente ?? r.rateAmount;
        r.tauxIntercompany = rates.tauxIntercompany ?? undefined;
        this.emit();
      },
    });
  }

  onRatesConfirmed(taux: CollaborateurTauxDto[]): void {
    this.showRateModal.set(false);
    // Pre-fill ressources from auto-calculated rates
    const existingIds = new Set(this.draft.ressources.map(r => r.userId));
    const newEntries = taux
      .filter(t => !existingIds.has(t.userId))
      .map(t => ({
        userId:           t.userId,
        userName:         t.fullName,
        resourceType:     'INTERNAL',
        rateType:         'DAILY',
        rateAmount:       t.tauxVente,
        rateCurrency:     this.currencies()[0]?.code ?? 'EUR',
        costAmount:       t.coutReel,
        tauxIntercompany: t.tauxIntercompany,
      }));
    // Update existing entries + add new ones
    const updated = this.draft.ressources.map(r => {
      const match = taux.find(t => t.userId === r.userId);
      return match ? { ...r, rateAmount: match.tauxVente, costAmount: match.coutReel, tauxIntercompany: match.tauxIntercompany } : r;
    });
    this.draft.ressources = [...updated, ...newEntries];
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, ressources: [...this.draft.ressources] });
  }
}
