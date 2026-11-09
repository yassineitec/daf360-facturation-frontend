/**
 * P&L monthly exchange-rates admin (WP6(f,h,i)/DEC19 in daf360-facturation-service). Mirrors the
 * real backend DTOs in `modules/cost/dto/*` — do not rename a field without checking the Java
 * record first. Gated by `FACT_MANAGE_FX_RATES`, distinct from `FACT_ADMIN_PL_CATALOGUE`.
 */

export type PlFxRateStatus = 'SEED' | 'DERIVED' | 'SOURCED' | 'CONFIRMED' | 'REVIEW';

/** One row of `pl_monthly_exchange_rates`. */
export interface PlMonthlyExchangeRateDto {
  id: number;
  currencyPair: string;
  rateYear: number;
  rateMonth: number;
  rateMonthEnd: number | null;
  rateMonthAvg: number | null;
  nLines: number | null;
  rateMin: number | null;
  rateMax: number | null;
  status: PlFxRateStatus;
  source: string;
  comment: string | null;
  createdBy: number | null;
  createdAt: string | null;
  confirmedBy: number | null;
  confirmedAt: string | null;
}

export interface DeriveRatesRequest {
  currencyPair: string;
  /** `YYYY-MM` — matches Java's `YearMonth` JSON (de)serialization. */
  fromMonth: string;
  toMonth: string;
}

export interface DeriveRatesResultDto {
  derivedOrUpdated: PlMonthlyExchangeRateDto[];
  skippedConfirmedMonths: string[];
  monthsWithNoData: string[];
}

/** WP6(h) — one month's "rates used" entry for a closed period, shown in-app before export,
 *  never in the workbook itself. */
export interface RatesUsedPanelRowDto {
  currencyPair: string;
  rateYear: number;
  rateMonth: number;
  minRateApplied: number | null;
  maxRateApplied: number | null;
  anyFallbackUsed: boolean;
  frozenLineRateCount: number;
}
