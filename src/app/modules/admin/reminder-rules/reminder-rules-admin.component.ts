import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  BadgeCell, ButtonComponent, DafCellDirective, DataTableComponent, DrawerComponent,
  FieldMessageComponent, FormFieldComponent, SelectComponent, SelectOption,
  TableColumn, TableConfig, TableRow, ToggleComponent,
} from '@khalilrebhiitec/daf360';
import { ReminderRuleService } from '../../payments/reminder-rule.service';
import {
  REMINDER_TEMPLATE_TOKENS, ReminderRule, SaveReminderRuleRequest,
} from '../../payments/reminder-rule.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { offsetLabel } from '../../payments/payments-display';

/**
 * Administration de l'échéancier de recouvrement — l'onglet « Relances ».
 *
 * Chaque ligne est un palier : un code, deux libellés, un décalage signé par rapport à
 * l'échéance de la facture, les rôles convoqués, et l'envoi ou non au client. Le
 * planificateur quotidien et le générateur d'échéancier lisent exactement cette table ;
 * il n'y a plus de liste en dur côté serveur.
 *
 * <h2>Deux garde-fous portés par l'écran</h2>
 * - **Le code se verrouille dès qu'il est utilisé.** `inUse` vient du serveur (il compte
 *   les relances portant ce code) ; le champ passe en lecture seule et le formulaire le
 *   dit, plutôt que de laisser tenter une modification que l'API refuserait.
 * - **Les rôles se choisissent, ils ne se tapent pas.** La liste vient des `role_name`
 *   réellement présents dans `users_ref` — la colonne sur laquelle le planificateur
 *   résout les adresses. Un rôle saisi à la main qui n'existe pas dans l'annuaire donne
 *   un palier sans destinataire, sans que rien ne le signale au moment de la saisie.
 */
@Component({
  selector: 'app-reminder-rules-admin',
  imports: [
    TranslatePipe, PermissionDirective,
    DataTableComponent, DafCellDirective, ButtonComponent, DrawerComponent,
    FormFieldComponent, SelectComponent, ToggleComponent, FieldMessageComponent,
  ],
  host: { class: 'block' },
  templateUrl: './reminder-rules-admin.component.html',
})
export class ReminderRulesAdminComponent implements OnInit {
  private readonly svc       = inject(ReminderRuleService);
  private readonly translate = inject(TranslateService);

  rules          = signal<ReminderRule[]>([]);
  availableRoles = signal<string[]>([]);
  loading        = signal(true);
  error          = signal<string | null>(null);

  readonly tokens = REMINDER_TEMPLATE_TOKENS;

  // ── Panneau d'édition ─────────────────────────────────────────────────────

  drawerOpen = signal(false);
  editing    = signal<ReminderRule | null>(null);
  saving     = signal(false);
  formError  = signal<string | null>(null);

  code         = signal('');
  labelFr      = signal('');
  labelEn      = signal('');
  offsetDays   = signal('0');
  roles        = signal<string[]>([]);
  notifyClient = signal(false);
  emailSubject = signal('');
  emailBody    = signal('');
  isActive     = signal(true);

  readonly isEdit     = computed(() => this.editing() !== null);
  readonly codeLocked = computed(() => this.editing()?.inUse === true);

  /**
   * Aperçu du décalage pendant la saisie, par le même formateur que la table et que la
   * fiche de recouvrement — les trois écrivaient « J+30 » chacun à leur façon, et le
   * serveur en renvoyait une quatrième version, française jusque dans l'interface
   * anglaise.
   */
  readonly offsetPreview = computed(() => {
    const n = Number(this.offsetDays());
    if (!Number.isFinite(n)) return '—';
    return offsetLabel(n, (k, p) => this.translate.instant(k, p));
  });

  readonly roleOptions = computed<SelectOption[]>(() =>
    this.availableRoles().map(r => ({ value: r, label: r })));

  /**
   * Un rôle configuré sur une règle mais absent de `users_ref` : le palier n'a alors
   * aucun destinataire interne. C'est le seul défaut de configuration qui ne se voit pas
   * autrement — la règle a l'air complète, et rien ne part.
   */
  readonly orphanRoles = computed(() => {
    const known = new Set(this.availableRoles());
    if (!known.size) return new Map<number, string[]>();
    return new Map(this.rules()
      .map(r => [r.id, r.roles.filter(role => !known.has(role))] as const)
      .filter(([, missing]) => missing.length > 0));
  });

  // ── Tableau ───────────────────────────────────────────────────────────────

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'offset',    label: t('ADMIN.REMINDERS.COL_OFFSET'),  type: 'badge'  },
      { key: 'rule',      label: t('ADMIN.REMINDERS.COL_RULE'),    type: 'custom' },
      { key: 'audience',  label: t('ADMIN.REMINDERS.COL_ROLES'),   type: 'custom' },
      { key: 'scope',     label: t('ADMIN.REMINDERS.COL_SCOPE'),   type: 'text'   },
      { key: 'state',     label: t('ADMIN.REMINDERS.COL_STATE'),   type: 'badge'  },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);
    const orphans = this.orphanRoles();

    return this.rules().map(r => ({
      id: r.id,
      offset: {
        label:   offsetLabel(r.offsetDays, t),
        // Avant échéance vs après : ce ne sont pas les mêmes gestes, la couleur le dit.
        options: { variant: r.offsetDays > 0 ? 'warning' : 'info', size: 'sm' },
      } satisfies BadgeCell,
      _code:        r.code,
      _labelFr:     r.labelFr,
      _labelEn:     r.labelEn,
      _roles:       r.roles,
      _orphans:     orphans.get(r.id) ?? [],
      _notifyClient: r.notifyClient,
      scope:        r.scope,
      state: {
        label:   t(r.isActive ? 'ADMIN.REMINDERS.ACTIVE' : 'ADMIN.REMINDERS.INACTIVE'),
        options: { variant: r.isActive ? 'success' : 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _source: r,
    }));
  });

  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: 7,
      emptyMessage: this.translate.instant('ADMIN.REMINDERS.EMPTY'),
      actions: [
        {
          id:      'edit',
          icon:    'edit',
          tooltip: this.translate.instant('ADMIN.COMMON.EDIT'),
          onClick: (row: TableRow) => this.openEdit(row['_source'] as ReminderRule),
        },
        {
          id:      'delete',
          icon:    'delete',
          variant: 'danger',
          tooltip: this.translate.instant('ADMIN.REMINDERS.DELETE'),
          // Une règle utilisée ne se supprime pas : elle est le seul endroit qui sait
          // traduire son code. Cacher l'action plutôt que laisser l'API la refuser.
          visible: (row: TableRow) => !(row['_source'] as ReminderRule).inUse,
          onClick: (row: TableRow) => this.remove(row['_source'] as ReminderRule),
        },
      ],
    };
  });

  // ── Chargement ────────────────────────────────────────────────────────────

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      rules: this.svc.list(),
      roles: this.svc.availableRoles(),
    }).subscribe({
      next: ({ rules, roles }) => {
        this.rules.set(rules);
        this.availableRoles.set(roles);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.REMINDERS.ERROR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  // ── Édition ───────────────────────────────────────────────────────────────

  openCreate(): void {
    this.editing.set(null);
    this.resetForm();
    this.drawerOpen.set(true);
  }

  openEdit(rule: ReminderRule): void {
    this.editing.set(rule);
    this.formError.set(null);
    this.code.set(rule.code);
    this.labelFr.set(rule.labelFr);
    this.labelEn.set(rule.labelEn);
    this.offsetDays.set(String(rule.offsetDays));
    this.roles.set([...rule.roles]);
    this.notifyClient.set(rule.notifyClient);
    this.emailSubject.set(rule.emailSubject ?? '');
    this.emailBody.set(rule.emailBody ?? '');
    this.isActive.set(rule.isActive);
    this.drawerOpen.set(true);
  }

  private resetForm(): void {
    this.formError.set(null);
    this.code.set('');
    this.labelFr.set('');
    this.labelEn.set('');
    this.offsetDays.set('0');
    this.roles.set([]);
    this.notifyClient.set(false);
    this.emailSubject.set('');
    this.emailBody.set('');
    this.isActive.set(true);
  }

  readonly canSave = computed(() =>
    !!this.code().trim()
    && !!this.labelFr().trim()
    && !!this.labelEn().trim()
    && Number.isInteger(Number(this.offsetDays())));

  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.formError.set(null);

    const dto: SaveReminderRuleRequest = {
      // Le périmètre reste le groupe : l'API accepte un `paysId` pour surcharger une
      // règle par entité, mais tant qu'aucun écran ne choisit d'entité, proposer le
      // champ laisserait créer des règles invisibles depuis cette liste.
      paysId:       this.editing()?.paysId ?? null,
      code:         this.code().trim().toUpperCase(),
      labelFr:      this.labelFr().trim(),
      labelEn:      this.labelEn().trim(),
      offsetDays:   Number(this.offsetDays()),
      roles:        this.roles(),
      notifyClient: this.notifyClient(),
      emailSubject: this.emailSubject().trim() || null,
      emailBody:    this.emailBody().trim() || null,
      isActive:     this.isActive(),
    };

    const editing = this.editing();
    const req = editing ? this.svc.update(editing.id, dto) : this.svc.create(dto);

    req.subscribe({
      next: () => { this.saving.set(false); this.drawerOpen.set(false); this.load(); },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.message
          ?? this.translate.instant('ADMIN.REMINDERS.ERROR_SAVE'));
      },
    });
  }

  remove(rule: ReminderRule): void {
    this.svc.delete(rule.id).subscribe({
      next:  () => this.load(),
      error: err => this.error.set(err?.error?.message
        ?? this.translate.instant('ADMIN.REMINDERS.ERROR_DELETE')),
    });
  }

  /** Ajoute un jeton à la fin du corps — évite de les faire recopier de mémoire. */
  insertToken(token: string): void {
    this.emailBody.update(b => (b ? `${b}${token}` : token));
  }
}
