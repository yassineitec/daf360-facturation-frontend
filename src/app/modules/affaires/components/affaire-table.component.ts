import { Component, ElementRef, ViewChild, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';
import { AffaireListItem, STATUT_LABELS, TYPE_LABELS } from '../affaire.model';
import {
  StatusBadgeComponent, CardComponent, BadgeVariant, SelectComponent, ToolbarComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
} from '@khalilrebhiitec/daf360';
import { FilterPanelComponent } from '../../../shared/filter-panel/filter-panel.component';

@Component({
  selector: 'app-affaire-table',
  imports: [
    FormsModule, UpperCasePipe, TranslatePipe, StatusBadgeComponent, CardComponent, SelectComponent,
    FilterPanelComponent, ToolbarComponent, DataTableComponent, DafCellDirective,
  ],
  templateUrl: './affaire-table.component.html',
  styleUrl: './affaire-table.component.scss',
})
export class AffaireTableComponent {
  private readonly translate = inject(TranslateService);

  affaires      = input.required<AffaireListItem[]>();
  loading       = input(false);
  error         = input<string | null>(null);
  deletingId    = input<number | null>(null);
  totalElements = input(0);
  currentPage   = input(0);
  totalPages    = input(0);

  searchText   = model('');
  filterStatut = model('');
  filterType   = model('');

  readonly rowClick    = output<number>();
  readonly deleteClick = output<{ affaire: AffaireListItem; event: MouseEvent }>();
  readonly pageChange  = output<number>();
  readonly searchGo    = output<void>();
  readonly filterGo    = output<void>();

  readonly statutOptions = Object.entries(STATUT_LABELS).map(([k, v]) => ({ value: k, label: this.translate.instant(v) }));
  readonly typeOptions   = Object.entries(TYPE_LABELS).map(([k, v])   => ({ value: k, label: v }));

  readonly tableColumns: TableColumn[] = [
    { key: 'reference',   label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.REF'),     type: 'custom' },
    { key: 'intitule',    label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.TITLE'),    type: 'custom' },
    { key: 'clientName',  label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.CLIENT'),   type: 'custom' },
    { key: 'responsable', label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.MANAGER'),  type: 'custom' },
    { key: 'type',        label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.TYPE'),     type: 'custom' },
    { key: 'budget',      label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.BUDGET'),   type: 'custom', align: 'right' },
    { key: 'raf',         label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.RAF'),      type: 'custom', align: 'right' },
    { key: 'statut',      label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.STATUS'),   type: 'custom' },
    { key: '_actions',    label: '', type: 'custom', align: 'right', width: '40px' },
  ];

  readonly tableRows = computed<TableRow[]>(() =>
    this.affaires().map(a => ({
      id:                   a.id,
      reference:            a.reference,
      intitule:             a.intitule,
      billingMode:          a.billingMode,
      clientName:           a.clientName,
      responsableFullName:  a.responsableFullName,
      typeAffaire:          a.typeAffaire,
      budgetPrevisionnel:   a.budgetPrevisionnel,
      rafDisponible:        a.rafDisponible,
      statut:               a.statut,
      _raw:                 a,
    }))
  );

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    emptyMessage: this.translate.instant('AFFAIRES.LIST.TABLE.EMPTY'),
  }));

  @ViewChild(FilterPanelComponent) private filterPanelRef!: FilterPanelComponent;
  @ViewChild('tcHeader')    private tcHeaderRef!: ElementRef<HTMLElement>;
  @ViewChild('tcMobHeader') private tcMobHeaderRef!: ElementRef<HTMLElement>;

  readonly mobileSearchOpen = signal(false);

  readonly viewMode = signal<'grid' | 'list'>('grid');

  private readonly mobileQuery = window.matchMedia('(max-width: 640px)');
  readonly isMobile = signal(this.mobileQuery.matches);

  constructor() {
    this.mobileQuery.addEventListener('change', e => this.isMobile.set(e.matches));
  }

  readonly toolbarActions = [
    { id: 'filters', label: 'Filtres', icon: 'tune', position: 'right' as const, variant: 'default' as const },
  ];

  private readonly allToggleOptions = [
    { id: 'grid', icon: 'grid_view',  tooltip: 'Vue grille' },
    { id: 'list', icon: 'table_rows', tooltip: 'Vue liste'  },
  ];

  readonly viewToggleOptions = computed(() =>
    this.isMobile() ? [] : this.allToggleOptions
  );

  filterStatutSel = signal<string[]>([]);
  filterTypeSel   = signal<string[]>([]);

  readonly selectStatutConfig = { placeholder: 'Statut', multiple: false, searchable: false, fullWidth: true };
  readonly selectTypeConfig   = { placeholder: 'Type',   multiple: false, searchable: false, fullWidth: true };

  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Debounce the search so we don't fire (and race) a backend reload on every keystroke. */
  onSearchChange(value: string): void {
    this.searchText.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchGo.emit(), 300);
  }

  onToolbarAction(id: string): void {
    if (id === 'filters') {
      const rect = this.tcHeaderRef.nativeElement.getBoundingClientRect();
      this.filterPanelRef.openAt(rect);
    }
  }

  onMobileFilter(): void {
    const rect = this.tcMobHeaderRef.nativeElement.getBoundingClientRect();
    this.filterPanelRef.openAt(rect);
  }

  onTableRowClick(row: TableRow): void {
    this.rowClick.emit(row['id'] as number);
  }

  onFilterApply(): void {
    this.filterStatut.set(this.filterStatutSel()[0] ?? '');
    this.filterType.set(this.filterTypeSel()[0] ?? '');
    this.filterGo.emit();
  }

  onFilterCancel(): void {
    this.filterStatutSel.set(this.filterStatut() ? [this.filterStatut()] : []);
    this.filterTypeSel.set(this.filterType()   ? [this.filterType()]   : []);
  }

  readonly statsEnCours  = computed(() => this.affaires().filter(a => a.statut === 'EN_COURS').length);
  readonly statsSuspendu = computed(() => this.affaires().filter(a => a.statut === 'SUSPENDUE').length);

  get pages(): number[] {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const start = Math.max(0, cur - 2);
    const end   = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  typeLabel(type: string): string { return TYPE_LABELS[type] ?? type; }

  initials(name: string | null): string {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  formatAmount(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  }

  rafColor(a: AffaireListItem): string {
    if (!a.budgetPrevisionnel || a.rafDisponible == null) return '#757684';
    const pct = (a.rafDisponible / a.budgetPrevisionnel) * 100;
    if (pct > 20) return '#006c49';
    if (pct > a.rafAlerteSeuilPct) return '#f59e0b';
    return '#ba1a1a';
  }

  budgetIcon(a: AffaireListItem): string {
    if (a.budgetValide) return 'check_circle';
    if (!a.budgetPrevisionnel) return 'schedule';
    return 'warning';
  }

  budgetIconColor(a: AffaireListItem): string {
    if (a.budgetValide) return '#006c49';
    if (!a.budgetPrevisionnel) return '#757684';
    return '#f59e0b';
  }

  statutBadgeCfg(statut: string): { label: string; color: string; shadow: string } {
    const map: Record<string, { label: string; color: string; shadow: string }> = {
      EN_COURS:  { label: 'AFFAIRES.LIST.TABLE.STATUS.EN_COURS',  color: '#006b58', shadow: 'rgba(0,107,88,0.30)'   },
      SUSPENDUE: { label: 'AFFAIRES.LIST.TABLE.STATUS.SUSPENDUE', color: '#D97706', shadow: 'rgba(217,119,6,0.30)'  },
      CLOTUREE:  { label: 'AFFAIRES.LIST.TABLE.STATUS.CLOTUREE',  color: '#50717B', shadow: 'rgba(80,113,123,0.30)' },
      ARCHIVEE:  { label: 'AFFAIRES.LIST.TABLE.STATUS.ARCHIVEE',  color: '#94A3B8', shadow: 'rgba(148,163,184,0.30)'},
    };
    return map[statut] ?? { label: statut, color: '#94A3B8', shadow: 'rgba(148,163,184,0.30)' };
  }

  statutBadgeVariant(statut: string): BadgeVariant {
    const map: Record<string, BadgeVariant> = {
      EN_COURS:  'success',
      SUSPENDUE: 'warning',
      CLOTUREE:  'secondary',
      ARCHIVEE:  'neutral',
    };
    return map[statut] ?? 'neutral';
  }
}
