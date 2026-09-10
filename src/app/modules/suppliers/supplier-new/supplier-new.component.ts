import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, ButtonOptions, CardComponent, FieldMessageComponent, FormFieldComponent,
  PageComponent, PageHeaderComponent, SelectComponent, SelectOption, StepperComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, PageHeaderBadge, StepperConfig, StepperStep,
} from '@khalilrebhiitec/daf360';
import { SupplierService } from '../supplier.service';
import { CreateSupplierRequest, SupplierDto } from '../supplier.model';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto } from '../../affaires/affaire.model';
import { FactListService } from '../../../core/fact-list.service';
import { ListValueDto } from '../../cost/cost.model';

type Step = 1 | 2 | 3;

const STEP_KEYS  = ['IDENTIFICATION', 'FISCAL', 'BANK'] as const;
const STEP_ICONS = ['badge', 'receipt_long', 'account_balance'] as const;

/**
 * Assistant fournisseur — **création ET modification**, un seul formulaire, comme
 * les assistants client et affaire (`clients.routes.ts` monte déjà `ClientNewComponent`
 * sur `:id/edit` pour la même raison : un seul écran à faire évoluer).
 *
 * Le mode se lit sur l'URL : `/finance/suppliers/new` crée, `/finance/suppliers/:id/edit`
 * modifie. Deux différences de comportement, pas trois écrans :
 *
 * 1. **Le pays est verrouillé en modification.** `code` est généré une fois à partir du
 *    préfixe ISO du pays (`SupplierService.generateCode()`) et a déjà été vu par des
 *    utilisateurs ; le serveur ignore d'ailleurs `paysId` sur le PATCH. Déplacer un
 *    fournisseur d'un pays à l'autre est une autre opération que le modifier.
 * 2. **On n'envoie que les champs réellement modifiés.** Le contrat du PATCH
 *    (cf. `SupplierService.updateSupplier`) est : absent/`null` = inchangé, chaîne
 *    **vide** = effacer. Renvoyer tout le formulaire écraserait donc ce qu'un autre
 *    utilisateur vient d'écrire dans un champ qu'on n'a pas touché.
 *
 * Même squelette que les assistants facture, affaire et client : `daf-page` porte le
 * rythme vertical, `daf-page-header` le h1, le fil d'Ariane et le résumé de la saisie en
 * pastilles, et la barre d'actions collante du bas porte la progression
 * (`daf-stepper` en `chrome: 'header-only'`).
 *
 * Ce qui a disparu :
 * - les **523 lignes de SCSS** et tout le balisage maison qu'elles habillaient
 *   (`.wizard-page`, `.sidebar`, `.panel-*`, `.step-list`, `.summary-*`, le fil d'Ariane
 *   en `<nav>`, la bascule `.toggle-track` / `.toggle-thumb`) ;
 * - les `<input class="form-input">` et le `<select>` natif, remplacés par
 *   `daf-form-field` et `daf-select` (recherche incluse : la liste des pays est longue) ;
 * - l'étape « TVA unique » et le champ « Notes ». Ils n'existent nulle part côté
 *   serveur : ni `SupplierDto`, ni `CreateSupplierRequest` ne les portent, Jackson les
 *   jetait à la création. L'utilisateur remplissait deux champs qui n'étaient jamais
 *   enregistrés.
 *
 * L'étape 2 porte désormais ce que le serveur accepte vraiment côté fiscal : numéro de
 * TVA et identifiant fiscal.
 */
@Component({
  selector: 'app-supplier-new',
  imports: [
    TranslatePipe,
    PageComponent, PageHeaderComponent, StepperComponent, ButtonComponent, CardComponent,
    FormFieldComponent, SelectComponent, FieldMessageComponent,
  ],
  host: { class: 'block' },
  templateUrl: './supplier-new.component.html',
  styleUrl:    './supplier-new.component.scss',
})
export class SupplierNewComponent implements OnInit {
  private readonly svc        = inject(SupplierService);
  private readonly clientSvc  = inject(ClientService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate  = inject(TranslateService);
  private readonly factListSvc = inject(FactListService);

  step      = signal<Step>(1);
  isSaving  = signal(false);
  saveError = signal<string | null>(null);
  paysId    = signal(0);
  paysList  = signal<PaysRefDto[]>([]);

  /**
   * Champs en signaux plutôt qu'en `FormGroup` : `daf-form-field` et `daf-select`
   * fonctionnent en `[value]` / `(valueChange)`, et la seule validation du formulaire
   * est « nom et pays remplis » — un `ReactiveFormsModule` complet pour deux
   * `Validators.required` ajoutait une seconde source de vérité à tenir en phase.
   */
  name      = signal('');
  typeId    = signal<number | null>(null);
  typeLabel = signal('');
  numeroTva = signal('');
  taxId     = signal('');
  iban      = signal('');

  supplierTypes = signal<ListValueDto[]>([]);

  touched = signal(false);

  // ═══ Mode modification ════════════════════════════════════════════════════

  /**
   * `null` en création. Lu sur `paramMap` et non via `input()` : ce remote est monté
   * par le routeur du shell, et `withComponentInputBinding()` est une option du
   * routeur *hôte* — même raison que dans la fiche fournisseur.
   */
  readonly editId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly isEdit = this.editId !== null;

  /** L'état serveur au chargement, seule référence pour savoir ce qui a changé. */
  private readonly original = signal<SupplierDto | null>(null);

  loading = signal(false);

  // ═══ Étapes ═══════════════════════════════════════════════════════════════

  readonly steps = computed(() => {
    this.translate.currentLang();
    return STEP_KEYS.map((k, i) => ({
      title: this.translate.instant('SUPPLIERS.NEW.STEPS.' + k),
      icon:  STEP_ICONS[i],
    }));
  });

  readonly stepTitle = computed(() => this.steps()[this.step() - 1].title);
  readonly stepIcon  = computed(() => this.steps()[this.step() - 1].icon);

  readonly stepSub = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('SUPPLIERS.NEW.STEP_OF', {
      current: this.step(), total: this.steps().length,
    });
  });

  readonly stepperSteps = computed<StepperStep[]>(() =>
    this.steps().map(s => ({ title: s.title })));

  readonly stepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      chrome: 'header-only',
      clickableSteps: true,
      stepperLabel: this.translate.instant('SUPPLIERS.NEW.PROGRESS'),
    };
  });

  /** Retour en arrière au clic sur le rail, jamais de saut en avant. */
  onStepClick(index: number): void {
    const target = (index + 1) as Step;
    if (target < this.step()) this.step.set(target);
  }

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  /**
   * Le fil d'Ariane remonte d'un cran de plus en modification : `:id/edit` est deux
   * segments sous la liste, `new` un seul. Chemins absolus plutôt que `['..']`, pour
   * ne pas dépendre de la profondeur de la route courante.
   */
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    const root: BreadcrumbItem = {
      label: this.translate.instant('SUPPLIERS.NEW.BREADCRUMB_ROOT'),
      link:  ['/finance/suppliers'],
    };
    if (!this.isEdit) {
      return [root, { label: this.translate.instant('SUPPLIERS.NEW.TITLE') }];
    }
    return [
      root,
      { label: this.original()?.name ?? '—', link: ['/finance/suppliers', this.editId!] },
      { label: this.translate.instant('SUPPLIERS.EDIT.TITLE') },
    ];
  });

  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.isEdit ? 'SUPPLIERS.EDIT.TITLE' : 'SUPPLIERS.NEW.TITLE');
  });

  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    return this.isEdit
      ? this.original()?.name ?? this.translate.instant('SUPPLIERS.EDIT.SUBTITLE')
      : this.translate.instant('SUPPLIERS.NEW.SUBTITLE');
  });

  /**
   * Le résumé de la saisie, en pastilles sur le titre — ce qui a remplacé la carte
   * « Résumé » de la colonne de droite. Une valeur non encore saisie ne produit pas de
   * pastille : la rangée se remplit au fil des étapes.
   */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    const badges: PageHeaderBadge[] = [];
    if (this.name().trim())  badges.push({ label: this.name().trim(), icon: 'storefront',      variant: 'neutral' });
    if (this.paysId())       badges.push({ label: this.paysSummary(), icon: 'public',          variant: 'neutral' });
    if (this.typeLabel())    badges.push({ label: this.typeLabel(),   icon: 'category',         variant: 'neutral' });
    if (this.numeroTva())    badges.push({ label: this.numeroTva(),   icon: 'receipt_long',    variant: 'neutral' });
    if (this.iban())         badges.push({ label: this.translate.instant('SUPPLIERS.NEW.BADGE_IBAN'), icon: 'account_balance', variant: 'secondary' });
    return badges;
  });

  private paysSummary(): string {
    const pays = this.paysList().find(p => p.id === this.paysId());
    return pays ? `${pays.isoCode} — ${pays.frenchLabel}` : '';
  }

  // ═══ Pays ═════════════════════════════════════════════════════════════════

  readonly paysSelectOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.isoCode} — ${p.frenchLabel}` })));

  readonly selectedPaysValue = computed(() => this.paysId() ? [String(this.paysId())] : []);

  onPaysSelect(values: string[]): void {
    this.paysId.set(Number(values[0] ?? 0));
  }

  // ═══ Catégorie de fournisseur ═════════════════════════════════════════════

  readonly typeSelectOptions = computed<SelectOption[]>(() =>
    this.supplierTypes().map(t => ({ value: t.id + '|' + t.labelFr, label: t.labelFr })));

  /**
   * La valeur sélectionnée est reconstruite `id|label` pour retomber sur l'option
   * correspondante. Le libellé est **relu dans la liste** quand elle est chargée,
   * plutôt que repris du `typeLabel` du fournisseur : les deux viennent du même
   * `label_fr` côté serveur, mais si l'un dérivait de l'autre, la chaîne ne
   * correspondrait à aucune option et le select afficherait son placeholder alors que
   * le fournisseur a bien une catégorie.
   */
  readonly selectedTypeValue = computed<string[]>(() => {
    const id = this.typeId();
    if (id === null) return [];
    const known = this.supplierTypes().find(t => t.id === id);
    return [id + '|' + (known?.labelFr ?? this.typeLabel())];
  });

  onTypeSelect(values: string[]): void {
    const value = values[0] ?? '';
    if (!value) { this.typeId.set(null); this.typeLabel.set(''); return; }
    const sep = value.indexOf('|');
    this.typeId.set(Number(value.substring(0, sep)));
    this.typeLabel.set(value.substring(sep + 1));
  }

  // ═══ Navigation ═══════════════════════════════════════════════════════════

  /** Seule l'étape 1 bloque : le fiscal et le bancaire sont facultatifs côté serveur. */
  readonly canGoNext = computed(() => {
    if (this.step() !== 1) return true;
    return !!this.name().trim() && !!this.paysId() && this.typeId() !== null;
  });

  readonly nextButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    const last = this.step() === 3;
    const commitKey = this.isEdit ? 'SUPPLIERS.EDIT.SAVE' : 'SUPPLIERS.NEW.CREATE';
    return {
      variant: 'teal',
      pill:    true,
      label:   this.translate.instant(last ? commitKey : 'SUPPLIERS.NEW.NEXT'),
      iconEnd:   last ? undefined : 'arrow_forward',
      iconStart: last ? (this.isEdit ? 'save' : 'storefront') : undefined,
      loading:  this.isSaving(),
      disabled: !this.canGoNext() || this.isSaving() || this.loading(),
    };
  });

  goNext(): void {
    if (this.step() < 3) {
      if (!this.canGoNext()) { this.touched.set(true); return; }
      this.step.update(s => (s + 1) as Step);
    } else {
      this.save();
    }
  }

  goPrev(): void {
    if (this.step() > 1) this.step.update(s => (s - 1) as Step);
  }

  cancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }

  // ═══ Enregistrement ═══════════════════════════════════════════════════════

  ngOnInit(): void {
    this.clientSvc.getPays().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.paysList.set(list));

    this.factListSvc.getListValues('SUPPLIER_CATEGORY', 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.supplierTypes.set(list));

    if (this.isEdit) {
      // Le pays vient du fournisseur, pas de l'utilisateur connecté : on peut modifier
      // un fournisseur d'un autre pays que le sien sans le lui réaffecter au passage.
      this.loadForEdit();
      return;
    }

    this.clientSvc.getMyPays().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: id => { if (id && id > 0) this.paysId.set(id); } });
  }

  private loadForEdit(): void {
    this.loading.set(true);
    this.svc.getSupplier(this.editId!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => {
        this.original.set(s);
        this.name.set(s.name ?? '');
        this.paysId.set(s.paysId ?? 0);
        this.typeId.set(s.typeId);
        this.typeLabel.set(s.typeLabel ?? '');
        this.numeroTva.set(s.numeroTva ?? '');
        this.taxId.set(s.taxId ?? '');
        this.iban.set(s.iban ?? '');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.saveError.set(this.translate.instant('SUPPLIERS.EDIT.LOAD_ERROR'));
      },
    });
  }

  private save(): void {
    this.touched.set(true);
    if (!this.canGoNext()) { this.step.set(1); return; }

    const paysId = this.paysId();
    if (!paysId) { this.saveError.set(this.translate.instant('SUPPLIERS.NEW.ERROR_PAYS')); return; }

    if (this.isEdit) { this.saveEdit(); return; }

    this.isSaving.set(true);
    this.saveError.set(null);

    this.svc.create({
      paysId,
      name:      this.name().trim(),
      typeId:    this.typeId() ?? undefined,
      numeroTva: this.numeroTva().trim() || undefined,
      taxId:     this.taxId().trim()     || undefined,
      iban:      this.iban().trim()      || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      // La fiche du fournisseur créé, pas la liste : c'est là qu'on vérifie ce qu'on
      // vient de saisir, et c'est maintenant un écran à part entière.
      next: s => {
        this.isSaving.set(false);
        this.router.navigate(['..', s.id], { relativeTo: this.route });
      },
      error: err => {
        this.isSaving.set(false);
        this.saveError.set(err?.error?.message
          ?? this.translate.instant('SUPPLIERS.NEW.ERROR_CREATE'));
      },
    });
  }

  /**
   * PATCH des seuls champs modifiés. `paysId` n'est jamais envoyé : le serveur
   * l'ignore de toute façon, et le préfixe du `code` en dépend.
   *
   * Un champ vidé part en **chaîne vide**, pas en `null` : côté serveur `null`
   * signifie « inchangé » (cf. `SupplierService.updateSupplier`), donc envoyer `null`
   * pour effacer un IBAN ne ferait rien du tout, silencieusement.
   */
  private saveEdit(): void {
    const before = this.original();
    if (!before) { this.saveError.set(this.translate.instant('SUPPLIERS.EDIT.LOAD_ERROR')); return; }

    const patch: Partial<CreateSupplierRequest> = {};

    const name = this.name().trim();
    if (name !== (before.name ?? '')) patch.name = name;

    // Les trois champs facultatifs : `''` côté formulaire ⇄ `null` côté serveur, donc
    // la comparaison se fait sur la chaîne pour ne pas voir une modification là où il
    // n'y en a pas (`null` → `''` n'est pas un changement).
    const numeroTva = this.numeroTva().trim();
    if (numeroTva !== (before.numeroTva ?? '')) patch.numeroTva = numeroTva;

    const taxId = this.taxId().trim();
    if (taxId !== (before.taxId ?? '')) patch.taxId = taxId;

    const iban = this.iban().trim();
    if (iban !== (before.iban ?? '')) patch.iban = iban;

    const typeId = this.typeId();
    if (typeId !== null && typeId !== before.typeId) patch.typeId = typeId;

    // Rien touché : pas d'appel. Un PATCH vide ne renverrait qu'un `updated_at`
    // remis à l'heure, ce qui ferait passer une consultation pour une modification.
    if (Object.keys(patch).length === 0) {
      this.router.navigate(['/finance/suppliers', this.editId!]);
      return;
    }

    this.isSaving.set(true);
    this.saveError.set(null);

    this.svc.update(this.editId!, patch)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: s => {
          this.isSaving.set(false);
          this.router.navigate(['/finance/suppliers', s.id]);
        },
        error: err => {
          this.isSaving.set(false);
          // Le serveur renvoie un message métier exploitable sur le seul cas
          // fonctionnel possible ici (RG_SUPPLIER_TVA_UNIQUE / RG_SUPPLIER_TYPE_INVALID).
          this.saveError.set(err?.error?.message
            ?? this.translate.instant('SUPPLIERS.EDIT.ERROR_UPDATE'));
        },
      });
  }
}
