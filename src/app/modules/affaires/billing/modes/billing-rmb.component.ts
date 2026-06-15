import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { FormsModule }                                        from '@angular/forms';
import { BillingService, ExpenseDto }                         from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';
import { FactListService }                                    from '../../../../core/fact-list.service';
import { ListValueDto }                                       from '../../../cost/cost.model';

const EXPENSE_STATUT: Record<string, { label: string; bg: string; color: string; border: string }> = {
  EN_ATTENTE: { label: 'En attente',  bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE:     { label: 'Validée',     bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  REFUSE:     { label: 'Refusée',     bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE  = 5 * 1024 * 1024; // 5 MB

@Component({
  selector: 'app-billing-rmb',
  standalone: true,
  imports: [NgClass, FormsModule, BillingLinesComponent],
  template: `
<div class="space-y-6">

  <!-- Submit form (CP) -->
  @if (canCP()) {
    <div class="bg-white border border-[#eceef0] rounded-xl p-5">
      <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-base text-[#1a6b7c]">upload_file</span>
        Soumettre une dépense
      </h3>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Catégorie *</label>
          <select [(ngModel)]="form.categorie"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30 bg-white">
            <option value="">Sélectionner…</option>
            @for (cat of categories(); track cat.id) {
              <option [value]="cat.code">{{ cat.labelFr }}</option>
            }
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Montant ({{ affaire.devise }}) *</label>
          <input type="number" [(ngModel)]="form.montant" min="0.01" step="0.01"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
            placeholder="0.00" />
        </div>

        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Date de la dépense *</label>
          <input type="date" [(ngModel)]="form.dateDepense"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30" />
        </div>

        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">
            Justificatif * <span class="font-normal text-[#64748b]">(JPEG, PNG, PDF — max 5 Mo)</span>
          </label>
          <label class="flex items-center gap-2 px-3 py-2 border border-[#eceef0] rounded-xl cursor-pointer
                        hover:border-[#1a6b7c] transition-colors text-sm text-[#64748b]">
            <span class="material-symbols-outlined text-base text-[#1a6b7c]">attach_file</span>
            @if (selectedFile()) {
              <span class="text-[#1d2b3e] truncate max-w-xs">{{ selectedFile()!.name }}</span>
            } @else {
              Choisir un fichier…
            }
            <input #fileInput type="file" accept=".jpg,.jpeg,.png,.pdf"
              class="hidden" (change)="onFileChange($event)" />
          </label>
          @if (fileError()) {
            <p class="text-xs text-[#dc2626] mt-1">{{ fileError() }}</p>
          }
        </div>

        <div class="col-span-2">
          <label class="block text-xs font-medium text-[#44474c] mb-1">Commentaire</label>
          <textarea [(ngModel)]="form.commentaire" rows="2" maxlength="500"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
            placeholder="Description de la dépense…"></textarea>
        </div>
      </div>

      @if (submitError()) {
        <p class="text-xs text-[#dc2626] mt-3">{{ submitError() }}</p>
      }

      <div class="flex justify-end mt-4">
        <button (click)="doSubmit()" [disabled]="!canSubmit() || submitting()"
          [ngClass]="canSubmit() && !submitting()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="flex items-center gap-1.5 px-5 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          @if (submitting()) {
            <span class="material-symbols-outlined text-base" style="animation: spin 1s linear infinite">progress_activity</span>
            Envoi…
          } @else {
            <span class="material-symbols-outlined text-base">send</span>
            Soumettre
          }
        </button>
      </div>
    </div>
  }

  <!-- Expense list -->
  <div>
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-1.5">
        <span class="material-symbols-outlined text-base text-[#1a6b7c]">list_alt</span>
        Dépenses soumises
      </h4>
      <button (click)="loadExpenses()" class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">refresh</span>Actualiser
      </button>
    </div>

    @if (expLoading()) {
      <div class="text-sm text-[#64748b] text-center py-6">Chargement…</div>
    } @else if (expenses().length === 0) {
      <div class="text-sm text-[#64748b] text-center py-6 border border-dashed border-[#eceef0] rounded-xl">
        Aucune dépense soumise.
      </div>
    } @else {
      <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
              <th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-left">Catégorie</th>
              <th class="px-4 py-3 text-right">Montant</th>
              <th class="px-4 py-3 text-left">Statut</th>
              <th class="px-4 py-3 text-left">Justificatif</th>
              @if (canRF()) {
                <th class="px-4 py-3 text-left">Actions</th>
              }
            </tr>
          </thead>
          <tbody class="divide-y divide-[#f1f5f9]">
            @for (exp of expenses(); track exp.id) {
              <tr class="hover:bg-[#f8fafc] transition-colors">
                <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(exp.dateDepense) }}</td>
                <td class="px-4 py-3 text-[#44474c]">{{ catLabel(exp.categorie) }}</td>
                <td class="px-4 py-3 text-right font-medium text-[#1d2b3e]">
                  {{ fmtAmt(exp.montant, affaire.devise) }}
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                    [style.background]="expCfg(exp.statut).bg"
                    [style.color]="expCfg(exp.statut).color"
                    [style.borderColor]="expCfg(exp.statut).border">
                    {{ expCfg(exp.statut).label }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  @if (exp.justificatifUrl) {
                    <a [href]="exp.justificatifUrl" target="_blank" rel="noopener"
                      class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
                      <span class="material-symbols-outlined text-sm">open_in_new</span>Voir
                    </a>
                  } @else {
                    <span class="text-xs text-[#64748b]">—</span>
                  }
                </td>
                @if (canRF()) {
                  <td class="px-4 py-3">
                    @if (exp.statut === 'EN_ATTENTE') {
                      <div class="flex gap-1.5">
                        <button (click)="doValidateExp(exp.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                                 hover:bg-[#a7f3d0] transition-colors">
                          Valider
                        </button>
                        <button (click)="openRefuseExp(exp.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                                 hover:bg-[#fecaca] transition-colors">
                          Refuser
                        </button>
                      </div>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>

  <app-billing-lines [affaireId]="affaire.id" [devise]="affaire.devise" />

</div>

<!-- Refuse expense modal -->
@if (showRefuseModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showRefuseModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">Motif de refus</h3>
      <textarea [(ngModel)]="refuseMotif" rows="3" maxlength="500"
        class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
               focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
        placeholder="Raison du refus…"></textarea>
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showRefuseModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          Annuler
        </button>
        <button (click)="doRefuseExp()"
          [ngClass]="refuseMotif.trim()
            ? 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          Refuser
        </button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class BillingRmbComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc          = inject(BillingService);
  private readonly store        = inject(UserStore);
  private readonly factListSvc  = inject(FactListService);

  categories  = signal<ListValueDto[]>([]);
  expenses    = signal<ExpenseDto[]>([]);
  expLoading  = signal(false);
  submitting  = signal(false);
  submitError = signal<string | null>(null);
  fileError   = signal<string | null>(null);
  selectedFile= signal<File | null>(null);

  showRefuseModal = signal(false);
  refuseMotif     = '';
  private refuseExpId = 0;

  form = {
    categorie:    '',
    montant:      0,
    dateDepense:  '',
    commentaire:  '',
  };

  readonly canCP = computed(() => this.store.hasPermission('FACT_CHEF_PROJET'));
  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));

  readonly canSubmit = computed(() =>
    !!this.form.categorie &&
    this.form.montant > 0 &&
    !!this.form.dateDepense &&
    this.selectedFile() !== null &&
    !this.fileError()
  );

  ngOnInit(): void {
    this.factListSvc.getListValues('EXPENSE_CATEGORY', this.affaire.paysId).subscribe({
      next: vals => this.categories.set(vals.filter(v => v.isActive)),
    });
    this.loadExpenses();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    this.fileError.set(null);
    if (!file) { this.selectedFile.set(null); return; }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set('Format non supporté. Utilisez JPEG, PNG ou PDF.');
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.fileError.set('Fichier trop volumineux (maximum 5 Mo).');
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  doSubmit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    const fd = new FormData();
    fd.append('categorie',   this.form.categorie);
    fd.append('montant',     String(this.form.montant));
    fd.append('dateDepense', this.form.dateDepense);
    if (this.form.commentaire.trim()) {
      fd.append('commentaire', this.form.commentaire.trim());
    }
    fd.append('justificatif', this.selectedFile()!);

    this.svc.submitExpense(this.affaire.id, fd).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form = { categorie: '', montant: 0, dateDepense: '', commentaire: '' };
        this.selectedFile.set(null);
        this.loadExpenses();
      },
      error: err => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.message ?? 'Erreur lors de la soumission.');
      },
    });
  }

  loadExpenses(): void {
    this.expLoading.set(true);
    this.svc.getExpenses(this.affaire.id).subscribe({
      next:  e => { this.expenses.set(e); this.expLoading.set(false); },
      error: () => this.expLoading.set(false),
    });
  }

  doValidateExp(id: number): void {
    this.svc.validateExpense(id).subscribe({ next: () => this.loadExpenses() });
  }

  openRefuseExp(id: number): void {
    this.refuseExpId = id;
    this.refuseMotif = '';
    this.showRefuseModal.set(true);
  }

  doRefuseExp(): void {
    if (!this.refuseMotif.trim()) return;
    this.svc.refuseExpense(this.refuseExpId, this.refuseMotif.trim()).subscribe({
      next: () => { this.showRefuseModal.set(false); this.loadExpenses(); },
    });
  }

  catLabel(code: string): string {
    return this.categories().find(c => c.code === code)?.labelFr ?? code;
  }

  expCfg(statut: string) {
    return EXPENSE_STATUT[statut] ?? { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  }

  fmtAmt(v: number, devise = 'EUR'): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v) + ' ' + devise;
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
