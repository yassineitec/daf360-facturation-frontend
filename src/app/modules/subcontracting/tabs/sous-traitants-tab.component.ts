import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PermissionDirective } from '../../../shared/permission.directive';
import { SubcontractingService } from '../subcontracting.service';
import { SousTraitantDto, CreateSousTraitantRequest } from '../subcontracting.model';
import {
  DataTableComponent, DafCellDirective, FormFieldComponent, TableColumn, TableConfig, BadgeOptions,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-sous-traitants-tab',
  imports: [TranslatePipe, PermissionDirective, DataTableComponent, DafCellDirective, FormFieldComponent],
  templateUrl: './sous-traitants-tab.component.html',
  styleUrl: './sous-traitants-tab.component.scss',
})
export class SousTraitantsTabComponent {
  paysId = input<number | null>(null);

  private readonly svc = inject(SubcontractingService);
  private readonly translate = inject(TranslateService);

  list    = signal<SousTraitantDto[]>([]);
  loading = signal(false);
  error   = signal<string | null>(null);

  readonly asStr = (v: string | number | null): string => (v == null ? '' : String(v));

  readonly tableColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'name',         label: t('SUBCONTRACTING.ST.TABLE.NAME'),   type: 'custom' },
      { key: 'contactEmail', label: t('SUBCONTRACTING.ST.TABLE.EMAIL'),  type: 'custom' },
      { key: 'contactPhone', label: t('SUBCONTRACTING.ST.TABLE.PHONE'),  type: 'custom' },
      { key: 'taxId',        label: t('SUBCONTRACTING.ST.TABLE.TAX_ID'), type: 'custom' },
      { key: 'country',      label: t('SUBCONTRACTING.ST.TABLE.COUNTRY'),type: 'custom' },
      { key: 'status',       label: t('SUBCONTRACTING.ST.TABLE.STATUS'), type: 'badge' },
      { key: '_actions',     label: '',                                  type: 'custom', align: 'right', width: '80px' },
    ];
  });

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable: true,
  }));

  readonly tableRows = computed(() => {
    this.translate.currentLang();
    return this.list().map(st => ({
      id:            st.id,
      name:          st.name,
      contactEmail:  st.contactEmail,
      contactPhone:  st.contactPhone,
      taxId:         st.taxId,
      country:       st.country,
      isActive:      st.isActive,
      status: {
        label:   this.translate.instant(st.isActive ? 'SUBCONTRACTING.ST.ACTIVE' : 'SUBCONTRACTING.ST.INACTIVE'),
        options: { variant: st.isActive ? 'success' : 'neutral', pill: true } as BadgeOptions,
      },
      _raw: st,
    }));
  });

  showModal  = signal(false);
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
      error: () => { this.error.set(this.translate.instant('SUBCONTRACTING.ST.ERROR_LOAD')); this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.editTarget.set(null);
    this.form = { name: '', contactEmail: '', contactPhone: '', taxId: '', country: '' };
    this.formError.set(null);
    this.showModal.set(true);
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
    this.showModal.set(true);
  }

  save(): void {
    const paysId = this.paysId();
    if (!this.form.name.trim() || paysId == null) return;
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
      next: () => { this.saving.set(false); this.showModal.set(false); this.load(paysId); },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.ST.ERROR_SAVE'));
      },
    });
  }

  confirmDelete(st: SousTraitantDto): void {
    this.deleteTarget.set(st);
  }

  doDelete(): void {
    const target = this.deleteTarget();
    const paysId = this.paysId();
    if (!target || paysId == null) return;
    this.deleting.set(true);
    this.svc.deleteSousTraitant(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.load(paysId);
      },
      error: err => {
        this.deleting.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('SUBCONTRACTING.ST.ERROR_DELETE'));
        this.deleteTarget.set(null);
      },
    });
  }
}
