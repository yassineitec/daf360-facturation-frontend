/** Number of decimal digits a currency is conventionally displayed with — TND (Tunisian
 * Dinar) subdivides into 1000 millimes, so it natively uses 3, unlike EUR/USD's 2. Used
 * anywhere amounts are formatted without Intl.NumberFormat's `style: 'currency'` (which
 * already applies this per ISO 4217 automatically). */
export function currencyFractionDigits(currency: string | null | undefined): number {
  return currency === 'TND' ? 3 : 2;
}
