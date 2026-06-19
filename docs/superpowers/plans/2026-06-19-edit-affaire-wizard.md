# Edit Affaire — Wizard Reuse (Approach 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow editing an existing EN_COURS/SUSPENDUE affaire through the same 5-step wizard used for creation, with billing mode read-only when locked.

**Architecture:** Route `/affaires/:id/edit` loads `AffaireWizardComponent` in edit mode (detected via route param). The wizard calls `GET /api/fact/affaires/{id}/draft` + `GET /api/fact/affaires/{id}` to pre-populate all steps. Step 2 PATCHes the existing affaire instead of creating a new draft; step 3 is skipped when billing is locked; step 6 navigates back to detail instead of activating. Backend relaxes the DRAFT-only status guard on responsables and planning config endpoints.

**Tech Stack:** Spring Boot 4 / Java 21 (backend), Angular 17+ standalone components + signals + `input()` route binding (frontend), RxJS `forkJoin`.

---

## Files Modified

### Backend (`daf360-facturation-service/facturation-service/src/main/java/com/daf360/facturation/modules/affaires/`)

| File | Change |
|------|--------|
| `dto/UpdateAffaireRequest.java` | Add `doc360Ref`, `erpReference`, `contractCurrency`, `billingPeriod` fields |
| `service/AffaireService.java` | `updateAffaire()` persists the 4 new fields |
| `service/AffaireCreationService.java` | Add `findEditableOrThrow()`; use it in `configureResponsables()` + `configurePlanning()` |

### Frontend (`daf360-facturation-frontend/src/app/modules/affaires/`)

| File | Change |
|------|--------|
| `affaire-wizard.model.ts` | Add `billingModeLocked?` to `AffaireDraftState`; add `mapDraftToState()` function; extend `UpdateAffaireRequest` |
| `affaire-wizard.service.ts` | Add `updateInfo()` method (no new service needed) |
| `affaires.routes.ts` | Add `:id/edit` route |
| `affaire-detail.component.ts` | Add `openEdit()` method |
| `affaire-detail.component.html` | Add "Modifier" action card in sidebar |
| `wizard/steps/wizard-step-billing.component.ts` | Add `@Input() locked = false` |
| `wizard/steps/wizard-step-billing.component.html` | Show locked notice when `locked` is true |
| `wizard/steps/wizard-step-info.component.ts` | Pre-fill client search input from `draft.clientName` |
| `wizard/steps/wizard-step-responsables.component.ts` | Resolve `userName` from allUsers after load |
| `wizard/affaire-wizard.component.ts` | Edit mode: signals, `ngOnInit`, `loadExistingDraft`, overridden step saves |
| `wizard/affaire-wizard.component.html` | Button label + locked billing step binding |

---

## Task 1 — Backend: Extend UpdateAffaireRequest + updateAffaire()

**Files:**
- Modify: `dto/UpdateAffaireRequest.java`
- Modify: `service/AffaireService.java`

- [ ] **Step 1: Replace the record fields in `UpdateAffaireRequest.java`**

Replace the entire record with:

```java
package com.daf360.facturation.modules.affaires.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateAffaireRequest(
        String intitule,
        Long clientId,
        Long responsableUserId,
        LocalDate dateDebut,
        LocalDate dateFin,
        BigDecimal budgetPrevisionnel,
        BigDecimal rafAlerteSeuilPct,
        String notes,
        String doc360Ref,
        String erpReference,
        String contractCurrency,
        String billingPeriod
) {}
```

- [ ] **Step 2: Update `updateAffaire()` in `AffaireService.java`**

Find the `updateAffaire()` method (lines ~139-153). After the existing `if (dto.notes() != null)` block, add:

```java
if (dto.doc360Ref() != null)        affaire.setDoc360Ref(dto.doc360Ref());
if (dto.erpReference() != null)     affaire.setErpReference(dto.erpReference());
if (dto.contractCurrency() != null) affaire.setContractCurrency(dto.contractCurrency());
if (dto.billingPeriod() != null)    affaire.setBillingPeriod(dto.billingPeriod());
```

- [ ] **Step 3: Build and verify no compile errors**

```bash
cd c:\Users\ITEC2\OneDrive\Documents\projects\daf360-facturation-service\facturation-service
./mvnw compile -q
```

Expected: `BUILD SUCCESS` with no errors.

- [ ] **Step 4: Commit backend Task 1**

```bash
git add src/main/java/com/daf360/facturation/modules/affaires/dto/UpdateAffaireRequest.java
git add src/main/java/com/daf360/facturation/modules/affaires/service/AffaireService.java
git commit -m "feat: extend UpdateAffaireRequest with doc360Ref, erpReference, contractCurrency, billingPeriod"
```

---

## Task 2 — Backend: Relax DRAFT Guard on Responsables + Planning

**Files:**
- Modify: `service/AffaireCreationService.java`

- [ ] **Step 1: Add `findEditableOrThrow()` helper**

In `AffaireCreationService.java`, after the existing `findDraftOrThrow()` method, add:

```java
private Affaire findEditableOrThrow(Long id) {
    Affaire a = affaireRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Affaire " + id + " introuvable."));
    if ("CLOTUREE".equals(a.getStatut()) || "ARCHIVEE".equals(a.getStatut())) {
        throw new BusinessRuleException(
                "L'affaire " + id + " est clôturée ou archivée et ne peut pas être modifiée.", null);
    }
    return a;
}
```

- [ ] **Step 2: Change `configureResponsables()` to use `findEditableOrThrow()`**

In `configureResponsables()`, the first line calls `findDraftOrThrow(affaireId)`. Change it to:

```java
Affaire affaire = findEditableOrThrow(affaireId);
```

- [ ] **Step 3: Change `configurePlanning()` to use `findEditableOrThrow()`**

In `configurePlanning()`, the first line calls `findDraftOrThrow(affaireId)`. Change it to:

```java
Affaire affaire = findEditableOrThrow(affaireId);
```

- [ ] **Step 4: Build and verify**

```bash
./mvnw compile -q
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit backend Task 2**

```bash
git add src/main/java/com/daf360/facturation/modules/affaires/service/AffaireCreationService.java
git commit -m "feat: allow responsables and planning config for non-DRAFT affaires (edit mode)"
```

---

## Task 3 — Frontend: Update Models + Wizard Service

**Files:**
- Modify: `affaire-wizard.model.ts`
- Modify: `affaire-wizard.service.ts`
- Modify: `affaire.model.ts`

- [ ] **Step 1: Add `billingModeLocked` to `AffaireDraftState` in `affaire-wizard.model.ts`**

In `AffaireDraftState`, after `billingMode?: BillingMode;` add:

```typescript
billingModeLocked?: boolean;
```

- [ ] **Step 2: Add `mapDraftToState()` to `affaire-wizard.model.ts`**

At the bottom of `affaire-wizard.model.ts`, add this export function (no imports needed — `AffaireDraftState` is in the same file):

```typescript
export function mapDraftToState(dto: any, clientName: string, clientKycDone: boolean): AffaireDraftState {
  const repartitions: AffaireDraftState['repartitions'] = (dto.ctrBpeTqcItems ?? []).map((r: any) => ({
    repartitionTypeId: r.repartitionTypeId,
    percentage: Number(r.percentage),
    label: r.label,
  }));
  const jalons: AffaireDraftState['jalons'] = (dto.jalons ?? []).map((j: any) => ({
    label: j.label,
    description: j.description,
    montant: Number(j.montant),
    ordre: j.ordre,
    datePrevisionnelle: j.datePrevisionnelle,
  }));
  const ressources: AffaireDraftState['ressources'] = (dto.ressources ?? []).map((r: any) => ({
    userId: r.userId,
    userName: '',
    resourceType: r.resourceType,
    rateType: r.rateType,
    rateAmount: Number(r.rateAmount),
    rateCurrency: r.rateCurrency,
    costAmount: r.costAmount != null ? Number(r.costAmount) : undefined,
  }));
  const responsables: ResponsableItem[] = (dto.responsables ?? []).map((r: any) => ({
    userId: r.userId,
    userName: '',
    isPrimary: r.isPrimary,
    role: r.role,
    budgetAllocation: r.budgetAllocation != null ? Number(r.budgetAllocation) : undefined,
  }));
  return {
    id:                       dto.id,
    paysId:                   dto.paysId ?? 0,
    clientId:                 dto.clientId,
    clientName,
    clientKycDone,
    intitule:                 dto.intitule ?? '',
    reference:                dto.reference,
    doc360Ref:                dto.doc360Ref,
    doc360ServerReference:    dto.doc360Ref,   // stored as doc360Ref in backend
    erpReference:             dto.erpReference,
    notes:                    dto.notes,
    billingMode:              dto.billingMode,
    billingModeLocked:        dto.billingModeLocked ?? false,
    billingPeriod:            dto.billingPeriod ?? 'MONTHLY',
    contractAmount:           dto.contractAmount != null ? Number(dto.contractAmount) : undefined,
    contractCurrency:         dto.contractCurrency ?? 'EUR',
    budgetPrevisionnel:       dto.budgetPrevisionnel != null ? Number(dto.budgetPrevisionnel) : undefined,
    repartitions,
    repartitionTotal:         repartitions.reduce((s, r) => s + r.percentage, 0),
    jalons,
    jalonTotal:               jalons.reduce((s, j) => s + j.montant, 0),
    ressources,
    eligibleCostCategoryIds:  dto.eligibleCostCategoryIds ?? [],
    eligibleExpenseCategoryIds: dto.eligibleExpenseCategoryIds ?? [],
    marginRatePct:            dto.cpMarginRatePct != null ? Number(dto.cpMarginRatePct) : undefined,
    responsables,
    activiteId:               dto.activiteId,
    disciplineId:             dto.disciplineId,
    disciplineLabel:          dto.disciplineLabel,
    disciplineServerRef:      dto.disciplineServerRef,
    disciplineLevelConcat:    undefined,
    dateDebutFacturation:     dto.dateDebutFacturation,
    dateFinContractuelle:     dto.dateFinContractuelle,
    datePremireEcheance:      dto.datePremireEcheance,
  };
}
```

- [ ] **Step 3: Extend `UpdateAffaireRequest` in `affaire.model.ts`**

Find the `CreateAffaireRequest` interface (which `UpdateAffaireRequest` aliases). Add the missing fields:

```typescript
export interface CreateAffaireRequest {
  reference?:          string | null;
  intitule:            string;
  clientId:            number;
  responsableUserId?:  number | null;
  typeAffaire?:        string | null;
  dateDebut?:          string | null;
  dateFin?:            string | null;
  budgetPrevisionnel?: number | null;
  paysId:              number;
  notes?:              string | null;
  doc360Ref?:          string | null;
  erpReference?:       string | null;    // ← add
  contractCurrency?:   string | null;   // ← add
  billingPeriod?:      string | null;   // ← add
}
```

- [ ] **Step 4: Add `updateInfo()` to `affaire-wizard.service.ts`**

In `AffaireWizardService`, add this method (it calls the existing `PATCH /api/fact/affaires/{id}` endpoint via `AffaireService`'s base URL — use `http` directly):

```typescript
updateInfo(id: number, dto: {
  intitule: string;
  clientId: number;
  notes: string | null;
  doc360Ref: string | null;
  erpReference: string | null;
  contractCurrency: string;
  billingPeriod: string;
  budgetPrevisionnel: number | null;
}): Observable<unknown> {
  return this.http.patch(
    `${environment.factApiUrl}/api/fact/affaires/${id}`,
    dto,
    { withCredentials: true }
  );
}
```

Note: `this.http` and `environment` are already imported in this service. `this.base` points to `${environment.factApiUrl}/api/fact/affaires`. Use `${this.base}/${id}` if preferred.

- [ ] **Step 5: Verify Angular compiles**

```bash
cd c:\Users\ITEC2\OneDrive\Documents\projects\daf360-facturation-frontend
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/affaires/affaire-wizard.model.ts src/app/modules/affaires/affaire-wizard.service.ts src/app/modules/affaires/affaire.model.ts
git commit -m "feat: add billingModeLocked, mapDraftToState, updateInfo for edit mode"
```

---

## Task 4 — Frontend: Route + Edit Button in Detail View

**Files:**
- Modify: `affaires.routes.ts`
- Modify: `affaire-detail.component.ts`
- Modify: `affaire-detail.component.html`

- [ ] **Step 1: Add `:id/edit` route in `affaires.routes.ts`**

Add the new route **before** the `:id` catch-all (order matters — Angular matches top-to-bottom):

```typescript
{
  path: ':id/edit',
  loadComponent: () =>
    import('./wizard/affaire-wizard.component').then(m => m.AffaireWizardComponent),
},
```

The routes array should read:
```typescript
{ path: '',       loadComponent: () => import('./affaires-list.component')... },
{ path: 'new',    loadComponent: () => import('./wizard/affaire-wizard.component')... },
{ path: ':id/edit', loadComponent: () => import('./wizard/affaire-wizard.component')... },  // ← new
{ path: ':id',    loadComponent: () => import('./affaire-detail.component')... },
```

- [ ] **Step 2: Add `openEdit()` to `affaire-detail.component.ts`**

The component already injects `Router`. Add after `goBack()`:

```typescript
openEdit(): void {
  this.router.navigate(['/fact/affaires', this.numId, 'edit']);
}
```

- [ ] **Step 3: Add "Modifier" card to `affaire-detail.component.html` sidebar**

In the sidebar (`<!-- RIGHT: Actions panel -->`), add this card **before** the "Quick actions" card. It should be the first card shown if the user has `FACT_UPDATE_AFFAIRE` permission and the affaire is editable:

```html
<!-- Edit affaire -->
@if (affaire()!.statut === 'EN_COURS' || affaire()!.statut === 'SUSPENDUE') {
  <div class="action-card glass-card" *appHasPermission="'FACT_UPDATE_AFFAIRE'">
    <h3>Modifier l'affaire</h3>
    <p>Modifier les responsables, le planning, les informations générales.</p>
    <button class="btn-action btn-action--teal" (click)="openEdit()">
      Modifier l'affaire
    </button>
  </div>
}
```

- [ ] **Step 4: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/modules/affaires/affaires.routes.ts src/app/modules/affaires/affaire-detail.component.ts src/app/modules/affaires/affaire-detail.component.html
git commit -m "feat: add /affaires/:id/edit route and Modifier button in detail sidebar"
```

---

## Task 5 — Frontend: Billing Step Locked Display

**Files:**
- Modify: `wizard/steps/wizard-step-billing.component.ts`
- Modify: `wizard/steps/wizard-step-billing.component.html`

- [ ] **Step 1: Add `locked` input to `wizard-step-billing.component.ts`**

Add after the existing `@Input() draft!: AffaireDraftState;`:

```typescript
@Input() locked = false;
```

- [ ] **Step 2: Pass `locked` to each sub-component in `wizard-step-billing.component.html`**

The template uses `@switch` to render one of five sub-components. Add `[locked]="locked"` to **each** sub-component tag:

```html
@case ('AV')  { <app-wizard-step-av  [draft]="draft" [locked]="locked" (draftChange)="onSubDraftChange($event)" /> }
@case ('JAL') { <app-wizard-step-jal [draft]="draft" [locked]="locked" (draftChange)="onSubDraftChange($event)" /> }
@case ('TM')  { <app-wizard-step-tm  [draft]="draft" [locked]="locked" (draftChange)="onSubDraftChange($event)" /> }
@case ('CP')  { <app-wizard-step-cp  [draft]="draft" [locked]="locked" (draftChange)="onSubDraftChange($event)" /> }
@case ('RMB') { <app-wizard-step-rmb [draft]="draft" [locked]="locked" (draftChange)="onSubDraftChange($event)" /> }
```

Also add a locked banner **at the top** of the billing template (before the `@switch`):

```html
@if (locked) {
  <div class="locked-notice">
    <span class="material-symbols-outlined">lock</span>
    Le mode de facturation est verrouillé et ne peut pas être modifié.
  </div>
}
```

- [ ] **Step 3: Add `@Input() locked = false` to each billing sub-component**

In each of these files, add `@Input() locked = false;` after the `draft` input:
- `wizard-step-av.component.ts`
- `wizard-step-jal.component.ts`
- `wizard-step-tm.component.ts`
- `wizard-step-cp.component.ts`
- `wizard-step-rmb.component.ts`

Each one just needs the `@Input()` added — no template changes needed in sub-components (the locked display is shown by the parent billing wrapper). The `@Input() locked` on sub-components is only to avoid Angular "unknown property" template errors.

- [ ] **Step 4: Add `.locked-notice` style to `wizard-step-billing.component.scss`**

```scss
.locked-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  padding: 10px 14px;
  color: #92400e;
  font-size: 13px;
  margin-bottom: 16px;

  .material-symbols-outlined {
    font-size: 18px;
    font-variation-settings: 'FILL' 1;
  }
}
```

- [ ] **Step 5: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/affaires/wizard/steps/wizard-step-billing.component.ts src/app/modules/affaires/wizard/steps/wizard-step-billing.component.html src/app/modules/affaires/wizard/steps/wizard-step-billing.component.scss src/app/modules/affaires/wizard/steps/wizard-step-av.component.ts src/app/modules/affaires/wizard/steps/wizard-step-jal.component.ts src/app/modules/affaires/wizard/steps/wizard-step-tm.component.ts src/app/modules/affaires/wizard/steps/wizard-step-cp.component.ts src/app/modules/affaires/wizard/steps/wizard-step-rmb.component.ts
git commit -m "feat: billing step shows locked notice in edit mode"
```

---

## Task 6 — Frontend: Info Step Client Pre-fill

**Files:**
- Modify: `wizard/steps/wizard-step-info.component.ts`

- [ ] **Step 1: Pre-fill `clientInputValue` from `draft.clientName` when already set**

In `wizard-step-info.component.ts`, inside `ngOnInit()`, after the existing `clientSvc.getDropdown(0).subscribe(...)` block, find where `prefillFromDoc360(clients)` is called. Add an `else if` branch **after** the doc360 pre-fill:

The existing pattern looks like:
```typescript
this.clientSvc.getDropdown(0).subscribe(clients => {
  this.clientOptions.set(clients);
  this.prefillFromDoc360(clients);  // ← existing
});
```

Change to:
```typescript
this.clientSvc.getDropdown(0).subscribe(clients => {
  this.clientOptions.set(clients);
  if (this.draft.doc360ClientName) {
    this.prefillFromDoc360(clients);
  } else if (this.draft.clientId && this.draft.clientName) {
    // Edit mode: client already selected — just show the name in the search input
    this.clientInputValue.set(this.draft.clientName);
  }
});
```

This prevents `prefillFromDoc360` from overwriting an already-selected client when editing.

- [ ] **Step 2: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/modules/affaires/wizard/steps/wizard-step-info.component.ts
git commit -m "feat: info step pre-fills client from draft.clientName in edit mode"
```

---

## Task 7 — Frontend: Responsables userName Resolution

**Files:**
- Modify: `wizard/steps/wizard-step-responsables.component.ts`

- [ ] **Step 1: Resolve `userName` for pre-loaded responsables**

In `wizard-step-responsables.component.ts`, in `ngOnInit()`, find where `this.affaireSvc.getUsers()` is subscribed. Change the subscription body to resolve `userName` for any responsable that arrived without one (from the draft):

```typescript
this.affaireSvc.getUsers().subscribe(u => {
  this.allUsers.set(u);
  // Resolve userNames for responsables pre-loaded from edit mode
  if (this.draft.responsables.some(r => !r.userName)) {
    const resolved = this.draft.responsables.map(r => ({
      ...r,
      userName: r.userName || u.find(u2 => u2.id === r.userId)?.fullName || `Utilisateur #${r.userId}`,
    }));
    this.emit({ ...this.draft, responsables: resolved });
  }
});
```

- [ ] **Step 2: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/modules/affaires/wizard/steps/wizard-step-responsables.component.ts
git commit -m "feat: responsables step resolves userName from users list in edit mode"
```

---

## Task 8 — Frontend: Wizard Component Edit Mode

**Files:**
- Modify: `wizard/affaire-wizard.component.ts`

This is the main task. The wizard component gains: `id` input from route, edit mode signals, `ngOnInit`, `loadExistingDraft`, and overridden save methods for steps 2, 3, and 6.

- [ ] **Step 1: Add imports to `affaire-wizard.component.ts`**

Add to the existing imports at the top of the file:

```typescript
import { OnInit, input }       from '@angular/core';
import { forkJoin }            from 'rxjs';
import { AffaireService }      from '../affaire.service';
import { AffaireDetail }       from '../affaire.model';
import { mapDraftToState }     from '../affaire-wizard.model';
```

Note: `input` (lowercase) is the Angular signals-based `input()` function — it may already be imported. Check existing imports first and add only what's missing.

- [ ] **Step 2: Add class-level signals and `AffaireService` injection**

In the component class body, after the existing injections and signals, add:

```typescript
private readonly affaireSvc = inject(AffaireService);

// Edit mode
readonly id        = input<string>();          // bound from route :id via withComponentInputBinding()
readonly editMode  = signal(false);
```

- [ ] **Step 3: Implement `OnInit` and add `ngOnInit()`**

Change the class declaration to implement `OnInit`:

```typescript
export class AffaireWizardComponent implements OnInit {
```

Add the `ngOnInit()` method:

```typescript
ngOnInit(): void {
  const rawId = this.id();
  if (rawId) {
    this.editMode.set(true);
    this.loadExistingDraft(Number(rawId));
  }
}
```

- [ ] **Step 4: Add `loadExistingDraft()` method**

```typescript
private loadExistingDraft(id: number): void {
  this.isSaving.set(true);
  forkJoin({
    draft:  this.wizardSvc.loadDraft(id) as any,
    detail: this.affaireSvc.getAffaire(id),
  }).subscribe({
    next: ({ draft, detail }: { draft: any; detail: AffaireDetail }) => {
      this.draft.set(
        mapDraftToState(
          draft,
          detail.clientName ?? '',
          true   // KYC was already validated at affaire creation
        )
      );
      this.draftId.set(id);
      this.isSaving.set(false);
    },
    error: () => {
      this.serverError.set('Impossible de charger l\'affaire. Réessayez.');
      this.isSaving.set(false);
    },
  });
}
```

Note: `this.wizardSvc.loadDraft(id)` calls `GET /api/fact/affaires/{id}/draft` (already exists in the service). `this.affaireSvc.getAffaire(id)` calls `GET /api/fact/affaires/{id}`.

- [ ] **Step 5: Override `saveStep2()` for edit mode**

Find the existing `saveStep2()` method. Wrap its logic so edit mode uses a PATCH instead of POST:

```typescript
private saveStep2(): void {
  if (this.editMode()) {
    const d = this.draft();
    this.isSaving.set(true);
    this.wizardSvc.updateInfo(this.draftId()!, {
      intitule:          d.intitule.trim(),
      clientId:          d.clientId!,
      notes:             d.notes ?? null,
      doc360Ref:         d.doc360ServerReference ?? null,
      erpReference:      d.erpReference ?? null,
      contractCurrency:  d.contractCurrency,
      billingPeriod:     d.billingPeriod,
      budgetPrevisionnel: d.budgetPrevisionnel ?? null,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.currentStep.set(3); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as any)?.message ?? 'Erreur lors de la mise à jour.');
      },
    });
    return;
  }
  // --- existing creation logic below (unchanged) ---
  if (this.draftId()) { this.currentStep.set(3); return; }
  // ... rest of original saveStep2 code
}
```

- [ ] **Step 6: Override `saveStep3()` for edit mode**

Find the existing `saveStep3()` method. Add at the very top:

```typescript
private saveStep3(): void {
  if (this.editMode()) {
    // Billing mode is locked in edit mode — no API call, just advance
    this.currentStep.set(4);
    return;
  }
  // ... existing logic unchanged
}
```

- [ ] **Step 7: Override `activateAffaire()` for edit mode**

Find `activateAffaire()`. Add at the very top:

```typescript
private activateAffaire(): void {
  if (this.editMode()) {
    // No activation needed — just navigate back to detail
    this.router.navigate(['/fact/affaires', this.draftId()]);
    return;
  }
  // ... existing logic unchanged
}
```

- [ ] **Step 8: Update `canGoNext` computed for edit mode**

Find the `canGoNext` computed signal. In its `switch` statement:

**Step 3 case** — add edit mode shortcut at the top:
```typescript
case 3: {
  if (this.editMode() && d.billingModeLocked) return true;
  // ... existing step 3 validation unchanged
}
```

**Step 6 case** — add edit mode shortcut:
```typescript
case 6: {
  if (this.editMode()) return true;
  return true;  // recap always allows next in creation mode too
}
```

- [ ] **Step 9: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/modules/affaires/wizard/affaire-wizard.component.ts
git commit -m "feat: wizard component edit mode — load draft, override step saves, skip activation"
```

---

## Task 9 — Frontend: Wizard Template Updates

**Files:**
- Modify: `wizard/affaire-wizard.component.html`

- [ ] **Step 1: Pass `locked` to the billing step (step 3)**

Find where `<app-wizard-step-billing>` is rendered (step 3 block). Add the `locked` binding:

```html
@if (currentStep() === 3) {
  <app-wizard-step-billing
    [draft]="draft()"
    [locked]="editMode() && (draft().billingModeLocked ?? false)"
    (draftChange)="onDraftChange($event)" />
}
```

- [ ] **Step 2: Change step 6 button label in edit mode**

Find the main navigation button (the one that calls `goNext()`). Its label changes per step. In the template, for the step 6 / final step label, wrap it so edit mode shows "Enregistrer" instead of whatever activation label is used:

Find the section that conditionally shows the button label. Add edit mode check:

```html
@if (currentStep() === totalSteps()) {
  {{ editMode() ? 'Enregistrer' : 'Activer l\'affaire' }}
} @else {
  Suivant
}
```

(The exact surrounding markup may differ — find the button label area and apply this logic.)

- [ ] **Step 3: Add wizard page title change in edit mode**

Find the `<h2>` or `<h1>` that shows "Nouvelle affaire" or similar at the top of the wizard. Conditionally show:

```html
<h2 class="wizard-title">
  {{ editMode() ? 'Modifier l\'affaire' : 'Nouvelle affaire' }}
</h2>
```

- [ ] **Step 4: Verify Angular compiles**

```bash
npx ng build --configuration development 2>&1 | tail -5
```

Expected: `Application bundle generation complete.` with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/modules/affaires/wizard/affaire-wizard.component.html
git commit -m "feat: wizard template — locked billing step, edit mode title and button label"
```

---

## Verification

### End-to-end test flow

1. **Start the facturation service** and the Angular dev server.

2. **Create an affaire** through the wizard (if one doesn't exist). Note its ID.

3. **Navigate to the detail page** `/fact/affaires/{id}`. Verify:
   - "Modifier l'affaire" button appears in the sidebar (for EN_COURS affaires).
   - The button is hidden for CLOTUREE or ARCHIVEE affaires.

4. **Click "Modifier l'affaire"**. Verify:
   - URL changes to `/fact/affaires/{id}/edit`.
   - All 6 wizard steps load (step indicator visible).
   - Wizard title shows "Modifier l'affaire".
   - Draft data is pre-populated: client name visible in step 2 field, billing mode pre-selected.

5. **Step 1 (DOC360)**: Can be skipped. If `doc360Ref` is set, it shows in the search field area. Click "Suivant".

6. **Step 2 (Info)**: Client name is shown in the client field. Modify `intitule` or `notes`. Click "Suivant". Verify PATCH `api/fact/affaires/{id}` fires (check browser network tab). Navigates to step 3.

7. **Step 3 (Billing)**: Yellow locked notice is displayed. Mode cards are visible but effectively read-only. "Suivant" is enabled immediately (no validation). Clicking it navigates directly to step 4 (no API call — check network tab).

8. **Step 4 (Responsables)**: Existing responsables are shown with correct names and budget allocations. Modify a budget split. "Suivant" enabled when budgets balance. Click — PATCH `api/fact/affaires/{id}/config/responsables` fires. Navigates to step 5.

9. **Step 5 (Planning)**: Existing dates pre-filled. Modify a date. Click "Suivant" — PATCH `api/fact/affaires/{id}/config/planning` fires. Navigates to step 6.

10. **Step 6 (Recap)**: Button shows "Enregistrer". Click — no API call, navigates to `/fact/affaires/{id}`. Detail page shows updated values.

### API smoke test

```
GET  /api/fact/affaires/{id}/draft      → 200, full draft data
PATCH /api/fact/affaires/{id}            → 200, accepts doc360Ref/contractCurrency/billingPeriod
PATCH /api/fact/affaires/{id}/config/responsables  → 200 for EN_COURS affaire (not just DRAFT)
PATCH /api/fact/affaires/{id}/config/planning      → 200 for EN_COURS affaire (not just DRAFT)
```
