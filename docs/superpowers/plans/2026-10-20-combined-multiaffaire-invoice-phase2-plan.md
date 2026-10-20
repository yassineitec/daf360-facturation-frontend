# Combined Multi-Affaire Invoice — Phase 2 (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend work correctly against the backend's new `validateDFCombined()` endpoint, and let a combined (multi-affaire) invoice be reviewed read-only through the existing wizard and detail page, without touching how a standard single-affaire invoice behaves.

**Architecture:** Fix the now-mismatched DTOs/response-handling in the approval queue (currently broken, not just unpolished). Add a new, explicitly-gated "combined invoice" read-only branch to `step-affaire.component.ts` and `step-lines.component.ts` — every existing per-mode branch in both files stays untouched, since the backend's Phase 1 fallback logic already lets a standard invoice's lines keep sending no per-line `affaireId`/`billingMode` at all. Fix `invoice-detail.component.ts`'s matching display gap.

**Tech Stack:** Angular (standalone components, signals), RxJS, `@khalilrebhiitec/daf360` component library.

---

## Context for the implementer

Read `docs/superpowers/specs/2026-10-20-combined-multiaffaire-invoice-phase2-design.md` (in the `daf360-facturation-service` repo) first for the full rationale. Short version: a prior phase changed the backend so DF-validating WIP across multiple affaires now produces ONE combined invoice instead of one-per-affaire — but the frontend was never updated and is currently broken against it (wrong response shape) and would misbehave if a combined invoice were ever opened in the wizard (wrong columns, and saving would silently discard the invoice's real per-affaire data).

**Important simplification found during planning**: the backend's Phase 1 fix already makes a line's `affaireId`/`billingMode` optional from the frontend's point of view — when absent, it falls back to the invoice's own single affaire/mode, which is exactly what every existing single-affaire mode (FORFAIT/RÉGIE/LIVRABLE/TS/ACOMPTE) already does today. **None of `step-lines.component.ts`'s five existing `next()` branches need to change.** Only the new, explicitly-combined-only branch needs to send real per-line values, because only a combined invoice has more than one affaire to disambiguate.

---

### Task 1: Fix the approval queue against the new backend response, and simplify "Valider"

**Files:**
- Modify: `src/app/modules/affaires/billing/billing.service.ts`
- Modify: `src/app/modules/affaires/billing/approval-queue.component.ts`
- Modify: `src/app/modules/affaires/billing/approval-queue.component.html`
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

The current frontend still expects the OLD per-affaire-batch response shape (`{succeeded, failures}`), but the backend now returns `{invoiceId, skipped}`. This is broken today, not a nice-to-have.

- [ ] **Step 1: Replace the old DTOs in `billing.service.ts`**

Read the file first to find the exact current location of `DFBatchFailureDto`/`DFBatchValidationResultDto` (around line 38-49) and `validateDFBatch()` (around line 213-216). Replace:

```typescript
/** One affaire group DFValidationService.validateDFBatchMultiAffaire() skipped. */
export interface DFBatchFailureDto {
  affaireId:        number;
  affaireReference: string | null;
  reason:           string;
}

/** Response of the now-cross-affaire-aware validate-batch endpoint. `succeeded` lines from
 * the same affaire share one invoiceId; lines from different affaires don't. */
export interface DFBatchValidationResultDto {
  succeeded: BillingLineDto[];
  failures:  DFBatchFailureDto[];
}
```

with:

```typescript
/** One billing line DFValidationService.validateDFCombined() left out of the combined
 * invoice -- either it failed its own validation or its affaire's currency/pays didn't
 * match the rest of the selection. */
export interface SkippedLineDto {
  lineId:    number;
  affaireId: number;
  reason:    string;
}

/** Response of the now-combined-invoice-aware validate-batch endpoint -- unlike the
 * per-affaire batching it replaces, there is only ever one invoice now. */
export interface DFCombinedValidationResultDto {
  invoiceId: number;
  skipped:   SkippedLineDto[];
}
```

Replace `validateDFBatch()`:

```typescript
  /** Bulk variant of validateDF() -- builds ONE invoice from lines that may span several
   * affaires, billing modes, and clients. `clientId` is only required when the selected
   * lines' affaires don't already share one client. */
  validateDFBatch(lineIds: number[], clientId?: number | null): Observable<DFCombinedValidationResultDto> {
    return this.http.post<DFCombinedValidationResultDto>(
      `${this.base}/billing/df/lines/validate-batch`, { lineIds, clientId: clientId ?? null }, this.opts);
  }
```

- [ ] **Step 2: Update `approval-queue.component.ts`'s imports and `batchResult` signal**

Read the file first. Replace the import of `DFBatchFailureDto` (around line 19) with `SkippedLineDto`. Remove the `batchResult` signal entirely (around line 212-218) — there's no longer a list of multiple invoices to show, so there's nothing to render after navigating away. Remove `CardComponent`/`CardOptions`/`ButtonComponent` from the `@khalilrebhiitec/daf360` import list IF (check first) nothing else in this file still uses them — `daf-button`/`daf-card` were only added for the now-removed results panel.

- [ ] **Step 3: Add an affaire→client resolver and rewrite `doValidateSelection()`**

Read `AffaireService` (`src/app/modules/affaires/affaire.service.ts`) to confirm `getAffaire(id: number): Observable<AffaireDetail>` exists and `AffaireDetail`/`AffaireListItem` carry `clientId: number | null` and `clientName: string | null` (already confirmed during planning — these fields exist). Inject it: `private readonly affSvc = inject(AffaireService);` (add the import `import { AffaireService } from '../affaire.service';` near the component's other imports — check the exact relative path first, since this component lives one level deeper than `affaire.service.ts`).

Add a new signal and replace `doValidateSelection()` (around line 1201-1218) and the two helper methods below it that only existed for the results panel (`dismissBatchResult()`, `openCreatedInvoice()`, `batchResultCardOptions()` — around lines 1220-1243, remove all three):

```typescript
  /** Set only when the current selection spans more than one client -- lets the template
   * show a small picker instead of calling validateDFBatch() with an ambiguous selection.
   * null the rest of the time. */
  readonly clientPickerOptions = signal<{ clientId: number; clientName: string }[] | null>(null);
  private pendingValidateIds: number[] | null = null;
  private pendingValidateSelection: RowSelection | null = null;

  /** Bulk variant of doValidateDF() -- shared by the Forfaitaire, Régie and TS tabs. Builds
   * ONE invoice from everything selected, which may now span several affaires/modes/clients.
   * Resolves client ambiguity client-side BEFORE calling the backend (rather than reacting
   * to a server error), so the common single-client case never pays for an extra round trip
   * it doesn't need. */
  doValidateSelection(selection: RowSelection): void {
    const ids = [...selection.ids()];
    if (ids.length === 0) return;

    const affaireIds = [...new Set(
      this.pendingLines().filter(l => ids.includes(l.id)).map(l => l.affaireId),
    )];

    if (affaireIds.length <= 1) {
      this.runValidateSelection(ids, selection, null);
      return;
    }

    forkJoin(affaireIds.map(id => this.affSvc.getAffaire(id))).subscribe({
      next: affaires => {
        const distinctClients = new Map<number, string>();
        for (const a of affaires) {
          if (a.clientId != null) distinctClients.set(a.clientId, a.clientName ?? `#${a.clientId}`);
        }
        if (distinctClients.size <= 1) {
          this.runValidateSelection(ids, selection, null);
          return;
        }
        this.pendingValidateIds = ids;
        this.pendingValidateSelection = selection;
        this.clientPickerOptions.set(
          [...distinctClients.entries()].map(([clientId, clientName]) => ({ clientId, clientName })));
      },
    });
  }

  /** Called when the user picks a client from clientPickerOptions(). */
  chooseClientForValidation(clientId: number): void {
    const ids = this.pendingValidateIds;
    const selection = this.pendingValidateSelection;
    this.clientPickerOptions.set(null);
    this.pendingValidateIds = null;
    this.pendingValidateSelection = null;
    if (ids && selection) this.runValidateSelection(ids, selection, clientId);
  }

  cancelClientPicker(): void {
    this.clientPickerOptions.set(null);
    this.pendingValidateIds = null;
    this.pendingValidateSelection = null;
  }

  private runValidateSelection(ids: number[], selection: RowSelection, clientId: number | null): void {
    this.svc.validateDFBatch(ids, clientId).subscribe({
      next: result => {
        selection.clear();
        if (result.skipped.length > 0) {
          const reasons = [...new Set(result.skipped.map(s => s.reason))].join(' ; ');
          this.toast.warning(this.translate.instant(
            'AFFAIRES.billing.approval.batch_result_some_skipped', { count: result.skipped.length, reasons }));
        }
        this.router.navigate(['/finance/invoicing', result.invoiceId, 'edit'],
          { queryParams: { fromApproval: 1 } });
      },
    });
  }
```

Add `import { ToastService } from '../../../../core/toast.service';` (check the exact relative path first — `core/toast.service.ts` is at `src/app/core/`) and `private readonly toast = inject(ToastService);` alongside the component's other injections. Add `import { forkJoin } from 'rxjs';` if not already imported (check the existing `rxjs` import line first — `forkJoin`/`Observable`/`switchMap` may already be partially imported).

- [ ] **Step 4: Replace the results-panel template with the client picker**

Read `approval-queue.component.html` first to find the exact current `@if (batchResult(); as result) { ... }` block (built for the old per-affaire results — a `<section>` with `daf-card`s). Replace that whole block with:

```html
  @if (clientPickerOptions(); as options) {
    <section class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <span class="font-medium">{{ 'AFFAIRES.billing.approval.client_picker_title' | translate }}</span>
      <div class="flex flex-wrap gap-2">
        @for (opt of options; track opt.clientId) {
          <daf-button
            [options]="{ label: opt.clientName, variant: 'secondary', size: 'sm' }"
            (onClick)="chooseClientForValidation(opt.clientId)" />
        }
      </div>
      <daf-button
        [options]="{ label: ('AFFAIRES.billing.approval.client_picker_cancel' | translate), variant: 'ghost', size: 'sm' }"
        (onClick)="cancelClientPicker()" />
    </section>
  }
```

Keep `ButtonComponent` (`daf-button`) in the component's `imports` array for this.

- [ ] **Step 5: Add/update i18n keys**

In `public/i18n/fr.json`, find the `AFFAIRES.billing.approval` section (has `batch_result_title`/`batch_result_dismiss`/`batch_result_invoice`/`batch_result_open`/`batch_result_skipped` from a prior feature). Replace those 5 keys (no longer used) with:

```json
        "client_picker_title": "Plusieurs clients sont concernés — choisissez celui de cette facture :",
        "client_picker_cancel": "Annuler",
        "batch_result_some_skipped": "{{count}} ligne(s) ignorée(s) : {{reasons}}",
```

In `public/i18n/en.json`, same section, replace the 5 old keys with:

```json
        "client_picker_title": "Several clients are involved — choose which one this invoice bills to:",
        "client_picker_cancel": "Cancel",
        "batch_result_some_skipped": "{{count}} line(s) skipped: {{reasons}}",
```

- [ ] **Step 6: Build**

Run: `npx ng build --configuration development`
Expected: clean build, zero new errors (pre-existing SCSS `@import` deprecation warnings are fine).

- [ ] **Step 7: Commit**

```bash
git add src/app/modules/affaires/billing/billing.service.ts src/app/modules/affaires/billing/approval-queue.component.ts src/app/modules/affaires/billing/approval-queue.component.html public/i18n/fr.json public/i18n/en.json
git commit -m "fix: update approval queue for the combined-invoice validate-batch response"
```

---

### Task 2: Add `affaireId`/`billingMode` to the frontend's line models

**Files:**
- Modify: `src/app/modules/invoicing/invoice.model.ts`
- Modify: `src/app/modules/invoicing/invoice-new/steps/step-lines.component.ts`

Purely additive TypeScript interface changes — no existing branch's behavior changes, since every existing mode keeps NOT populating these two fields (the backend's fallback already handles that correctly).

- [ ] **Step 1: Add the fields to `invoice.model.ts`**

In `InvoiceLine` (response, around line 10-37), add after `sourceExpenseId?: number;`:

```typescript
  // Combined (multi-affaire) invoices only -- which affaire/mode this specific line
  // belongs to. null/absent for every standard single-affaire invoice, where the whole
  // invoice's own affaireId/billingMode already apply to every line.
  affaireId?:   number | null;
  billingMode?: string | null;
```

In `InvoiceLineRequest` (request, around line 157-173), add the same two fields in the same relative position.

- [ ] **Step 2: Add the fields to `StepLinesValue` in `step-lines.component.ts`**

Read the file first to find the exact current `StepLinesValue.lines[]` shape (around line 16-46). Add after `sourceExpenseId?: number;`:

```typescript
    // Combined (multi-affaire) invoices only -- see isCombined() further down. Absent for
    // every other mode.
    affaireId?:   number;
    billingMode?: string;
```

- [ ] **Step 3: Build**

Run: `npx ng build --configuration development`
Expected: clean build (these are optional fields nothing currently reads or writes, so nothing should break).

- [ ] **Step 4: Commit**

```bash
git add src/app/modules/invoicing/invoice.model.ts src/app/modules/invoicing/invoice-new/steps/step-lines.component.ts
git commit -m "feat: add affaireId/billingMode to the frontend's invoice line models"
```

---

### Task 3: `step-affaire.component.ts` — combined-invoice edit mode

**Files:**
- Modify: `src/app/modules/invoicing/invoice-new/steps/step-affaire.component.ts`

When editing an existing combined invoice, `initialValue()` is non-null but its `affaireId` is `null` — today this silently falls through to `preselectFromQuery()` (which does nothing useful here), leaving the user looking at a blank affaire-search box instead of their invoice's actual context.

- [ ] **Step 1: Add an `isCombinedInvoice` signal**

Read the file first to find `ngOnInit()` (around line 251-264) and `next()` (around line 367-382). Add near the other computed signals (e.g. near `validBillingModeFromAffaire`, around line 219-222):

```typescript
  /** True only when editing an existing invoice that has no single affaire (a combined,
   * multi-affaire invoice from a prior phase) -- never true when creating a new invoice,
   * since initialValue() is null in that case. */
  readonly isCombinedInvoice = computed(() => {
    const iv = this.initialValue();
    return iv != null && iv.affaireId == null;
  });
```

- [ ] **Step 2: Branch `ngOnInit()` to skip the affaire search for a combined invoice**

Replace:

```typescript
    const iv = this.initialValue();
    if (iv?.affaireId) this.preselectForEdit(iv);
    else this.preselectFromQuery();
```

with:

```typescript
    const iv = this.initialValue();
    if (iv?.affaireId) {
      this.preselectForEdit(iv);
    } else if (iv) {
      // Combined invoice: nothing to search for or preselect -- iv already carries the
      // real clientId/paysId/currency/billingMode from the invoice itself (see next()
      // below, which just re-emits them unchanged).
      this.form.patchValue({ invoiceType: iv.invoiceType, billingMode: iv.billingMode });
    } else {
      this.preselectFromQuery();
    }
```

- [ ] **Step 3: Branch `next()` to pass the invoice's own values through for a combined invoice**

Replace:

```typescript
  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.rafBlocked() || this.rafLoading()) return;
    const v = this.form.getRawValue();
    const aff = this.selectedAffaire();
    this.nextStep.emit({
      affaireId:   aff?.id ?? null,
      tsId:        v.tsId ?? null,
      invoiceType: v.invoiceType!,
      clientId:    aff?.clientId ?? null,
      paysId:      aff?.paysId ?? 0,
      currency:    aff?.devise ?? 'TND',
      billingMode: v.billingMode || this.validBillingModeFromAffaire() || '',
      contractAmount: aff?.contractAmount ?? null,
    });
  }
```

with:

```typescript
  next(): void {
    if (this.isCombinedInvoice()) {
      // No affaire was ever selected (there isn't one) and no RAF applies -- just re-emit
      // the invoice's own already-correct values unchanged.
      const iv = this.initialValue()!;
      this.nextStep.emit(iv);
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.rafBlocked() || this.rafLoading()) return;
    const v = this.form.getRawValue();
    const aff = this.selectedAffaire();
    this.nextStep.emit({
      affaireId:   aff?.id ?? null,
      tsId:        v.tsId ?? null,
      invoiceType: v.invoiceType!,
      clientId:    aff?.clientId ?? null,
      paysId:      aff?.paysId ?? 0,
      currency:    aff?.devise ?? 'TND',
      billingMode: v.billingMode || this.validBillingModeFromAffaire() || '',
      contractAmount: aff?.contractAmount ?? null,
    });
  }
```

- [ ] **Step 4: Add a read-only summary to the template for a combined invoice**

Read the template (the `@Component({ template: ... })` block in this same file) to find where the affaire search UI starts (likely right after the step's header, before the search input). Wrap the existing search/selection markup in `@if (!isCombinedInvoice()) { ... }`, and add a new sibling block:

```html
@if (isCombinedInvoice()) {
  <div class="combined-invoice-summary">
    <p class="section-title">{{ 'INVOICING.STEP_AFFAIRE.COMBINED_TITLE' | translate }}</p>
    <p>{{ 'INVOICING.STEP_AFFAIRE.COMBINED_HINT' | translate }}</p>
  </div>
}
```

(Exact CSS class names should match whatever convention the rest of this template already uses for a simple text block — check the template's existing `.scss`/inline styles before inventing new class names.)

Add to `public/i18n/fr.json`'s `INVOICING.STEP_AFFAIRE` section:
```json
    "COMBINED_TITLE": "Facture combinée multi-affaires",
    "COMBINED_HINT": "Cette facture regroupe des lignes de plusieurs affaires, validées ensemble depuis la file d'approbation. Les lignes sont visibles à l'étape suivante.",
```
And `public/i18n/en.json`:
```json
    "COMBINED_TITLE": "Combined multi-affaire invoice",
    "COMBINED_HINT": "This invoice groups lines from several affaires, validated together from the approval queue. The lines are shown in the next step.",
```

- [ ] **Step 5: Build**

Run: `npx ng build --configuration development`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/invoicing/invoice-new/steps/step-affaire.component.ts public/i18n/fr.json public/i18n/en.json
git commit -m "feat: handle combined invoices in step-affaire (read-only summary, no crash)"
```

---

### Task 4: `step-lines.component.ts` — read-only combined-invoice lines

**Files:**
- Modify: `src/app/modules/invoicing/invoice-new/steps/step-lines.component.ts`

This is the task that actually shows a combined invoice's lines correctly instead of falling through to the generic quantity/price columns and silently discarding real data on save.

- [ ] **Step 1: Add an `isCombined` signal and an affaire-reference lookup**

Read the file first to confirm the exact current location of `isAcompte` (around line 690) and `AffaireService`'s injection pattern elsewhere in this component (it already injects several services — check the exact import path and existing `inject(...)` block near the top of the class). Add near the other mode signals:

```typescript
  /** True for a combined (multi-affaire) invoice -- see step-affaire.component.ts's
   * isCombinedInvoice(). Read-only in this phase: no add/edit controls, next() just
   * passes the already-correct seeded lines through unchanged. */
  readonly isCombined = computed(() => this.affaireData().billingMode === 'MIXED');

  /** affaireId -> "REF — Intitulé" for the Affaire column, resolved once per distinct
   * affaireId found among the seeded lines (see seedFromInitialLines()). Empty until
   * resolved; the column shows the raw id as a fallback in the meantime. */
  readonly affaireLabels = signal<Map<number, string>>(new Map());

  private resolveAffaireLabels(affaireIds: number[]): void {
    const distinct = [...new Set(affaireIds)];
    if (distinct.length === 0) return;
    forkJoin(distinct.map(id => this.affSvc.getAffaire(id))).subscribe({
      next: affaires => {
        const map = new Map<number, string>();
        for (const a of affaires) map.set(a.id, `${a.reference} — ${a.intitule}`);
        this.affaireLabels.set(map);
      },
    });
  }

  affaireLabel(affaireId: number | undefined | null): string {
    if (affaireId == null) return '—';
    return this.affaireLabels().get(affaireId) ?? `#${affaireId}`;
  }
```

Add `import { forkJoin } from 'rxjs';` if not already present, and inject `AffaireService` (`private readonly affSvc = inject(AffaireService);`, with the matching import — check the relative path from this file to `affaire.service.ts`, likely `'../../../affaires/affaire.service'`, but verify directly rather than assume).

- [ ] **Step 2: Store the seeded lines' own affaireId/billingMode and resolve their labels**

Read `seedFromInitialLines()` in full (around line 897). It currently builds each `InvoiceLine`/line FormGroup from `initial.lines` without reading `affaireId`/`billingMode` at all (Task 2 added these as optional fields on `StepLinesValue.lines[]`, but nothing reads them yet). Since combined-invoice lines are read-only (no form controls needed for editing), store them in a plain signal instead of threading them through `newLine()`'s FormGroup:

```typescript
  /** Read-only combined-invoice line data, captured once from seedFromInitialLines() --
   * index-aligned with linesArray.controls for a combined invoice specifically (never
   * populated for any other mode). */
  readonly combinedLineMeta = signal<{ affaireId?: number; billingMode?: string }[]>([]);
```

In `seedFromInitialLines()`, after the existing loop that builds `this.linesArray` from `initial.lines` (find the exact closing of that loop first), add:

```typescript
    if (this.isCombined()) {
      this.combinedLineMeta.set(initial.lines.map(l => ({ affaireId: l.affaireId, billingMode: l.billingMode })));
      this.resolveAffaireLabels(initial.lines.map(l => l.affaireId).filter((id): id is number => id != null));
    }
```

- [ ] **Step 3: Hide the add-line/add-rmb/add-carry-forward buttons for a combined invoice**

Read the template's button-guard block (around line 76-91). Update the three `@if` conditions to also exclude `isCombined()`:

```html
      @if (!isCombined() && ((!isAv() && !isTm() && !isLivrable() && !isTsCarryForward()) || isAcompte())) {
        <button type="button" class="btn-add-line" (click)="addLine()">
          {{ 'INVOICING.STEP_LINES.ADD_LINE' | translate }}
        </button>
      }
      @if (!isCombined() && (isAv() || isTm() || isLivrable())) {
        <button type="button" class="btn-add-line btn-add-rmb" [disabled]="!categoriesLoaded()"
          (click)="toggleRmbPicker()">
          {{ 'INVOICING.STEP_LINES.ADD_REMBOURSABLE' | translate }}
        </button>
      }
      @if (!isCombined() && (isAv() || isTm() || isLivrable() || isTsCarryForward())) {
        <button type="button" class="btn-add-line btn-add-rmb" (click)="toggleCarryForwardPicker()">
          {{ 'INVOICING.STEP_LINES.ADD_CARRY_FORWARD' | translate }}
        </button>
      }
```

Also find the "Ajouter une colonne" button (the deduction-column-add button, inside the `deduction-columns-bar` div, guarded today only by `deductionColumns().includes(null)`) and add the same `!isCombined()` guard:

```html
    @if (!isCombined() && deductionColumns().includes(null)) {
      <button type="button" class="btn-add-line btn-add-deduction" (click)="addDeductionColumn()">
        {{ 'INVOICING.STEP_LINES.ADD_DEDUCTION_COLUMN' | translate }}
      </button>
    }
```

A freshly combined invoice never has any deduction column active (nothing in the backend sets one), so this guard is what actually keeps the lines read-only end to end — without it, a user could still click through to add an editable deduction column despite everything else being locked down.


- [ ] **Step 3b: Guard the remove-line ("✕") button too**

Read the existing remove-line button in the row template (`<button type="button" class="remove-line-btn" title="✕" (click)="removeLine(i)" [disabled]="linesArray.length === 1">✕</button>`, in the universal per-row section shared by every mode). `combinedLineMeta()` is a flat array captured once in `seedFromInitialLines()` and is NOT reactively kept index-aligned with `linesArray.controls` — removing a line without also removing its `combinedLineMeta()` entry would desync every later line's affaire label. Since combined invoices are read-only in this phase anyway, disable the button entirely rather than trying to keep the two arrays in sync:

```html
                <button type="button" class="remove-line-btn" title="✕" (click)="removeLine(i)"
                  [disabled]="isCombined() || linesArray.length === 1">✕</button>
```

- [ ] **Step 4: Add the combined header, row, and TTC column branches**

Read the exact current header condition (around line 189, `@if (isAv() || isTm() || isLivrable() || isTsCarryForward() || isAcompte())`) and the TOTAL_TTC header condition (around line 200, same pattern). Add `|| isCombined()` to both — the 5-column avancement-style header fits a combined invoice too.

Before the 5 avancement `<th>`s inside that same `@if` block, add a 6th column header (only shown for combined invoices, since no other mode needs it):

```html
          @if (isCombined()) {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.AFFAIRE' | translate }}</th>
          }
```

(Read the exact surrounding `<th>` markup first to place this correctly relative to the existing `BUDGET_AFFAIRE`/etc. headers — it should come first, before Budget Affaire, so the Affaire column reads leftmost among the numeric columns.)

In the row-rendering `@if` chain (the one starting `@if (isAcompte()) { ... } @else if (isAv()) { ... }`, around line 248), add a new FIRST branch before `isAcompte()`:

```html
              @if (isCombined()) {
                <td class="td-computed">{{ affaireLabel(combinedLineMeta()[i]?.affaireId) }}</td>
                <td class="td-computed">{{ formatAmount(lg.get('budgetAffaire')!.value) }}</td>
                <td class="td-computed">{{ formatPct(lg.get('pctFacture')!.value ?? 0) }}</td>
                <td class="td-computed">{{ formatPct(lg.get('pctAvancement')!.value ?? 0) }}</td>
                <td class="td-computed">{{ formatPct(lg.get('pctAFacturer')!.value ?? 0) }}</td>
                <td class="td-computed">{{ formatAmount(lg.get('prixUnitaireHt')!.value) }}</td>
              } @else if (isAcompte()) {
```

(`lg.get('budgetAffaire')`/etc. already exist as FormGroup controls on every line regardless of mode — `newLine()` always creates them, per the existing ACOMPTE branch's own pattern — so reading them read-only here needs no new form-control wiring, only `combinedLineMeta()[i]?.affaireId` is genuinely new per-line data.)

In the VAT→TTC column `@if` chain (around line 369, `@if (isAcompte()) { ... } @else if (isAv()) { ... }`), add the same new first branch:

```html
              @if (isCombined()) {
                <td class="td-computed">{{ formatAmount(lineTtcAv(i)) }}</td>
              } @else if (isAcompte()) {
```

(Reuses `lineTtcAv(i)` — HT × (1+VAT), the same generic "amount already known, just add VAT" calculation ACOMPTE already reuses, no new helper needed.)

In the footer total row (around line 437, `@if (isAv() || isAcompte()) { ... }` — confirm the exact current condition, it was last touched for ACOMPTE), add `|| isCombined()`:

```html
          @if (isAv() || isAcompte() || isCombined()) {
            <td colspan="7" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcAv) }}</td>
```

(`colspan="7"` instead of the existing `colspan="6"`, to account for the new Affaire column — but ONLY when `isCombined()` is the active branch; if the existing `colspan="6"` is shared across `isAv()`/`isAcompte()` too, which don't have the Affaire column, this needs its own conditional colspan rather than a flat change. Check the exact current markup and adjust so `isAv()`/`isAcompte()` keep `colspan="6"` while `isCombined()` uses `colspan="7"` — e.g. `[attr.colspan]="isCombined() ? 7 : 6"`.)

- [ ] **Step 5: Add the `next()` pass-through branch**

Read `next()`'s current `if (this.isAcompte()) { ... } else if (this.isAv()) { ... }` chain (around line 1605). Add a new FIRST branch:

```typescript
    if (this.isCombined()) {
      // Read-only: re-emit exactly what was seeded, including each line's own
      // affaireId/billingMode so the backend's existing matching logic (Phase 1) sees
      // real, stable per-line values -- see combinedLineMeta() above.
      const meta = this.combinedLineMeta();
      const combinedLines = (this.linesArray.value as {
        description: string; tauxTva: number;
        budgetAffaire: number | null; pctFacture: number | null;
        pctAvancement: number | null; pctAFacturer: number | null;
        prixUnitaireHt: number;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[]).map((l, i) => ({
        description:   l.description,
        quantity:      1,
        unitRate:      l.prixUnitaireHt,
        vatRatePct:    l.tauxTva,
        budgetAffaire: l.budgetAffaire ?? undefined,
        pctFacture:    l.pctFacture    ?? undefined,
        pctAvancement: l.pctAvancement ?? undefined,
        pctAFacturer:  l.pctAFacturer  ?? undefined,
        affaireId:     meta[i]?.affaireId,
        billingMode:   meta[i]?.billingMode,
        ...dedFields(l),
      }));
      this.nextStep.emit({ lines: combinedLines, deductionColumns });
    } else if (this.isAcompte()) {
```

- [ ] **Step 6: Add the i18n key**

`public/i18n/fr.json`'s `INVOICING.STEP_LINES` section: `"AFFAIRE": "Affaire",`
`public/i18n/en.json`'s same section: `"AFFAIRE": "Affaire",`

- [ ] **Step 7: Build**

Run: `npx ng build --configuration development`
Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add src/app/modules/invoicing/invoice-new/steps/step-lines.component.ts public/i18n/fr.json public/i18n/en.json
git commit -m "feat: render a combined invoice's lines read-only in step-lines"
```

---

### Task 5: `invoice-detail.component.ts` — display fix

**Files:**
- Modify: `src/app/modules/invoicing/invoice-detail/invoice-detail.component.ts`
- Modify: `src/app/modules/invoicing/invoice-detail/invoice-detail.component.html` (only if the Affaire column needs a header cell added outside the computed `lineTableColumns()`/`lineTableRows()` — check first; this page uses `DataTableComponent` driven entirely from those two computed signals, so the header likely needs no separate template change)

- [ ] **Step 1: Add `'MIXED'` to `usesAvancementColumns()`**

Read the file first to find the exact current location (around line 347-350). Change:

```typescript
  readonly usesAvancementColumns = computed(() => {
    const mode = this.invoice()?.billingMode;
    return mode === 'FORFAIT' || mode === 'REGIE' || mode === 'LIVRABLE' || mode === 'TS';
  });
```

to:

```typescript
  readonly usesAvancementColumns = computed(() => {
    const mode = this.invoice()?.billingMode;
    return mode === 'FORFAIT' || mode === 'REGIE' || mode === 'LIVRABLE' || mode === 'TS' || mode === 'MIXED';
  });
```

- [ ] **Step 2: Add an affaire-reference lookup, same pattern as step-lines**

Inject `AffaireService` (confirm the exact relative import path from this file to `affaire.service.ts`). Add:

```typescript
  readonly affaireLabels = signal<Map<number, string>>(new Map());

  private resolveAffaireLabels(affaireIds: (number | null | undefined)[]): void {
    const distinct = [...new Set(affaireIds.filter((id): id is number => id != null))];
    if (distinct.length === 0) return;
    forkJoin(distinct.map(id => this.affSvc.getAffaire(id))).subscribe({
      next: affaires => {
        const map = new Map<number, string>();
        for (const a of affaires) map.set(a.id, `${a.reference} — ${a.intitule}`);
        this.affaireLabels.set(map);
      },
    });
  }

  affaireLabel(affaireId: number | null | undefined): string {
    if (affaireId == null) return '—';
    return this.affaireLabels().get(affaireId) ?? `#${affaireId}`;
  }
```

Find where `invoice()` is first populated (the signal set after the `GET /invoices/{id}` response arrives — read the component to find this exact spot) and call `this.resolveAffaireLabels(inv.lines.map(l => l.affaireId));` right after, only when `inv.billingMode === 'MIXED'` (no need to do this lookup for every single-affaire invoice, which never has per-line affaireId set).

- [ ] **Step 3: Add the Affaire column to `lineTableColumns()`/`lineTableRows()`**

Read the exact current `lineTableColumns()` (around line 352-381) and `lineTableRows()` (around line 390-407). In `lineTableColumns()`, inside the `usesAvancementColumns()` branch, add a new column before `description`:

```typescript
    if (this.usesAvancementColumns()) {
      return [
        { key: 'affaire',        label: t('INVOICING.DETAIL.LINES.AFFAIRE'),       type: 'custom', sortable: true },
        { key: 'description',    label: t('INVOICING.DETAIL.LINES.DESC'),                type: 'custom', sortable: true },
        ...
```

In `lineTableRows()`, add the resolved label to each row:

```typescript
    return inv.lines.map((line, idx) => ({
      id:            line.id ?? idx,
      affaire:       this.affaireLabel(line.affaireId),
      description:   line.description,
      ...
```

- [ ] **Step 4: Add the i18n key**

`public/i18n/fr.json`'s `INVOICING.DETAIL.LINES` section: `"AFFAIRE": "Affaire",`
`public/i18n/en.json`'s same section: `"AFFAIRE": "Affaire",`

- [ ] **Step 5: Build**

Run: `npx ng build --configuration development`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/invoicing/invoice-detail/invoice-detail.component.ts public/i18n/fr.json public/i18n/en.json
git commit -m "fix: render MIXED-mode invoices correctly in the detail page, add Affaire column"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Clean build**

Run: `npx ng build --configuration development`
Expected: clean build, zero new errors.

- [ ] **Step 2: Rebuild and restart the frontend dev container**

```bash
docker compose -f docker-compose.dev.yml up -d --build daf360-facturation-frontend
```
(Run from `C:\Users\ITEC2\OneDrive\Documents\projects`, the directory containing `docker-compose.dev.yml`.)

- [ ] **Step 3: Browser smoke test — standard (single-affaire) invoice regression check**

This is the most important check: nothing in Tasks 1-5 should have changed how a STANDARD invoice looks or behaves, since every change is gated behind `isCombined()`/`isCombinedInvoice()`. Open the Finance app, go to an existing single-affaire DRAFT invoice's edit wizard (or create a new one via the approval queue's existing single-affaire "Valider" flow), and confirm:
- Step "Affaire & Client" still shows the normal affaire search/selection UI, not the new combined summary.
- Step "Lignes" still shows editable fields exactly as before, with no new "Affaire" column.
- Saving still works.
- The invoice's detail page still shows the correct avancement or quantity/price columns, depending on its mode, with no "Affaire" column (since `affaireId` is undefined on every line of a standard invoice).

- [ ] **Step 4: Browser smoke test — approval queue**

Open the DF approval queue, select billing lines across TWO different affaires (same client, to exercise the simple path first), click "Valider". Confirm: no console errors, the page redirects straight into the invoice edit wizard (no results panel), and the wizard's "Lignes" step shows the new read-only combined view with an Affaire column resolving to real references (not raw ids) once the lookup resolves. Then select lines across two affaires with DIFFERENT clients (if test data allows) and confirm the client picker appears, and picking a client proceeds correctly to the same combined-invoice review.

- [ ] **Step 5: Report completion**

Summarize for the user: Phase 2 (frontend) of the Combined Multi-Affaire Invoice feature is complete — the approval queue correctly calls the new backend endpoint, resolves client ambiguity before submitting, and a combined invoice can be reviewed read-only through the existing wizard and detail page without disturbing any standard invoice's behavior. Explicitly note: Phase 3 (PDF rendering for a mixed-mode/multi-affaire invoice) is still a separate, not-yet-started spec — exporting a combined invoice's PDF will not render correctly until then.
