import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  ButtonComponent, ButtonOptions, PageComponent, PageHeaderComponent, StepperComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, PageHeaderBadge, StepperConfig, StepperStep,
} from '@khalilrebhiitec/daf360';

import { ClientService } from '../client.service';
import { ClientDetailDto } from '../client.model';
import { ClientFormComponent } from '../client-form.component';

const STEP_ICONS = ['badge', 'contacts', 'receipt_long'];

/**
 * Assistant « Nouveau client » — aligné sur l'assistant d'affaire.
 *
 * Ce qui a disparu : la page `.wizard-page` maison et ses 377 lignes de SCSS, la colonne
 * de droite (navigation + progression verticale + résumé) et le fil d'Ariane bricolé.
 * La progression est passée dans la barre d'actions du bas (`daf-stepper` en rail seul),
 * le résumé de la saisie dans les pastilles du titre, et le formulaire occupe toute la
 * largeur.
 */
@Component({
  selector: 'app-client-new',
  imports: [
    TranslatePipe, ClientFormComponent,
    PageComponent, PageHeaderComponent, StepperComponent, ButtonComponent,
  ],
  templateUrl: './client-new.component.html',
  styleUrl: './client-new.component.scss',
})
export class ClientNewComponent implements OnInit {
  private readonly svc       = inject(ClientService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly paysId      = signal(0);
  readonly currentStep = signal(1);

  readonly formRef = viewChild(ClientFormComponent);

  readonly steps = computed(() => {
    this.translate.currentLang();
    return STEP_ICONS.map((icon, i) => ({
      title: this.translate.instant(`CLIENTS.NEW.STEPS.${i}`),
      icon,
    }));
  });

  // ── Barre d'actions ─────────────────────────────────────────────────────

  readonly stepperSteps = computed<StepperStep[]>(() =>
    this.steps().map(s => ({ title: s.title })));

  readonly stepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      nextLabel:   this.translate.instant('CLIENTS.NEW.NEXT'),
      prevLabel:   this.translate.instant('CLIENTS.NEW.PREV'),
      cancelLabel: this.translate.instant('CLIENTS.NEW.CANCEL'),
      finishLabel: this.translate.instant('CLIENTS.NEW.CREATE'),
      // Rail seul : la navigation vit dans la barre, à droite.
      chrome: 'header-only',
      clickableSteps: true,
      stepperLabel: this.translate.instant('CLIENTS.NEW.PROGRESS'),
    };
  });

  /**
   * Retour en arrière au clic sur le rail, jamais de saut en avant : l'étape 1 porte les
   * champs obligatoires, la franchir sans les remplir mènerait à un enregistrement
   * refusé au dernier écran.
   */
  onStepClick(index: number): void {
    const target = index + 1;
    if (target < this.currentStep()) this.currentStep.set(target);
  }

  readonly nextButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    const last = this.currentStep() === this.steps().length;
    return {
      variant: 'teal',
      pill: true,
      label: this.translate.instant(last ? 'CLIENTS.NEW.CREATE' : 'CLIENTS.NEW.NEXT'),
      iconStart: last ? 'person_add' : undefined,
      iconEnd:   last ? undefined : 'arrow_forward',
      loading:  this.isSaving(),
      disabled: this.isSaving(),
    };
  });

  // ── En-tête ─────────────────────────────────────────────────────────────

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('CLIENTS.NEW.BREADCRUMB_CLIENTS'), link: ['..'] },
      { label: this.translate.instant('CLIENTS.NEW.BREADCRUMB_NEW') },
    ];
  });

  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    return this.formRef()?.clientName()?.trim()
      || this.translate.instant('CLIENTS.NEW.SUBTITLE');
  });

  /**
   * Le résumé de la saisie, en pastilles sur le titre — ce qui a remplacé la carte
   * « Résumé » de la colonne de droite. Une valeur non saisie ne produit pas de pastille
   * vide : la rangée se remplit au fil des étapes.
   */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const f = this.formRef();
    if (!f) return [];
    this.translate.currentLang();
    const badges: PageHeaderBadge[] = [];

    const sector   = f.selectedSector()[0];
    const city     = f.city()?.trim();
    const currency = f.selectedCurrency()[0];

    if (sector)   badges.push({ label: sector,   icon: 'category', variant: 'neutral' });
    if (city)     badges.push({ label: city,     icon: 'place',    variant: 'neutral' });
    if (currency) badges.push({ label: currency, icon: 'payments', variant: 'secondary' });
    return badges;
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  readonly isSaving = computed(() => this.formRef()?.saving() ?? false);

  readonly canGoNext = computed(() => {
    const form = this.formRef();
    if (!form) return false;
    if (this.currentStep() === 1) {
      return !!form.clientName()?.trim() && !!form.selectedSector()[0];
    }
    return true;
  });

  readonly stepValidationError = computed((): string | null => {
    this.translate.currentLang();
    if (this.currentStep() === 1 && !this.canGoNext()) {
      return this.translate.instant('CLIENTS.NEW.VALIDATION_REQUIRED');
    }
    return null;
  });

  /**
   * L'ENTITÉ propriétaire du client (`clients.pays_id`) — à ne pas confondre avec le
   * pays du client lui-même, qui est un champ du formulaire.
   *
   * ⚠️ Elle valait `pays[0].id` : le PREMIER pays du référentiel, quel que soit
   * l'utilisateur. Tout client créé était donc rattaché à la même entité (la Tunisie,
   * première de la table), y compris depuis un compte égyptien ou français — et comme
   * `updateClient` ne touche jamais `pays_id`, l'erreur était définitive.
   *
   * On prend l'entité de l'utilisateur connecté, comme le fait l'assistant d'affaire.
   * Le repli sur le premier pays ne sert que si `/ref/me` échoue, pour ne pas bloquer
   * la création.
   */
  ngOnInit(): void {
    this.svc.getMyPays().subscribe(myPays => {
      if (myPays) { this.paysId.set(myPays); return; }
      this.svc.getPays().subscribe(pays => {
        if (pays.length > 0) this.paysId.set(pays[0].id);
      });
    });
  }

  goNext(): void {
    if (this.currentStep() < this.steps().length) {
      if (!this.canGoNext()) {
        this.formRef()?.touched.set(true);
        return;
      }
      this.currentStep.update(s => s + 1);
    } else {
      this.formRef()?.submit();
    }
  }

  goPrev(): void {
    if (this.currentStep() > 1) this.currentStep.update(s => s - 1);
  }

  onSaved(client: ClientDetailDto): void {
    this.router.navigate(['..', client.id], { relativeTo: this.route });
  }

  goBack(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
