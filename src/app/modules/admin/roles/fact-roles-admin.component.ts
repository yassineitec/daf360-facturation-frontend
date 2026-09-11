import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';import {
  ButtonComponent, CardComponent, CheckboxComponent, PageHeaderComponent, BreadcrumbItem, AccordionCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow, BadgeCell,
} from '@khalilrebhiitec/daf360';

interface PermissionCodeItem { code: string; label: string; }
interface PermissionGroup    { groupName: string; permissions: PermissionCodeItem[]; }
interface RoleListItem {
  id: number;
  frenchName: string;
  permissions: string[];
  permissionCount: number;
  userCount: number;
  showAll: boolean;
}

@Component({
  selector: 'app-fact-roles-admin',
  standalone: true,
  imports: [
    FormsModule, TranslatePipe, ButtonComponent, CardComponent, CheckboxComponent, PageHeaderComponent, AccordionCardComponent,
    DataTableComponent, DafCellDirective,
  ],
  template: `
@if (!selectedRole()) {
  <!-- List — same pattern as /rh/admin's role management: a table, click a row to
       open its permissions as this component's own "page" below, not a side panel. -->
  <div class="roles-page">

    <div class="page-header">
      <h1 class="page-title">{{ 'ADMIN.ROLES.TITLE' | translate }}</h1>
      <p class="page-sub">{{ 'ADMIN.ROLES.SUBTITLE' | translate }}</p>
    </div>

    @if (pageError()) {
      <div class="banner banner--error">{{ pageError() }}</div>
    }

    <!-- Fond partagé pour le tableau de rôles — même variante glass que la carte
         du bandeau d'onglets principal, au lieu d'un tableau nu sans arrière-plan. -->
    <daf-card [options]="{ variant: 'glass', padding: 'sm', radius: 'xl' }">
      <daf-data-table [columns]="roleColumns()" [rows]="roleRows()" [config]="roleTableConfig()"
        (rowClick)="selectRole($event['_raw'])">
        <ng-template dafCell="name" let-row>
          <span class="role-name">{{ row['name'] }}</span>
        </ng-template>
      </daf-data-table>
    </daf-card>
  </div>
} @else {
  <!-- Detail — breadcrumb back to the list, same convention as /rh/admin's role
       editor (no separate "back" button, the crumb itself is the way back). -->
  <div class="roles-page">

    <daf-page-header
      [title]="selectedRole()!.frenchName"
      [breadcrumbs]="[
        { label: ('ADMIN.TABS.PERMISSIONS' | translate) },
        { label: selectedRole()!.frenchName }
      ]"
      (breadcrumbNavigate)="onBreadcrumbNavigate($event)" />

    <div class="perms-actions">
      <daf-button [options]="{ variant: 'ghost', size: 'sm', label: ('ADMIN.ROLES.CHECK_ALL' | translate), disabled: saving() }"
        (onClick)="selectAll()" />
      <daf-button [options]="{ variant: 'ghost', size: 'sm', label: ('ADMIN.ROLES.UNCHECK_ALL' | translate), disabled: saving() }"
        (onClick)="clearAll()" />
      <daf-button [options]="{ variant: 'teal', size: 'sm', label: ((saving() ? 'ADMIN.ROLES.SAVING' : 'ADMIN.ROLES.SAVE') | translate), loading: saving() }"
        (onClick)="saveAll()" />
    </div>

    @if (saveError()) {
      <div class="banner banner--error">{{ saveError() }}</div>
    }
    @if (saveSuccess()) {
      <div class="banner banner--success">{{ saveSuccess() }}</div>
    }

    @if (loadingCatalog()) {
      <div class="loading-hint">{{ 'ADMIN.ROLES.LOADING_CATALOG' | translate }}</div>
    } @else {
      <!-- daf-accordion-card natif à la place de l'accordéon fait main : chrome
           (chevron, bouton accessible aria-expanded, corps monté seulement à
           l'ouverture) fourni par la lib. L'option state reste au défaut 'pending' —
           un groupe de permissions n'est pas une étape de workflow, donc pas de
           couleur/état forcés ; statusLabel porte juste le compte X / Y. -->
      <div class="groups-list">
        @for (group of catalog(); track group.groupName) {
          <daf-accordion-card
            [options]="{ title: group.groupName, icon: 'shield',
                         statusLabel: groupCheckedCount(group) + ' / ' + group.permissions.length }"
            [open]="isExpanded(group.groupName)"
            (openChange)="toggleGroup(group.groupName)">
            <div class="perm-items">
              @for (perm of group.permissions; track perm.code) {
                <div class="perm-item"
                  [class.perm-item--fact]="perm.code.startsWith('FACT_')"
                  [class.perm-item--checked]="isChecked(perm.code)">
                  <daf-checkbox
                    [checked]="isChecked(perm.code)"
                    (checkedChange)="toggle(perm.code)" />
                  <span class="perm-code">{{ perm.code }}</span>
                  <span class="perm-label">{{ perm.label }}</span>
                </div>
              }
            </div>
          </daf-accordion-card>
        }
      </div>
    }
  </div>
}
  `,
  styles: [`
    .roles-page { padding: 1.5rem 2rem; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title  { font-size: 1.375rem; font-weight: 700; color: #0f172a; margin: 0 0 0.25rem; }
    .page-sub    { font-size: 0.875rem; color: #64748b; margin: 0; }

    .banner {
      padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.875rem;
      margin-bottom: 1rem;
      &--error   { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
      &--success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    }

    .role-name  { font-size: 0.875rem; color: #0f172a; font-weight: 500; }

    .perms-actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-shrink: 0; margin: 1rem 0; }

    /* Permission groups — le chrome de l'accordéon (bordure, en-tête, chevron) vient
       maintenant de daf-accordion-card ; il ne reste ici que le contenu projeté. */
    .groups-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .perm-items  { display: flex; flex-direction: column; }
    .perm-item {
      display: flex; align-items: center; gap: 0.625rem;
      padding: 0.5rem 0.875rem; border-top: 1px solid #f1f5f9;
      &:hover { background: #fafafa; }
      &--fact { background: #f0f9ff; &:hover { background: #e0f2fe; } }
      /* Ligne cochée mise en évidence — même idée que /rh/admin (rpt-perm-checked),
         teinte distincte du bleu "--fact" pour ne pas se confondre avec lui. */
      &--checked { background: #f0fdfa; &:hover { background: #ccfbf1; } }
    }
    .perm-code  { font-size: 0.775rem; font-family: monospace; color: #0f172a; min-width: 230px; }
    .perm-label { font-size: 0.775rem; color: #64748b; }

    .loading-hint { padding: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.875rem; }
  `],
})
export class FactRolesAdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly base = `${environment.factApiUrl}/api/fact/admin`;

  roles        = signal<RoleListItem[]>([]);
  selectedRole = signal<RoleListItem | null>(null);
  catalog      = signal<PermissionGroup[]>([]);

  loadingRoles   = signal(true);
  loadingCatalog = signal(true);
  saving         = signal(false);
  pageError      = signal<string | null>(null);
  saveError      = signal<string | null>(null);
  saveSuccess    = signal<string | null>(null);

  checkedSet     = signal<Set<string>>(new Set());
  expandedGroups = signal<Set<string>>(new Set());

  readonly roleColumns = computed<TableColumn[]>(() => [
    { key: 'name',  label: '', type: 'custom' },
    { key: 'badge', label: '', type: 'badge', align: 'right' },
  ]);

  readonly roleRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string, params?: object) => this.translate.instant(key, params);
    return this.roles().map(r => ({
      id:   r.id,
      name: r.frenchName,
      badge: {
        label:   r.showAll ? t('ADMIN.ROLES.BADGE_ADMIN') : t('ADMIN.ROLES.PERM_COUNT', { count: r.permissionCount }),
        options: { variant: r.showAll ? 'warning' : 'neutral', size: 'sm' },
      } satisfies BadgeCell,
      _raw: r,
    }));
  });

  readonly roleTableConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    loading:    this.loadingRoles(),
    emptyMessage: this.translate.instant('ADMIN.ROLES.NO_ROLES'),
  }));

  ngOnInit(): void {
    this.http.get<RoleListItem[]>(`${this.base}/roles`).subscribe({
      next:  roles => { this.roles.set(roles); this.loadingRoles.set(false); },
      error: ()    => {
        this.pageError.set(this.translate.instant('ADMIN.ROLES.ERROR_LOAD_ROLES'));
        this.loadingRoles.set(false);
      },
    });

    this.http.get<PermissionGroup[]>(`${this.base}/permissions/catalog`).subscribe({
      next: groups => {
        this.catalog.set(groups);
        this.expandedGroups.set(new Set(
          groups.filter(g => g.groupName === 'Module Facturation').map(g => g.groupName)
        ));
        this.loadingCatalog.set(false);
      },
      error: () => this.loadingCatalog.set(false),
    });
  }

  onBreadcrumbNavigate(crumb: BreadcrumbItem): void {
    if (crumb.label !== this.selectedRole()?.frenchName) {
      this.selectedRole.set(null);
    }
  }

  selectRole(role: RoleListItem): void {
    this.selectedRole.set(role);
    const catalogCodes = new Set(this.catalog().flatMap(g => g.permissions.map(p => p.code)));
    this.checkedSet.set(new Set(role.permissions.filter(p => catalogCodes.has(p))));
    this.saveError.set(null);
    this.saveSuccess.set(null);
  }

  toggleGroup(name: string): void {
    const s = new Set(this.expandedGroups());
    if (s.has(name)) s.delete(name); else s.add(name);
    this.expandedGroups.set(s);
  }

  isExpanded(name: string): boolean { return this.expandedGroups().has(name); }
  isChecked(code: string): boolean  { return this.checkedSet().has(code); }

  groupCheckedCount(group: PermissionGroup): number {
    return group.permissions.filter(p => this.isChecked(p.code)).length;
  }

  toggle(code: string): void {
    const next = new Set(this.checkedSet());
    if (next.has(code)) next.delete(code); else next.add(code);
    this.checkedSet.set(next);
  }

  selectAll(): void {
    this.checkedSet.set(new Set(this.catalog().flatMap(g => g.permissions.map(p => p.code))));
  }

  clearAll(): void { this.checkedSet.set(new Set()); }

  saveAll(): void {
    const role = this.selectedRole();
    if (!role) return;
    const codes = [...this.checkedSet()];
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    this.http.patch<void>(`${this.base}/roles/${role.id}/permissions`, { permissions: codes })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saveSuccess.set(this.translate.instant('ADMIN.ROLES.SAVE_SUCCESS'));
          // Refresh role in list
          this.roles.update(list => list.map(r =>
            r.id === role.id ? { ...r, permissions: codes, permissionCount: codes.length } : r
          ));
          this.selectedRole.update(r => r ? { ...r, permissions: codes, permissionCount: codes.length } : r);
          setTimeout(() => this.saveSuccess.set(null), 3000);
        },
        error: err => {
          this.saving.set(false);
          this.saveError.set(err?.error?.message ?? this.translate.instant('ADMIN.ROLES.SAVE_ERROR'));
        },
      });
  }
}
