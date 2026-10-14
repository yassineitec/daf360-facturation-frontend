import { Routes } from '@angular/router';
import { permissionGuard } from '@khalilrebhiitec/daf360';

/**
 * `cost.routes.ts`-style convention: the parent `reporting` entry in `app.routes.ts` carries the
 * broad `FACT_VIEW_PL_REPORT` guard (anyone who can even land on `/reporting`), and each child
 * here narrows further where the screen itself needs more. Literal segments ('budget',
 * 'calendar') are declared BEFORE the dynamic ':id' catch-all — ':id' is a single-segment
 * wildcard and would otherwise greedily match them.
 */
export const REPORTING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reporting-list.component').then(m => m.ReportingListComponent),
  },
  /**
   * Budget Reference entry grid. Visible to anyone with `FACT_VIEW_PL_REPORT` (Finance
   * Manager included, to read the grid and submit it for CD approval) — the two approval
   * actions (`approve-cd`/`approve-group`, `FACT_ADMIN_PL_REPORT`) are gated at the
   * component/button level, not here, same split `cost.routes.ts` uses for its own screens.
   *
   * Component does not exist yet — Task 3.3 creates it. This route only wires the future
   * lazy-loaded path.
   */
  {
    path: 'budget',
    canActivate: [permissionGuard],
    data: { permissions: ['FACT_VIEW_PL_REPORT'] },
    loadComponent: () =>
      import('./budget-entry/budget-entry.component').then(m => m.BudgetEntryComponent),
  },
  /**
   * Submission calendar admin screen. Same reasoning as 'budget' above: readable at
   * `FACT_VIEW_PL_REPORT`, the actual deadline-editing actions are `FACT_ADMIN_PL_REPORT`
   * and gated inside the component.
   *
   * Component does not exist yet — Task 3.3 creates it.
   */
  {
    path: 'calendar',
    canActivate: [permissionGuard],
    data: { permissions: ['FACT_VIEW_PL_REPORT'] },
    loadComponent: () =>
      import('./calendar-admin/calendar-admin.component').then(m => m.CalendarAdminComponent),
  },
  /**
   * Report detail (recap + variance commentary + actions + export). Same permission as the
   * list — the action bar's submit/endorse/accept/request-amendment/reopen buttons are each
   * gated individually inside the component by both report status and the narrower
   * permission that action actually requires (`FACT_MANAGE_PL_REPORT`/`FACT_ENDORSE_PL_REPORT`/
   * `FACT_ACCEPT_PL_REPORT`).
   *
   * Component does not exist yet — Task 3.2 creates it. Deliberately LAST: ':id' is a
   * single-segment wildcard that would otherwise shadow 'budget'/'calendar' above.
   */
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permissions: ['FACT_VIEW_PL_REPORT'] },
    loadComponent: () =>
      import('./report-detail/report-detail.component').then(m => m.ReportDetailComponent),
  },
];
