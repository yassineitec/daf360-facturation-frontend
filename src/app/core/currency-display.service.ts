import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fact_display_currency';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'TND', 'EGP'] as const;
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
