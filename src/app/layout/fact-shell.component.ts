import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { SideNavComponent } from '@khalilrebhiitec/daf360';
import type { NavItem, SideNavConfig } from '@khalilrebhiitec/daf360';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserStore } from '../core/user.store';

interface AppNavDef {
  id: string;
  labelKey: string;
  icon: string;
  route: string;
  permission: string | null;
}

const APP_NAV_DEFS: AppNavDef[] = [
  { id: 'home',          labelKey: 'FACTURATION.layout.NAV.HOME',           icon: 'home',                 route: 'home',          permission: null },
  { id: 'affaires',      labelKey: 'FACTURATION.layout.NAV.AFFAIRES',       icon: 'work',                 route: 'affaires',      permission: null },
  { id: 'clients',       labelKey: 'FACTURATION.layout.NAV.CLIENTS',        icon: 'corporate_fare',       route: 'clients',       permission: null },
  { id: 'invoicing',     labelKey: 'FACTURATION.layout.NAV.INVOICING',      icon: 'receipt_long',         route: 'invoicing',     permission: null },
  { id: 'payments',      labelKey: 'FACTURATION.layout.NAV.PAYMENTS',       icon: 'credit_card',          route: 'payments',      permission: null },
  { id: 'subcontracting',labelKey: 'FACTURATION.layout.NAV.SUBCONTRACTING', icon: 'group',                route: 'subcontracting',permission: null },
  { id: 'cost',          labelKey: 'FACTURATION.layout.NAV.COST',           icon: 'payments',             route: 'cost',          permission: null },
  { id: 'cost-approval', labelKey: 'FACTURATION.layout.NAV.COST_APPROVAL',  icon: 'price_check',          route: 'cost/approval', permission: null },
  { id: 'suppliers',     labelKey: 'FACTURATION.layout.NAV.SUPPLIERS',      icon: 'storefront',           route: 'suppliers',     permission: null },
  { id: 'reporting',     labelKey: 'FACTURATION.layout.NAV.REPORTING',      icon: 'bar_chart',            route: 'reporting',     permission: null },
  { id: 'admin',         labelKey: 'FACTURATION.layout.NAV.ADMIN',          icon: 'admin_panel_settings', route: 'admin',         permission: null },
];

@Component({
  selector: 'app-fact-shell',
  standalone: true,
  imports: [RouterOutlet, SideNavComponent, CommonModule, TranslatePipe],
  templateUrl: './fact-shell.component.html',
  styleUrl: './fact-shell.component.scss',
})
export class FactShellComponent {
  private readonly userStore      = inject(UserStore);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly injector       = inject(Injector);
  private readonly translate      = inject(TranslateService);
  // styles.css is injected + awaited by the shell (ensureRemoteStyles) before
  // this route activates — no runtime injection here.

  readonly activeRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url, injector: this.injector },
  );

  /**
   * The lib SideNavComponent matches active state by EXACT equality
   * (`activeRoute === item.route`), but router.url is the full path
   * (e.g. `/facturation/cost/approval`) while item routes are bare segments
   * (`cost/approval`). Map the URL to the matching item route, longest first
   * so `cost/approval` wins over `cost`.
   */
  readonly activeNavRoute = computed<string>(() => {
    const url = this.activeRoute().split(/[?#]/)[0].replace(/\/+$/, '');
    const bySpecificity = [...APP_NAV_DEFS].sort((a, b) => b.route.length - a.route.length);
    const match = bySpecificity.find((def) => {
      const seg = '/' + def.route;
      return url === seg || url.endsWith(seg) || url.includes(seg + '/');
    });
    return match ? match.route : '';
  });

  readonly sidebarOpen = signal(false);

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  closeSidebar():  void { this.sidebarOpen.set(false); }

  readonly sideNavConfig = computed<SideNavConfig>(() => {
    this.translate.currentLang();
    return {
      sectionLabel: this.translate.instant('FACTURATION.layout.SECTION'),
      collapsible: true,
    };
  });

  readonly navItems = computed<NavItem[]>(() => {
    this.translate.currentLang();
    return APP_NAV_DEFS.filter(
      (def) => !def.permission || this.userStore.hasPermission(def.permission),
    ).map((def) => ({ id: def.id, label: this.translate.instant(def.labelKey), icon: def.icon, route: def.route }));
  });

  onNavClick(item: NavItem): void {
    this.closeSidebar();
    if (item.route) {
      this.router.navigate([item.route], { relativeTo: this.activatedRoute });
    }
  }
}
