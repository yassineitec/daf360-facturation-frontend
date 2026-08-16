import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FieldMessageComponent, ModalService, PageComponent,
  PageHeaderComponent, SectionCardComponent,
} from '@khalilrebhiitec/daf360';
import type { BreadcrumbItem, PageHeaderBadge } from '@khalilrebhiitec/daf360';

import { SupplierService } from '../supplier.service';
import { SupplierDto } from '../supplier.model';
import {
  SUPPLIER_STATE_BADGE, SUPPLIER_STATE_LABEL, supplierCode, supplierState,
} from '../supplier-display';
import { PermissionDirective } from '../../../shared/permission.directive';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

/**
 * Fiche fournisseur — `/finance/suppliers/:id`.
 *
 * Elle remplace le panneau de droite du panneau scindé de la liste. Ce n'est pas qu'un
 * déplacement : la fiche y était coincée dans un tiers de largeur, n'avait pas d'URL —
 * donc pas de partage ni de rafraîchissement possible — et disparaissait dès qu'on
 * paginait. Elle suit maintenant le squelette des fiches facture, client et
 * recouvrement : deux colonnes, la gauche sticky, en **flex inline** (le `styles.css`
 * d'un remote ne contient que les classes que Tailwind a déjà vues).
 *
 * Ce qui a disparu au passage : les bordures et fonds en `rgba()` en dur, le vert
 * `#006b58` répété six fois, et les `<button class="decision-btn">` maison.
 */
@Component({
  selector: 'app-supplier-detail',
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent,
    ButtonComponent, FieldMessageComponent,
  ],
  host: { class: 'block' },
  templateUrl: './supplier-detail.component.html',
})
export class SupplierDetailComponent implements OnInit {
  private readonly svc       = inject(SupplierService);
  private readonly translate = inject(TranslateService);
  private readonly modals    = inject(ModalService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  /**
   * Lu sur `paramMap` plutôt que par `input()` lié à la route : ce remote est monté par
   * le routeur du shell, et `withComponentInputBinding()` est une option du *routeur
   * hôte*. Le paramètre d'URL, lui, est toujours là.
   */
  private readonly supplierId = Number(this.route.snapshot.paramMap.get('id'));

  supplier    = signal<SupplierDto | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);

  ibanRaw         = signal<string | null>(null);
  isRevealLoading = signal(false);
  isDeactivating  = signal(false);

  readonly ibanRevealed = computed(() => this.ibanRaw() !== null);

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerSubtitle = computed(() => {
    const s = this.supplier();
    if (!s) return '';
    return [supplierCode(s), s.paysLabel ?? s.paysCode].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const s = this.supplier();
    if (!s) return [];
    this.translate.currentLang();
    const state = supplierState(s);

    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(SUPPLIER_STATE_LABEL[state]),
      variant: SUPPLIER_STATE_BADGE[state],
      dot:     true,
    }];

    if (s.isIntercompany) {
      badges.push({
        label:   this.translate.instant('SUPPLIERS.DETAIL.INTERCOMPANY'),
        variant: 'info',
        icon:    'hub',
      });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('SUPPLIERS.DETAIL.BACK'), link: ['..'] },
      { label: this.supplier()?.name ?? '—' },
    ];
  });

  // ═══ Contenu ══════════════════════════════════════════════════════════════

  readonly identityFields = computed<DetailField[]>(() => {
    const s = this.supplier();
    if (!s) return [];
    return [
      { label: 'SUPPLIERS.DETAIL.INFO.CODE',          value: supplierCode(s) },
      { label: 'SUPPLIERS.DETAIL.INFO.COUNTRY',       value: s.paysLabel ?? s.paysCode ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.SUPPLIER_CODE', value: s.supplierCode ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.CREATED_AT',    value: this.formatDate(s.createdAt) },
    ];
  });

  readonly fiscalFields = computed<DetailField[]>(() => {
    const s = this.supplier();
    if (!s) return [];
    return [
      { label: 'SUPPLIERS.DETAIL.INFO.TVA',     value: s.numeroTva ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.TAX_ID',  value: s.taxId ?? '—' },
      { label: 'SUPPLIERS.DETAIL.INFO.COUNTRY_ISO', value: s.country ?? s.paysCode ?? '—' },
    ];
  });

  /** Ce qui s'affiche dans le bloc bancaire : l'IBAN révélé, sinon le masque. */
  readonly ibanDisplay = computed(() => {
    const s = this.supplier();
    return this.ibanRaw() ?? s?.ibanMasked ?? null;
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (!this.supplierId) {
      this.loading.set(false);
      this.error.set(this.translate.instant('SUPPLIERS.DETAIL.LOAD_ERROR'));
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSupplier(this.supplierId).subscribe({
      next: s => { this.supplier.set(s); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('SUPPLIERS.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  /**
   * L'IBAN complet n'est jamais dans la réponse de liste ni dans la fiche (D3-122) :
   * il faut un appel dédié, sous `FACT_MANAGE_COST`. Masquer à nouveau efface la valeur
   * côté client plutôt que de la garder cachée dans un signal — un IBAN « masqué » mais
   * toujours en mémoire est un IBAN divulgué.
   */
  revealIban(): void {
    this.actionError.set(null);
    this.isRevealLoading.set(true);
    this.svc.revealIban(this.supplierId).subscribe({
      next: r => { this.ibanRaw.set(r.iban); this.isRevealLoading.set(false); },
      error: () => {
        this.actionError.set(this.translate.instant('SUPPLIERS.DETAIL.IBAN_ERROR'));
        this.isRevealLoading.set(false);
      },
    });
  }

  hideIban(): void { this.ibanRaw.set(null); }

  goBack(): void { this.router.navigate(['..'], { relativeTo: this.route }); }

  openDeactivate(): void {
    const s = this.supplier();
    if (!s) return;
    this.actionError.set(null);
    this.modals.open({
      title:           this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_TITLE'),
      // `icon` + le corps du message portent la gravité : `ModalButton.variant` ne
      // connaît que `primary` et `secondary`, il n'y a pas de bouton rouge en modale.
      icon:            'block',
      body:            this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_MSG', { name: s.name }),
      size:            'sm',
      closeOnBackdrop: true,
      buttons: [
        { label: this.translate.instant('SUPPLIERS.COMMON.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label:   this.translate.instant('SUPPLIERS.DETAIL.DEACTIVATE_CONFIRM'),
          variant: 'primary',
          icon:    'block',
          action:  r => { r.close(); this.confirmDeactivate(); },
        },
      ],
    });
  }

  /**
   * Après désactivation, retour à la liste : ni `GET /suppliers` ni `/search` ne
   * renvoient les inactifs, donc rester sur une fiche que la liste ne référence plus
   * n'apprendrait rien. Et il n'y a pas de réactivation — aucun endpoint ne remet
   * `isActive` à vrai.
   */
  confirmDeactivate(): void {
    this.isDeactivating.set(true);
    this.svc.deactivate(this.supplierId).subscribe({
      next: () => {
        this.isDeactivating.set(false);
        this.router.navigate(['..'], { relativeTo: this.route });
      },
      error: err => {
        this.isDeactivating.set(false);
        this.actionError.set(err?.error?.message
          ?? this.translate.instant('SUPPLIERS.DETAIL.ACTION_ERROR'));
      },
    });
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(
      this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR',
      { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
