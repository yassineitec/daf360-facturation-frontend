import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageComponent, PageHeaderComponent, TabItem, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import { catchError, of } from 'rxjs';
import { ClientService } from '../clients/client.service';
import { SousTraitantsTabComponent } from './tabs/sous-traitants-tab.component';
import { OrdresStTabComponent } from './tabs/ordres-st-tab.component';
import { CoutsAnalyseTabComponent } from './tabs/couts-analyse-tab.component';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import type { GuideStep } from '../../shared/guide/page-guide.types';
import { HeaderPaysService } from '../../core/header-pays.service';

type TabId = 'st' | 'ordres' | 'analyse';
const TAB_IDS: TabId[] = ['st', 'ordres', 'analyse'];

/** Guide de la page — `target` = un `data-guide` du gabarit, `tab` = l'onglet à ouvrir. */
const step = (key: string, icon: string, target?: string, tab?: TabId): GuideStep => ({
  icon, titleKey: `GUIDE.SUBCONTRACTING.${key}_TITLE`, textKey: `GUIDE.SUBCONTRACTING.${key}_TEXT`, target, tab,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO',    'handshake'),
  step('TABS',     'tab',        'sc-tabs',  'st'),
  step('ST',       'groups',     'sc-panel', 'st'),
  // Plus d'étape « ENTITY » : le sélecteur d'entité est remplacé par le drapeau de la navbar.
  step('ORDERS',   'assignment', 'sc-panel', 'ordres'),
  step('COSTS',    'payments',   'sc-panel', 'ordres'),
  step('ANALYSIS', 'bar_chart',  'sc-panel', 'analyse'),
  step('END',      'help'),
];

@Component({
  selector: 'app-subcontracting',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, TabsComponent,
    SousTraitantsTabComponent, OrdresStTabComponent, CoutsAnalyseTabComponent, PageGuideComponent,
  ],
  host: { class: 'block' },
  templateUrl: './subcontracting.component.html',
})
export class SubcontractingComponent {
  private readonly translate  = inject(TranslateService);

  /** Adossé au paramètre d'URL : voir tabParam. Survit au rechargement et au précédent. */
  activeTab      = tabParam<TabId>(TAB_IDS, 'st');

  /**
   * Le pays de l'utilisateur côté FINANCE (`/ref/me`) — et non celui du jeton, qui est un id
   * RH et ne désigne pas le même pays dans `pays_ref`.
   */
  private readonly ownPaysId = toSignal(
    inject(ClientService).getMyPays().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** Ids FINANCE de tous les drapeaux cochés (`178,63`) ; undefined = « Tous les pays ». */
  private readonly headerPaysList = inject(HeaderPaysService).paysList;

  /**
   * Les entités LISTÉES (onglet Sous-traitants) : tous les drapeaux cochés ; null = « Tous
   * les pays » (le serveur applique alors le périmètre du rôle).
   */
  readonly listPays = computed<string | null>(() => this.headerPaysList() ?? null);

  /**
   * L'entité d'un NOUVEAU sous-traitant (et des onglets qui n'en prennent qu'une) : un
   * seul pays — le drapeau s'il n'y en a qu'un ; sinon le pays de l'utilisateur s'il est
   * coché (ou si rien n'est coché), sinon le premier coché. Le sélecteur « Entité » de la
   * page est retiré — il démarrait sur le premier des 194 pays de `pays_ref`.
   */
  readonly selectedPaysId = computed<number | null>(() => {
    const ids = (this.listPays() ?? '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);
    const own = this.ownPaysId() ?? null;
    if (ids.length === 1) return ids[0];
    if (!ids.length || (own != null && ids.includes(own))) return own;
    return ids[0];
  });

  /** Plus de requête propre à la page (la liste des pays servait le sélecteur retiré). */
  firstLoad = signal(false);

  readonly guideSteps = GUIDE_STEPS;

  /** L'onglet de l'utilisateur, rendu à la fermeture du guide (qui ouvre ceux qu'il explique). */
  private tabBeforeGuide: TabId | null = null;

  onGuideTab(tab: string): void {
    this.tabBeforeGuide ??= this.activeTab();
    this.activeTab.set(tab as TabId);
  }

  onGuideClosed(): void {
    if (this.tabBeforeGuide) this.activeTab.set(this.tabBeforeGuide);
    this.tabBeforeGuide = null;
  }

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'st',      label: t('SUBCONTRACTING.TABS.SUBCONTRACTORS'), icon: 'groups'      },
      { id: 'ordres',  label: t('SUBCONTRACTING.TABS.ORDERS'),         icon: 'assignment'  },
      { id: 'analyse', label: t('SUBCONTRACTING.TABS.COST_ANALYSIS'),  icon: 'bar_chart'   },
    ];
  });

  /**
   * One explanatory line per tab. The three tabs are three *levels* — the vendor
   * directory, an order placed on one affaire, and the margin of one affaire — and the
   * page said nothing about that, so landing on tab 2 or 3 showed a bare search box
   * with no indication of what to search for or why.
   */
  readonly tabIntro = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(`SUBCONTRACTING.INTRO.${this.activeTab().toUpperCase()}`);
  });

}
