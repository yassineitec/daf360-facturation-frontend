import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageComponent, PageHeaderComponent } from '@khalilrebhiitec/daf360';
import { CostLinesComponent } from './tabs/cost-lines.component';

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
  imports: [TranslatePipe, PageComponent, PageHeaderComponent, CostLinesComponent],
  host: { class: 'block' },
  templateUrl: './cost.component.html',
})
export class CostComponent {
}
