import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CostLinesComponent }    from './tabs/cost-lines.component';
import { ApprovalQueueComponent } from './tabs/approval-queue.component';
import { CostConfigComponent }    from './tabs/cost-config.component';
import { CostImportPanelComponent } from './import/cost-import-panel.component';
import { ClientService } from '../clients/client.service';

type CostTab = 'lines' | 'approvals' | 'config';

@Component({
  selector: 'app-cost',
  standalone: true,
  imports: [
    CommonModule,
    CostLinesComponent,
    ApprovalQueueComponent,
    CostConfigComponent,
    CostImportPanelComponent,
  ],
  templateUrl: './cost.component.html',
  styleUrl: './cost.component.scss',
})
export class CostComponent implements OnInit {
  private readonly clientSvc = inject(ClientService);

  activeTab = signal<CostTab>('lines');
  paysId    = signal<number>(0);

  readonly tabs: { id: CostTab; label: string }[] = [
    { id: 'lines',     label: 'Lignes de coût' },
    { id: 'approvals', label: 'Approbations' },
    { id: 'config',    label: 'Configuration' },
  ];

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
