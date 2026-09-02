import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageComponent, PageHeaderComponent, SelectComponent, SelectOption, TabItem, TabsComponent,
  tabParam,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from '../affaires/affaire.service';
import { PaysRefDto } from '../affaires/affaire.model';
import { SousTraitantsTabComponent } from './tabs/sous-traitants-tab.component';
import { OrdresStTabComponent } from './tabs/ordres-st-tab.component';
import { CoutsAnalyseTabComponent } from './tabs/couts-analyse-tab.component';

type TabId = 'st' | 'ordres' | 'analyse';
const TAB_IDS: TabId[] = ['st', 'ordres', 'analyse'];

@Component({
  selector: 'app-subcontracting',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, SelectComponent, TabsComponent,
    SousTraitantsTabComponent, OrdresStTabComponent, CoutsAnalyseTabComponent,
  ],
  host: { class: 'block' },
  templateUrl: './subcontracting.component.html',
})
export class SubcontractingComponent implements OnInit {
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);

  /** Adossé au paramètre d'URL : voir tabParam. Survit au rechargement et au précédent. */
  activeTab      = tabParam<TabId>(TAB_IDS, 'st');
  pays           = signal<PaysRefDto[]>([]);
  selectedPaysId = signal<number | null>(null);

  /** The entity list is the page's own first request — the tabs load their own data. */
  firstLoad = signal(true);

  readonly paysOptions = computed<SelectOption[]>(() =>
    this.pays().map(p => ({ value: String(p.id), label: p.frenchLabel })));

  readonly paysSelected = computed(() => {
    const id = this.selectedPaysId();
    return id != null ? [String(id)] : [];
  });

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

  ngOnInit(): void {
    this.affaireSvc.getPays().subscribe({
      next: p => {
        this.pays.set(p);
        if (p.length > 0) this.selectedPaysId.set(p[0].id);
        this.firstLoad.set(false);
      },
      error: () => this.firstLoad.set(false),
    });
  }

  onPaysSelect(values: string[]): void {
    const val = values[0];
    this.selectedPaysId.set(val ? +val : null);
  }
}
