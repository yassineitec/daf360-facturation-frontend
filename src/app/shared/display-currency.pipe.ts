import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyRateService } from '../core/currency-rate.service';
import { CurrencyDisplayService } from '../core/currency-display.service';
import { currencyFractionDigits } from './currency-decimals.util';

@Pipe({ name: 'displayCurrency', standalone: true, pure: false })
export class DisplayCurrencyPipe implements PipeTransform {
  private ratesSvc   = inject(CurrencyRateService);
  private displaySvc = inject(CurrencyDisplayService);

  transform(amount: number | null | undefined, sourceCurrency = 'TND'): string {
    if (amount == null) return '—';
    const target    = this.displaySvc.selectedCurrency();
    const converted = this.ratesSvc.convert(amount, sourceCurrency, target);
    try {
      // No minimumFractionDigits/maximumFractionDigits override — Intl.NumberFormat
      // already applies each ISO currency's own native decimal precision (2 for
      // EUR/USD, 3 for TND).
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: target,
      }).format(converted);
    } catch {
      const digits = currencyFractionDigits(target);
      return `${converted.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${target}`;
    }
  }
}
