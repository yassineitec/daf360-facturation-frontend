import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageComponent, PageHeaderComponent } from '@khalilrebhiitec/daf360';
import { CostLinesComponent } from './tabs/cost-lines.component';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import type { GuideStep } from '../../shared/guide/page-guide.types';

/** Guide de la page — chaque `target` est un `data-guide` de app-cost-lines. */
const step = (key: string, icon: string, target?: string): GuideStep => ({
  icon, titleKey: `GUIDE.COSTS.${key}_TITLE`, textKey: `GUIDE.COSTS.${key}_TEXT`, target,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO',   'request_quote'),
  step('KPIS',    'monitoring', 'cost-kpis'),
  step('NEW',     'add',        'cost-new'),
  step('TOOLBAR', 'search',     'cost-toolbar'),
  step('LIST',    'grid_view',  'cost-list'),
  step('ACTIONS', 'bolt',       'cost-list'),
  step('LIFECYCLE', 'route'),
  step('END',     'help'),
];

// L'onglet « config » (et le panneau d'import CSV qui l'accompagnait) a déménagé
// dans /finance/admin (onglet « Configuration des coûts », à côté des Maquettes de
// documents) — voir admin-list.component. L'onglet « approvals » a disparu à son tour :
// c'était une version plus simple (lignes de coût seules) de l'écran d'approbation déjà
// accessible depuis la barre latérale (« Approbation Coûts » → /finance/cost/approval,
// CostApprovalQueueComponent), qui couvre en plus les demandes d'embauche. Un seul onglet
// restant ne justifie plus de bande `daf-tabs` : la page rend `app-cost-lines` directement.
@Component({
  selector: 'app-cost',
  standalone: true,
  imports: [TranslatePipe, PageComponent, PageHeaderComponent, CostLinesComponent, PageGuideComponent],
  host: { class: 'block' },
  templateUrl: './cost.component.html',
})
export class CostComponent {
  readonly guideSteps = GUIDE_STEPS;
}
