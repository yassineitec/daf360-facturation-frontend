import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
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
  imports: [CommonModule, FormsModule, TranslatePipe, SelectComponent],
  templateUrl: './rate-computation.component.html',
  styleUrl: './rate-computation.component.scss',
})
export class RateComputationComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);

  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  /**
   * Le pays se choisit dans une LISTE DÉROULANTE avec recherche, et non plus dans une
   * bande d'onglets.
   *
   * <p>Les onglets tenaient tant que `pays_ref` portait onze lignes. Depuis V75 elle porte
   * les 194 pays, et une bande de 194 boutons n'est pas une navigation : c'est un mur.
   * `daf-select` avec `searchable: true` fait le même travail en une ligne — et la
   * recherche porte sur le libellé affiché, donc « TN » comme « Tunisie » trouvent la
   * Tunisie.
   */
  readonly paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      label: `${p.frenchLabel} (${p.isoCode})`,
    })));

  readonly paysSelectConfig = computed(() => {
    this.translate.currentLang();
    return {
      // Clé existante de COST.FORM : « Pays / Entité ». Ici le pays EST le contexte
      // d'entité du calcul de taux, donc le libellé est juste — et pas besoin d'une
      // nouvelle clé dans les trois locales.
      label: this.translate.instant('COST.FORM.PAYS_LABEL'),
      searchable: true,
      fullWidth: false,
    };
  });

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0) this.selectPays(id);
  }

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

  rateStatusLabel(status: string): string {
    return this.translate.instant('COST.RATE.STATUS.' + status);
  }

  periodTypeLabel(type: string): string {
    return this.translate.instant('COST.RATE.PERIOD.' + type);
  }

  readonly months = computed(() => {
    this.translate.currentLang();
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: this.translate.instant('COST.RATE.MONTHS.M' + (i + 1)),
    }));
  });

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
          this.serverError.set(this.translate.instant('COST.RATE.NO_PAYS'));
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.serverError.set(this.translate.instant('COST.RATE.LOAD_PAYS_ERROR'));
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
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.RATE.LOAD_ERROR'));
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
      this.createError.set(this.translate.instant('COST.RATE.YEAR_REQUIRED'));
      return;
    }
    if (this.newRecord.periodType === 'QUARTERLY' && !this.newRecord.periodQuarter) {
      this.createError.set(this.translate.instant('COST.RATE.QUARTER_REQUIRED'));
      return;
    }
    if (this.newRecord.periodType === 'MONTHLY' && !this.newRecord.periodMonth) {
      this.createError.set(this.translate.instant('COST.RATE.MONTH_REQUIRED'));
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
        this.createError.set(err.error?.message ?? this.translate.instant('COST.RATE.CREATE_ERROR'));
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
        this.actionError.set(err.error?.message ?? this.translate.instant('COST.RATE.COMPUTE_ERROR'));
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
        this.actionError.set(err.error?.message ?? this.translate.instant('COST.RATE.VALIDATE_ERROR'));
        this.actionLoadingId.set(null);
      },
    });
  }

  periodLabel(rc: RateComputationDto): string {
    if (rc.periodType === 'QUARTERLY') return `${this.translate.instant('COST.RATE.QUARTER_SHORT')}${rc.periodQuarter} / ${rc.periodYear}`;
    if (rc.periodType === 'MONTHLY') {
      const m = this.months().find(x => x.value === rc.periodMonth);
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
