import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { AffaireService }    from '../../affaire.service';
import { FactListService }   from '../../../../core/fact-list.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { UserRefDto }        from '../../affaire.model';
import { ListValueDto }      from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-tm',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  templateUrl: './wizard-step-tm.component.html',
  styleUrl: './wizard-step-tm.component.scss',
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
