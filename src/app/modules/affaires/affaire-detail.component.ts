import { Component, OnInit, inject, signal, computed, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { AffaireService } from './affaire.service';
import { AffaireWizardService } from './affaire-wizard.service';
import {
  AffaireDetail, RafDetailsDto, AffaireKpisDto, TsDto,
  STATUT_TRANSITIONS, STATUT_LABELS, TYPE_LABELS,
} from './affaire.model';
import { UserStore } from '../../core/user.store';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PermissionDirective } from '../../shared/permission.directive';
import { TsListComponent } from './ts/ts-list.component';
import { TsFormComponent } from './ts/ts-form.component';
import { AffaireOstComponent } from './ost/affaire-ost.component';
import { AfaireBillingTabComponent } from './billing/affaire-billing-tab.component';

@Component({
  selector: 'app-affaire-detail',
  imports: [RouterLink, FormsModule, DecimalPipe, StatusBadgeComponent, PermissionDirective, TsListComponent, TsFormComponent, AffaireOstComponent, AfaireBillingTabComponent],
  templateUrl: './affaire-detail.component.html',
  styleUrl: './affaire-detail.component.scss',
})
export class AffaireDetailComponent implements OnInit {
  // Bound from route param via withComponentInputBinding()
  id = input<string>();

  private readonly svc       = inject(AffaireService);
  private readonly wizardSvc = inject(AffaireWizardService);
  private readonly store     = inject(UserStore);
  private readonly router    = inject(Router);

  affaire      = signal<AffaireDetail | null>(null);
  raf          = signal<RafDetailsDto | null>(null);
  kpis         = signal<AffaireKpisDto | null>(null);
  tsList       = signal<TsDto[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft        = signal<any>(null);

  loading      = signal(true);
  error        = signal<string | null>(null);
  actionError  = signal<string | null>(null);
  actionLoading= signal(false);

  // Section open states
  openSections = signal<Set<string>>(new Set(['info']));

  // Statut modal
  showStatutModal = signal(false);
  targetStatut    = signal('');
  motif           = signal('');

  // TS new-form
  showTsForm = signal(false);

  readonly stubSections = [
    { key: 'factures',  label: 'Factures émises' },
    { key: 'paiements', label: 'Paiements reçus' },
  ];

  readonly ALL_STATUTS = ['EN_COURS', 'SUSPENDUE', 'CLOTUREE', 'ARCHIVEE'];

  // Budget validation
  budgetLoading = signal(false);

  get numId(): number { return Number(this.id()); }

  readonly availableTransitions = computed(() => {
    const a = this.affaire();
    if (!a) return [];
    return STATUT_TRANSITIONS[a.statut] ?? [];
  });

  readonly typeLabel = computed(() => {
    const a = this.affaire();
    return a ? (TYPE_LABELS[a.typeAffaire] ?? a.typeAffaire) : '';
  });

  readonly affaireDevise = computed(() => this.affaire()?.devise || 'TND');

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    const id = this.numId;
    if (!id) { this.error.set('Identifiant invalide.'); this.loading.set(false); return; }

    this.loading.set(true);
    this.error.set(null);

    this.svc.getAffaire(id).subscribe({
      next: a => {
        this.affaire.set(a);
        this.loading.set(false);
        this.loadRaf();
        this.loadKpis();
        this.loadTs();
        this.loadDraft();
      },
      error: () => {
        this.error.set('Impossible de charger l\'affaire.');
        this.loading.set(false);
      },
    });
  }

  loadRaf(): void {
    this.svc.getAffaireRaf(this.numId).subscribe({ next: r => this.raf.set(r) });
  }

  loadKpis(): void {
    this.svc.getAffaireKpis(this.numId).subscribe({ next: k => this.kpis.set(k) });
  }

  loadTs(): void {
    this.svc.getTS(this.numId).subscribe({ next: ts => this.tsList.set(ts) });
  }

  loadDraft(): void {
    this.wizardSvc.loadDraft(this.numId).subscribe({
      next: dto => this.draft.set(dto),
    });
  }

  toggleSection(key: string): void {
    this.openSections.update(s => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isOpen(key: string): boolean { return this.openSections().has(key); }

  // ── Budget validation ────────────────────────────────────────────────────────

  validerBudget(): void {
    if (this.budgetLoading()) return;
    this.budgetLoading.set(true);
    this.actionError.set(null);
    this.svc.validerBudget(this.numId).subscribe({
      next: () => {
        this.budgetLoading.set(false);
        this.loadAll();
      },
      error: err => {
        this.budgetLoading.set(false);
        this.actionError.set(err?.error?.message ?? 'Erreur lors de la validation du budget.');
      },
    });
  }

  // ── Statut change ────────────────────────────────────────────────────────────

  openStatutModal(): void {
    const transitions = this.availableTransitions();
    if (transitions.length === 0) return;
    this.targetStatut.set(transitions[0]);
    this.motif.set('');
    this.showStatutModal.set(true);
  }

  submitStatut(): void {
    const statut = this.targetStatut();
    if (!statut) return;
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.svc.changerStatut(this.numId, { newStatut: statut, reason: this.motif().trim() || null }).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.showStatutModal.set(false);
        this.loadAll();
      },
      error: err => {
        this.actionLoading.set(false);
        this.actionError.set(err?.error?.message ?? 'Erreur lors du changement de statut.');
      },
    });
  }

  openTsForm(): void { this.showTsForm.set(true); }

  onTsFormClosed(saved: boolean): void {
    this.showTsForm.set(false);
    if (saved) { this.loadTs(); this.loadRaf(); }
  }

  // ── Formatting helpers ───────────────────────────────────────────────────────

  formatAmount(v: number | null, devise = 'TND'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  statutLabel(s: string): string { return STATUT_LABELS[s] ?? s; }

  statutIcon(s: string): string {
    const m: Record<string, string> = {
      EN_COURS: 'play_circle', SUSPENDUE: 'pause_circle',
      CLOTUREE: 'check_circle', ARCHIVEE: 'archive',
    };
    return m[s] ?? 'circle';
  }

  canTransitionTo(s: string): boolean {
    return this.availableTransitions().includes(s);
  }

  gaugeOffset(pct: number): number {
    return Math.round(175 * (1 - Math.min(Math.max(pct, 0), 100) / 100));
  }

  goBack(): void { this.router.navigate(['/fact/affaires']); }

  openEdit(): void {
    this.router.navigate(['/fact/affaires', this.numId, 'edit']);
  }
}
