import { describe, it, expect } from 'vitest';
import { clientLocation } from './client-display';

describe('clientLocation', () => {
  it('joins city and postal code', () => {
    expect(clientLocation({ address: '12 rue de Carthage', city: 'Tunis', postalCode: '1002' }))
      .toBe('Tunis, 1002');
  });

  it('shows the city alone when there is no postal code', () => {
    expect(clientLocation({ address: null, city: 'Sfax', postalCode: null })).toBe('Sfax');
  });

  it('shows the postal code alone when there is no city', () => {
    expect(clientLocation({ address: null, city: null, postalCode: '1002' })).toBe('1002');
  });

  it('falls back to the street address when neither city nor postal code is set', () => {
    expect(clientLocation({ address: '12 rue de Carthage', city: null, postalCode: null }))
      .toBe('12 rue de Carthage');
  });

  it('ignores blank values', () => {
    expect(clientLocation({ address: '  ', city: ' Tunis ', postalCode: '' })).toBe('Tunis');
  });

  it('returns a dash when nothing is known', () => {
    expect(clientLocation({ address: null, city: null, postalCode: null })).toBe('—');
  });
});
