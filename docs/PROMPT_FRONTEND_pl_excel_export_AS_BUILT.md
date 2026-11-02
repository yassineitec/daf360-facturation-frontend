# DAF360 Facturation Frontend — P&L Page Enhancement — AS-BUILT
# Module : daf360-facturation-frontend
# Ce document remplace PROMPT_FRONTEND_pl_excel_export_CORRECTED.md : la fonctionnalité a été
# entièrement implémentée, revue et PUSHÉE sur origin/main le 2026-10-22 (commit `68fe5d1` +
# fusion sans conflit avec le reste d'origin/main). Ce qui suit décrit l'état RÉEL du code, pas
# un plan.

---

## Statut

`ng build --configuration development` propre, aucune erreur TS. Revue finale faite directement
(pas via subagent, limite de taux org-wide atteinte ce jour-là) : correspondance champ-à-champ des
DTOs, chaînes d'ageing alignées à l'identique sur les 6 valeurs réelles du backend, clé `period.id`
vs `report.id` vérifiée correcte, i18n FR/EN complet — aucun problème trouvé.

**Même gap connu que côté backend** (voir `PROMPT_BACKEND_pl_excel_export_AS_BUILT.md`) : aucun
`.xlsx` réellement généré n'a été ouvert dans Excel/LibreOffice pendant cette session — seule la
vérification build/compile a eu lieu côté frontend pour le bouton de téléchargement.

---

## Décisions reflétées côté frontend (voir le document backend pour le détail complet)

- **Décision B (Internal/External)** : `ReceivableLineDto.clientType` est traité comme une vraie
  valeur fiable aujourd'hui (toujours `"External"`), pas comme un badge à masquer — contrairement
  à ce que le prompt CORRECTED anticipait prudemment avant que la décision soit tranchée.
- **Décision C (recharges)** : les 2 champs `salaryRecharges`/`otherCostRecharges` sont de vrais
  champs de formulaire dans la modale "Clôturer la période", pas des stubs.
- **Material & Energy / Subcontractors (Décision A)** existent désormais comme vraies lignes de
  catalogue côté backend (`MATERIAL_ENERGY`, `SUBCONTRACTORS`) — le frontend n'a pas eu besoin de
  mapping spécial pour elles : elles arrivent comme n'importe quel autre `PlReportLineDto` avec un
  `catalogueLineCode` réel.

---

## `pl-reporting.model.ts`

Ajouts confirmés, aux positions exactes :
```typescript
// PlPeriodDto (lecture) — juste après wipPreviousYears
salaryRecharges: number;
otherCostRecharges: number;

// ClosePeriodRequest (écriture) — mêmes noms, optionnels/nullable
salaryRecharges?: number | null;
otherCostRecharges?: number | null;
```

Nouvelles interfaces (vérifiées champ pour champ contre les vrais records Java côté backend,
PAS les suppositions du prompt original qui imaginait à tort une ventilation WIP par tranche
d'âge dans `MissingCashRowDto` — elle n'existe pas, `wipTotal` est une figure unique) :
```typescript
export interface ReceivableLineDto {
  invoiceNumber: string;
  clientName: string;
  clientType: string;          // toujours "External" aujourd'hui, voir Décision B
  emittedAt: string;
  dueDate: string;
  amountIncTax: number;
  amountExTax: number;
  currency: string;
  daysAgeing: number;
  ageingCategory: 'Not Overdue' | '<30 Days' | '31-60 Days'
                | '61-180 Days' | '181-365 Days' | '> 365 Days';
}

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
  wipTotal: number;             // figure unique, pas de ventilation par âge (v1, documenté)
  missingCashTotal: number;
}
```

---

## Services

`pl-period.service.ts` — nouvelle méthode, à côté des méthodes existantes :
```typescript
exportWorkbook(periodId: number): Observable<Blob> {
  // GET {base}/pl-periods/${periodId}/export-workbook
}
```

`pl-report.service.ts` — 2 nouvelles méthodes :
```typescript
getReceivables(paysId: number): Observable<ReceivableLineDto[]>  // GET .../pl-reports/receivables?paysId=
getMissingCash(paysId: number): Observable<MissingCashRowDto[]>  // GET .../pl-reports/missing-cash?paysId=
```

Les boutons existants `exportXlsx()`/`exportPdf()` (export technique 1-onglet, clé `report.id`)
sont restés **complètement inchangés**, byte pour byte — le nouveau bouton est un ajout, pas un
remplacement.

---

## `report-detail.component.ts` / `.html`

- `isExportingWorkbook` (signal) + `downloadWorkbook()` — se branche sur `period()?.id`
  (**pas** `report.id` — ce sont bien deux espaces d'id distincts, confirmé). Réutilise les
  helpers déjà existants `downloadBlob()`/`readBlobError()`.
- `kpiCards` (computed) — réutilise les computeds d'affichage de cascade **déjà existants sur la
  page** (`grossRevenue2Display`, `netRevenueDisplay`, `ebitdaDisplay`, `ebitdaPctDisplay`) plutôt
  que le composant de librairie `daf-metric-card` disponible ailleurs dans l'app — choix explicite
  pour rester cohérent avec le langage visuel "cascade" déjà en place sur cette page précise.
- `AGEING_BADGE` (constante au niveau module) — mappe chacune des 6 chaînes `ageingCategory` réelles
  du backend vers une variante de badge visuel, avec un fallback `'neutral'` pour toute valeur non
  reconnue (défensif, jamais déclenché en pratique puisque le backend n'émet que ces 6 valeurs).
- Panneaux Receivables / Missing Cash via `daf-data-table`, chargement paresseux au premier
  affichage (pas au chargement initial de la page), rendus dans l'ordre renvoyé par le backend
  (`missingCashTotal` décroissant côté serveur) — **pas** de `.sort()` côté client.

---

## `reporting-list.component.ts` / `.html`

2 nouveaux signaux `closeSalaryRecharges`/`closeOtherCostRecharges` dans la modale "Clôturer la
période" (`openClosePeriod()` les réinitialise, `submitClosePeriod()` les inclut dans le corps de
la requête), 2 nouveaux champs `<daf-form-field type="number">` — même pattern de binding exact
que les 5 champs manuels déjà existants (`$event === null || $event === '' ? null : +$event`).

---

## i18n (`public/i18n/fr.json` / `en.json`)

Nouvelles clés confirmées présentes et appariées dans les deux fichiers :
`REPORTING.CLOSE_PERIOD_SALARY_RECHARGES`, `REPORTING.CLOSE_PERIOD_OTHER_COST_RECHARGES`,
`REPORTING.DETAIL.KPI_TITLE`, `REPORTING.DETAIL.ACTIONS.EXPORT_WORKBOOK`/`EXPORTING_WORKBOOK`,
`REPORTING.DETAIL.CASH.{RECEIVABLES,AGEING,MISSING_CASH}`.
