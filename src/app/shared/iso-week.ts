/** ISO 8601 week number (Monday-start weeks, week 1 = the week containing the year's first
 * Thursday) — standard algorithm: shift to that week's Thursday, then count days from Jan 1
 * of Thursday's year. Parsed with an explicit T00:00:00 so a plain 'yyyy-MM-dd' string is
 * read as local midnight, not shifted by UTC parsing.
 *
 * Shared between the WIP collaborator drill-down table and its Excel export, so both agree
 * on which week a given day falls into. */
export function isoWeek(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** The ISO week-numbering year — the year of the Thursday that falls in the same week as
 * `iso`. Not always the same as the calendar year: e.g. 31 Dec 2029 is a Monday, so its
 * week's Thursday (3 Jan 2030) belongs to 2030's week 1. Needed alongside isoWeek() to sort
 * week labels correctly (and avoid collisions) whenever a range crosses a year boundary. */
export function isoWeekYear(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  return d.getFullYear();
}
