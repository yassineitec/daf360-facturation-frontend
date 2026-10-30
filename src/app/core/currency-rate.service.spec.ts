import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CurrencyRateService } from './currency-rate.service';

describe('CurrencyRateService', () => {
  let httpMock: HttpTestingController;
  const CACHE_KEY = 'fact_currency_rates';

  beforeEach(() => {
    localStorage.removeItem(CACHE_KEY);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(CACHE_KEY);
  });

  it('rejects a cached entry missing a required currency and fetches fresh instead', () => {
    const badCache = { rates: { EUR: 1, USD: 1.08 }, ts: Date.now() }; // missing TND/EGP/SAR/AED
    localStorage.setItem(CACHE_KEY, JSON.stringify(badCache));

    const service = TestBed.inject(CurrencyRateService);

    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4, SAR: 4.05, AED: 3.97 } });

    expect(service.rates()['TND']).toBe(3.35);
  });

  it('rejects a cached entry where EUR is not ~1 and fetches fresh instead', () => {
    const badCache = {
      rates: { EUR: 1000, USD: 1080, TND: 3350, EGP: 52400, SAR: 4050, AED: 3970 },
      ts: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(badCache));

    const service = TestBed.inject(CurrencyRateService);

    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4, SAR: 4.05, AED: 3.97 } });

    expect(service.rates()['EUR']).toBe(1);
  });

  it('rejects a cached entry with a zero/negative rate and fetches fresh instead', () => {
    const badCache = { rates: { EUR: 1, USD: 1.08, TND: 0, EGP: 52.4, SAR: 4.05, AED: 3.97 }, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(badCache));

    const service = TestBed.inject(CurrencyRateService);

    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.35, EGP: 52.4, SAR: 4.05, AED: 3.97 } });

    expect(service.rates()['TND']).toBe(3.35);
  });

  it('accepts a valid cached entry as-is, with no fetch', () => {
    const goodCache = { rates: { EUR: 1, USD: 1.08, TND: 3.4, EGP: 52.0, SAR: 4.0, AED: 3.9 }, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(goodCache));

    const service = TestBed.inject(CurrencyRateService);

    httpMock.expectNone('https://open.exchangerate-api.com/v6/latest/EUR');
    expect(service.rates()['TND']).toBe(3.4);
  });

  it('ignores an invalid fetch response and keeps the existing rates', () => {
    const service = TestBed.inject(CurrencyRateService);
    const before = service.rates();

    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.08 } }); // missing TND/EGP/SAR/AED — invalid

    expect(service.rates()).toEqual(before);
  });

  it('accepts a valid fetch response and replaces the rates', () => {
    const service = TestBed.inject(CurrencyRateService);

    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.09, TND: 3.4, EGP: 51.0, SAR: 4.1, AED: 3.95 } });

    expect(service.rates()['USD']).toBe(1.09);
  });

  it('convert() uses the real rate for a currency present in rates()', () => {
    const service = TestBed.inject(CurrencyRateService);
    httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR')
      .flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.4, EGP: 52.0, SAR: 4.0, AED: 3.9 } });

    expect(service.convert(100, 'EUR', 'TND')).toBeCloseTo(340, 5);
  });

  it('convert() falls back to FALLBACK_RATES for a currency missing from rates(), not a blanket 1', () => {
    const service = TestBed.inject(CurrencyRateService);
    const req = httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR');
    req.flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.4, EGP: 52.0, SAR: 4.0, AED: 3.9 } });

    expect(service.convert(100, 'EUR', 'GBP')).toBe(100);
  });

  it('needsFallbackRate() reports true only for a currency absent from the current rates()', () => {
    const service = TestBed.inject(CurrencyRateService);
    httpMock.expectOne('https://open.exchangerate-api.com/v6/latest/EUR')
      .flush({ conversion_rates: { EUR: 1, USD: 1.08, TND: 3.4, EGP: 52.0, SAR: 4.0, AED: 3.9 } });

    expect(service.needsFallbackRate('TND')).toBe(false);
    expect(service.needsFallbackRate('GBP')).toBe(true);
  });
});
