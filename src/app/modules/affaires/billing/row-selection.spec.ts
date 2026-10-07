import { RowSelection } from './row-selection';

describe('RowSelection', () => {
  it('starts empty with no affaire lock', () => {
    const sel = new RowSelection();
    expect(sel.ids().size).toBe(0);
    expect(sel.lockedAffaireId()).toBeNull();
  });

  it('locks to the first checked row\'s affaire', () => {
    const sel = new RowSelection();
    sel.toggle(1, 100);
    expect(sel.ids().has(1)).toBe(true);
    expect(sel.lockedAffaireId()).toBe(100);
  });

  it('allows further selection within the same affaire', () => {
    const sel = new RowSelection();
    sel.toggle(1, 100);
    sel.toggle(2, 100);
    expect(sel.ids().size).toBe(2);
    expect(sel.lockedAffaireId()).toBe(100);
  });

  it('is disabled for a row of a different affaire once locked', () => {
    const sel = new RowSelection();
    sel.toggle(1, 100);
    expect(sel.isDisabledFor(200)).toBe(true);
    expect(sel.isDisabledFor(100)).toBe(false);
  });

  it('unchecking the last row clears the lock', () => {
    const sel = new RowSelection();
    sel.toggle(1, 100);
    sel.toggle(1, 100);
    expect(sel.ids().size).toBe(0);
    expect(sel.lockedAffaireId()).toBeNull();
    expect(sel.isDisabledFor(200)).toBe(false);
  });

  it('clear() resets everything', () => {
    const sel = new RowSelection();
    sel.toggle(1, 100);
    sel.toggle(2, 100);
    sel.clear();
    expect(sel.ids().size).toBe(0);
    expect(sel.lockedAffaireId()).toBeNull();
  });
});
