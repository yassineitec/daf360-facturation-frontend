import { TestBed }    from '@angular/core/testing';
import { AuthService } from './auth.service';
import { UserStore }   from './user.store';

describe('AuthService', () => {
  let service: AuthService;
  let storeSpy: jasmine.SpyObj<UserStore>;

  beforeEach(() => {
    storeSpy = jasmine.createSpyObj('UserStore', ['clear', 'loadCurrentUser'], {
      isAuthenticated: jasmine.createSpy('isAuthenticated').and.returnValue(false),
    });
    storeSpy.loadCurrentUser.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: UserStore, useValue: storeSpy },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('logout calls store.clear()', () => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
    service.logout();
    expect(storeSpy.clear).toHaveBeenCalled();
  });

  it('refreshToken delegates to store.loadCurrentUser', async () => {
    await service.refreshToken();
    expect(storeSpy.loadCurrentUser).toHaveBeenCalled();
  });

  it('refreshToken returns authenticated state after reload', async () => {
    (storeSpy.isAuthenticated as jasmine.Spy).and.returnValue(true);
    const result = await service.refreshToken();
    expect(result).toBeTrue();
  });
});
