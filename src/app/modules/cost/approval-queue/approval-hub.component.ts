import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageComponent, PageHeaderComponent, PermissionService, TabItem, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import { CostApprovalQueueComponent } from './cost-approval-queue.component';
import { MissionApprovalQueueComponent } from '../missions/mission-approval-queue.component';
import { SalaryAdvanceListComponent } from '../salary-advances/salary-advance-list.component';
import { APPROVAL_TABS } from './approval-tabs.config';

/**
 * /finance/cost/approval — « Validation des dépenses ».
 *
 * Une seule page : l'en-tête et le bandeau `daf-tabs` restent en place, seul le panneau
 * de l'onglet actif (KPI, recherche, liste) change. L'onglet vit dans l'URL (`?tab=`, via
 * `tabParam`) : F5, lien partagé et précédent/suivant le restaurent. Les anciennes routes
 * `cost/missions` et `cost/salary-advances` redirigent vers `?tab=missions` / `?tab=advances`.
 *
 * Les permissions sont lues avec `PermissionService`, pas `UserStore` : même règle que
 * `permissionGuard` (aucun passe-droit « administrateur »), pour qu'un onglet visible ne
 * mène jamais à un panneau dont chaque appel renverrait 403.
 */
@Component({
  selector: 'app-approval-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, NgTemplateOutlet, PageComponent, PageHeaderComponent, TabsComponent,
    CostApprovalQueueComponent, MissionApprovalQueueComponent, SalaryAdvanceListComponent,
  ],
  template: `
    <!-- Squelette pleine page à la PREMIÈRE ouverture seulement, comme les autres pages :
         ensuite, changer d'onglet laisse en-tête et bandeau en place et chaque liste
         affiche son propre chargement. -->
    <daf-page [loading]="pageLoading()" [kpis]="activeTab() === 'requests' ? 2 : 3"
              [loadingLabel]="'COST.APPROVAL_QUEUE.TITLE' | translate">
      <!-- Même en-tête que « Coûts collaborateurs » : le titre seul à gauche, les boutons de
           l'onglet actif à droite. Chaque panneau déclare ses boutons (#pageActions) ; la
           phrase sous les onglets tient lieu de sous-titre. -->
      <daf-page-header
        [title]="'COST.APPROVAL_QUEUE.TITLE' | translate"
        [subtitle]="hintKey() | translate">
        <!-- Pas d'@if autour : la projection se fait sur l'attribut pageActions, et
             ngTemplateOutlet avec null n'affiche simplement rien. -->
        <ng-container pageActions [ngTemplateOutlet]="actionsTpl()" />
      </daf-page-header>

      <!-- Un seul panneau monté à la fois : chacun ne charge sa file qu'à l'ouverture.
           Le bandeau d'onglets est projeté DANS le panneau (slot [approvalTabs]), qui le
           place sous ses cartes KPI, au-dessus de la recherche et de la liste. -->
      <div role="tabpanel" [id]="'approval-tabs-panel-' + activeTab()">
        @switch (activeTab()) {
          @case ('missions') {
            <app-mission-approval-queue>
              <ng-container approvalTabs [ngTemplateOutlet]="tabsTpl" />
            </app-mission-approval-queue>
          }
          @case ('advances') {
            <app-salary-advance-list>
              <ng-container approvalTabs [ngTemplateOutlet]="tabsTpl" />
            </app-salary-advance-list>
          }
          @default {
            <app-cost-approval-queue>
              <ng-container approvalTabs [ngTemplateOutlet]="tabsTpl" />
            </app-cost-approval-queue>
          }
        }
      </div>
    </daf-page>

    <!-- Même rendu que /payroll « Avances sur salaire » : bandeau souligné pleine largeur.
         La phrase de l'onglet actif est le sous-titre de l'en-tête, comme sur les autres pages. -->
    <ng-template #tabsTpl>
      @if (tabs().length > 1) {
        <daf-tabs
          variant="underline"
          style="--daf-tabs-fade: var(--color-background)"
          [tabs]="tabs()"
          [(active)]="activeTab"
          idPrefix="approval-tabs"
          [tabsLabel]="'COST.APPROVAL_QUEUE.TABS_LABEL' | translate" />
      }
    </ng-template>
  `,
  host: { class: 'block' },
})
export class ApprovalHubComponent {
  private readonly translate = inject(TranslateService);
  private readonly perms     = inject(PermissionService);

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    this.perms.permissions();
    return APPROVAL_TABS
      .filter(t => this.perms.hasAny(t.permissions))
      .map(t => ({ id: t.id, label: this.translate.instant(t.labelKey), icon: t.icon }));
  });

  private readonly costPanel     = viewChild(CostApprovalQueueComponent);
  private readonly missionsPanel = viewChild(MissionApprovalQueueComponent);

  private readonly advancesPanel = viewChild(SalaryAdvanceListComponent);

  /** Premier chargement du panneau actif. Le panneau existe même sous le squelette :
   *  le contenu projeté dans daf-page est créé par cette page, pas par daf-page. */
  private readonly panelFirstLoad = computed(() =>
    (this.costPanel() ?? this.missionsPanel() ?? this.advancesPanel())?.firstLoad() ?? true);

  /** Passe à vrai dès que le premier panneau a chargé — et n'en redescend plus. */
  private readonly pageReady = signal(false);

  readonly pageLoading = computed(() => !this.pageReady() && this.panelFirstLoad());

  constructor() {
    effect(() => { if (!this.panelFirstLoad()) this.pageReady.set(true); });
  }

  /** Boutons du panneau actif. */
  readonly actionsTpl = computed(() =>
    this.costPanel()?.pageActions() ?? this.missionsPanel()?.pageActions()
      ?? this.advancesPanel()?.pageActions() ?? null);

  /** Sous-titre de l'en-tête : ce que contient l'onglet actif. */
  readonly hintKey = computed(() =>
    `COST.APPROVAL_QUEUE.TAB_HINT_${this.activeTab().toUpperCase()}`);

  /** Onglet par défaut : le premier autorisé (la route garantit qu'il y en a au moins un). */
  readonly activeTab = tabParam(
    computed(() => this.tabs().map(t => t.id)),
    this.tabs()[0]?.id ?? 'requests',
  );
}
