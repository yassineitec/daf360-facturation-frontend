import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageComponent, PageHeaderComponent, TabItem, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import { CostLinesComponent } from './tabs/cost-lines.component';
import { ApprovalQueueComponent } from './tabs/approval-queue.component';
import { CostConfigComponent } from './tabs/cost-config.component';
import { CostImportPanelComponent } from './import/cost-import-panel.component';
import { ClientService } from '../clients/client.service';

type CostTab = 'lines' | 'approvals' | 'config';
const TAB_IDS: CostTab[] = ['lines', 'approvals', 'config'];

@Component({
  selector: 'app-cost',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, TabsComponent,
    CostLinesComponent, ApprovalQueueComponent, CostConfigComponent, CostImportPanelComponent,
  ],
  host: { class: 'block' },
  templateUrl: './cost.component.html',
})
export class CostComponent implements OnInit {
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);

  /**
   * Adossé au paramètre d'URL : l'onglet survit à un rechargement, à un signet, à un lien
   * partagé et au bouton précédent. Remplace la restauration manuelle qui vivait dans
   * ngOnInit et la navigation qui vivait dans onTabChange, recopiées à l'identique dans
   * trois autres pages.
   */
  activeTab = tabParam<CostTab>(TAB_IDS, 'lines');
  paysId    = signal<number>(0);

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'lines',     label: t('COST.TABS.LINES'),     icon: 'receipt_long' },
      { id: 'approvals', label: t('COST.TABS.APPROVALS'), icon: 'rule'         },
      { id: 'config',    label: t('COST.TABS.CONFIG'),    icon: 'tune'         },
    ];
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => { if (id != null && id > 0) this.paysId.set(id); },
      error: () => {},
    });
  }

}
