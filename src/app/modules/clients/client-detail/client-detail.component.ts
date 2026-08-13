import {
  Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AvatarComponent, ButtonComponent, ButtonOptions, FieldMessageComponent,
  MetricCardComponent, ModalService,
  PageComponent, PageHeaderComponent, ProgressBarComponent, SectionCardComponent,
  TabsComponent,
} from '@khalilrebhiitec/daf360';
import type {
  AvatarData, BreadcrumbItem, MetricCardOptions, MetricDelta, PageHeaderBadge,
  ProgressBarOptions, TabItem,
} from '@khalilrebhiitec/daf360';

import { ClientService } from '../client.service';
import { ClientDetailDto, ClientStatsDto } from '../client.model';
import { CLIENT_STATE_BADGE, CLIENT_STATE_LABEL, clientState } from '../client-display';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

/** Une tuile de la rangée d'indicateurs. `label` est une clé i18n. */
interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Fiche client — refondue sur le squelette de la fiche affaire.
 *
 * Ce que la version précédente portait et qui a disparu : une page `.detail-page` à la
 * main avec 337 lignes de SCSS, un spinner et un bouton retour maison, des cartes KPI
 * bricolées, des sections dépliantes, trois `confirm()` natifs, et une quarantaine de
 * chaînes françaises en dur. Tout passe par la lib et par i18n, comme la fiche affaire :
 * `daf-page`, `daf-page-header` (badges + fil d'Ariane), `daf-section-card`,
 * `daf-metric-card`, `daf-tabs`, `daf-progress-bar` et `ModalService`.
 */
@Component({
  selector: 'app-client-detail',
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ProgressBarComponent, ButtonComponent, AvatarComponent,
    FieldMessageComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './client-detail.component.html',
})
export class ClientDetailComponent implements OnInit {
  private readonly svc       = inject(ClientService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);


  client      = signal<ClientDetailDto | null>(null);
  stats       = signal<ClientStatsDto | null>(null);
  isLoading   = signal(true);
  actionError = signal<string | null>(null);

  activeTab = signal<string>('overview');

  private clientId = 0;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.params['id']);
    this.clientId = id;
    // `?edit=true` renvoyait vers une modale ; la modification vit maintenant dans
    // l'assistant, donc l'ancien lien redirige plutôt que d'ouvrir un second formulaire.
    if (this.route.snapshot.queryParams['edit'] === 'true') {
      this.openEdit();
      return;
    }
    this.loadClient(id);
  }

  loadClient(id: number): void {
    this.isLoading.set(true);
    this.actionError.set(null);
    forkJoin({
      client: this.svc.getClient(id),
      stats:  this.svc.getClientStats(id),
    }).subscribe({
      next: ({ client, stats }) => {
        this.client.set(client);
        this.stats.set(stats);
        this.isLoading.set(false);
      },
      error: () => {
        this.actionError.set(this.translate.instant('CLIENTS.DETAIL.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  private readonly devise = computed(() => this.client()?.defaultCurrency || 'TND');

  readonly headerSubtitle = computed(() => {
    const c = this.client();
    if (!c) return '';
    return [c.clientCode, c.paysLabel ?? c.country, c.sector].filter(Boolean).join(' · ');
  });

  /**
   * Statut du client d'abord (actif / KYC), puis le rappel du délai de paiement : c'est
   * la donnée qu'on cherche le plus souvent sur cette page après le nom.
   */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const c = this.client();
    if (!c) return [];
    this.translate.currentLang();
    const state = clientState(c);

    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(CLIENT_STATE_LABEL[state]),
      variant: CLIENT_STATE_BADGE[state],
      dot:     true,
    }];

    if (c.paymentTermsDays != null) {
      badges.push({
        label: this.translate.instant('CLIENTS.DETAIL.BADGE.PAYMENT_TERMS', { days: c.paymentTermsDays }),
        variant: 'neutral',
      });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('CLIENTS.DETAIL.BACK_TO_LIST'), link: ['..'] },
      { label: this.client()?.clientCode ?? '' },
    ];
  });

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const c = this.client();
    if (!c) return [];
    return [
      { label: 'CLIENTS.DETAIL.INFO.CODE',    value: c.clientCode },
      { label: 'CLIENTS.DETAIL.INFO.COUNTRY', value: c.paysLabel ?? c.country ?? '—' },
      { label: 'CLIENTS.DETAIL.INFO.ADDRESS', value: this.formattedAddress() || '—' },
    ];
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    const c = this.client();
    if (!c) return [];
    const fields: DetailField[] = [
      { label: 'CLIENTS.DETAIL.INFO.SECTOR',   value: c.sector ?? '—' },
      { label: 'CLIENTS.DETAIL.INFO.CURRENCY', value: this.devise() },
      {
        label: 'CLIENTS.DETAIL.INFO.PAYMENT_TERMS',
        value: c.paymentTermsDays != null
          ? this.translate.instant('CLIENTS.DETAIL.INFO.DAYS', { days: c.paymentTermsDays })
          : '—',
      },
    ];
    if (c.taxId) fields.push({ label: 'CLIENTS.DETAIL.INFO.TAX_ID', value: c.taxId });
    return fields;
  });

  readonly formattedAddress = computed(() => {
    const c = this.client();
    if (!c) return '';
    return [c.address, c.city, c.postalCode].filter(Boolean).join(', ');
  });

  // ═══ Boutons d'action ═════════════════════════════════════════════════════

  // ═══ Centre d'actions ═════════════════════════════════════════════════════
  //
  // Trois niveaux, comme la fiche affaire : l'action principale (facturer), l'action
  // opérationnelle (le KYC), puis la gestion (modifier, activer/désactiver) dans une
  // rangée de pied. Avant, les quatre étaient quatre boutons `sm` de même poids.

  /** L'action principale : `primary`, `lg`, pleine largeur, flèche de sortie. */
  readonly newInvoiceOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'primary',
      size:      'lg',
      fullWidth: true,
      iconStart: 'add_card',
      iconEnd:   'arrow_forward',
      label:     this.translate.instant('CLIENTS.DETAIL.ACTIONS.NEW_INVOICE'),
    };
  });

  /**
   * Le KYC reste en `secondary` même quand il manque, alors qu'il passait en `primary`
   * avant : avec un appel à l'action principal juste au-dessus, deux boutons teintés
   * marque se disputaient le regard. L'urgence est portée par la carte « Validation KYC »,
   * qui passe en `warning` tant que la validation n'est pas faite.
   */
  readonly kycButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    const done = this.client()?.isKycDone === true;
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: done ? 'lock_open' : 'verified_user',
      label: this.translate.instant(done
        ? 'CLIENTS.DETAIL.ACTIONS.REVOKE_KYC'
        : 'CLIENTS.DETAIL.ACTIONS.VALIDATE_KYC'),
    };
  });

  /**
   * L'action de blocage est NOMMÉE, pas déduite d'une pastille d'état : « Bloquer le
   * client » / « Réactiver le client ». L'état, lui, se lit déjà sur la pastille du titre
   * et sur la carte « Validation KYC ».
   */
  readonly activationTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.client()?.isActive
      ? 'CLIENTS.DETAIL.ACTIONS.DEACTIVATE'
      : 'CLIENTS.DETAIL.ACTIONS.REACTIVATE');
  });

  readonly activationIcon = computed(() => this.client()?.isActive ? 'block' : 'restart_alt');

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  readonly kpiTiles = computed<KpiTile[]>(() => {
    const s = this.stats();
    return [
      {
        label: 'CLIENTS.DETAIL.KPI.PROJECTS',
        value: String(s?.totalAffaires ?? 0),
        delta: s ? { value: this.translate.instant('CLIENTS.DETAIL.KPI.ACTIVE_COUNT',
                       { count: s.activeAffaires }), direction: 'neutral' } : null,
        options: { icon: 'business_center', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'CLIENTS.DETAIL.KPI.INVOICED',
        value: this.money(s?.totalInvoiced),
        delta: null,
        options: { icon: 'receipt_long', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: 'CLIENTS.DETAIL.KPI.PAID',
        value: this.money(s?.totalPaid),
        delta: null,
        options: { icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10',
                   valueColor: 'text-primary' },
      },
      {
        label: 'CLIENTS.DETAIL.KPI.PENDING',
        value: this.money(s?.pendingAmount),
        delta: null,
        options: { icon: 'pending_actions', iconColor: 'text-warning', iconBg: 'bg-warning/10' },
      },
    ];
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'overview', label: t('CLIENTS.DETAIL.TABS.OVERVIEW') },
      { id: 'contact',  label: t('CLIENTS.DETAIL.TABS.CONTACT') },
      { id: 'trace',    label: t('CLIENTS.DETAIL.TABS.TRACE') },
    ];
  });

  /** Répartition des projets — trois chiffres, dont les terminés déduits. */
  readonly projectStats = computed(() => {
    const s = this.stats();
    const total  = s?.totalAffaires  ?? 0;
    const active = s?.activeAffaires ?? 0;
    return [
      { label: 'CLIENTS.DETAIL.PROJECTS.TOTAL',  value: String(total),          tone: 'text-on-surface' },
      { label: 'CLIENTS.DETAIL.PROJECTS.ACTIVE', value: String(active),         tone: 'text-success' },
      { label: 'CLIENTS.DETAIL.PROJECTS.DONE',   value: String(Math.max(0, total - active)), tone: 'text-on-surface-variant' },
    ];
  });

  readonly contactFields = computed<DetailField[]>(() => {
    const c = this.client();
    if (!c) return [];
    return [
      { label: 'CLIENTS.DETAIL.CONTACT.NAME',  value: c.contactName  ?? '—' },
      { label: 'CLIENTS.DETAIL.CONTACT.EMAIL', value: c.contactEmail ?? c.email ?? '—' },
      { label: 'CLIENTS.DETAIL.CONTACT.PHONE', value: c.contactPhone ?? c.phone ?? '—' },
      { label: 'CLIENTS.DETAIL.CONTACT.WEBSITE', value: c.website ?? '—' },
    ];
  });

  /**
   * Le validateur KYC en données d'avatar, ou `null` quand le nom n'est pas résolu.
   *
   * `computed` et non un objet construit dans le gabarit : `data` est une entrée signal,
   * un littéral inline changerait d'identité à chaque cycle de détection.
   */
  readonly kycApprover = computed<AvatarData | null>(() => {
    const name = this.client()?.kycApprovedByName?.trim();
    return name ? { name } : null;
  });

  readonly traceFields = computed<DetailField[]>(() => {
    const c = this.client();
    const s = this.stats();
    if (!c) return [];
    const fields: DetailField[] = [
      { label: 'CLIENTS.DETAIL.TRACE.CREATED_AT', value: this.formatDate(c.createdAt) },
    ];
    if (c.updatedAt) {
      fields.push({ label: 'CLIENTS.DETAIL.TRACE.UPDATED_AT', value: this.formatDate(c.updatedAt) });
    }
    if (c.kycApprovedAt) {
      fields.push({ label: 'CLIENTS.DETAIL.TRACE.KYC_AT', value: this.formatDate(c.kycApprovedAt) });
    }
    if (c.kycApprovedByName) {
      fields.push({ label: 'CLIENTS.DETAIL.TRACE.KYC_BY', value: c.kycApprovedByName });
    }
    if (s?.lastActivityDate) {
      fields.push({ label: 'CLIENTS.DETAIL.TRACE.LAST_ACTIVITY', value: this.formatDate(s.lastActivityDate) });
    }
    return fields;
  });

  // ═══ Recouvrement ═════════════════════════════════════════════════════════
  //
  // Les deux barres se lisent sur le MÊME dénominateur, le total facturé : « encaissé »
  // et « en attente » sont deux parts d'un même tout, pas deux mesures indépendantes.

  private readonly invoiced = computed(() => this.stats()?.totalInvoiced ?? 0);

  readonly paidPct = computed(() => {
    const inv = this.invoiced();
    return inv > 0 ? ((this.stats()?.totalPaid ?? 0) / inv) * 100 : 0;
  });

  readonly pendingPct = computed(() => {
    const inv = this.invoiced();
    return inv > 0 ? ((this.stats()?.pendingAmount ?? 0) / inv) * 100 : 0;
  });

  readonly paidBarLabel = computed(() =>
    `${this.translate.instant('CLIENTS.DETAIL.COLLECTION.PAID')} — ${this.money(this.stats()?.totalPaid)}`);

  readonly pendingBarLabel = computed(() =>
    `${this.translate.instant('CLIENTS.DETAIL.COLLECTION.PENDING')} — ${this.money(this.stats()?.pendingAmount)}`);

  // `variant` et non `color`, `showPercent` et non `showValue` : ce sont les noms de
  // `ProgressBarOptions`. Et pas de teinte « success » dans la lib — la palette est
  // primary | secondary | tertiary | teal | danger | warning ; `teal` est déjà la couleur
  // de l'argent encaissé sur la fiche affaire, on garde la même lecture.
  readonly paidBarOptions: ProgressBarOptions    = { variant: 'teal',    size: 'sm', showPercent: true };
  readonly pendingBarOptions: ProgressBarOptions = { variant: 'warning', size: 'sm', showPercent: true };

  // ═══ Actions ══════════════════════════════════════════════════════════════

  /**
   * La modification ouvre l'assistant (`clients/:id/edit`), qui réutilise le formulaire de
   * création préremplli — comme pour les affaires. Elle vivait dans une modale `lg` : le
   * même formulaire y était comprimé sans progression par étapes, et la fiche devait
   * maintenir un `ng-template`, une `ModalRef` et trois gestionnaires pour l'accueillir.
   */
  openEdit(): void {
    this.router.navigate(['edit'], { relativeTo: this.route });
  }

  /**
   * KYC : valider n'appelle pas de confirmation, révoquer si — c'est le sens du
   * `confirm()` natif qui traînait ici, mais dans une `daf-modal` comme le reste.
   */
  toggleKyc(): void {
    const c = this.client();
    if (!c) return;
    if (!c.isKycDone) { this.runKyc(true); return; }

    this.confirmThen('CLIENTS.DETAIL.CONFIRM.REVOKE_KYC_TITLE',
                     'CLIENTS.DETAIL.CONFIRM.REVOKE_KYC_BODY',
                     () => this.runKyc(false));
  }

  private runKyc(validate: boolean): void {
    const c = this.client();
    if (!c) return;
    this.actionError.set(null);
    const call$ = validate ? this.svc.validateKyc(c.id) : this.svc.revokeKyc(c.id);
    call$.subscribe({
      next:  updated => this.client.set(updated),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant(
        validate ? 'CLIENTS.DETAIL.ERR.KYC_VALIDATE' : 'CLIENTS.DETAIL.ERR.KYC_REVOKE')),
    });
  }

  toggleActivation(): void {
    const c = this.client();
    if (!c) return;

    if (!c.isActive) {
      this.actionError.set(null);
      this.svc.reactivate(c.id).subscribe({
        next:  () => this.loadClient(c.id),
        error: err => this.actionError.set(err?.error?.message
          ?? this.translate.instant('CLIENTS.DETAIL.ERR.REACTIVATE')),
      });
      return;
    }

    this.confirmThen('CLIENTS.DETAIL.CONFIRM.DEACTIVATE_TITLE',
                     'CLIENTS.DETAIL.CONFIRM.DEACTIVATE_BODY', () => {
      this.actionError.set(null);
      this.svc.deactivate(c.id).subscribe({
        // Un client désactivé n'a plus de fiche à montrer : retour à la liste.
        next:  () => this.router.navigate(['..'], { relativeTo: this.route }),
        error: err => this.actionError.set(err?.error?.message
          ?? this.translate.instant('CLIENTS.DETAIL.ERR.DEACTIVATE')),
      });
    });
  }

  /** Confirmation sur `daf-modal` — remplace les `confirm()` natifs de la page. */
  private confirmThen(titleKey: string, bodyKey: string, run: () => void): void {
    this.modal.open({
      title: this.translate.instant(titleKey),
      body:  this.translate.instant(bodyKey),
      size:  'sm',
      buttons: [
        { label: this.translate.instant('CLIENTS.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('CLIENTS.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: r => { r.close(); run(); },
        },
      ],
    });
  }

  goToInvoicing(): void {
    this.router.navigate(['../../invoicing', 'new'], { relativeTo: this.route });
  }

  /**
   * « Voir les affaires » ouvre la liste RESTREINTE à ce client — elle y arrivait sans
   * filtre, donc sur les affaires de tout le monde, ce qui n'avait rien à voir avec le
   * chiffre affiché juste au-dessus. Le nom accompagne l'id pour que le bandeau de
   * contexte de la liste puisse le nommer sans requête supplémentaire.
   */
  goToAffaires(): void {
    const c = this.client();
    if (!c) return;
    this.router.navigate(['../../affaires'], {
      relativeTo: this.route,
      queryParams: { clientId: c.id, client: c.clientName },
    });
  }

  // ═══ Rendu ════════════════════════════════════════════════════════════════

  private money(v: number | null | undefined): string {
    return this.currency.transform(v ?? null, this.devise());
  }

  formatDate(d?: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR',
      { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
