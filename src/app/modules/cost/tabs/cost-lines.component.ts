import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CostService } from '../cost.service';
import {
  CostLineDto, CostLineStatus, COST_STATUS_CONFIG, CostCategoryDto,
} from '../cost.model';
import { ClientService } from '../../clients/client.service';
import {
  MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
  PaginationComponent,
  ToolbarComponent, ToolbarAction,
  SelectComponent, SelectOption,
  StatusBadgeComponent as DafBadgeComponent, BadgeOptions, BadgeVariant,
  CardComponent,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-lines',
  standalone: true,
  imports: [
    MetricCardComponent, DataTableComponent, DafCellDirective,
    PaginationComponent, ToolbarComponent, SelectComponent,
    DafBadgeComponent, CardComponent,
  ],
  templateUrl: './cost-lines.component.html',
  styleUrl: './cost-lines.component.scss',
})
export class CostLinesComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  paysId = signal<number>(0);
  lines  = signal<CostLineDto[]>([]);
  total  = signal(0);
  page   = signal(0);
  size   = 25;

  statusFilterSel = signal<string[]>([]);
  searchText      = signal<string>('');
  isLoading       = signal(false);
  serverError     = signal<string | null>(null);
  actionError     = signal<string | null>(null);

  categories  = signal<CostCategoryDto[]>([]);
  categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.labelFr])));

  draftCount    = computed(() => this.lines().filter(l => l.status === 'DRAFT').length);
  pendingCount  = computed(() => this.lines().filter(l => l.status === 'SUBMITTED').length);
  approvedCount = computed(() =>
    this.lines().filter(l => ['APPROVED', 'VALIDATED', 'POSTED'].includes(l.status)).length
  );

  readonly totalPagesCount = computed(() => Math.ceil(this.total() / this.size) || 1);

  readonly statusSelectOptions: SelectOption[] = Object.entries(COST_STATUS_CONFIG)
    .map(([k, v]) => ({ value: k, label: v.label }));

  readonly tableColumns: TableColumn[] = [
    { key: 'label',         label: 'Description', type: 'custom' },
    { key: 'categoryLabel', label: 'Catégorie',   type: 'text' },
    { key: 'date',          label: 'Date',        type: 'text' },
    { key: 'netAmountLocal',label: 'Montant HT',  type: 'custom', align: 'right' },
    { key: 'netAmountEur',  label: 'EUR',         type: 'custom', align: 'right' },
    { key: 'status',        label: 'Statut',      type: 'custom', align: 'center' },
    { key: 'approvalLevel', label: 'Approbation', type: 'custom', align: 'center' },
    { key: '_actions',      label: 'Actions',     type: 'custom', align: 'right', width: '80px' },
  ];

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.isLoading(),
    emptyMessage: 'Aucune ligne de coût trouvée.',
    skeletonRows: 5,
  }));

  readonly toolbarActions: ToolbarAction[] = [
    { id: 'new', label: 'Nouvelle ligne', icon: 'add', position: 'right', variant: 'primary' },
  ];

  readonly tableRows = computed(() => {
    const q = this.searchText().toLowerCase().trim();
    return this.lines()
      .filter(line => !q ||
        (line.label ?? '').toLowerCase().includes(q) ||
        (line.reference ?? '').toLowerCase().includes(q)
      )
      .map(line => ({
        id:            line.id,
        label:         line.label,
        reference:     line.reference,
        categoryLabel: this.getCategoryLabel(line.categoryId),
        date:          this.formatDate(line.transactionDate),
        netAmountLocal:line.netAmountLocal,
        currency:      line.currency,
        netAmountEur:  line.netAmountEur,
        status:        line.status,
        approvalLevel: line.approvalLevelRequired,
        _canEdit:      this.canEdit(line),
        _canSubmit:    this.canSubmit(line),
        _raw:          line,
      }));
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.load();
          this.svc.getCategories(paysId).subscribe({
            next: cats => this.categories.set(cats),
            error: () => {},
          });
        } else {
          this.serverError.set('Pays introuvable pour votre compte.');
        }
      },
      error: () => this.serverError.set('Impossible de déterminer le pays.'),
    });
  }

  load(): void {
    if (!this.paysId()) return;
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.getCostLines({
      paysId: this.paysId(),
      status: this.statusFilterSel()[0] || null,
      page:   this.page(),
      size:   this.size,
    }).subscribe({
      next: p => {
        this.lines.set(p.content);
        this.total.set(p.totalElements);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Impossible de charger les lignes.');
        this.isLoading.set(false);
      },
    });
  }

  onStatusChange(): void { this.page.set(0); this.load(); }
  onToolbarAction(id: string): void { if (id === 'new') this.openCreate(); }
  onRowClick(row: TableRow): void { this.openEdit(row['_raw']); }
  goToPage(p: number): void { this.page.set(p); this.load(); }

  openCreate(): void { this.router.navigate(['new'], { relativeTo: this.route }); }
  openEdit(line: CostLineDto): void { this.router.navigate([line.id, 'edit'], { relativeTo: this.route }); }

  submitLine(line: CostLineDto): void {
    this.actionError.set(null);
    this.svc.submitCostLine(line.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err.error?.message ?? 'Erreur lors de la soumission.'),
    });
  }

  getCategoryLabel(id: number | null): string {
    if (id == null) return '—';
    return this.categoryMap().get(id) ?? `Cat. ${id}`;
  }

  canEdit(line: CostLineDto): boolean   { return line.status === 'DRAFT' || line.status === 'RETURNED'; }
  canSubmit(line: CostLineDto): boolean { return line.status === 'DRAFT' || line.status === 'RETURNED'; }

  statusBadgeOptions(s: string): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      DRAFT:     'neutral',
      SUBMITTED: 'info',
      RETURNED:  'warning',
      APPROVED:  'success',
      VALIDATED: 'success',
      POSTED:    'secondary',
      CANCELLED: 'danger',
      REJECTED:  'danger',
    };
    return { variant: variantMap[s] ?? 'neutral', pill: true };
  }

  statusLabel(s: string): string {
    return COST_STATUS_CONFIG[s as CostLineStatus]?.label ?? s;
  }

  approvalBadgeOptions(level: string | null): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      L1: 'neutral', L2: 'info', L3: 'warning', L4: 'danger',
    };
    return { variant: (level ? (variantMap[level] ?? 'neutral') : 'neutral'), pill: true };
  }

  formatAmount(amount: number | null | undefined, currency = 'EUR'): string {
    if (amount == null) return '—';
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    } catch { return `${amount} ${currency}`; }
  }

  formatDate(date: string | null): string {
    if (!date) return '—';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch { return date; }
  }
}
