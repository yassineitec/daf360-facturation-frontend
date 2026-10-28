import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fact_display_currency';

// employee-cost.component.ts, ts-form.component.ts and expense-form.component.ts each
// keep their own hardcoded currency-options fallback list, independent of this constant
// and currently stale (missing EGP/SAR/AED). They should eventually be reconciled against
// SUPPORTED_CURRENCIES, or better, refactored to import it directly.
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'TND', 'EGP', 'SAR', 'AED'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

@Injectable({ providedIn: 'root' })
export class CurrencyDisplayService {
  selectedCurrency = signal<string>(
    localStorage.getItem(STORAGE_KEY) ?? 'EUR'
  );

  setCurrency(code: string): void {
    this.selectedCurrency.set(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }
}
