import { Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  BadgeCell, ButtonComponent, DafCellDirective, DataTableComponent,
  FieldMessageComponent, FormFieldComponent, ModalRef, ModalService, SelectComponent, SelectOption,
  SearchToolbarComponent, TableColumn, TableConfig, TableRow, ToggleComponent,
} from '@khalilrebhiitec/daf360';
import { CostReminderRuleService } from '../../cost/cost-reminder-rule.service';
import {
  COST_REMINDER_TEMPLATE_TOKENS, CostReminderRule, SaveCostReminderRuleRequest,
} from '../../cost/cost-reminder-rule.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { searchTableRows, tableTools } from '../../../shared/table-tools';
import { offsetLabel } from '../../payments/payments-display';

/**
 * Administration de l'échéancier de paiement fournisseur — onglet "Relances fournisseurs".
 * Mirrors ReminderRulesAdminComponent (client side), minus notify-client — ces relances
 * sont toujours internes, les fournisseurs n'ayant pas d'adresse e-mail enregistrée.
 */
@Component({
  selector: 'app-cost-reminder-rules-admin',
  imports: [
    TranslatePipe, PermissionDirective,
    DataTableComponent, DafCellDirective, ButtonComponent,
    FormFieldComponent, SelectComponent, ToggleComponent, FieldMessageComponent,
    SearchToolbarComponent,
  ],
  host: { class: 'block' },
  templateUrl: './cost-reminder-rules-admin.component.html',
})
export class CostReminderRulesAdminComponent implements OnInit {
  private readonly svc       = inject(CostReminderRuleService);
  private readonly translate = inject(TranslateService);
  private readonly modal     = inject(ModalService);

  rules          = signal<CostReminderRule[]>([]);
  availableRoles = signal<string[]>([]);
  loading        = signal(true);
  error          = signal<string | null>(null);

  readonly tokens = COST_REMINDER_TEMPLATE_TOKENS;

  private readonly formTpl = viewChild.required<TemplateRef<unknown>>('formTpl');
  private formRef: ModalRef | null = null;

  editing     = signal<CostReminderRule | null>(null);
  saving      = signal(false);
  formError   = signal<string | null>(null);
  dispatching = signal(false);

  code         = signal('');
  labelFr      = signal('');
  labelEn      = signal('');
  offsetDays   = signal('0');
  roles        = signal<string[]>([]);
  emailSubject = signal('');
  emailBody    = signal('');
  isActive     = signal(true);

  readonly isEdit     = computed(() => this.editing() !== null);
  readonly codeLocked = computed(() => this.editing()?.inUse === true);

  readonly offsetPreview = computed(() => {
    const n = Number(this.offsetDays());
    if (!Number.isFinite(n)) return '—';
    return offsetLabel(n, (k, p) => this.translate.instant(k, p));
  });

  readonly roleOptions = computed<SelectOption[]>(() =>
    this.availableRoles().map(r => ({ value: r, label: r })));

  readonly orphanRoles = computed(() => {
    const known = new Set(this.availableRoles());
    if (!known.size) return new Map<number, string[]>();
    return new Map(this.rules()
      .map(r => [r.id, r.roles.filter(role => !known.has(role))] as const)
      .filter(([, missing]) => missing.length > 0));
  });

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const en = this.translate.currentLang() === 'en';
    return [
      { key: 'offset',   label: t('ADMIN.COST_REMINDERS.COL_OFFSET'), type: 'badge',  sortable: true,
        sortAccessor: row => row['_offsetDays'] as number },
      { key: 'rule',     label: t('ADMIN.COST_REMINDERS.COL_RULE'),   type: 'custom', sortable: true,
        sortAccessor: row => ((en ? row['_labelEn'] : row['_labelFr']) as string | null) ?? (row['_code'] as string) },
      { key: 'audience', label: t('ADMIN.COST_REMINDERS.COL_ROLES'),  type: 'custom', sortable: true,
        sortAccessor: row => (row['_roles'] as unknown[] | null)?.length ?? 0 },
      { key: 'scope',    label: t('ADMIN.COST_REMINDERS.COL_SCOPE'),  type: 'text',   sortable: true },
      { key: 'state',    label: t('ADMIN.COST_REMINDERS.COL_STATE'),  type: 'badge',  sortable: true },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);
    const orphans = this.orphanRoles();

    return this.rules().map(r => ({
      id: r.id,
      offset: {
        label:   offsetLabel(r.offsetDays, t),
        options: { variant: r.offsetDays > 0 ? 'warning' : 'info', size: 'sm' },
      } satisfies BadgeCell,
      _offsetDays: r.offsetDays,
      _code:       r.code,
      _labelFr:    r.labelFr,
      _labelEn:    r.labelEn,
      _roles:      r.roles,
      _orphans:    orphans.get(r.id) ?? [],
      scope:       r.scope,
      state: {
        label:   t(r.isActive ? 'ADMIN.COST_REMINDERS.ACTIVE' : 'ADMIN.COST_REMINDERS.INACTIVE'),
        options: { variant: r.isActive ? 'success' : 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _source: r,
    }));
  });

  readonly search = signal('');

  private readonly searchColumns = computed<TableColumn[]>(() =>
    this.columns().map(c => {
      switch (c.key) {
        case 'offset':   return { ...c, sortAccessor: undefined };
        case 'rule':     return { ...c, sortAccessor: (row: TableRow) =>
          [row['_code'], row['_labelFr'], row['_labelEn']].filter(Boolean).join(' ') };
        case 'audience': return { ...c, sortAccessor: (row: TableRow) =>
          ((row['_roles'] as string[] | null) ?? []).join(' ') };
        default:         return c;
      }
    }));

  readonly filteredRows = computed<TableRow[]>(() =>
    searchTableRows(this.rows(), this.searchColumns(), this.search()));

  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: 4,
      emptyMessage: this.translate.instant('ADMIN.COST_REMINDERS.EMPTY'),
      ...tableTools(this.translate),
      actions: [
        {
          id:      'edit',
          icon:    'edit',
          tooltip: this.translate.instant('ADMIN.COMMON.EDIT'),
          onClick: (row: TableRow) => this.openEdit(row['_source'] as CostReminderRule),
        },
        {
          id:      'delete',
          icon:    'delete',
          variant: 'danger',
          tooltip: this.translate.instant('ADMIN.COST_REMINDERS.DELETE'),
          visible: (row: TableRow) => !(row['_source'] as CostReminderRule).inUse,
          onClick: (row: TableRow) => this.remove(row['_source'] as CostReminderRule),
        },
      ],
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      rules: this.svc.list(),
      roles: this.svc.availableRoles(),
    }).subscribe({
      next: ({ rules, roles }) => {
        this.rules.set(rules);
        this.availableRoles.set(roles);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.COST_REMINDERS.ERROR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.resetForm();
    this.openFormModal();
  }

  openEdit(rule: CostReminderRule): void {
    this.editing.set(rule);
    this.formError.set(null);
    this.code.set(rule.code);
    this.labelFr.set(rule.labelFr);
    this.labelEn.set(rule.labelEn);
    this.offsetDays.set(String(rule.offsetDays));
    this.roles.set([...rule.roles]);
    this.emailSubject.set(rule.emailSubject ?? '');
    this.emailBody.set(rule.emailBody ?? '');
    this.isActive.set(rule.isActive);
    this.openFormModal();
  }

  private openFormModal(): void {
    const t = (k: string) => this.translate.instant(k);
    this.formRef = this.modal.open({
      title: t(this.isEdit() ? 'ADMIN.COST_REMINDERS.EDIT_TITLE' : 'ADMIN.COST_REMINDERS.NEW_TITLE'),
      icon:  'notifications_active',
      body:  this.formTpl(),
      size:  'lg',
      closeOnBackdrop: false,
      buttons: [
        { label: t('ADMIN.COMMON.CANCEL'), variant: 'secondary', action: () => this.closeForm() },
        { label: t('ADMIN.COMMON.SAVE'),   variant: 'primary', icon: 'save', action: () => this.save() },
      ],
    });
  }

  closeForm(): void {
    this.formRef?.close();
    this.formRef = null;
  }

  private resetForm(): void {
    this.formError.set(null);
    this.code.set('');
    this.labelFr.set('');
    this.labelEn.set('');
    this.offsetDays.set('0');
    this.roles.set([]);
    this.emailSubject.set('');
    this.emailBody.set('');
    this.isActive.set(true);
  }

  readonly canSave = computed(() =>
    !!this.code().trim()
    && !!this.labelFr().trim()
    && !!this.labelEn().trim()
    && Number.isInteger(Number(this.offsetDays())));

  save(): void {
    if (this.saving()) return;
    if (!this.canSave()) {
      this.formError.set(this.translate.instant('ADMIN.COST_REMINDERS.ERROR_REQUIRED'));
      return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const dto: SaveCostReminderRuleRequest = {
      paysId:       this.editing()?.paysId ?? null,
      code:         this.code().trim().toUpperCase(),
      labelFr:      this.labelFr().trim(),
      labelEn:      this.labelEn().trim(),
      offsetDays:   Number(this.offsetDays()),
      roles:        this.roles(),
      emailSubject: this.emailSubject().trim() || null,
      emailBody:    this.emailBody().trim() || null,
      isActive:     this.isActive(),
    };

    const editing = this.editing();
    const req = editing ? this.svc.update(editing.id, dto) : this.svc.create(dto);

    req.subscribe({
      next: () => { this.saving.set(false); this.closeForm(); this.load(); },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('ADMIN.COST_REMINDERS.ERROR_SAVE'));
      },
    });
  }

  triggerDispatch(): void {
    this.dispatching.set(true);
    this.svc.dispatch().subscribe({
      next:  () => { this.dispatching.set(false); this.load(); },
      error: () =>   this.dispatching.set(false),
    });
  }

  remove(rule: CostReminderRule): void {
    this.svc.delete(rule.id).subscribe({
      next:  () => this.load(),
      error: err => this.error.set(err?.error?.detail ?? err?.error?.message
        ?? this.translate.instant('ADMIN.COST_REMINDERS.ERROR_DELETE')),
    });
  }

  insertToken(token: string): void {
    this.emailBody.update(b => (b ? `${b}${token}` : token));
  }
}
