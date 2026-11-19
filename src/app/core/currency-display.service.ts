import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fact_display_currency';

// employee-cost.component.ts, ts-form.component.ts and expense-form.component.ts each
// import this directly for their own currency-options fallback list (shown only when the
// per-pays CURRENCY configurable list fails or returns empty), so the three can no longer
// drift into their own stale, independently-maintained copies.
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
