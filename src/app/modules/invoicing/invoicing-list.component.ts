import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-invoicing-list',
  imports: [TranslatePipe],
  template: `
    <div class="placeholder-page">
      <h2>{{ 'INVOICING.PLACEHOLDER.TITLE' | translate }}</h2>
      <p>{{ 'INVOICING.PLACEHOLDER.SUBTITLE' | translate }}</p>
    </div>
  `,
  styles: [`.placeholder-page { padding: 1rem; color: #475569; }`],
})
export class InvoicingListComponent {}
