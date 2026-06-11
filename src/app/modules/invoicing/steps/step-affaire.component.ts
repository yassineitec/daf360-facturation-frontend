import {
  Component, OnInit, inject, input, output, signal, computed,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { InvoiceService } from '../invoice.service';
import { AffaireListItem, TsDto } from '../../affaires/affaire.model';
import { AffaireService } from '../../affaires/affaire.service';

export interface StepAffaireValue {
  affaireId:   number | null;
  tsId:        number | null;
  invoiceType: string;
  clientId:    number | null;
}

@Component({
  selector: 'app-step-affaire',
  imports: [ReactiveFormsModule],
  template: `
<div class="step-affaire">

  <!-- Affaire search -->
  <div class="field">
    <label>Affaire</label>
    <div class="search-wrap">
      <input type="search" class="form-input" placeholder="Rechercher une affaire (ref, intitulé)…"
        [value]="searchQuery()" (input)="onSearchInput($event)"
        maxlength="100" autocomplete="off" />
    </div>

    @if (searching()) {
      <div class="search-hint">Recherche…</div>
    }

    @if (searchResults().length > 0 && !selectedAffaire()) {
      <div class="search-dropdown">
        @for (a of searchResults(); track a.id) {
          <div class="search-item" (click)="selectAffaire(a)">
            <span class="aff-ref">{{ a.reference }}</span>
            <span class="aff-name">{{ a.intitule }}</span>
            <span class="aff-client">{{ a.clientNom }}</span>
          </div>
        }
      </div>
    }

    @if (selectedAffaire()) {
      <div class="selected-affaire">
        <div class="sel-header">
          <span class="aff-ref">{{ selectedAffaire()!.reference }}</span>
          <span class="aff-name">{{ selectedAffaire()!.intitule }}</span>
          <button type="button" class="clear-btn" (click)="clearAffaire()">&times;</button>
        </div>
        <div class="sel-kpis">
          <div class="kpi">
            <span class="kpi-label">Budget prévisionnel</span>
            <span class="kpi-val">{{ formatAmount(selectedAffaire()!.budgetPrevisionnel ?? 0) }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">RAF</span>
            <span class="kpi-val" [class.raf-warn]="rafWarning()" [class.raf-block]="rafBlocked()">
              {{ formatAmount(selectedAffaire()!.rafDisponible ?? 0) }}
            </span>
          </div>
        </div>
        @if (rafBlocked()) {
          <div class="raf-alert raf-alert--block">RAF épuisé — facturation bloquée (RG10).</div>
        } @else if (rafWarning()) {
          <div class="raf-alert raf-alert--warn">RAF faible ({{ formatPct(rafPct()) }}%) — vérifiez le montant.</div>
        }
      </div>
    }
  </div>

  <!-- Type de facture -->
  <div class="field">
    <label>Type de facture *</label>
    <select class="form-input" [formControl]="form.controls['invoiceType']"
      [class.invalid]="form.controls['invoiceType'].invalid && form.controls['invoiceType'].touched">
      <option value="">Sélectionner…</option>
      <option value="ACOMPTE">Acompte</option>
      <option value="INTERMEDIAIRE">Intermédiaire</option>
      <option value="FINALE">Finale</option>
      <option value="AVOIR">Avoir</option>
    </select>
    @if (form.controls['invoiceType'].invalid && form.controls['invoiceType'].touched) {
      <span class="error-msg">Type requis.</span>
    }
  </div>

  <!-- TS associé (si affaire sélectionnée) -->
  @if (selectedAffaire() && tsList().length > 0) {
    <div class="field">
      <label>TS associé (optionnel)</label>
      <select class="form-input" [formControl]="form.controls['tsId']">
        <option [value]="null">Aucun</option>
        @for (ts of tsList(); track ts.id) {
          <option [value]="ts.id">{{ ts.reference }} — {{ ts.intitule }} ({{ formatAmount(ts.montant) }})</option>
        }
      </select>
    </div>
  }

  <div class="step-actions">
    <button type="button" class="btn-next" (click)="next()" [disabled]="rafBlocked()">
      Suivant →
    </button>
  </div>
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepAffaireComponent implements OnInit {
  private readonly invSvc = inject(InvoiceService);
  private readonly affSvc = inject(AffaireService);
  private readonly fb     = inject(FormBuilder);

  nextStep = output<StepAffaireValue>();

  searchQuery  = signal('');
  searchResults = signal<AffaireListItem[]>([]);
  searching    = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);
  tsList       = signal<TsDto[]>([]);

  private readonly search$ = new Subject<string>();

  form = this.fb.group({
    invoiceType: ['', Validators.required],
    tsId:        [null as number | null],
  });

  readonly rafPct = computed(() => {
    const a = this.selectedAffaire();
    if (!a || !a.budgetPrevisionnel) return 100;
    return ((a.rafDisponible ?? 0) / a.budgetPrevisionnel) * 100;
  });
  readonly rafWarning = computed(() => this.rafPct() < 20 && this.rafPct() > 0);
  readonly rafBlocked = computed(() => {
    const a = this.selectedAffaire();
    return a ? (a.rafDisponible ?? 0) <= 0 : false;
  });

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => { this.searching.set(true); return this.invSvc.searchAffaires(q); }),
    ).subscribe({
      next:  r => { this.searchResults.set(r); this.searching.set(false); },
      error: () => this.searching.set(false),
    });
  }

  onSearchInput(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    if (q.trim().length >= 2) this.search$.next(q.trim());
    else this.searchResults.set([]);
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.searchResults.set([]);
    this.searchQuery.set(`${a.reference} — ${a.intitule}`);
    this.affSvc.getTS(a.id).subscribe({ next: r => this.tsList.set(r), error: () => {} });
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.tsList.set([]);
    this.form.patchValue({ tsId: null });
  }

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.rafBlocked()) return;
    const v = this.form.getRawValue();
    this.nextStep.emit({
      affaireId:   this.selectedAffaire()?.id ?? null,
      tsId:        v.tsId ?? null,
      invoiceType: v.invoiceType!,
      clientId:    this.selectedAffaire()?.clientId ?? null,
    });
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatPct(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }
}
