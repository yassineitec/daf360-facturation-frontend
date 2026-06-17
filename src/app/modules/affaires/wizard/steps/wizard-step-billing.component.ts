import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, BillingMode, BILLING_MODES } from '../../affaire-wizard.model';
import { ListValueDto }       from '../../../cost/cost.model';
import { WizardStepAvComponent }  from './wizard-step-av.component';
import { WizardStepJalComponent } from './wizard-step-jal.component';
import { WizardStepTmComponent }  from './wizard-step-tm.component';
import { WizardStepCpComponent }  from './wizard-step-cp.component';
import { WizardStepRmbComponent } from './wizard-step-rmb.component';

@Component({
  selector: 'app-wizard-step-billing',
  standalone: true,
  imports: [
    FormsModule,
    WizardStepAvComponent, WizardStepJalComponent,
    WizardStepTmComponent, WizardStepCpComponent, WizardStepRmbComponent,
  ],
  templateUrl: './wizard-step-billing.component.html',
  styleUrl: './wizard-step-billing.component.scss',
})
export class WizardStepBillingComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly listSvc = inject(FactListService);

  readonly BILLING_MODES = BILLING_MODES;
  currencies = signal<ListValueDto[]>([]);

  ngOnInit(): void {
    this.listSvc.getListValues('CURRENCY', 0).subscribe(c => this.currencies.set(c));
  }

  selectMode(code: BillingMode): void {
    const updated = { ...this.draft, billingMode: code };
    if (!BILLING_MODES.find(m => m.code === code)?.requiresContractAmount) {
      updated.contractAmount = undefined;
    }
    this.draftChange.emit(updated);
  }

  onContractAmountChange(val: string): void {
    this.draftChange.emit({ ...this.draft, contractAmount: val ? Number(val) : undefined });
  }

  onCurrencyChange(val: string): void {
    this.draftChange.emit({ ...this.draft, contractCurrency: val });
  }

  onSubDraftChange(updated: AffaireDraftState): void {
    this.draftChange.emit(updated);
  }

  getModeColor(code: string): string {
    const colors: Record<string, string> = {
      AV:  '#0d9488',
      JAL: '#7c3aed',
      TM:  '#0369a1',
      CP:  '#d97706',
      RMB: '#059669',
    };
    return colors[code] ?? '#64748b';
  }
}
