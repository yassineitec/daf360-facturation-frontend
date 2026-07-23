import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CostLinesComponent }    from './tabs/cost-lines.component';
import { ApprovalQueueComponent } from './tabs/approval-queue.component';
import { CostConfigComponent }    from './tabs/cost-config.component';
import { CostImportPanelComponent } from './import/cost-import-panel.component';
import { ClientService } from '../clients/client.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

type CostTab = 'lines' | 'approvals' | 'config';

@Component({
  selector: 'app-cost',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    CostLinesComponent,
    ApprovalQueueComponent,
    CostConfigComponent,
    CostImportPanelComponent,
    TranslatePipe,
  ],
  templateUrl: './cost.component.html',
  styleUrl: './cost.component.scss',
})
export class CostComponent implements OnInit {
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);

  activeTab = signal<CostTab>('lines');
  paysId    = signal<number>(0);

  readonly tabs = computed<{ id: CostTab; label: string }[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'lines',     label: this.translate.instant('COST.TABS.LINES') },
      { id: 'approvals', label: this.translate.instant('COST.TABS.APPROVALS') },
      { id: 'config',    label: this.translate.instant('COST.TABS.CONFIG') },
    ];
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => { if (id != null && id > 0) this.paysId.set(id); },
      error: () => {},
    });
  }

  setTab(tab: CostTab): void {
    this.activeTab.set(tab);
  }
}
