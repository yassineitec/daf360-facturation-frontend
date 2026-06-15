import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PermissionDirective } from '../../../shared/permission.directive';
import { SubcontractingService } from '../subcontracting.service';
import { SousTraitantDto, CreateSousTraitantRequest } from '../subcontracting.model';

@Component({
  selector: 'app-sous-traitants-tab',
  imports: [FormsModule, PermissionDirective],
  templateUrl: './sous-traitants-tab.component.html',
  styleUrl: './sous-traitants-tab.component.scss',
})
export class SousTraitantsTabComponent {
  paysId = input<number | null>(null);

  private readonly svc = inject(SubcontractingService);

  list    = signal<SousTraitantDto[]>([]);
  loading = signal(false);
  error   = signal<string | null>(null);

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
      error: () => { this.error.set('Impossible de charger les sous-traitants.'); this.loading.set(false); },
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
        this.formError.set(err?.error?.message ?? 'Erreur lors de l\'enregistrement.');
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
        this.error.set(err?.error?.message ?? 'Erreur lors de la suppression.');
        this.deleteTarget.set(null);
      },
    });
  }
}
