import { Component, Input }      from '@angular/core';
import { AffaireDetail }         from '../affaire.model';
import { BillingAvComponent }    from './modes/billing-av.component';
import { BillingJalComponent }   from './modes/billing-jal.component';
import { BillingTmComponent }    from './modes/billing-tm.component';
import { BillingCpComponent }    from './modes/billing-cp.component';
import { BillingRmbComponent }   from './modes/billing-rmb.component';

@Component({
  selector: 'app-affaire-billing-tab',
  standalone: true,
  imports: [
    BillingAvComponent, BillingJalComponent, BillingTmComponent,
    BillingCpComponent, BillingRmbComponent,
  ],
  template: `
<div class="py-2">
  @switch (affaire.billingMode) {
    @case ('AV') {
      <app-billing-av [affaire]="affaire" />
    }
    @case ('JAL') {
      <app-billing-jal [affaire]="affaire" />
    }
    @case ('TM') {
      <app-billing-tm [affaire]="affaire" />
    }
    @case ('CP') {
      <app-billing-cp [affaire]="affaire" />
    }
    @case ('RMB') {
      <app-billing-rmb [affaire]="affaire" />
    }
    @default {
      <div class="text-sm text-[#64748b] text-center py-6">
        Mode de facturation non reconnu : {{ affaire.billingMode }}
      </div>
    }
  }
</div>
  `,
})
export class AfaireBillingTabComponent {
  @Input({ required: true }) affaire!: AffaireDetail;
}
