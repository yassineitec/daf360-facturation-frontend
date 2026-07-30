import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyRateService } from '../core/currency-rate.service';
import { CurrencyDisplayService } from '../core/currency-display.service';

@Pipe({ name: 'displayCurrency', standalone: true, pure: false })
export class DisplayCurrencyPipe implements PipeTransform {
  private ratesSvc   = inject(CurrencyRateService);
  private displaySvc = inject(CurrencyDisplayService);

  transform(amount: number | null | undefined, sourceCurrency = 'TND'): string {
    if (amount == null) return '—';
    const target    = this.displaySvc.selectedCurrency();
    const converted = this.ratesSvc.convert(amount, sourceCurrency, target);
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: target,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(converted);
    } catch {
      return `${Math.round(converted).toLocaleString('fr-FR')} ${target}`;
    }
  }
}
