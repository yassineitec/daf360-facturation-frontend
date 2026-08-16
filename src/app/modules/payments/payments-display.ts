import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { AgingRow } from './payment.model';

/**
 * Single source of truth for how an unpaid invoice is *displayed* on
 * `/finance/payments`.
 *
 * It replaces `agingRowColor()` in `payment.model.ts`, which returned raw hex
 * (`#fef3c7` / `#ffedd5` / `#fee2e2`) that the table painted onto a `.row-bg` wrapper
 * div **inside every one of the seven cells** — a hand-rolled row tint that the lib's
 * table has no concept of, duplicated seven times per row, and invisible for the two
 * lowest tiers since they returned `''`. The severity now lives in the `joursRetard`
 * badge variant alone, which already carried it.
 */

/** Aging severity, from the invoice's own days-late count. */
export function retardVariant(joursRetard: number): BadgeVariant {
  if (joursRetard > 60) return 'danger';
  if (joursRetard > 30) return 'warning';
  return 'neutral';
}

/** Complete literal classes (UI-PLAYBOOK §3), for the card's days-late figure. */
export function retardToneClass(joursRetard: number): string {
  if (joursRetard > 60) return 'text-danger';
  if (joursRetard > 30) return 'text-warning';
  return 'text-on-surface-variant';
}

/**
 * Libellé du dernier palier de relance envoyé.
 *
 * Il vient de la **règle** qui a produit le palier, transporté par la ligne. Ce fut
 * successivement un `Record` français codé en dur dans le composant, puis une clé i18n
 * (`PAYMENTS.DASHBOARD.REMINDER.<code>`) — les deux supposaient une liste de paliers
 * connue à la compilation. Depuis que l'échéancier est configurable
 * (`payment_reminder_rules`), cette liste n'existe plus : un palier créé ce matin
 * n'aurait aucune traduction.
 *
 * Repli sur le code brut quand plus aucune règle ne le porte — relance envoyée sous un
 * ancien échéancier, qu'il vaut mieux montrer telle quelle que faire disparaître.
 */
export function reminderLabel(row: AgingRow, lang: string | null): string | null {
  const label = lang === 'en' ? row.lastReminderLabelEn : row.lastReminderLabelFr;
  return label ?? row.lastReminderType;
}

/**
 * Une date lisible dans la langue courante.
 *
 * Le format était figé en `fr-FR` : en anglais, l'écran affichait « 14 janv. 2026 » à
 * côté de libellés anglais. `lang` est la valeur de `TranslateService.currentLang()`,
 * qui peut être vide au tout premier rendu — d'où le repli sur le français, la langue
 * par défaut de l'application.
 */
export function formatDate(d: string | null, lang?: string | null): string {
  if (!d) return '—';
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Le décalage d'un palier, écrit dans la langue courante : « J+30 » / « D+30 »,
 * « J-7 » / « D-7 », « Jour J » / « Due day ».
 *
 * Cette mise en forme venait du serveur, qui renvoyait un « Jour J » français à une
 * interface anglaise. Le service transporte maintenant le nombre signé et rien d'autre :
 * il n'a pas de locale, et la lettre elle-même change de langue.
 *
 * @param offsetDays `null` quand la relance ne correspond plus à aucune règle
 */
export function offsetLabel(
  offsetDays: number | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (offsetDays == null) return '';
  if (offsetDays === 0)  return t('PAYMENTS.OFFSET.DAY_ZERO');
  return offsetDays > 0
    ? t('PAYMENTS.OFFSET.AFTER',  { n: offsetDays })
    : t('PAYMENTS.OFFSET.BEFORE', { n: Math.abs(offsetDays) });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/** An invoice past its due date — the only urgency cue an entity-card can carry (§6). */
export function isLate(row: AgingRow): boolean {
  return row.joursRetard > 0;
}
