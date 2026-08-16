import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, ButtonOptions, FieldMessageComponent, FormFieldComponent,
  PageComponent, PageHeaderComponent, SelectComponent, SelectOption, StepperComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, PageHeaderBadge, StepperConfig, StepperStep,
} from '@khalilrebhiitec/daf360';
import { SupplierService } from '../supplier.service';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto } from '../../affaires/affaire.model';

type Step = 1 | 2 | 3;

const STEP_KEYS  = ['IDENTIFICATION', 'FISCAL', 'BANK'] as const;
const STEP_ICONS = ['badge', 'receipt_long', 'account_balance'] as const;

/**
 * Assistant « Nouveau fournisseur » — même squelette que les assistants facture,
 * affaire et client : `daf-page` porte le rythme vertical, `daf-page-header` le h1, le
 * fil d'Ariane et le résumé de la saisie en pastilles, et la barre d'actions collante du
 * bas porte la progression (`daf-stepper` en `chrome: 'header-only'`).
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
    PageComponent, PageHeaderComponent, StepperComponent, ButtonComponent,
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
  paysCode  = signal('');
  paysLabel = signal('');
  numeroTva = signal('');
  taxId     = signal('');
  iban      = signal('');

  touched = signal(false);

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

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('SUPPLIERS.NEW.BREADCRUMB_ROOT'), link: ['..'] },
      { label: this.translate.instant('SUPPLIERS.NEW.TITLE') },
    ];
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
    if (this.paysCode())     badges.push({ label: this.paysSummary(), icon: 'public',          variant: 'neutral' });
    if (this.numeroTva())    badges.push({ label: this.numeroTva(),   icon: 'receipt_long',    variant: 'neutral' });
    if (this.iban())         badges.push({ label: this.translate.instant('SUPPLIERS.NEW.BADGE_IBAN'), icon: 'account_balance', variant: 'secondary' });
    return badges;
  });

  private paysSummary(): string {
    const code = this.paysCode();
    const pays = this.paysList().find(p => p.isoCode === code);
    return pays ? `${code} — ${pays.frenchLabel}` : code;
  }

  // ═══ Pays ═════════════════════════════════════════════════════════════════

  readonly paysSelectOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: p.isoCode, label: `${p.isoCode} — ${p.frenchLabel}` })));

  onPaysCodeChange(code: string): void {
    this.paysCode.set(code ?? '');
    this.paysLabel.set(this.paysList().find(p => p.isoCode === code)?.frenchLabel ?? '');
  }

  // ═══ Navigation ═══════════════════════════════════════════════════════════

  /** Seule l'étape 1 bloque : le fiscal et le bancaire sont facultatifs côté serveur. */
  readonly canGoNext = computed(() => {
    if (this.step() !== 1) return true;
    return !!this.name().trim() && !!this.paysCode();
  });

  readonly nextButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    const last = this.step() === 3;
    return {
      variant: 'teal',
      pill:    true,
      label:   this.translate.instant(last ? 'SUPPLIERS.NEW.CREATE' : 'SUPPLIERS.NEW.NEXT'),
      iconEnd:   last ? undefined : 'arrow_forward',
      iconStart: last ? 'storefront' : undefined,
      loading:  this.isSaving(),
      disabled: !this.canGoNext() || this.isSaving(),
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

    this.clientSvc.getMyPays().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: id => { if (id && id > 0) this.paysId.set(id); } });
  }

  private save(): void {
    this.touched.set(true);
    if (!this.canGoNext()) { this.step.set(1); return; }

    const paysId = this.paysId();
    if (!paysId) { this.saveError.set(this.translate.instant('SUPPLIERS.NEW.ERROR_PAYS')); return; }

    this.isSaving.set(true);
    this.saveError.set(null);

    this.svc.create({
      paysId,
      name:      this.name().trim(),
      paysCode:  this.paysCode(),
      paysLabel: this.paysLabel() || undefined,
      country:   this.paysCode()  || undefined,
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
}
