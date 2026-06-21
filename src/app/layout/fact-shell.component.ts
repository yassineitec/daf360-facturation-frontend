import { Component, Injector, OnInit, computed, inject } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { SideNavComponent } from '@khalilrebhiitec/daf360';
import type { NavItem, SideNavConfig } from '@khalilrebhiitec/daf360';
import { UserStore }           from '../core/user.store';
import { RemoteStylesService } from '../core/remote-styles.service';
import { environment }         from '../../environments/environment';

interface AppNavDef {
  id:         string;
  label:      string;
  icon:       string;
  route:      string;
  permission: string | null;
}

// Routes mirror the child paths defined in app.routes.ts
const APP_NAV_DEFS: AppNavDef[] = [
  { id: 'home',           label: 'Accueil',            icon: 'home',                 route: 'home',             permission: null },
  { id: 'affaires',       label: 'Affaires',           icon: 'work',                 route: 'affaires',         permission: null },
  { id: 'clients',        label: 'Clients',            icon: 'corporate_fare',       route: 'clients',          permission: null },
  { id: 'invoicing',      label: 'Factures',           icon: 'receipt_long',         route: 'invoicing',        permission: null },
  { id: 'payments',       label: 'Paiements',          icon: 'credit_card',          route: 'payments',         permission: null },
  { id: 'subcontracting', label: 'Sous-traitance',     icon: 'group',                route: 'subcontracting',   permission: null },
  { id: 'cost',           label: 'Coûts',              icon: 'payments',             route: 'cost',             permission: null },
  { id: 'reporting',      label: 'Reporting',          icon: 'bar_chart',            route: 'reporting',        permission: null },
  { id: 'admin',          label: 'Administration',     icon: 'admin_panel_settings', route: 'admin',            permission: null },
  { id: 'approval',       label: "File d'approbation", icon: 'task_alt',             route: 'billing/approval', permission: null },
];

@Component({
  selector: 'app-fact-shell',
  standalone: true,
  imports: [RouterOutlet, SideNavComponent],
  templateUrl: './fact-shell.component.html',
  styleUrl:    './fact-shell.component.scss',
})
export class FactShellComponent implements OnInit {
  private readonly userStore      = inject(UserStore);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly remoteStyles   = inject(RemoteStylesService);
  private readonly injector       = inject(Injector);

  ngOnInit(): void {
    this.remoteStyles.injectStyles(environment.stylesUrl);
  }

  readonly activeRoute = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url, injector: this.injector },
  );

  readonly sideNavConfig: SideNavConfig = {
    sectionLabel: 'FINANCE',
    collapsible:  true,
  };

  readonly navItems = computed<NavItem[]>(() =>
    APP_NAV_DEFS
      .filter(def => !def.permission || this.userStore.hasPermission(def.permission))
      .map(def => ({ id: def.id, label: def.label, icon: def.icon, route: def.route }))
  );

  onNavClick(item: NavItem): void {
    if (item.route) {
      this.router.navigate([item.route], { relativeTo: this.activatedRoute });
    }
  }
}
