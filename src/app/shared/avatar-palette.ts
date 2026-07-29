/**
 * Avatar badge backgrounds for `daf-entity-card`'s initials badge.
 *
 * These MUST be utility classes the library itself renders — never app-local
 * arbitrary values such as a `bg-[linear-gradient(…)]` with hardcoded hexes.
 * (Spelled with an ellipsis on purpose: Tailwind scans this file, and a literal
 * arbitrary class in a comment would emit a dead rule.)
 *
 * Native Federation loads a remote's JavaScript but not its global stylesheet:
 * the shell injects `<remote>/styles.css` separately (see the shell's
 * `ensureRemoteStyles`, which resolves on `error`/timeout too so a CSS failure
 * can't hang navigation). Whenever that sheet is missing, stale or slow, only
 * the SHELL's Tailwind build is in effect — and the shell scans
 * `@khalilrebhiitec/daf360`'s bundle, so lib-token classes are always present
 * there while an app-only arbitrary class is not. A missing badge background
 * leaves the card's `text-white` initials invisible on the white glass card.
 *
 * Every entry below is verified present in the shell's compiled CSS and clears
 * 4.5:1 against the badge's white text (primary #1d2b3e, secondary #4648d4,
 * teal #2D5D6E). Do NOT add `bg-tertiary` (#00c1ad), `bg-warning` (#f59e0b) or
 * `bg-teal-light` (remapped to #00c1ad by this app's styles.css) — white text
 * fails contrast on all three.
 */
export const AVATAR_BADGE_BG = [
  'bg-gradient-to-br from-primary to-secondary',
  'bg-primary',
  'bg-teal',
  'bg-secondary',
] as const;

/**
 * Two-letter initials for an avatar badge. Never returns `''` — the card only
 * falls back to `'?'` on null/undefined, so an empty string would render an
 * empty badge.
 */
export function avatarInitials(name: string | null | undefined): string {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
  return initials || '?';
}
