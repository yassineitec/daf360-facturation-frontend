import { Component, Injector, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { RadialMenuComponent, SideNavComponent } from '@khalilrebhiitec/daf360';
import type { NavItem, RadialMenuConfig, RadialMenuItem, SideNavConfig } from '@khalilrebhiitec/daf360';
import { UserStore } from '../core/user.store';
import {
  FINANCE_MODULES, activeNavRoute, isNavigableRoute, routePermissions,
} from '../modules/finance-modules';
import type { FinanceModuleDef } from '../modules/finance-modules';
import { CurrencyDisplayService, SUPPORTED_CURRENCIES } from '../core/currency-display.service';

/** 1–3 characters drawn in the circle — the radial menu shows `glyph` when there is no `icon`. */
const CURRENCY_GLYPHS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  TND: 'DT',
  EGP: 'E£',
};

@Component({
  selector: 'app-fact-shell',
  standalone: true,
  imports: [RouterOutlet, SideNavComponent, RadialMenuComponent],
  templateUrl: './fact-shell.component.html',
  styleUrl: './fact-shell.component.scss',
})
export class FactShellComponent {
  private readonly userStore      = inject(UserStore);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly injector       = inject(Injector);
  private readonly translate      = inject(TranslateService);
  private readonly currencySvc    = inject(CurrencyDisplayService);

  // styles.css is injected + awaited by the shell (ensureRemoteStyles) before
  // this route activates — no runtime injection here.

  private readonly rawUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url, injector: this.injector },
  );

  /**
   * `daf-side-nav` allume sur une **égalité stricte** `activeRoute === item.route`, or les
   * routes de nav sont des segments (`affaires`) et l'URL est absolue
   * (`/finance/affaires/3`) : en lui passant l'URL brute, aucune entrée ne s'allumait
   * jamais. C'est le même correctif que `hr-shell`.
   */
  readonly activeRoute = computed(() => activeNavRoute(this.rawUrl() ?? '', FINANCE_MODULES));

  /**
   * Les enfants de la route de layout — donc la config réelle des écrans finance. C'est
   * `routeConfig` du composant lui-même : pas d'import de `app.routes`, qui référence ce
   * composant et créerait un cycle.
   */
  private readonly routeChildren = this.activatedRoute.routeConfig?.children ?? [];

  readonly sidebarOpen = signal(false);

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  closeSidebar():  void { this.sidebarOpen.set(false); }

  /** Le libellé de section passe par i18n comme les entrées — il était en dur. */
  readonly sideNavConfig = computed<SideNavConfig>(() => {
    this.translate.currentLang();
    return {
      sectionLabel: this.translate.instant('FACTURATION.layout.SECTION'),
      collapsible:  true,
    };
  });

  /**
   * La barre latérale, construite depuis `FINANCE_MODULES` — la même liste que la page
   * d'accueil, donc même ordre et mêmes libellés.
   *
   * Deux filtres, tous deux **dérivés de la config de route**, jamais redéclarés ici :
   *  - `isNavigableRoute` écarte ce qui n'est qu'un `redirectTo`. C'est ce qui garde
   *    « Recouvrement » et « Trésorerie » hors de la barre — elles renverraient sur
   *    l'accueil — tout en les laissant en cartes sur l'accueil. Le jour où leur écran
   *    existera, elles apparaîtront d'elles-mêmes.
   *  - `routePermissions` reprend le `data.permissions` que `permissionGuard` applique
   *    déjà, en « au moins une ». Afficher une entrée qui renvoie ensuite sur
   *    `/forbidden` n'a pas de sens ; et comme la source est la route, la barre ne peut
   *    pas diverger du garde.
   *
   * `translate.currentLang()` est lu pour que les libellés se retraduisent au changement
   * de langue : `instant` n'est pas réactif, et `daf-side-nav` prend des objets `NavItem`,
   * donc le pipe `translate` n'est pas une option.
   */
  readonly navItems = computed<NavItem[]>(() => {
    this.translate.currentLang();

    const allowed = (route: string) => {
      const perms = routePermissions(this.routeChildren, route);
      return perms.length === 0 || perms.some(p => this.userStore.hasPermission(p));
    };

    const toNavItem = (def: FinanceModuleDef): NavItem => {
      const children = (def.children ?? [])
        .filter(c => def.sidebar !== false && allowed(c.route))
        .map(toNavItem);
      return {
        id:    def.id,
        label: this.translate.instant(def.labelKey),
        icon:  def.icon,
        route: def.route,
        // Omis quand vide : `children: []` ferait quand même de l'entrée un groupe
        // dépliable, avec un chevron qui n'ouvre rien.
        ...(children.length ? { children } : {}),
      };
    };

    return FINANCE_MODULES
      .filter(def => def.sidebar !== false)
      .filter(def => isNavigableRoute(this.routeChildren, def.route))
      .filter(def => allowed(def.route))
      .map(toNavItem);
  });

  // ── Display-currency picker (daf-radial-menu) ──────────────────────────────
  //
  // The FAB stands in for the current choice, so `active` is the currency in force and
  // the menu only ever reports a click — the service stays the single writer, because
  // it is what persists the choice and what `DisplayCurrencyPipe` reads.

  readonly currentCurrency = this.currencySvc.selectedCurrency;

  /** `currentLang()` is read so the labels re-translate on a language switch. */
  readonly currencyItems = computed<RadialMenuItem[]>(() => {
    this.translate.currentLang();
    return SUPPORTED_CURRENCIES.map(code => ({
      id:    code,
      glyph: CURRENCY_GLYPHS[code],
      label: this.translate.instant(`COMMON.CURRENCY.NAMES.${code}`),
    }));
  });

  readonly currencyMenuConfig = computed<RadialMenuConfig>(() => {
    this.translate.currentLang();
    return {
      label:      this.translate.instant('COMMON.CURRENCY.TITLE'),
      // Every supported currency fits on the arc — no carousel controls.
      maxVisible: SUPPORTED_CURRENCIES.length,
    };
  });

  onCurrencyPick(item: RadialMenuItem): void {
    this.currencySvc.setCurrency(item.id);
  }

  onNavClick(item: NavItem): void {
    this.closeSidebar();
    if (item.route) {
      this.router.navigate([item.route], { relativeTo: this.activatedRoute });
    }
  }
}
