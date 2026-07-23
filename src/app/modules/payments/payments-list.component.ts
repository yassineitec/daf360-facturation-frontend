import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-payments-list',
  imports: [TranslatePipe],
  template: `
    <div class="placeholder-page">
      <h2>{{ 'PAYMENTS.LIST.TITLE' | translate }}</h2>
      <p>{{ 'PAYMENTS.LIST.WIP' | translate }}</p>
    </div>
  `,
  styles: [`.placeholder-page { padding: 1rem; color: #475569; }`],
})
export class PaymentsListComponent {}
