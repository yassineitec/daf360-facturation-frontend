import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormFieldComponent, SelectComponent } from '@khalilrebhiitec/daf360';
import type { SelectOption } from '@khalilrebhiitec/daf360';

import { AffaireService } from '../affaire.service';
import { FactListService } from '../../../core/fact-list.service';
import { CreateTsRequest } from '../affaire.model';
import { ListValueDto } from '../../cost/cost.model';

/**
 * Corps du formulaire « Nouveau travail supplémentaire ».
 *
 * Ce n'est plus une fenêtre : c'était un `.modal-overlay` maison — surcouche,
 * boîte, en-tête, croix de fermeture, clic sur le fond, pied de boutons, plus 145
 * lignes de SCSS — qui reproduisait `daf-modal` en moins bien (pas de piège au clavier,
 * pas de restitution du focus, pas d'`aria` complet). La fiche affaire ouvre désormais
 * ce corps via `ModalService`, comme ses autres modales, et ne garde ici que les champs.
 *
 * Contrôles exclusivement issus de la lib (`daf-form-field`, `daf-select`), et la liste
 * des devises vient du référentiel au lieu de cinq `<option>` écrites en dur.
 */
@Component({
  selector: 'app-ts-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormFieldComponent, SelectComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-4">

      <daf-form-field
        [options]="intituleOptions()"
        [value]="intitule()"
        (valueChange)="intitule.set(text($event))" />

      <div style="display:flex; flex-wrap:wrap; gap:1rem">
        <daf-form-field
          style="flex:1 1 220px; min-width:0"
          [options]="montantOptions()"
          [value]="montantEstime()"
          (valueChange)="montantEstime.set(num($event))" />

        <daf-select
          style="flex:1 1 140px; min-width:0"
          [options]="currencyOptions()"
          [config]="currencyConfig()"
          [selected]="[devise()]"
          (selectedChange)="devise.set($event[0] ?? devise())" />
      </div>

      <daf-form-field
        [options]="perimetreOptions()"
        [value]="perimetre()"
        (valueChange)="perimetre.set(text($event))" />

      <daf-form-field
        [options]="impactOptions()"
        [value]="impactBudgetaire()"
        (valueChange)="impactBudgetaire.set(text($event))" />

      <daf-form-field
        [options]="descriptionOptions()"
        [value]="description()"
        (valueChange)="description.set(text($event))" />

      @if (serverError()) {
        <div class="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-body-sm text-danger">
          <span class="material-symbols-outlined text-[18px]">error</span>{{ serverError() }}
        </div>
      }

    </div>
  `,
})
export class TsFormComponent implements OnInit {
  affaireId = input.required<number>();
  /** Devise par défaut : celle de l'affaire, pas une constante. */
  defaultDevise = input<string>('TND');

  /** `true` après création réussie, `false` sur annulation — inchangé pour l'appelant. */
  closed = output<boolean>();

  private readonly svc       = inject(AffaireService);
  private readonly listSvc   = inject(FactListService);
  private readonly translate = inject(TranslateService);

  readonly intitule         = signal('');
  readonly montantEstime    = signal<number | null>(null);
  readonly devise           = signal('TND');
  readonly perimetre        = signal('');
  readonly impactBudgetaire = signal('');
  readonly description      = signal('');

  readonly saving      = signal(false);
  readonly serverError = signal<string | null>(null);

  private readonly currencies = signal<ListValueDto[]>([]);

  ngOnInit(): void {
    this.devise.set(this.defaultDevise() || 'TND');
    // paysId 0 : le référentiel des devises est global, comme partout ailleurs dans le module.
    this.listSvc.getListValues('CURRENCY', 0)
      .subscribe(v => this.currencies.set(v.filter(c => c.isActive)));
  }

  // ── Options des contrôles ───────────────────────────────────────────────

  private t(key: string): string { return this.translate.instant(key); }

  readonly intituleOptions = computed(() => {
    this.translate.currentLang();
    return {
      label: this.t('AFFAIRES.ts.form.intitule'),
      placeholder: this.t('AFFAIRES.ts.form.intitule_placeholder'),
      required: true, maxLength: 255, fullWidth: true,
      // L'erreur n'apparaît qu'après une tentative d'envoi : signaler « requis » sur un
      // champ que l'utilisateur n'a pas encore atteint est du bruit.
      error: this.showErrors() && !this.intitule().trim()
        ? this.t('AFFAIRES.ts.errors.required') : undefined,
    };
  });

  readonly montantOptions = computed(() => {
    this.translate.currentLang();
    const v = this.montantEstime();
    return {
      type: 'number' as const,
      label: this.t('AFFAIRES.ts.form.montant'),
      placeholder: '0.00', required: true, fullWidth: true,
      error: this.showErrors() && !(v && v > 0)
        ? this.t('AFFAIRES.ts.errors.min') : undefined,
    };
  });

  readonly currencyOptions = computed<SelectOption[]>(() => {
    const list = this.currencies();
    if (list.length) return list.map(c => ({ value: c.code, label: c.code }));
    return ['TND', 'EUR', 'USD', 'MAD', 'DZD'].map(c => ({ value: c, label: c }));
  });

  readonly currencyConfig = computed(() => {
    this.translate.currentLang();
    return { label: this.t('AFFAIRES.ts.form.devise'), fullWidth: true };
  });

  readonly perimetreOptions = computed(() => {
    this.translate.currentLang();
    return {
      label: this.t('AFFAIRES.ts.form.perimetre'),
      placeholder: this.t('AFFAIRES.ts.form.perimetre_placeholder'),
      maxLength: 500, fullWidth: true,
    };
  });

  readonly impactOptions = computed(() => {
    this.translate.currentLang();
    return {
      label: this.t('AFFAIRES.ts.form.impact'),
      placeholder: this.t('AFFAIRES.ts.form.impact_placeholder'),
      maxLength: 500, fullWidth: true,
    };
  });

  readonly descriptionOptions = computed(() => {
    this.translate.currentLang();
    return {
      type: 'textarea' as const, rows: 3, maxLength: 2000,
      label: this.t('AFFAIRES.ts.form.description'),
      placeholder: this.t('AFFAIRES.ts.form.description_placeholder'),
      fullWidth: true,
    };
  });

  private readonly showErrors = signal(false);

  readonly valid = computed(() =>
    !!this.intitule().trim() && (this.montantEstime() ?? 0) > 0);

  // ── Conversions des sorties de `daf-form-field` ─────────────────────────

  text(v: string | number | null): string { return v === null ? '' : String(v); }
  num(v: string | number | null): number | null {
    return v === null || v === '' ? null : Number(v);
  }

  /**
   * Appelée par le bouton de la modale. Renvoie `false` quand la saisie est incomplète,
   * pour que l'appelant laisse la fenêtre ouverte sur les erreurs affichées.
   */
  submit(): boolean {
    if (this.saving()) return false;
    if (!this.valid()) { this.showErrors.set(true); return false; }

    this.saving.set(true);
    this.serverError.set(null);

    const dto: CreateTsRequest = {
      intitule:         this.intitule().trim(),
      montantEstime:    Number(this.montantEstime()),
      devise:           this.devise(),
      perimetre:        this.perimetre().trim()        || null,
      impactBudgetaire: this.impactBudgetaire().trim() || null,
      description:      this.description().trim()      || null,
    };

    this.svc.createTS(this.affaireId(), dto).subscribe({
      next: () => { this.saving.set(false); this.closed.emit(true); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.detail ?? err?.error?.message
          ?? this.t('AFFAIRES.ts.errors.create'));
      },
    });
    return true;
  }

  cancel(): void { this.closed.emit(false); }
}
