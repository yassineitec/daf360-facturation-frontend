# DAF360 Facturation Frontend — P&L Page Enhancement — CORRECTED
# Module : daf360-facturation-frontend
# Cette version corrige le prompt original contre le code RÉEL tel qu'audité le 2026-10-21
# (voir daf360-facturation-service/docs/PL_AUDIT.md pour l'audit complet du module).
# PRÉREQUIS : PROMPT_BACKEND_pl_excel_export_CORRECTED.md exécuté et validé (au moins
# le nouvel endpoint GET /api/fact/pl-periods/{id}/export-workbook disponible).

---

## CORRECTIONS APPORTÉES AU PROMPT ORIGINAL — LIRE EN PREMIER

1. **Un bouton d'export Excel existe déjà dans `ReportDetailComponent`** —
   `exportXlsx()`/`exportPdf()` (lignes ~513-545 de `report-detail.component.ts`),
   déjà câblés dans le template (`report-detail.component.html`), déjà fonctionnels,
   appelant l'export technique 1-onglet existant (`pl-report.service.ts`'s
   `exportXlsx(id)`/`exportPdf(id)` → `GET /pl-reports/{id}/export.xlsx`/`.pdf`).
   Le nouveau bouton "Export Excel" de ce prompt doit avoir un **libellé distinct**
   (ex. "Exporter le classeur complet" / "Export full workbook") et appeler le
   **nouvel** endpoint `GET /pl-periods/{id}/export-workbook` — ne pas remplacer ni
   confondre avec le bouton existant, qui reste utile tel quel pour l'export
   technique simple.
2. **`PlPeriodDto`/`PlReportDto` n'ont PAS les champs plats inventés** par le prompt
   original (`period.mtdInvoiced`, `period.ytdWip`, `period.averageFte`,
   `period.billableHrs`, etc. — confirmé absents de `pl-reporting.model.ts`). La
   cascade MTD existe bel et bien en champs plats **réels** sur `PlPeriodDto` —
   `ebitda, ebitdaPct, grossRevenue1Local, grossRevenue2Local, netRevenueLocal,
   revenueLocal, wipBalanceAtClose, totalOperatingCost, intercompanyInbound,
   intersedeInbound, intersedeOutbound, wipPreviousYears` — mais **la ventilation
   par catégorie de coût (Salary/Material/Subcontractors/Other/HQ...) n'existe QUE
   sous forme de tableau générique `PlReportLineDto[]`**, un élément par
   `GroupCatalogueLine` (champ `catalogueLineCode`), pas en propriétés nommées. Le
   composant actuel (`report-detail.component.ts`) lit déjà `sortedLines()` de cette
   façon pour son tableau existant — réutiliser exactement ce pattern plutôt que
   d'inventer des noms de champs.
3. **Les 17 vrais codes `GroupCatalogueLine`** (confirmés dans les migrations
   backend) : `REVENUE, DIRECT_PROJECT_COSTS, DIRECT_PAYROLL, INDIRECT_PAYROLL,
   HR_OVERHEAD, IT_OVERHEAD, OFFICE_OVERHEAD, INSURANCE, TRAVEL_EXPENSES,
   STATUTORY_REGULATORY, MARKETING_BD, GROUP_HQ_ALLOCATION, OTHER_ONEOFF, WIP,
   WIP_PREVIOUS_YEARS, INTERCOMPANY, INTERSEDE`. **Aucun `MATERIAL_ENERGY` ni
   `SUBCONTRACTORS`** — voir la Décision Ouverte A du prompt backend corrigé ; tant
   qu'elle n'est pas tranchée, ne pas construire un mapping UI qui suppose ces
   codes existent côté backend.
4. **Les endpoints Receivables/Missing Cash proposés en Étape 4 du prompt original
   n'existent pas et doivent être créés côté backend d'abord** (confirmé : zéro
   route de ce type dans `PlReportController` aujourd'hui) — ce prompt frontend
   suppose maintenant qu'ils seront ajoutés avec les noms/formes de requête du
   prompt backend corrigé ; ne pas commencer l'UI avant que ces deux endpoints
   répondent réellement (vérifier avec `curl` avant de coder le composant).
5. **La notion "Internal/External" (intercompany) n'a pas de source fiable
   aujourd'hui** (voir Décision Ouverte B du prompt backend) — le badge
   `clientType` ci-dessous doit soit être masqué, soit afficher "External" par
   défaut avec une mention explicite "non disponible" tant que cette décision n'est
   pas tranchée, plutôt que d'afficher une donnée inventée comme si elle était
   fiable.
6. Toutes les règles de l'original restent valables (signaux Angular, pas de
   `<form>` HTML, `withCredentials: true`, copier les classes CSS existantes) — non
   répétées en détail ici, voir le prompt original pour ces points inchangés.

---

## RÈGLES AVANT DE COMMENCER

1. Lire ce fichier en entier, et `daf360-facturation-service/docs/PL_AUDIT.md`.
2. Lire au complet :
   - `report-detail.component.ts` + `.html` — composant existant COMPLET, en particulier
     `sortedLines()`, `exportXlsx()`/`exportPdf()`, et comment `period()`/`lines()`
     sont peuplés aujourd'hui
   - `pl-reporting.model.ts` — interfaces RÉELLES (`PlPeriodDto`, `PlReportDto`,
     `PlReportLineDto`, `PlReportDetailDto`)
   - `pl-report.service.ts`, `pl-period.service.ts` — méthodes HTTP existantes
3. Confirmer que le backend corrigé expose bien `GET /pl-periods/{id}/export-workbook`
   (et, si l'UI Receivables/Missing Cash est dans le périmètre de cette itération,
   les deux nouveaux endpoints correspondants) avant de commencer le code Angular.
4. Exécuter `ng build --configuration=development` et reporter les erreurs.

---

## ÉTAPE 1 — Modèles TypeScript (corrigés)

Ajouter dans `pl-reporting.model.ts`, sans dupliquer ce qui existe déjà
(`PlReportLineDto` existe déjà et doit être réutilisé tel quel pour la ventilation
par catégorie — ne pas créer un nouveau type parallèle pour la même donnée) :

```typescript
// ── Classeur complet (7 onglets) — juste le déclenchement du téléchargement,
//    pas de modèle de données détaillé côté frontend : le fichier est généré
//    entièrement côté backend, le frontend ne fait que déclencher/recevoir le blob.

// (Rien de nouveau requis ici pour le bouton d'export lui-même — voir Étape 2.)

// ── Receivables (si les endpoints backend existent déjà) ───────────────────

export interface ReceivableLineDto {
  invoiceNumber: string;
  clientName: string;
  /** 'External' par défaut tant que la Décision Ouverte B (prompt backend) n'est
   * pas tranchée -- ne pas traiter cette valeur comme fiable à 100% dans l'UI. */
  clientType: 'Internal' | 'External';
  emittedAt: string;
  dueDate: string;
  amountIncTax: number;
  amountExTax: number;
  currency: string;
  daysAgeing: number;
  ageingCategory: 'Not Overdue' | '<30 Days' | '31-60 Days'
                | '61-180 Days' | '181-365 Days' | '> 365 Days';
}

// ── Missing Cash (si les endpoints backend existent déjà) ──────────────────

export interface MissingCashRowDto {
  projectRef: string;
  arTotal: number;
  arNotOverdue: number;
  arLt1Month: number;
  ar1To2Months: number;
  ar2To3Months: number;
  ar3To6Months: number;
  ar6To12Months: number;
  arGt1Year: number;
  wipTotal: number;
  wipLt1Month: number;
  wip1To2Months: number;
  wip2To3Months: number;
  wip3To6Months: number;
  wip6To12Months: number;
  wipGt1Year: number;
  missingCashTotal: number;
}
```

---

## ÉTAPE 2 — Service : export du classeur complet

Ajouter dans `pl-period.service.ts`, **à côté de** (pas à la place de) toute méthode
existante liée à la période :

```typescript
/**
 * Télécharge le classeur Excel complet (7 onglets, format groupe ARX), généré par
 * le NOUVEL endpoint backend -- distinct de PlReportService.exportXlsx(), qui reste
 * l'export technique 1-onglet déjà existant et déjà utilisé ailleurs dans cette page.
 */
exportWorkbook(periodId: number): Observable<Blob> {
  return this.http.get(
    `${this.base}/pl-periods/${periodId}/export-workbook`,
    { responseType: 'blob', withCredentials: true }
  );
}
```

(Vérifier le nom exact du champ de base URL déjà utilisé par les autres méthodes de
ce service — `this.base` est illustratif, ne pas introduire une deuxième convention.)

Si les endpoints Receivables/Missing Cash existent côté backend, ajouter dans
`pl-report.service.ts` (vérifier le chemin exact confirmé par le backend avant de
coder, l'original suppose `/pl-reports/receivables` — à aligner avec ce que le
prompt backend corrigé expose réellement) :

```typescript
getReceivables(paysId: number): Observable<ReceivableLineDto[]> { /* ... */ }
getMissingCash(paysId: number): Observable<MissingCashRowDto[]> { /* ... */ }
```

---

## ÉTAPE 3 — Modifications de `ReportDetailComponent` (corrigées)

### 3a — Ne pas recréer `plRows`/`kpiCards` à partir de champs inexistants

Le prompt original construit `plRows`/`kpiCards` en lisant des propriétés comme
`period.mtdInvoiced` qui n'existent pas. **Pour toute ligne qui a un équivalent
`GroupCatalogueLine` réel**, dériver la valeur du tableau déjà existant
`this.sortedLines()` (ou `this.lines()`) en cherchant par `catalogueLineCode`,
exactement comme le fait déjà le tableau actuel du composant :

```typescript
/** Lit la valeur d'une ligne de catalogue par son code réel (voir la liste des 17
 * codes dans la section CORRECTIONS ci-dessus) -- retourne undefined si absente
 * plutôt que 0, pour distinguer "pas de donnée" de "montant nul". */
private lineAmountByCode(code: string): number | undefined {
  return this.lines().find(l => l.catalogueLineCode === code)?.amountLocal;
}

private lineBudgetByCode(code: string): number | undefined {
  return this.lines().find(l => l.catalogueLineCode === code)?.budgetAmountLocal;
}
```

Les lignes de cascade "totaux" (Gross Revenue 1/2, Net Revenue, Total Costs, EBITDA,
EBITDA%) ont, elles, de vrais champs plats sur `PlPeriodDto` — les lire directement
(`this.period()?.grossRevenue1Local`, etc.), exactement comme le composant le fait
déjà aujourd'hui pour l'EBITDA (ligne ~244 du fichier actuel) — ne pas les recalculer
côté client.

Pour "Material & Energy"/"Subcontractors"/"Salaries recharges"/"Other costs
recharges" : tant que les Décisions Ouvertes A/C (prompt backend) ne sont pas
tranchées, ces lignes n'ont pas de `catalogueLineCode` correspondant. Les afficher
avec la valeur `undefined` → "—" (tiret), pas 0, pour ne pas laisser croire à une
vraie valeur nulle calculée.

### 3b — Bouton d'export (nouveau, distinct de l'existant)

```typescript
isExportingWorkbook = signal(false);

downloadWorkbook(): void {
  const period = this.period();  // vérifier le nom exact du signal existant
  if (!period?.id) return;
  this.isExportingWorkbook.set(true);
  this.plPeriodService.exportWorkbook(period.id).subscribe({
    next: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `P_L_Workbook_${period.periodYear}_${period.periodMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      this.isExportingWorkbook.set(false);
    },
    error: () => this.isExportingWorkbook.set(false),
  });
}
```

Template : ajouter ce bouton À CÔTÉ des boutons `exportXlsx()`/`exportPdf()`
existants (ne pas les retirer), avec un libellé clairement différent, ex. :

```html
<button (click)="downloadWorkbook()" [disabled]="isExportingWorkbook()"
        class="...classes btn existantes...">
  @if (isExportingWorkbook()) { Génération du classeur complet… }
  @else { Exporter le classeur complet (7 onglets) }
</button>
```

### 3c — Receivables / Missing Cash — uniquement si les endpoints backend existent

Reprendre le pattern du prompt original (signaux `showReceivables`/`showMissingCash`,
`isLoadingReceivables`/`isLoadingMissingCash`, chargement paresseux au premier clic)
— ce pattern lui-même n'avait pas d'erreur de fond, seule l'hypothèse sur
l'existence préalable des endpoints était fausse. Vérifier d'abord avec `curl` que
`GET /pl-reports/receivables?paysId=` et `/missing-cash?paysId=` répondent
réellement avant d'écrire ce code.

Pour le badge "Internal/External" de chaque ligne Receivables : afficher le badge
UNIQUEMENT si `clientType` est fiable (voir Décision Ouverte B) — sinon, masquer le
badge entièrement plutôt que d'afficher une valeur par défaut qui a l'air d'être une
vraie donnée.

---

## ÉTAPE 4 — KPI cards (corrigées)

Retirer les 4 KPI cards "Average FTE"/"Billable hrs"-based de l'original (aucune
donnée source dans ce backend — voir ÉTAPE 2 du prompt backend corrigé). Garder
uniquement les cards dont la donnée existe réellement :

```typescript
kpiCards = computed<PlKpiCard[]>(() => {
  const period = this.period();
  if (!period) return [];
  return [
    { label: 'Gross Revenue 2', value: period.grossRevenue2Local ?? 0,
      format: 'currency', currency: /* devise réelle du pays, à confirmer le champ */ undefined },
    { label: 'Net Revenue', value: period.netRevenueLocal ?? 0, format: 'currency' },
    { label: 'EBITDA', value: period.ebitda ?? 0, format: 'currency',
      trend: (period.ebitda ?? 0) >= 0 ? 'up' : 'down' },
    { label: 'EBITDA %', value: period.ebitdaPct ?? 0, format: 'percent' },
  ];
});
```

(Si un KPI "Order Intake YTD" est souhaité, il nécessite l'agrégation YTD décrite en
ÉTAPE 2b du prompt backend corrigé — pas disponible en un seul appel aujourd'hui.)

---

## ÉTAPE 5 — Vérification

```bash
ng build --configuration=development 2>&1 | grep "error TS"
```

**Checklist (corrigée)** :
- [ ] Le bouton existant `exportXlsx()`/`exportPdf()` est toujours présent et
      fonctionnel, inchangé
- [ ] Le nouveau bouton "classeur complet" a un libellé clairement différent
- [ ] Aucune propriété inventée (`mtdInvoiced`, `averageFte`, etc.) n'apparaît dans
      le code final — uniquement les champs réels de `PlPeriodDto` et la lecture de
      `PlReportLineDto[]` par `catalogueLineCode`
- [ ] Les lignes sans source de données réelle (Material & Energy, Subcontractors
      tant que non tranché, recharges) affichent "—", pas "0" ni une valeur inventée
- [ ] Le badge Internal/External n'affiche rien de trompeur tant que la Décision
      Ouverte B n'est pas tranchée
- [ ] Receivables/Missing Cash ne sont codés qu'après confirmation que les
      endpoints backend correspondants répondent réellement
