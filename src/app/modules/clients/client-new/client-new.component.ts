import { Component, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  CardComponent, FieldMessageComponent,
  PageComponent, PageHeaderComponent, StepperComponent,
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
    PageComponent, PageHeaderComponent, StepperComponent,
    CardComponent, FieldMessageComponent,
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

  /**
   * Mode édition : l'assistant sert aussi `clients/:id/edit`, exactement comme
   * l'assistant d'affaire sert `affaires/:id/edit`. Le formulaire est le même composant,
   * il reçoit simplement le client à modifier — la modale d'édition de la fiche client
   * (huit champs empilés, un formulaire de plus à maintenir) n'a plus de raison d'être.
   */
  readonly editMode   = signal(false);
  readonly editClient = signal<ClientDetailDto | null>(null);
  readonly isLoading  = signal(false);

  /** Erreur de chargement du client à modifier. */
  readonly loadError = signal<string | null>(null);

  readonly formRef = viewChild(ClientFormComponent);

  /**
   * Étape la plus avancée atteinte : c'est elle qui dit ce qui est cliquable dans le rail,
   * et non `currentStep` — revenir à l'étape 1 ne doit pas re-verrouiller la 2 et la 3.
   * En édition, tout est ouvert d'emblée : le client existe, on vient corriger une section.
   */
  readonly maxStepReached = signal(1);

  constructor() {
    effect(() => {
      const step = this.currentStep();
      if (step > this.maxStepReached()) this.maxStepReached.set(step);
    });
  }

  readonly steps = computed(() => {
    this.translate.currentLang();
    return STEP_ICONS.map((icon, i) => ({
      title: this.translate.instant(`CLIENTS.NEW.STEPS.${i}`),
      icon,
    }));
  });

  // ── Barre d'actions ─────────────────────────────────────────────────────

  readonly stepperSteps = computed<StepperStep[]>(() =>
    this.steps().map((s, i) => ({
      title:     s.title,
      completed: i + 1 < this.maxStepReached(),
      disabled:  i + 1 > this.maxStepReached(),
    })));

  readonly stepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      nextLabel:   this.translate.instant('CLIENTS.NEW.NEXT'),
      prevLabel:   this.translate.instant('CLIENTS.NEW.PREV'),
      cancelLabel: this.translate.instant('CLIENTS.NEW.CANCEL'),
      finishLabel: this.translate.instant(
        this.editMode() ? 'CLIENTS.NEW.SAVE' : 'CLIENTS.NEW.CREATE'),
      // Rail seul : la navigation vit dans la barre, à droite.
      chrome: 'header-only',
      clickableSteps: true,
      // Rail dense : le nom de l'étape est déjà imprimé en titre dans la carte au-dessus.
      labelDensity: 'quiet',
      stepperLabel: this.translate.instant('CLIENTS.NEW.PROGRESS'),
    };
  });

  /**
   * Navigation libre sur tout ce qui a DÉJÀ été franchi. Les étapes jamais atteintes
   * restent verrouillées : l'étape 1 porte les champs obligatoires, la sauter mènerait à
   * un enregistrement refusé au dernier écran.
   */
  onStepClick(index: number): void {
    const target = index + 1;
    if (target !== this.currentStep() && target <= this.maxStepReached()) {
      this.currentStep.set(target);
    }
  }

  /** Libellé de l'action « avancer » : suivant, créer, ou enregistrer en édition. */
  readonly nextLabel = computed(() => {
    this.translate.currentLang();
    if (this.currentStep() < this.steps().length) {
      return this.translate.instant('CLIENTS.NEW.NEXT');
    }
    return this.translate.instant(this.editMode() ? 'CLIENTS.NEW.SAVE' : 'CLIENTS.NEW.CREATE');
  });

  // ── En-tête ─────────────────────────────────────────────────────────────

  /** `..` en création (clients/new), `../..` en édition (clients/:id/edit). */
  readonly listRoute = computed(() => this.editMode() ? ['../..'] : ['..']);

  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.editMode() ? 'CLIENTS.NEW.TITLE_EDIT' : 'CLIENTS.NEW.TITLE');
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('CLIENTS.NEW.BREADCRUMB_CLIENTS'), link: this.listRoute() },
      { label: this.editMode()
          ? this.translate.instant('CLIENTS.NEW.BREADCRUMB_EDIT')
          : this.translate.instant('CLIENTS.NEW.BREADCRUMB_NEW') },
    ];
  });

  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    return this.formRef()?.clientName()?.trim()
      || this.editClient()?.clientName?.trim()
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
    const rawId = this.route.snapshot.params['id'];
    if (rawId) {
      this.editMode.set(true);
      // Le client existe : toutes les étapes sont franchies, le rail est ouvert.
      this.maxStepReached.set(this.steps().length);
      this.loadClient(Number(rawId));
      // `paysId` n'est pas utilisé en édition (`updateClient` ne touche pas `pays_id`),
      // mais le formulaire l'exige en entrée : on le prend du client chargé.
      return;
    }
    this.svc.getMyPays().subscribe(myPays => {
      if (myPays) { this.paysId.set(myPays); return; }
      this.svc.getPays().subscribe(pays => {
        if (pays.length > 0) this.paysId.set(pays[0].id);
      });
    });
  }

  private loadClient(id: number): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.svc.getClient(id).subscribe({
      next: client => {
        this.editClient.set(client);
        this.paysId.set(client.paysId);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(this.translate.instant('CLIENTS.NEW.LOAD_ERROR'));
        this.isLoading.set(false);
      },
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

  /** Création comme édition, on repart sur la fiche du client enregistré. */
  onSaved(client: ClientDetailDto): void {
    this.router.navigate([...this.listRoute(), client.id], { relativeTo: this.route });
  }

  /**
   * `..` sert les deux cas sans condition : depuis `clients/new` il mène à la liste,
   * depuis `clients/:id/edit` à la fiche du client — dans les deux cas, l'écran d'où
   * l'on vient.
   */
  goBack(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
