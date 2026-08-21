import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { EmployeeCostService } from './employee-cost.service';
import {
  EmployeeCostDto, EmployeeCostDriverField, deriveEmployeeCostFields,
} from './employee-cost.model';

@Component({
  selector: 'app-employee-cost',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './employee-cost.component.html',
  styleUrl: './employee-cost.component.scss',
})
export class EmployeeCostComponent implements OnInit {
  private readonly svc       = inject(EmployeeCostService);
  private readonly translate = inject(TranslateService);

  rows            = signal<EmployeeCostDto[]>([]);
  isLoading       = signal(false);
  serverError     = signal<string | null>(null);
  showActiveOnly  = signal(true);

  showAddForm = signal(false);
  isSaving    = signal(false);
  saveError   = signal<string | null>(null);
  editingId   = signal<number | null>(null);

  readonly currentYear = new Date().getFullYear();

  newRecord = {
    employeeEmail: '',
    driver: 'basic' as EmployeeCostDriverField,
    basicCost: null as number | null,
    internalSellingCost: null as number | null,
    externalSellingCost: null as number | null,
    dateDebut: `${this.currentYear}-01-01`,
    dateFin: `${this.currentYear}-12-31`,
  };

  readonly visibleRows = computed(() =>
    this.showActiveOnly() ? this.rows().filter(r => r.sourceStatus === 'Current') : this.rows());

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.list().subscribe({
      next: list => {
        this.rows.set(list);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  toggleActiveOnly(): void {
    this.showActiveOnly.update(v => !v);
  }

  toggleAddForm(): void {
    this.showAddForm.update(v => !v);
    this.editingId.set(null);
    this.saveError.set(null);
    this.resetNewRecord();
  }

  /** Whichever field the person types into becomes the driver; the other two
   * immediately recompute — impossible to save numbers that don't satisfy the
   * fixed 1.1 / 1.2 markup formula. */
  onFieldInput(driver: EmployeeCostDriverField, value: number | null): void {
    this.newRecord.driver = driver;
    if (value === null || value === undefined) {
      this.newRecord.basicCost = null;
      this.newRecord.internalSellingCost = null;
      this.newRecord.externalSellingCost = null;
      return;
    }
    const derived = deriveEmployeeCostFields(driver, value);
    this.newRecord.basicCost = derived.basicCost;
    this.newRecord.internalSellingCost = derived.internalSellingCost;
    this.newRecord.externalSellingCost = derived.externalSellingCost;
  }

  save(): void {
    if (!this.newRecord.employeeEmail || this.newRecord.basicCost === null) {
      this.saveError.set(this.translate.instant('COST.EMPLOYEE_COST.FIELDS_REQUIRED'));
      return;
    }
    this.isSaving.set(true);
    this.saveError.set(null);

    const req = {
      basicCost: this.newRecord.basicCost,
      dateDebut: this.newRecord.dateDebut,
      dateFin: this.newRecord.dateFin,
    };

    const request$ = this.editingId() !== null
      ? this.svc.update(this.editingId()!, req)
      : this.svc.create({ employeeEmail: this.newRecord.employeeEmail, ...req });

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showAddForm.set(false);
        this.editingId.set(null);
        this.resetNewRecord();
        this.load();
      },
      error: err => {
        this.saveError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.SAVE_ERROR'));
        this.isSaving.set(false);
      },
    });
  }

  edit(row: EmployeeCostDto): void {
    this.editingId.set(row.id);
    this.newRecord = {
      employeeEmail: row.employeeEmail,
      driver: 'basic',
      basicCost: row.basicCost,
      internalSellingCost: row.internalSellingCost,
      externalSellingCost: row.externalSellingCost,
      dateDebut: row.dateDebut,
      dateFin: row.dateFin,
    };
    this.showAddForm.set(true);
  }

  remove(row: EmployeeCostDto): void {
    this.svc.delete(row.id).subscribe({
      next: () => this.load(),
      error: err => this.serverError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.DELETE_ERROR')),
    });
  }

  private resetNewRecord(): void {
    this.newRecord = {
      employeeEmail: '',
      driver: 'basic',
      basicCost: null,
      internalSellingCost: null,
      externalSellingCost: null,
      dateDebut: `${this.currentYear}-01-01`,
      dateFin: `${this.currentYear}-12-31`,
    };
  }

  statusLabel(status: string | null): string {
    if (status === 'Current') return this.translate.instant('COST.EMPLOYEE_COST.STATUS_ACTIVE');
    if (status === 'Expired') return this.translate.instant('COST.EMPLOYEE_COST.STATUS_EXPIRED');
    return '—';
  }
}
