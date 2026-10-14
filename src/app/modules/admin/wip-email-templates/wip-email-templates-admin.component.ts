import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, ButtonComponent, DafCellDirective, DataTableComponent, DrawerComponent,
  FieldMessageComponent, FormFieldComponent, SelectComponent, SelectOption,
  TableColumn, TableConfig, TableRow, ToggleComponent,
} from '@khalilrebhiitec/daf360';
import { WipEmailTemplateService } from './wip-email-template.service';
import {
  SaveWipEmailTemplateRequest, WipEmailMode, WipEmailTemplate,
  WIP_EMAIL_TOKENS_BY_MODE,
} from './wip-email-template.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { tableTools } from '../../../shared/table-tools';

@Component({
  selector: 'app-wip-email-templates-admin',
  standalone: true,
  imports: [
    TranslatePipe, PermissionDirective,
    DataTableComponent, DafCellDirective, ButtonComponent, DrawerComponent,
    FormFieldComponent, SelectComponent, ToggleComponent, FieldMessageComponent,
  ],
  host: { class: 'block' },
  templateUrl: './wip-email-templates-admin.component.html',
})
export class WipEmailTemplatesAdminComponent implements OnInit {
  private readonly svc       = inject(WipEmailTemplateService);
  private readonly translate = inject(TranslateService);

  templates  = signal<WipEmailTemplate[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);

  // ── Drawer ───────────────────────────────────────────────────────────────────

  drawerOpen  = signal(false);
  editing     = signal<WipEmailTemplate | null>(null);
  saving      = signal(false);
  formError   = signal<string | null>(null);

  mode            = signal<WipEmailMode>('TM');
  paysId          = signal<number | null>(null);
  subjectTemplate = signal('');
  bodyTemplate    = signal('');
  active          = signal(true);

  readonly isEdit = computed(() => this.editing() !== null);

  /** Exposed so the template can call them without the Angular compiler complaining. */
  protected readonly String = String;
  protected readonly Number = Number;

  readonly modeOptions = computed<SelectOption[]>(() => [
    { value: 'TM',       label: this.translate.instant('ADMIN.WIP_EMAIL_TPLS.MODE_TM') },
    { value: 'AV',       label: this.translate.instant('ADMIN.WIP_EMAIL_TPLS.MODE_AV') },
    { value: 'LIVRABLE', label: this.translate.instant('ADMIN.WIP_EMAIL_TPLS.MODE_LIVRABLE') },
    { value: 'TS',       label: this.translate.instant('ADMIN.WIP_EMAIL_TPLS.MODE_TS') },
  ]);

  readonly tokens = computed(() => WIP_EMAIL_TOKENS_BY_MODE[this.mode()] ?? []);

  readonly canSave = computed(() =>
    !!this.subjectTemplate().trim() && !!this.bodyTemplate().trim());

  // ── Table ────────────────────────────────────────────────────────────────────

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'mode',    label: t('ADMIN.WIP_EMAIL_TPLS.COL_MODE'),   type: 'badge',  sortable: true },
      { key: 'scope',   label: t('ADMIN.WIP_EMAIL_TPLS.COL_SCOPE'),  type: 'text',   sortable: true },
      { key: 'subject', label: t('ADMIN.WIP_EMAIL_TPLS.COL_SUBJECT'),type: 'text',   sortable: true },
      { key: 'state',   label: t('ADMIN.WIP_EMAIL_TPLS.COL_STATE'),  type: 'badge',  sortable: true },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return this.templates().map(tpl => ({
      id:      tpl.id,
      mode: {
        label:   t(`ADMIN.WIP_EMAIL_TPLS.MODE_${tpl.mode}`),
        options: { variant: tpl.mode === 'TM' ? 'info' : tpl.mode === 'AV' ? 'teal' : 'warning', size: 'sm' },
      } satisfies BadgeCell,
      scope:   tpl.paysId ? t('ADMIN.WIP_EMAIL_TPLS.SCOPE_COUNTRY') + ` (id ${tpl.paysId})` : t('ADMIN.WIP_EMAIL_TPLS.SCOPE_GLOBAL'),
      subject: tpl.subjectTemplate,
      state: {
        label:   t(tpl.active ? 'ADMIN.WIP_EMAIL_TPLS.ACTIVE' : 'ADMIN.WIP_EMAIL_TPLS.INACTIVE'),
        options: { variant: tpl.active ? 'success' : 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _source: tpl,
    }));
  });

  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: 5,
      emptyMessage: this.translate.instant('ADMIN.WIP_EMAIL_TPLS.EMPTY'),
      ...tableTools(this.translate),
      actions: [
        {
          id:      'edit',
          icon:    'edit',
          tooltip: this.translate.instant('ADMIN.COMMON.EDIT'),
          onClick: (row: TableRow) => this.openEdit(row['_source'] as WipEmailTemplate),
        },
        {
          id:      'delete',
          icon:    'delete',
          variant: 'danger',
          tooltip: this.translate.instant('ADMIN.COMMON.DELETE'),
          onClick: (row: TableRow) => this.remove(row['_source'] as WipEmailTemplate),
        },
      ],
    };
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next:  tpls => { this.templates.set(tpls); this.loading.set(false); },
      error: ()   => {
        this.error.set(this.translate.instant('ADMIN.WIP_EMAIL_TPLS.ERROR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.resetForm();
    this.drawerOpen.set(true);
  }

  openEdit(tpl: WipEmailTemplate): void {
    this.editing.set(tpl);
    this.formError.set(null);
    this.mode.set(tpl.mode);
    this.paysId.set(tpl.paysId);
    this.subjectTemplate.set(tpl.subjectTemplate);
    this.bodyTemplate.set(tpl.bodyTemplate);
    this.active.set(tpl.active);
    this.drawerOpen.set(true);
  }

  private resetForm(): void {
    this.formError.set(null);
    this.mode.set('TM');
    this.paysId.set(null);
    this.subjectTemplate.set('');
    this.bodyTemplate.set('');
    this.active.set(true);
  }

  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.formError.set(null);
    const dto: SaveWipEmailTemplateRequest = {
      mode:            this.mode(),
      paysId:          this.paysId(),
      subjectTemplate: this.subjectTemplate().trim(),
      bodyTemplate:    this.bodyTemplate().trim(),
      active:          this.active(),
    };
    const editing = this.editing();
    const req = editing ? this.svc.update(editing.id, dto) : this.svc.create(dto);
    req.subscribe({
      next: () => { this.saving.set(false); this.drawerOpen.set(false); this.load(); },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? this.translate.instant('ADMIN.WIP_EMAIL_TPLS.ERROR_SAVE'));
      },
    });
  }

  remove(tpl: WipEmailTemplate): void {
    this.svc.delete(tpl.id).subscribe({
      next:  () => this.load(),
      error: err => this.error.set(err?.error?.message ?? this.translate.instant('ADMIN.WIP_EMAIL_TPLS.ERROR_DELETE')),
    });
  }

  insertToken(token: string): void {
    this.bodyTemplate.update(b => b ? `${b}${token}` : token);
  }
}
