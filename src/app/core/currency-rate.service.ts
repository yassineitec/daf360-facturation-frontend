import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const CACHE_KEY = 'fact_currency_rates';
const CACHE_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry {
  rates: Record<string, number>;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class CurrencyRateService {
  private http = inject(HttpClient);

  // Approximate fallback rates (1 EUR = X currency). Updated live from API.
  rates = signal<Record<string, number>>({ EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4, SAR: 4.05, AED: 3.97 });

  // Tracks currency codes already warned about so convert() — called from the
  // pure: false DisplayCurrencyPipe on every change-detection cycle — logs
  // each missing currency once instead of flooding the console.
  private readonly warnedMissingCurrencies = new Set<string>();

  constructor() {
    this.load();
  }

  private load(): void {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const entry: CacheEntry = JSON.parse(cached);
        if (Date.now() - entry.ts < CACHE_TTL) {
          this.rates.set(entry.rates);
          return;
        }
      } catch {}
    }
    this.fetch();
  }

  private fetch(): void {
    this.http.get<{ conversion_rates: Record<string, number> }>(
      'https://open.exchangerate-api.com/v6/latest/EUR'
    ).subscribe({
      next: resp => {
        const rates = { ...resp.conversion_rates, EUR: 1 };
        this.rates.set(rates);
        const entry: CacheEntry = { rates, ts: Date.now() };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch {}
      },
      error: () => {
        // Keep the default fallback rates already set
      },
    });
  }

  convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const r = this.rates();
    const fromKey = from.toUpperCase();
    const toKey = to.toUpperCase();
    this.warnOnceIfMissing(fromKey);
    this.warnOnceIfMissing(toKey);
    const fromRate = r[fromKey] ?? 1;
    const toRate   = r[toKey]   ?? 1;
    return (amount / fromRate) * toRate;
  }

  private warnOnceIfMissing(key: string): void {
    if (key in this.rates() || this.warnedMissingCurrencies.has(key)) return;
    this.warnedMissingCurrencies.add(key);
    console.warn(`[CurrencyRateService] No rate for '${key}' — falling back to 1 (result is wrong).`);
  }
}
