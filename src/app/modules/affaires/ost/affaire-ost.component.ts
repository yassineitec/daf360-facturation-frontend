import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PermissionDirective } from '../../../shared/permission.directive';
import { SubcontractingService } from '../../subcontracting/subcontracting.service';
import {
  OSTDto, CoutSTDto, SousTraitantDto,
  CreateOSTRequest, CreateCoutSTRequest,
  OST_STATUT_LABELS, OST_VALID_TRANSITIONS,
  ostBudgetPct, ostIsOver, fmtAmt,
} from '../../subcontracting/subcontracting.model';

@Component({
  selector: 'app-affaire-ost',
  imports: [FormsModule, PermissionDirective],
  templateUrl: './affaire-ost.component.html',
  styleUrl: './affaire-ost.component.scss',
})
export class AffaireOstComponent implements OnInit {
  affaireId     = input.required<number>();
  paysId        = input.required<number>();
  devise        = input<string>('TND');
  affaireStatut = input<string>('');

  private readonly svc = inject(SubcontractingService);

  ordres  = signal<OSTDto[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  // Create / edit OST modal
  showOstModal  = signal(false);
  editOstTarget = signal<OSTDto | null>(null);
  stList        = signal<SousTraitantDto[]>([]);
  stLoading     = signal(false);
  ostForm       = { sousTraitantId: 0, perimetre: '', montantBudget: 0, devise: 'TND', alerteDepassementPct: 10 };
  ostSaving     = signal(false);
  ostError      = signal<string | null>(null);

  // Changer statut
  showStatutModal = signal(false);
  statutTarget    = signal<OSTDto | null>(null);
  newStatut       = '';
  statutSaving    = signal(false);
  statutError     = signal<string | null>(null);

  // Costs drawer
  drawerOpen   = signal(false);
  drawerOst    = signal<OSTDto | null>(null);
  coutsList    = signal<CoutSTDto[]>([]);
  coutsLoading = signal(false);
  showAddCout  = signal(false);
  coutForm     = { montant: 0, dateCout: '', devise: 'TND', description: '' };
  coutSaving   = signal(false);
  coutError    = signal<string | null>(null);

  readonly today = new Date().toISOString().slice(0, 10);

  ngOnInit(): void {
    this.loadOrdres();
    this.loadSousTraitants();
  }

  loadOrdres(): void {
    this.loading.set(true);
    this.svc.listOSTByAffaire(this.affaireId()).subscribe({
      next: l => { this.ordres.set(l); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger les ordres ST.'); this.loading.set(false); },
    });
  }

  private loadSousTraitants(): void {
    this.stLoading.set(true);
    this.svc.listSousTraitants(this.paysId()).subscribe({
      next: l => { this.stList.set(l.filter(s => s.isActive)); this.stLoading.set(false); },
      error: () => this.stLoading.set(false),
    });
  }

  // ── Create / Edit OST ────────────────────────────────────────────────

  openCreateOst(): void {
    this.editOstTarget.set(null);
    const firstSt = this.stList()[0];
    this.ostForm = {
      sousTraitantId:       firstSt?.id ?? 0,
      perimetre:            '',
      montantBudget:        0,
      devise:               this.devise(),
      alerteDepassementPct: 10,
    };
    this.ostError.set(null);
    this.showOstModal.set(true);
  }

  openEditOst(o: OSTDto): void {
    this.editOstTarget.set(o);
    this.ostForm = {
      sousTraitantId:       o.sousTraitantId,
      perimetre:            o.perimetre,
      montantBudget:        o.montantBudget,
      devise:               o.devise,
      alerteDepassementPct: o.alerteDepassementPct,
    };
    this.ostError.set(null);
    this.showOstModal.set(true);
  }

  saveOst(): void {
    if (!this.ostForm.perimetre.trim() || !this.ostForm.sousTraitantId || this.ostForm.montantBudget <= 0) return;
    this.ostSaving.set(true);
    this.ostError.set(null);
    const req: CreateOSTRequest = {
      sousTraitantId:       +this.ostForm.sousTraitantId,
      perimetre:            this.ostForm.perimetre.trim(),
      montantBudget:        +this.ostForm.montantBudget,
      devise:               this.ostForm.devise || null,
      alerteDepassementPct: this.ostForm.alerteDepassementPct != null ? +this.ostForm.alerteDepassementPct : null,
    };
    const edit = this.editOstTarget();
    const call$ = edit
      ? this.svc.updateOST(edit.id, req)
      : this.svc.createOST(this.affaireId(), req);
    call$.subscribe({
      next: () => { this.ostSaving.set(false); this.showOstModal.set(false); this.loadOrdres(); },
      error: err => { this.ostSaving.set(false); this.ostError.set(err?.error?.message ?? 'Erreur lors de l\'enregistrement.'); },
    });
  }

  // ── Changer statut ────────────────────────────────────────────────────

  openStatutModal(o: OSTDto): void {
    this.statutTarget.set(o);
    const transitions = OST_VALID_TRANSITIONS[o.statut] ?? [];
    this.newStatut = transitions[0] ?? '';
    this.statutError.set(null);
    this.showStatutModal.set(true);
  }

  submitStatut(): void {
    const target = this.statutTarget();
    if (!target || !this.newStatut) return;
    this.statutSaving.set(true);
    this.svc.changerStatutOST(target.id, this.newStatut).subscribe({
      next: () => { this.statutSaving.set(false); this.showStatutModal.set(false); this.loadOrdres(); },
      error: err => { this.statutSaving.set(false); this.statutError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  validTransitionsFor(o: OSTDto): string[] {
    return OST_VALID_TRANSITIONS[o.statut] ?? [];
  }

  // ── Costs drawer ──────────────────────────────────────────────────────

  openDrawer(o: OSTDto): void {
    this.drawerOst.set(o);
    this.drawerOpen.set(true);
    this.showAddCout.set(false);
    this.coutError.set(null);
    this.coutForm = { montant: 0, dateCout: this.today, devise: o.devise, description: '' };
    this.coutsLoading.set(true);
    this.svc.listCouts(o.id).subscribe({
      next: l => { this.coutsList.set(l); this.coutsLoading.set(false); },
      error: () => this.coutsLoading.set(false),
    });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.drawerOst.set(null);
  }

  addCout(): void {
    const ost = this.drawerOst();
    if (!ost || !this.coutForm.montant || !this.coutForm.dateCout) return;
    this.coutSaving.set(true);
    this.coutError.set(null);
    const req: CreateCoutSTRequest = {
      montant:     +this.coutForm.montant,
      dateCout:    this.coutForm.dateCout,
      devise:      this.coutForm.devise || null,
      description: this.coutForm.description || null,
    };
    this.svc.addCout(ost.id, req).subscribe({
      next: () => {
        this.coutSaving.set(false);
        this.showAddCout.set(false);
        this.svc.listCouts(ost.id).subscribe(l => this.coutsList.set(l));
        this.loadOrdres();
      },
      error: err => { this.coutSaving.set(false); this.coutError.set(err?.error?.message ?? 'Erreur lors de l\'ajout.'); },
    });
  }

  removeCout(cout: CoutSTDto): void {
    const ost = this.drawerOst();
    if (!ost) return;
    this.svc.removeCout(ost.id, cout.id).subscribe({
      next: () => {
        this.svc.listCouts(ost.id).subscribe(l => this.coutsList.set(l));
        this.loadOrdres();
      },
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  budgetPct(o: OSTDto): number { return ostBudgetPct(o); }
  isOver(o: OSTDto): boolean   { return ostIsOver(o); }
  statLabel(s: string): string { return OST_STATUT_LABELS[s] ?? s; }
  amt(v: number | null, d?: string): string { return fmtAmt(v, d ?? this.devise()); }
  fmtDate(d: string): string { return new Date(d).toLocaleDateString('fr-FR'); }

  statColor(statut: string): { bg: string; color: string; border: string } {
    const map: Record<string, { bg: string; color: string; border: string }> = {
      EN_COURS: { bg: '#e0f5f8', color: '#1a6b7c', border: '#1a6b7c' },
      SUSPENDU: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
      CLOTURE:  { bg: '#f1f5f9', color: '#475569', border: '#94a3b8' },
    };
    return map[statut] ?? { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  }
}
