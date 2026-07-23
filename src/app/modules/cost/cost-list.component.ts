import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-cost-list',
  imports: [TranslatePipe],
  template: `
    <div class="placeholder-page">
      <h2>{{ 'COST.LIST_PLACEHOLDER.TITLE' | translate }}</h2>
      <p>{{ 'COST.LIST_PLACEHOLDER.SUB' | translate }}</p>
    </div>
  `,
  styles: [`.placeholder-page { padding: 1rem; color: #475569; }`],
})
export class CostListComponent {}
