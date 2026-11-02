import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SUPPORTED_CURRENCIES } from './currency-display.service';

const CACHE_KEY = 'fact_currency_rates';
const CACHE_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry {
  rates: Record<string, number>;
  ts: number;
}

/** Approximate rates (1 EUR = X currency), used as the initial signal value AND as the
 *  per-currency fallback inside convert() when a specific currency isn't in the live/cached set. */
const FALLBACK_RATES: Record<string, number> = { EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4, SAR: 4.05, AED: 3.97 };

/** A rate set is only trustworthy if EUR is ~1 (the base currency) and every currency this app
 *  actually offers is present as a finite, positive number. Rejects a degenerate/corrupted set
 *  (e.g. all currencies collapsed to the same value) rather than silently using it. */
function isValidRateSet(rates: unknown): rates is Record<string, number> {
  if (!rates || typeof rates !== 'object') return false;
  const r = rates as Record<string, unknown>;
  const eur = r['EUR'];
  if (typeof eur !== 'number' || !Number.isFinite(eur) || Math.abs(eur - 1) > 0.0001) return false;
  for (const code of SUPPORTED_CURRENCIES) {
    const v = r[code];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return false;
  }
  return true;
}

@Injectable({ providedIn: 'root' })
export class CurrencyRateService {
  private http = inject(HttpClient);

  // Approximate fallback rates (1 EUR = X currency). Updated live from API. Spread into a new
  // object rather than handing out FALLBACK_RATES itself — an in-place write on the signal's
  // current value would otherwise silently poison the shared fallback table forever.
  rates = signal<Record<string, number>>({ ...FALLBACK_RATES });

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
        if (Date.now() - entry.ts < CACHE_TTL && isValidRateSet(entry.rates)) {
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
        if (!isValidRateSet(rates)) {
          console.warn('[CurrencyRateService] Fetched rate set failed validation — keeping existing rates.');
          return;
        }
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
    const fromRate = r[fromKey] ?? FALLBACK_RATES[fromKey] ?? 1;
    const toRate   = r[toKey]   ?? FALLBACK_RATES[toKey]   ?? 1;
    return (amount / fromRate) * toRate;
  }

  /** True when converting this currency code would need FALLBACK_RATES because it isn't in the
   *  current live/cached rate set — callers displaying a converted amount should flag the result
   *  as approximate rather than presenting it as exact. */
  needsFallbackRate(code: string): boolean {
    return !(code.toUpperCase() in this.rates());
  }

  private warnOnceIfMissing(key: string): void {
    if (key in this.rates() || this.warnedMissingCurrencies.has(key)) return;
    this.warnedMissingCurrencies.add(key);
    console.warn(`[CurrencyRateService] No rate for '${key}' — falling back to an approximate rate.`);
  }
}
