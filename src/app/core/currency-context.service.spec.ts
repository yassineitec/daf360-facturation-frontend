import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CurrencyContextService } from './currency-context.service';
import { UserStore } from './user.store';
import { AffaireService } from '../modules/affaires/affaire.service';
import type { PaysRefDto } from '../modules/affaires/affaire.model';

/**
 * 2026-11-10 currency-audit follow-up, Item 3: proves the two concrete cases the fix was for --
 * a Tunisia user resolves EUR, an Egypt user resolves USD -- using the real pays_ref.devise
 * values confirmed live against the dev DB (Tunisia id=179=EUR, Egypt id=53=USD), not invented
 * ones. This is the practical substitute for a live two-session browser proof (no Egypt test
 * user/running dev stack available in this environment).
 */
describe('CurrencyContextService', () => {
  const PAYS: PaysRefDto[] = [
    { id: 179, isoCode: 'TN', frenchLabel: 'Tunisie', englishLabel: 'Tunisia', devise: 'EUR' } as PaysRefDto,
    { id: 53,  isoCode: 'EG', frenchLabel: 'Égypte',  englishLabel: 'Egypt',   devise: 'USD' } as PaysRefDto,
  ];

  function setup(paysId: number | undefined, isAdmin: boolean) {
    const userStoreMock = {
      user: signal(paysId !== undefined ? { paysId } : null),
      isAdmin: () => isAdmin,
    };
    const affaireSvcMock = { getPays: () => of(PAYS) };
    TestBed.configureTestingModule({
      providers: [
        { provide: UserStore, useValue: userStoreMock },
        { provide: AffaireService, useValue: affaireSvcMock },
      ],
    });
    return TestBed.inject(CurrencyContextService);
  }

  it('resolves EUR for a Tunisia user (pays_id=179)', () => {
    const service = setup(179, false);
    service.init();
    expect(service.defaultCurrency()).toBe('EUR');
  });

  it('resolves USD for an Egypt user (pays_id=53), not the blanket EUR default', () => {
    const service = setup(53, false);
    service.init();
    expect(service.defaultCurrency()).toBe('USD');
  });

  it('is null for an admin, so callers fall through to the record\'s own currency', () => {
    const service = setup(179, true);
    service.init();
    expect(service.defaultCurrency()).toBeNull();
  });

  it('is idempotent -- a second init() does not re-fetch or change the resolved value', () => {
    let calls = 0;
    const userStoreMock = { user: signal({ paysId: 179 }), isAdmin: () => false };
    const affaireSvcMock = { getPays: () => { calls++; return of(PAYS); } };
    TestBed.configureTestingModule({
      providers: [
        { provide: UserStore, useValue: userStoreMock },
        { provide: AffaireService, useValue: affaireSvcMock },
      ],
    });
    const service = TestBed.inject(CurrencyContextService);

    service.init();
    service.init();

    expect(calls).toBe(1);
    expect(service.defaultCurrency()).toBe('EUR');
  });

  it('is null when the user has no paysId (e.g. not yet loaded)', () => {
    const service = setup(undefined, false);
    service.init();
    expect(service.defaultCurrency()).toBeNull();
  });
});
