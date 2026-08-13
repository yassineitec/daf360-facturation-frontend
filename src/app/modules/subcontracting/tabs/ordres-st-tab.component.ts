import { Component, TemplateRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, DrawerComponent, DrawerConfig, FormFieldComponent,
  MetricCardComponent, MetricCardOptions, ModalRef, ModalService, SearchToolbarComponent,
  SelectComponent, SelectOption, SkeletonComponent, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { PermissionDirective } from '../../../shared/permission.directive';
import { UserStore } from '../../../core/user.store';
import { AffaireService } from '../../affaires/affaire.service';
import { AffaireListItem } from '../../affaires/affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import { SubcontractingService } from '../subcontracting.service';
import {
  CoutSTDto, CreateCoutSTRequest, CreateOSTRequest, OSTDto,
  OST_VALID_TRANSITIONS, SousTraitantDto,
} from '../subcontracting.model';
import { isOver, ostStatutKey } from '../subcontracting-display';
import { OstCardsSectionComponent } from './ost-cards-section.component';
import { OstTableSectionComponent } from './ost-table-section.component';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-ordres-st-tab',
  imports: [
    TranslatePipe, PermissionDirective, ButtonComponent, CardComponent, DrawerComponent,
    FormFieldComponent, MetricCardComponent, SearchToolbarComponent, SelectComponent,
    SkeletonComponent, DisplayCurrencyPipe, TableActionComponent,
    OstCardsSectionComponent, OstTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './ordres-st-tab.component.html',
})
export class OrdresStTabComponent {
  paysId = input<number | null>(null);

  private readonly svc        = inject(SubcontractingService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);
  private readonly modal      = inject(ModalService);
  private readonly userStore  = inject(UserStore);

  @ViewChild('ostTpl')    private ostTpl!:    TemplateRef<unknown>;
  @ViewChild('statutTpl') private statutTpl!: TemplateRef<unknown>;
  private ostRef:    ModalRef | null = null;
  private statutRef: ModalRef | null = null;

  readonly canManage = computed(() => this.userStore.hasPermission('FACT_MANAGE_ST'));
  readonly asStr = (v: string | number | null): string => (v == null ? '' : String(v));

  // ── Affaire search ───────────────────────────────────────────────────
  searchQuery     = signal('');
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);

  // ── OST list ─────────────────────────────────────────────────────────
  ordres    = signal<OSTDto[]>([]);
  loading   = signal(false);
  error     = signal<string | null>(null);
  ostFilter = signal('');
  viewMode  = signal<ViewMode>('grid');

  /** Client-side: an affaire's orders all arrive in one call, so there is nothing to re-fetch. */
  readonly visibleOrdres = computed<OSTDto[]>(() => {
    const q = this.ostFilter().trim().toLowerCase();
    if (!q) return this.ordres();
    return this.ordres().filter(o =>
      [o.referenceOst, o.sousTraitantName, o.perimetre].some(v => (v ?? '').toLowerCase().includes(q)),
    );
  });

  readonly totalBudget  = computed(() => this.ordres().reduce((s, o) => s + (o.montantBudget  ?? 0), 0));
  readonly totalRealise = computed(() => this.ordres().reduce((s, o) => s + (o.montantRealise ?? 0), 0));
  readonly overrunCount = computed(() => this.ordres().filter(o => isOver(o)).length);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiOrders   : MetricCardOptions = { icon: 'assignment', iconColor: 'text-primary',   iconBg: 'bg-primary/10'   };
  readonly kpiBudget   : MetricCardOptions = { icon: 'account_balance_wallet', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };
  readonly kpiRealized : MetricCardOptions = { icon: 'payments',   iconColor: 'text-teal',      iconBg: 'bg-teal/10'      };
  readonly kpiOverruns : MetricCardOptions = {
    icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger',
  };

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('SUBCONTRACTING.ST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('SUBCONTRACTING.ST.VIEW_LIST') },
    ];
  });

  // ── Create / Edit OST ────────────────────────────────────────────────
  editOstTarget = signal<OSTDto | null>(null);
  stList        = signal<SousTraitantDto[]>([]);
  stLoading     = signal(false);
  ostForm       = { sousTraitantId: 0, perimetre: '', montantBudget: 0, devise: 'TND', alerteDepassementPct: 10 };
  ostSaving     = signal(false);
  ostError      = signal<string | null>(null);

  readonly stOptions = computed<SelectOption[]>(() =>
    this.stList().map(s => ({ value: String(s.id), label: s.name })));

  // ── Changer statut ───────────────────────────────────────────────────
  statutTarget = signal<OSTDto | null>(null);
  newStatut    = signal('');
  statutSaving = signal(false);
  statutError  = signal<string | null>(null);

  readonly transitionOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const ost = this.statutTarget();
    const transitions = ost ? (OST_VALID_TRANSITIONS[ost.statut] ?? []) : [];
    return transitions.map(s => ({ value: s, label: this.translate.instant(ostStatutKey(s)) }));
  });

  // ── Costs drawer ─────────────────────────────────────────────────────
  drawerOpen   = signal(false);
  drawerOst    = signal<OSTDto | null>(null);
  coutsList    = signal<CoutSTDto[]>([]);
  coutsLoading = signal(false);
  showAddCout  = signal(false);
  coutForm     = { montant: 0, dateCout: '', devise: 'TND', description: '' };
  coutSaving   = signal(false);
  coutError    = signal<string | null>(null);

  exporting = signal<number | null>(null);

  readonly drawerConfig = computed<DrawerConfig>(() => {
    this.translate.currentLang();
    const ost = this.drawerOst();
    return {
      title: ost ? `${this.translate.instant('SUBCONTRACTING.OST.COSTS')} — ${ost.referenceOst}` : '',
      icon: 'payments',
      width: '420px',
      showToggle: false,
      closeLabel: this.translate.instant('SUBCONTRACTING.OST.COST_MODAL.CLOSE'),
    };
  });

  // ── Affaire search ───────────────────────────────────────────────────
  searchAffaires(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.searching.set(true);
    this.affaireSvc.getAffaires({ search: q, size: 8 }).subscribe({
      next: page => { this.searchResults.set(page.content); this.searching.set(false); },
      error:    () => this.searching.set(false),
    });
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.searchResults.set([]);
    this.searchQuery.set(`${a.reference} — ${a.intitule}`);
    this.loadOrdres(a.id);
    this.stLoading.set(true);
    this.svc.listSousTraitants(a.paysId).subscribe({
      next: list => { this.stList.set(list.filter(s => s.isActive)); this.stLoading.set(false); },
      error:    () => this.stLoading.set(false),
    });
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.ordres.set([]);
  }

  loadOrdres(affaireId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listOSTByAffaire(affaireId).subscribe({
      next: l => { this.ordres.set(l); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('SUBCONTRACTING.OST.ERROR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  // ── Create / Edit OST ────────────────────────────────────────────────
  openCreateOst(): void {
    this.editOstTarget.set(null);
    this.ostForm = {
      sousTraitantId:       this.stList()[0]?.id ?? 0,
      perimetre:            '',
      montantBudget:        0,
      devise:               'TND',
      alerteDepassementPct: 10,
    };
    this.ostError.set(null);
    this.openOstModal();
  }

  openEditOst(o: OSTDto): void {
    this.editOstTarget.set(o);
    this.ostForm = {
      sousTraitantId:       o.sousTraitantId,
      perimetre:            o.perimetre,
      montantBudget:        o.montantBudget,
      devise:               o.devise,
      alerteDepassementPct: o.alerteDepassementPct,
    };
    this.ostError.set(null);
    this.openOstModal();
  }

  private openOstModal(): void {
    const t = (key: string) => this.translate.instant(key);
    this.ostRef = this.modal.open({
      title: t(this.editOstTarget() ? 'SUBCONTRACTING.OST.MODAL.EDIT_TITLE' : 'SUBCONTRACTING.OST.MODAL.NEW_TITLE'),
      body:  this.ostTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('SUBCONTRACTING.OST.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        { label: t('SUBCONTRACTING.OST.MODAL.SAVE'),   variant: 'primary',   action: () => this.saveOst() },
      ],
    });
  }

  saveOst(): void {
    const affaire = this.selectedAffaire();
    if (!affaire) return;
    if (!this.ostForm.perimetre.trim() || !this.ostForm.sousTraitantId || this.ostForm.montantBudget <= 0) {
      // The modal's button `disabled` is fixed at open time, so required-field
      // validation surfaces here rather than by greying the button out.
      this.ostError.set(this.translate.instant('SUBCONTRACTING.OST.MODAL.REQUIRED'));
      return;
    }
    this.ostSaving.set(true);
    this.ostError.set(null);
    const req: CreateOSTRequest = {
      sousTraitantId:       +this.ostForm.sousTraitantId,
      perimetre:            this.ostForm.perimetre.trim(),
      montantBudget:        +this.ostForm.montantBudget,
      devise:               this.ostForm.devise || null,
      alerteDepassementPct: this.ostForm.alerteDepassementPct != null ? +this.ostForm.alerteDepassementPct : null,
    };
    const edit = this.editOstTarget();
    const call$ = edit ? this.svc.updateOST(edit.id, req) : this.svc.createOST(affaire.id, req);
    call$.subscribe({
      next: () => { this.ostSaving.set(false); this.ostRef?.close(); this.loadOrdres(affaire.id); },
      error: err => {
        this.ostSaving.set(false);
        this.ostError.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.OST.ERROR_SAVE'));
      },
    });
  }

  // ── Changer statut ───────────────────────────────────────────────────
  openStatutModal(o: OSTDto): void {
    this.statutTarget.set(o);
    this.newStatut.set((OST_VALID_TRANSITIONS[o.statut] ?? [])[0] ?? '');
    this.statutError.set(null);
    const t = (key: string) => this.translate.instant(key);
    this.statutRef = this.modal.open({
      title: t('SUBCONTRACTING.OST.STATUT_MODAL.TITLE'),
      body:  this.statutTpl,
      size:  'sm',
      buttons: [
        { label: t('SUBCONTRACTING.OST.STATUT_MODAL.CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: t('SUBCONTRACTING.OST.STATUT_MODAL.CONFIRM'), variant: 'primary',   action: () => this.submitStatut() },
      ],
    });
  }

  submitStatut(): void {
    const target  = this.statutTarget();
    const affaire = this.selectedAffaire();
    if (!target || !this.newStatut() || !affaire) return;
    this.statutSaving.set(true);
    this.svc.changerStatutOST(target.id, this.newStatut()).subscribe({
      next: () => { this.statutSaving.set(false); this.statutRef?.close(); this.loadOrdres(affaire.id); },
      error: err => {
        this.statutSaving.set(false);
        this.statutError.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.OST.ERROR_GENERIC'));
      },
    });
  }

  // ── Costs drawer ─────────────────────────────────────────────────────
  openDrawer(o: OSTDto): void {
    this.drawerOst.set(o);
    this.drawerOpen.set(true);
    this.showAddCout.set(false);
    this.coutError.set(null);
    this.coutForm = { montant: 0, dateCout: new Date().toISOString().slice(0, 10), devise: o.devise, description: '' };
    this.coutsLoading.set(true);
    this.svc.listCouts(o.id).subscribe({
      next: l => { this.coutsList.set(l); this.coutsLoading.set(false); },
      error:  () => this.coutsLoading.set(false),
    });
  }

  addCout(): void {
    const ost = this.drawerOst();
    const affaire = this.selectedAffaire();
    if (!ost || !this.coutForm.montant || !this.coutForm.dateCout || !affaire) return;
    this.coutSaving.set(true);
    this.coutError.set(null);
    const req: CreateCoutSTRequest = {
      montant:     +this.coutForm.montant,
      dateCout:    this.coutForm.dateCout,
      devise:      this.coutForm.devise || null,
      description: this.coutForm.description || null,
    };
    this.svc.addCout(ost.id, req).subscribe({
      next: () => {
        this.coutSaving.set(false);
        this.showAddCout.set(false);
        this.reloadDrawer(ost);
        this.loadOrdres(affaire.id);
      },
      error: err => {
        this.coutSaving.set(false);
        this.coutError.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.OST.ERROR_ADD'));
      },
    });
  }

  removeCout(cout: CoutSTDto): void {
    const ost = this.drawerOst();
    const affaire = this.selectedAffaire();
    if (!ost || !affaire) return;
    this.svc.removeCout(ost.id, cout.id).subscribe({
      next: () => { this.reloadDrawer(ost); this.loadOrdres(affaire.id); },
    });
  }

  private reloadDrawer(ost: OSTDto): void {
    this.svc.listCouts(ost.id).subscribe(l => this.coutsList.set(l));
  }

  exportCsv(o: OSTDto): void {
    this.exporting.set(o.id);
    this.svc.exportAccounting(o.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `couts_${o.referenceOst}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(null);
      },
      error: () => this.exporting.set(null),
    });
  }

  fmtDate(d: string): string { return new Date(d).toLocaleDateString('fr-FR'); }
}
