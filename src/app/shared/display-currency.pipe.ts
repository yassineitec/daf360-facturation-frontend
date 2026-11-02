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
    const target      = this.displaySvc.selectedCurrency();
    const converted   = this.ratesSvc.convert(amount, sourceCurrency, target);
    const approximate = this.ratesSvc.needsFallbackRate(sourceCurrency) || this.ratesSvc.needsFallbackRate(target);
    const prefix       = approximate ? '≈ ' : '';
    try {
      return prefix + new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: target,
      }).format(converted);
    } catch {
      const digits = currencyFractionDigits(target);
      return `${prefix}${converted.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${target}`;
    }
  }
}
