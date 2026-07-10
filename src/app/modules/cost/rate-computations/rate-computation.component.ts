import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import {
  RateComputationDto, CreateRateComputationRequest,
  RATE_COMPUTATION_STATUS_CONFIG,
} from '../cost.model';
import { PaysRefDto } from '../../affaires/affaire.model';

@Component({
  selector: 'app-rate-computation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rate-computation.component.html',
  styleUrl: './rate-computation.component.scss',
})
export class RateComputationComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);

  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  computations    = signal<RateComputationDto[]>([]);
  isLoading       = signal(false);
  serverError     = signal<string | null>(null);
  actionError     = signal<string | null>(null);
  actionLoadingId = signal<number | null>(null);

  showAddForm = signal(false);
  isCreating  = signal(false);
  createError = signal<string | null>(null);

  readonly currentYear = new Date().getFullYear();

  newRecord = {
    periodType:      'ANNUAL',
    periodYear:      this.currentYear,
    periodQuarter:   null as number | null,
    periodMonth:     null as number | null,
    hqCostPct:       5.0,
    targetMarginPct: 10.0,
    currency:        'EUR',
  };

  readonly STATUS_CONFIG = RATE_COMPUTATION_STATUS_CONFIG;

  readonly PERIOD_TYPE_LABELS: Record<string, string> = {
    ANNUAL:    'Annuel',
    QUARTERLY: 'Trimestriel',
    MONTHLY:   'Mensuel',
  };

  readonly MONTHS = [
    { value: 1, label: 'Janvier' }, { value: 2, label: 'Février' },
    { value: 3, label: 'Mars' },    { value: 4, label: 'Avril' },
    { value: 5, label: 'Mai' },     { value: 6, label: 'Juin' },
    { value: 7, label: 'Juillet' }, { value: 8, label: 'Août' },
    { value: 9, label: 'Septembre' },{ value: 10, label: 'Octobre' },
    { value: 11, label: 'Novembre' },{ value: 12, label: 'Décembre' },
  ];

  ngOnInit(): void {
    this.isLoading.set(true);
    forkJoin({
      myPays:  this.clientSvc.getMyPays(),
      allPays: this.clientSvc.getPays(),
    }).subscribe({
      next: ({ myPays, allPays }) => {
        this.paysList.set(allPays);
        const resolved = myPays ?? (allPays.length > 0 ? allPays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.load();
        } else {
          this.serverError.set('Aucun pays configuré.');
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.serverError.set('Impossible de charger les pays.');
        this.isLoading.set(false);
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.showAddForm.set(false);
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.serverError.set(null);
    this.actionError.set(null);
    this.svc.getRateComputations(this.paysId()).subscribe({
      next: list => {
        this.computations.set(list);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Erreur de chargement.');
        this.isLoading.set(false);
      },
    });
  }

  toggleAddForm(): void {
    this.showAddForm.update(v => !v);
    this.createError.set(null);
  }

  create(): void {
    if (!this.newRecord.periodYear) {
      this.createError.set('L\'année est requise.');
      return;
    }
    if (this.newRecord.periodType === 'QUARTERLY' && !this.newRecord.periodQuarter) {
      this.createError.set('Le trimestre est requis.');
      return;
    }
    if (this.newRecord.periodType === 'MONTHLY' && !this.newRecord.periodMonth) {
      this.createError.set('Le mois est requis.');
      return;
    }
    this.isCreating.set(true);
    this.createError.set(null);
    const req: CreateRateComputationRequest = {
      paysId:          this.paysId(),
      periodType:      this.newRecord.periodType,
      periodYear:      Number(this.newRecord.periodYear),
      periodQuarter:   this.newRecord.periodType === 'QUARTERLY' ? this.newRecord.periodQuarter : null,
      periodMonth:     this.newRecord.periodType === 'MONTHLY'   ? this.newRecord.periodMonth   : null,
      hqCostPct:       this.newRecord.hqCostPct       / 100,
      targetMarginPct: this.newRecord.targetMarginPct / 100,
      currency:        this.newRecord.currency || 'EUR',
    };
    this.svc.createRateComputation(req).subscribe({
      next: created => {
        this.computations.update(list => [created, ...list]);
        this.showAddForm.set(false);
        this.isCreating.set(false);
        this.newRecord = {
          periodType: 'ANNUAL', periodYear: this.currentYear,
          periodQuarter: null, periodMonth: null,
          hqCostPct: 5.0, targetMarginPct: 10.0, currency: 'EUR',
        };
      },
      error: err => {
        this.createError.set(err.error?.message ?? 'Erreur de création.');
        this.isCreating.set(false);
      },
    });
  }

  compute(rc: RateComputationDto): void {
    this.actionLoadingId.set(rc.id);
    this.actionError.set(null);
    this.svc.computeRateComputation(rc.id).subscribe({
      next: updated => {
        this.computations.update(list => list.map(r => r.id === updated.id ? updated : r));
        this.actionLoadingId.set(null);
      },
      error: err => {
        this.actionError.set(err.error?.message ?? 'Erreur lors du calcul.');
        this.actionLoadingId.set(null);
      },
    });
  }

  validate(rc: RateComputationDto): void {
    this.actionLoadingId.set(rc.id);
    this.actionError.set(null);
    this.svc.validateRateComputation(rc.id).subscribe({
      next: updated => {
        this.computations.update(list => list.map(r => r.id === updated.id ? updated : r));
        this.actionLoadingId.set(null);
      },
      error: err => {
        this.actionError.set(err.error?.message ?? 'Erreur lors de la validation.');
        this.actionLoadingId.set(null);
      },
    });
  }

  periodLabel(rc: RateComputationDto): string {
    if (rc.periodType === 'QUARTERLY') return `T${rc.periodQuarter} / ${rc.periodYear}`;
    if (rc.periodType === 'MONTHLY') {
      const m = this.MONTHS.find(x => x.value === rc.periodMonth);
      return `${m?.label ?? rc.periodMonth} ${rc.periodYear}`;
    }
    return `${rc.periodYear}`;
  }

  pct(v: number | null): string {
    if (v == null) return '—';
    return (v * 100).toFixed(1) + ' %';
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
  }
}
