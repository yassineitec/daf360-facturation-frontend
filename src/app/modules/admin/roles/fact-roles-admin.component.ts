import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';

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
  imports: [FormsModule, TranslatePipe],
  template: `
<div class="roles-page">

  <div class="page-header">
    <h1 class="page-title">{{ 'ADMIN.ROLES.TITLE' | translate }}</h1>
    <p class="page-sub">{{ 'ADMIN.ROLES.SUBTITLE' | translate }}</p>
  </div>

  @if (pageError()) {
    <div class="banner banner--error">{{ pageError() }}</div>
  }

  <div class="roles-layout">

    <!-- Left: role list -->
    <div class="roles-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ 'ADMIN.ROLES.SIDEBAR_TITLE' | translate:{ count: roles().length } }}</span>
      </div>

      @if (loadingRoles()) {
        <div class="loading-hint">{{ 'ADMIN.ROLES.LOADING' | translate }}</div>
      } @else {
        <div class="role-list">
          @for (r of roles(); track r.id) {
            <button class="role-row" [class.active]="selectedRole()?.id === r.id"
                    (click)="selectRole(r)">
              <span class="role-name">{{ r.frenchName }}</span>
              <span class="role-badge" [class.badge-all]="r.showAll">
                {{ r.showAll ? ('ADMIN.ROLES.BADGE_ADMIN' | translate) : ('ADMIN.ROLES.PERM_COUNT' | translate:{ count: r.permissionCount }) }}
              </span>
            </button>
          }
        </div>
      }
    </div>

    <!-- Right: permissions -->
    <div class="perms-panel">
      @if (!selectedRole()) {
        <div class="empty-state">{{ 'ADMIN.ROLES.EMPTY_STATE' | translate }}</div>
      } @else {
        <div class="perms-header">
          <div>
            <h2 class="perms-title">{{ selectedRole()!.frenchName }}</h2>
            @if (selectedRole()!.showAll) {
              <span class="admin-note">{{ 'ADMIN.ROLES.ADMIN_NOTE' | translate }}</span>
            }
          </div>
          <div class="perms-actions">
            <button class="btn-ghost" (click)="selectAll()" [disabled]="saving()">{{ 'ADMIN.ROLES.CHECK_ALL' | translate }}</button>
            <button class="btn-ghost" (click)="clearAll()" [disabled]="saving()">{{ 'ADMIN.ROLES.UNCHECK_ALL' | translate }}</button>
            <button class="btn-save" (click)="saveAll()"
                    [disabled]="saving()">
              {{ (saving() ? 'ADMIN.ROLES.SAVING' : 'ADMIN.ROLES.SAVE') | translate }}
            </button>
          </div>
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
          <div class="groups-list">
            @for (group of catalog(); track group.groupName) {
              <div class="perm-group">
                <button class="group-header" (click)="toggleGroup(group.groupName)">
                  <span class="group-chevron">{{ isExpanded(group.groupName) ? '▾' : '▸' }}</span>
                  <span class="group-name">{{ group.groupName }}</span>
                  <span class="group-count">
                    {{ groupCheckedCount(group) }}/{{ group.permissions.length }}
                  </span>
                </button>

                @if (isExpanded(group.groupName)) {
                  <div class="perm-items">
                    @for (perm of group.permissions; track perm.code) {
                      <label class="perm-item" [class.perm-item--fact]="perm.code.startsWith('FACT_')">
                        <input type="checkbox"
                               [checked]="isChecked(perm.code)"
                               (change)="toggle(perm.code)" />
                        <span class="perm-code">{{ perm.code }}</span>
                        <span class="perm-label">{{ perm.label }}</span>
                      </label>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  </div>

</div>
  `,
  styles: [`
    .roles-page { padding: 1.5rem 2rem; max-width: 1200px; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title  { font-size: 1.375rem; font-weight: 700; color: #0f172a; margin: 0 0 0.25rem; }
    .page-sub    { font-size: 0.875rem; color: #64748b; margin: 0; }

    .banner {
      padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.875rem;
      margin-bottom: 1rem;
      &--error   { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
      &--success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    }

    .roles-layout {
      display: grid; grid-template-columns: 260px 1fr; gap: 1.5rem; align-items: start;
    }

    /* Sidebar */
    .roles-sidebar {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
    }
    .sidebar-header {
      padding: 0.875rem 1rem; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
    }
    .sidebar-title { font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .role-list { display: flex; flex-direction: column; }
    .role-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1rem; background: none; border: none; border-bottom: 1px solid #f1f5f9;
      cursor: pointer; text-align: left; gap: 0.5rem;
      &:hover    { background: #f8fafc; }
      &.active   { background: #eff6ff; border-left: 3px solid #3b82f6; }
      &:last-child { border-bottom: none; }
    }
    .role-name  { font-size: 0.875rem; color: #0f172a; font-weight: 500; flex: 1; }
    .role-badge {
      font-size: 0.7rem; padding: 2px 6px; border-radius: 99px;
      background: #f1f5f9; color: #64748b; white-space: nowrap;
      &.badge-all { background: #fef3c7; color: #92400e; }
    }

    /* Permissions panel */
    .perms-panel {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem;
    }
    .empty-state {
      text-align: center; color: #94a3b8; padding: 3rem 1rem; font-size: 0.9rem;
    }
    .perms-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 1.25rem; gap: 1rem;
    }
    .perms-title  { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 0 0 0.125rem; }
    .admin-note   { font-size: 0.8rem; color: #d97706; }
    .perms-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
    .btn-ghost {
      padding: 0.4rem 0.875rem; border: 1px solid #cbd5e1; border-radius: 6px;
      background: #fff; color: #374151; font-size: 0.8rem; cursor: pointer;
      &:hover:not(:disabled) { background: #f8fafc; }
      &:disabled { opacity: 0.45; cursor: default; }
    }
    .btn-save {
      padding: 0.4rem 1rem; border: none; border-radius: 6px;
      background: #0f172a; color: #fff; font-size: 0.8rem; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: #1e293b; }
      &:disabled { opacity: 0.45; cursor: default; }
    }

    /* Permission groups */
    .groups-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .perm-group  { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .group-header {
      display: flex; align-items: center; gap: 0.5rem; width: 100%;
      padding: 0.625rem 0.875rem; background: #f8fafc; border: none; cursor: pointer;
      text-align: left;
      &:hover { background: #f1f5f9; }
    }
    .group-chevron { font-size: 0.7rem; color: #64748b; width: 12px; }
    .group-name   { flex: 1; font-size: 0.825rem; font-weight: 600; color: #374151; }
    .group-count  { font-size: 0.75rem; color: #94a3b8; }
    .perm-items   { display: flex; flex-direction: column; }
    .perm-item {
      display: flex; align-items: center; gap: 0.625rem;
      padding: 0.5rem 0.875rem; cursor: pointer; border-top: 1px solid #f1f5f9;
      &:hover { background: #fafafa; }
      &--fact { background: #f0f9ff; &:hover { background: #e0f2fe; } }
      input[type=checkbox] { accent-color: #3b82f6; width: 15px; height: 15px; cursor: pointer; }
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
