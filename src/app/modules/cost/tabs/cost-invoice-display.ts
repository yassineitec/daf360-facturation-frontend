import { CostInvoiceDto, CostLineDto, costCategoryDisplay, localizedLabel } from '../cost.model';

/**
 * How a cost INVOICE (V93) is summarised on the list page and in the approval queue.
 *
 * The invoice is the unit of entry, approval and payment, but its category lives on each
 * of its lines — so every screen that shows "the category" of an invoice goes through
 * `invoiceCategorySummary()` here, and every category filter through
 * `invoiceHasCategory()` / `invoiceHasSubCategory()` (an invoice matches when ANY line does).
 */

/** DRAFT and RETURNED only — same rule `cost-display.canEdit()` applies to a status. */
export function canEditInvoice(inv: Pick<CostInvoiceDto, 'status'>): boolean {
  return inv.status === 'DRAFT' || inv.status === 'RETURNED';
}
export const canSubmitInvoice = canEditInvoice;

/** APPROVED and not paid yet — the backend refuses a second règlement on the same invoice. */
export function canReglementInvoice(inv: Pick<CostInvoiceDto, 'status' | 'reglement'>): boolean {
  return inv.status === 'APPROVED' && !inv.reglement;
}

/** What is paid to the supplier: TTC minus the retenue à la source. */
export function invoicePayableAmount(inv: CostInvoiceDto): number {
  return inv.netToPay ?? (inv.grossAmountLocal - (inv.rsAmount ?? 0));
}

/** Distinct categories of the invoice's lines, in line order, localized. */
export function invoiceCategories(
  inv: Pick<CostInvoiceDto, 'lines'>, lang: string | null | undefined,
): { id: number; label: string }[] {
  const seen = new Map<number, string>();
  for (const l of inv.lines ?? []) {
    if (l.costCategoryId != null && !seen.has(l.costCategoryId)) {
      seen.set(l.costCategoryId,
        localizedLabel(l.costCategoryLabel, l.costCategoryLabelEn, lang) ?? String(l.costCategoryId));
    }
  }
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** Distinct sub-categories of the invoice's lines, localized. */
export function invoiceSubCategories(
  inv: Pick<CostInvoiceDto, 'lines'>, lang: string | null | undefined,
): { id: number; label: string }[] {
  const seen = new Map<number, string>();
  for (const l of inv.lines ?? []) {
    if (l.costSubCategoryId != null && !seen.has(l.costSubCategoryId)) {
      seen.set(l.costSubCategoryId,
        localizedLabel(l.costSubCategoryLabel, l.costSubCategoryLabelEn, lang) ?? String(l.costSubCategoryId));
    }
  }
  return [...seen].map(([id, label]) => ({ id, label }));
}

/**
 * One category for the whole invoice → that category (with the sub-category when every
 * line shares it); several → "first +N" (COST.LINES.CATEGORY_MORE); none → "—".
 */
export function invoiceCategorySummary(
  inv: Pick<CostInvoiceDto, 'lines'>,
  lang: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const cats = invoiceCategories(inv, lang);
  if (cats.length === 0) return '—';
  if (cats.length === 1) {
    const subs = invoiceSubCategories(inv, lang);
    const lines = inv.lines ?? [];
    const allShareSub = subs.length === 1 && lines.every(l => l.costSubCategoryId === subs[0].id);
    return allShareSub
      ? costCategoryDisplay({ costCategoryLabel: cats[0].label, costSubCategoryLabel: subs[0].label })
      : cats[0].label;
  }
  return t('COST.LINES.CATEGORY_MORE', { first: cats[0].label, count: cats.length - 1 });
}

export function invoiceHasCategory(inv: Pick<CostInvoiceDto, 'lines'>, categoryId: number): boolean {
  return (inv.lines ?? []).some((l: CostLineDto) => l.costCategoryId === categoryId);
}

export function invoiceHasSubCategory(inv: Pick<CostInvoiceDto, 'lines'>, subCategoryId: number): boolean {
  return (inv.lines ?? []).some((l: CostLineDto) => l.costSubCategoryId === subCategoryId);
}

/** Search haystack: reference, supplier, supplier invoice number, every line description. */
export function invoiceMatchesText(inv: CostInvoiceDto, q: string): boolean {
  if (!q) return true;
  return [
    inv.reference, inv.supplierName, inv.supplierInvoiceNumber, inv.notes,
    ...(inv.lines ?? []).map(l => l.label),
  ].some(v => (v ?? '').toLowerCase().includes(q));
}
