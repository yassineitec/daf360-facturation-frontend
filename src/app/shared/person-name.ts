/**
 * "Prénom NOM" — the same rule as the RH app (daf360-rh-frontend
 * shared/utils/person-name.utils.ts); keep the two in step.
 *
 *   formatFirstName('jean-marc ben') → 'Jean-Marc Ben'
 *   formatLastName('ben dupont')     → 'BEN DUPONT'
 *   composePersonName('jean', 'ben dupont') → 'Jean BEN DUPONT'
 */

/** Prénom: every word with a leading capital (also after - and '). */
export function formatFirstName(raw: string | null | undefined): string {
  return words(raw).map(capitalize).join(' ');
}

/** Nom: the whole last name in capitals. */
export function formatLastName(raw: string | null | undefined): string {
  return words(raw).join(' ').toLocaleUpperCase('fr');
}

/** "Prénom NOM" from the two fields; either may be empty. */
export function composePersonName(firstName: string | null | undefined,
                                  lastName: string | null | undefined): string {
  return [formatFirstName(firstName), formatLastName(lastName)].filter(Boolean).join(' ');
}

/**
 * Splits a stored "Prénom NOM" back into its two fields. The NOM is the run of words in
 * capitals at the end ('Jean BEN DUPONT' → Jean / BEN DUPONT); a name not yet in that form
 * falls back to its last word ('Jean Dupont' → Jean / Dupont). The first word always stays
 * in the prénom.
 */
export function splitPersonName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const w = words(fullName);
  if (w.length < 2) return { firstName: w[0] ?? '', lastName: '' };
  let start = w.length;
  while (start > 1 && isUpperWord(w[start - 1])) start--;
  if (start === w.length) start = w.length - 1;
  return { firstName: w.slice(0, start).join(' '), lastName: w.slice(start).join(' ') };
}

function words(raw: string | null | undefined): string[] {
  return (raw ?? '').trim().split(/\s+/).filter(Boolean);
}

/** Has at least one cased letter and none of them lower-case. */
function isUpperWord(word: string): boolean {
  return word !== word.toLocaleLowerCase('fr') && word === word.toLocaleUpperCase('fr');
}

function capitalize(word: string): string {
  let out = '';
  let upNext = true;
  for (const ch of word.toLocaleLowerCase('fr')) {
    out += upNext ? ch.toLocaleUpperCase('fr') : ch;
    upNext = ch === '-' || ch === '\'' || ch === '’';
  }
  return out;
}
