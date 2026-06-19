import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserStore }   from '../core/user.store';
import { AuthService } from '../core/auth.service';

interface NavItem {
  path:       string;
  label:      string;
  icon:       string;
  permission: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/fact/home',             label: 'Accueil',             icon: 'home',                 permission: null },
  { path: '/fact/affaires',         label: 'Affaires',            icon: 'work',                 permission: 'FACT_CREATE_AFFAIRE' },
  { path: '/fact/clients',          label: 'Clients',             icon: 'corporate_fare',       permission: 'FACT_VIEW_CLIENTS' },
  { path: '/fact/invoicing',        label: 'Factures',            icon: 'receipt_long',         permission: 'FACT_CREATE_INVOICE' },
  { path: '/fact/payments',         label: 'Paiements',           icon: 'credit_card',          permission: 'FACT_BANK_RECONCILIATION' },
  { path: '/fact/subcontracting',   label: 'Sous-traitance',      icon: 'group',                permission: 'FACT_MANAGE_ST' },
  { path: '/fact/cost',             label: 'Coûts',               icon: 'payments',             permission: null },
  { path: '/fact/reporting',        label: 'Reporting',           icon: 'bar_chart',            permission: 'FACT_VIEW_KPIS' },
  { path: '/fact/admin',            label: 'Administration',      icon: 'admin_panel_settings', permission: 'FACT_VALIDER_BUDGET' },
  { path: '/fact/billing/approval', label: "File d'approbation",  icon: 'task_alt',             permission: 'FACT_VALIDATE_RF' },
];

@Component({
  selector: 'app-fact-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './fact-shell.component.html',
  styleUrl: './fact-shell.component.scss',
})
export class FactShellComponent {
  protected readonly store = inject(UserStore);
  protected readonly auth  = inject(AuthService);

  protected readonly collapsed = signal(false);
  protected readonly user      = this.store.user;

  protected readonly initials = computed(() => {
    const name = this.user()?.fullName ?? '';
    return name.split(' ').filter(Boolean).slice(0, 2)
      .map(p => p[0].toUpperCase()).join('');
  });

  protected readonly visibleNavItems = computed(() =>
    NAV_ITEMS.filter(item => !item.permission || this.store.hasPermission(item.permission))
  );
}
