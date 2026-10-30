import { CurrencyRateService } from '../core/currency-rate.service';
import { CurrencyDisplayService } from '../core/currency-display.service';
import { DisplayCurrencyPipe } from './display-currency.pipe';

describe('DisplayCurrencyPipe', () => {
  function makePipe(rates: Record<string, number>, target: string): DisplayCurrencyPipe {
    const pipe = Object.create(DisplayCurrencyPipe.prototype) as DisplayCurrencyPipe;
    (pipe as any).ratesSvc = { convert: (amount: number, from: string, to: string) => {
      if (from === to) return amount;
      const r = rates;
      return (amount / (r[from] ?? 1)) * (r[to] ?? 1);
    }, needsFallbackRate: (code: string) => !(code in rates) } as Partial<CurrencyRateService>;
    (pipe as any).displaySvc = { selectedCurrency: () => target } as Partial<CurrencyDisplayService>;
    return pipe;
  }

  it('does not prefix the result when both currencies resolve from real rates', () => {
    const pipe = makePipe({ EUR: 1, TND: 3.35 }, 'TND');
    expect(pipe.transform(100, 'EUR')).not.toContain('≈');
  });

  it('prefixes the result with "≈ " when the target currency needed a fallback rate', () => {
    const pipe = makePipe({ EUR: 1 }, 'TND'); // TND absent -> needs fallback
    expect(pipe.transform(100, 'EUR').startsWith('≈ ')).toBe(true);
  });

  it('prefixes the result with "≈ " when the source currency needed a fallback rate', () => {
    const pipe = makePipe({ EUR: 1 }, 'EUR'); // source 'TND' absent -> needs fallback, even though target is fine
    expect(pipe.transform(100, 'TND').startsWith('≈ ')).toBe(true);
  });
});
