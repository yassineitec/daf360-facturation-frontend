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
  rates = signal<Record<string, number>>({ EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4 });

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
    const fromRate = r[from.toUpperCase()] ?? 1;
    const toRate   = r[to.toUpperCase()]   ?? 1;
    return (amount / fromRate) * toRate;
  }
}
