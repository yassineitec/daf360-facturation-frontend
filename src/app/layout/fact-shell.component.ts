import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { SideNavComponent } from '@khalilrebhiitec/daf360';
import type { NavItem, SideNavConfig } from '@khalilrebhiitec/daf360';
import { UserStore } from '../core/user.store';
import { CurrencySwitcherComponent } from '../shared/currency-switcher/currency-switcher.component';

interface AppNavDef {
  id: string;
  label: string;
  icon: string;
  route: string;
  permission: string | null;
}

const APP_NAV_DEFS: AppNavDef[] = [
  { id: 'home',          label: 'Accueil',          icon: 'home',                 route: 'home',          permission: null },
  { id: 'affaires',      label: 'Affaires',          icon: 'work',                 route: 'affaires',      permission: null },
  { id: 'clients',       label: 'Clients',           icon: 'corporate_fare',       route: 'clients',       permission: null },
  { id: 'invoicing',     label: 'Factures',          icon: 'receipt_long',         route: 'invoicing',     permission: null },
  { id: 'payments',      label: 'Paiements',         icon: 'credit_card',          route: 'payments',      permission: null },
  { id: 'subcontracting',label: 'Sous-traitance',    icon: 'group',                route: 'subcontracting',permission: null },
  { id: 'cost',          label: 'Coûts',             icon: 'payments',             route: 'cost',          permission: null },
  { id: 'cost-approval', label: 'Approbation Coûts', icon: 'price_check',          route: 'cost/approval', permission: null },
  { id: 'suppliers',     label: 'Fournisseurs',      icon: 'storefront',           route: 'suppliers',     permission: null },
  { id: 'reporting',     label: 'Reporting',         icon: 'bar_chart',            route: 'reporting',     permission: null },
  { id: 'admin',         label: 'Administration',    icon: 'admin_panel_settings', route: 'admin',         permission: null },
];

@Component({
  selector: 'app-fact-shell',
  standalone: true,
  imports: [RouterOutlet, SideNavComponent, CommonModule, CurrencySwitcherComponent],
  templateUrl: './fact-shell.component.html',
  styleUrl: './fact-shell.component.scss',
})
export class FactShellComponent {
  private readonly userStore      = inject(UserStore);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly injector       = inject(Injector);

  // The display currency lives in `app-currency-switcher` now — the shell no longer
  // owns the service or the currency list.
  // styles.css is injected + awaited by the shell (ensureRemoteStyles) before
  // this route activates — no runtime injection here.

  readonly activeRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url, injector: this.injector },
  );

  readonly sidebarOpen = signal(false);

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  closeSidebar():  void { this.sidebarOpen.set(false); }

  readonly sideNavConfig: SideNavConfig = {
    sectionLabel: 'FINANCE',
    collapsible: true,
  };

  readonly navItems = computed<NavItem[]>(() =>
    APP_NAV_DEFS.filter(
      (def) => !def.permission || this.userStore.hasPermission(def.permission),
    ).map((def) => ({ id: def.id, label: def.label, icon: def.icon, route: def.route })),
  );

  onNavClick(item: NavItem): void {
    this.closeSidebar();
    if (item.route) {
      this.router.navigate([item.route], { relativeTo: this.activatedRoute });
    }
  }
}
