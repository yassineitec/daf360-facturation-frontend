import { Component, TemplateRef, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, ModalRef, ModalService, SearchToolbarComponent, SearchToolbarFilterConfig,
  ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { PermissionDirective } from '../../../shared/permission.directive';
import { UserStore } from '../../../core/user.store';
import { SubcontractingService } from '../subcontracting.service';
import { CreateSousTraitantRequest, SousTraitantDto } from '../subcontracting.model';
import { StCardsSectionComponent } from './st-cards-section.component';
import { StTableSectionComponent } from './st-table-section.component';

type ViewMode = 'grid' | 'list';
type StatusFilter = '' | 'active' | 'inactive';

@Component({
  selector: 'app-sous-traitants-tab',
  imports: [
    TranslatePipe, PermissionDirective, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, FormFieldComponent, StCardsSectionComponent, StTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './sous-traitants-tab.component.html',
})
export class SousTraitantsTabComponent {
  paysId = input<number | null>(null);

  private readonly svc       = inject(SubcontractingService);
  private readonly translate = inject(TranslateService);
  private readonly modal     = inject(ModalService);
  private readonly userStore = inject(UserStore);

  @ViewChild('formTpl')   private formTpl!:   TemplateRef<unknown>;
  @ViewChild('deleteTpl') private deleteTpl!: TemplateRef<unknown>;
  private formRef:   ModalRef | null = null;
  private deleteRef: ModalRef | null = null;

  list    = signal<SousTraitantDto[]>([]);
  loading = signal(false);
  error   = signal<string | null>(null);

  searchText   = signal('');
  filterStatus = signal<StatusFilter>('');
  viewMode     = signal<ViewMode>('grid');

  readonly canManage = computed(() => this.userStore.hasPermission('FACT_MANAGE_ST'));

  readonly asStr = (v: string | number | null): string => (v == null ? '' : String(v));

  /**
   * Search and the status filter are client-side projections: the endpoint returns the
   * whole list for an entity in one call, so there is nothing to re-fetch and no
   * pagination — the same shape `/rh/candidates` uses for its board.
   */
  readonly visibleList = computed<SousTraitantDto[]>(() => {
    const q = this.searchText().trim().toLowerCase();
    const status = this.filterStatus();
    return this.list().filter(st => {
      if (status === 'active'   && !st.isActive) return false;
      if (status === 'inactive' &&  st.isActive) return false;
      if (!q) return true;
      return [st.name, st.contactEmail, st.contactPhone, st.taxId, st.country]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  });

  readonly statsTotal     = computed(() => this.list().length);
  readonly statsActive    = computed(() => this.list().filter(st => st.isActive).length);
  readonly statsInactive  = computed(() => this.list().filter(st => !st.isActive).length);
  readonly statsCountries = computed(() =>
    new Set(this.list().map(st => st.country).filter(Boolean)).size);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiTotal     : MetricCardOptions = { icon: 'groups',       iconColor: 'text-primary',   iconBg: 'bg-primary/10'   };
  readonly kpiActive    : MetricCardOptions = { icon: 'task_alt',     iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };
  readonly kpiInactive  : MetricCardOptions = { icon: 'block',        iconColor: 'text-outline',   iconBg: 'bg-surface-container' };
  readonly kpiCountries : MetricCardOptions = { icon: 'public',       iconColor: 'text-teal',      iconBg: 'bg-teal/10'      };

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('SUBCONTRACTING.ST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('SUBCONTRACTING.ST.VIEW_LIST') },
    ];
  });

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [{
      name: 'status',
      label: t('SUBCONTRACTING.ST.TABLE.STATUS'),
      type: 'select',
      placeholder: t('SUBCONTRACTING.ST.FILTER_ALL'),
      options: [
        { value: 'active',   label: t('SUBCONTRACTING.ST.ACTIVE')   },
        { value: 'inactive', label: t('SUBCONTRACTING.ST.INACTIVE') },
      ],
    }];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('SUBCONTRACTING.ST.FILTER_TITLE'),
      applyLabel:   t('SUBCONTRACTING.ST.MODAL.SAVE'),
      cancelLabel:  t('SUBCONTRACTING.ST.MODAL.CANCEL'),
      resetLabel:   t('SUBCONTRACTING.ST.FILTER_RESET'),
      triggerLabel: t('SUBCONTRACTING.ST.FILTER_TITLE'),
      // Seeded once, in the panel's internal shape — a select is a string[] (§10b).
      initialValues: { status: this.filterStatus() ? [this.filterStatus()] : [] },
    };
  });

  // ── Form state ──────────────────────────────────────────────────────────────
  editTarget = signal<SousTraitantDto | null>(null);
  form       = { name: '', contactEmail: '', contactPhone: '', taxId: '', country: '' };
  saving     = signal(false);
  formError  = signal<string | null>(null);

  deleteTarget = signal<SousTraitantDto | null>(null);
  deleting     = signal(false);

  constructor() {
    effect(() => {
      const id = this.paysId();
      if (id != null) this.load(id);
      else this.list.set([]);
    });
  }

  load(paysId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listSousTraitants(paysId).subscribe({
      next: l => { this.list.set(l); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('SUBCONTRACTING.ST.ERROR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  applyFilters(result: FilterResult): void {
    this.filterStatus.set(((result['status'] as string | null) ?? '') as StatusFilter);
  }

  // ── Create / edit ───────────────────────────────────────────────────────────
  openCreate(): void {
    this.editTarget.set(null);
    this.form = { name: '', contactEmail: '', contactPhone: '', taxId: '', country: '' };
    this.formError.set(null);
    this.openFormModal();
  }

  openEdit(st: SousTraitantDto): void {
    this.editTarget.set(st);
    this.form = {
      name:         st.name,
      contactEmail: st.contactEmail ?? '',
      contactPhone: st.contactPhone ?? '',
      taxId:        st.taxId        ?? '',
      country:      st.country      ?? '',
    };
    this.formError.set(null);
    this.openFormModal();
  }

  private openFormModal(): void {
    const t = (key: string) => this.translate.instant(key);
    this.formRef = this.modal.open({
      title: t(this.editTarget() ? 'SUBCONTRACTING.ST.MODAL.EDIT_TITLE' : 'SUBCONTRACTING.ST.MODAL.NEW_TITLE'),
      body:  this.formTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('SUBCONTRACTING.ST.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        { label: t('SUBCONTRACTING.ST.MODAL.SAVE'),   variant: 'primary',   action: () => this.save() },
      ],
    });
  }

  save(): void {
    const paysId = this.paysId();
    if (paysId == null) return;
    if (!this.form.name.trim()) {
      // The modal's button `disabled` is fixed at open time, so required-field
      // validation has to surface here rather than by greying the button out.
      this.formError.set(this.translate.instant('SUBCONTRACTING.ST.MODAL.NAME_REQUIRED'));
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const req: CreateSousTraitantRequest = {
      paysId,
      name:         this.form.name.trim(),
      contactEmail: this.form.contactEmail || null,
      contactPhone: this.form.contactPhone || null,
      taxId:        this.form.taxId        || null,
      country:      this.form.country      || null,
    };
    const edit = this.editTarget();
    const call$ = edit
      ? this.svc.updateSousTraitant(edit.id, req)
      : this.svc.createSousTraitant(req);
    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formRef?.close();
        this.load(paysId);
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.ST.ERROR_SAVE'));
      },
    });
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────
  confirmDelete(st: SousTraitantDto): void {
    this.deleteTarget.set(st);
    const t = (key: string) => this.translate.instant(key);
    this.deleteRef = this.modal.open({
      title: t('SUBCONTRACTING.ST.DELETE.TITLE'),
      body:  this.deleteTpl,
      size:  'sm',
      buttons: [
        { label: t('SUBCONTRACTING.ST.DELETE.CANCEL'),  variant: 'secondary', action: r => { r.close(); this.deleteTarget.set(null); } },
        { label: t('SUBCONTRACTING.ST.DELETE.CONFIRM'), variant: 'primary',   action: () => this.doDelete() },
      ],
    });
  }

  doDelete(): void {
    const target = this.deleteTarget();
    const paysId = this.paysId();
    if (!target || paysId == null) return;
    this.deleting.set(true);
    this.svc.deleteSousTraitant(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteRef?.close();
        this.deleteTarget.set(null);
        this.load(paysId);
      },
      error: err => {
        this.deleting.set(false);
        this.deleteRef?.close();
        this.error.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.ST.ERROR_DELETE'));
        this.deleteTarget.set(null);
      },
    });
  }
}
