import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-reporting-list',
  imports: [TranslatePipe],
  template: `
    <div class="placeholder-page">
      <h2>{{ 'REPORTING.TITLE' | translate }}</h2>
      <p>{{ 'REPORTING.WIP' | translate }}</p>
    </div>
  `,
  styles: [`.placeholder-page { padding: 1rem; color: #475569; }`],
})
export class ReportingListComponent {}
