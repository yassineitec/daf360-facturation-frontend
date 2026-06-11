import { Component, signal }   from '@angular/core';
import { TestBed }             from '@angular/core/testing';
import { By }                  from '@angular/platform-browser';
import { PermissionDirective } from './permission.directive';
import { UserStore }           from '../core/user.store';

@Component({
  imports: [PermissionDirective],
  template: `<ng-container *appHasPermission="'SOME_PERM'"><div class="target">content</div></ng-container>`,
})
class TestHostComponent {}

describe('PermissionDirective', () => {
  function setup(hasPermission: boolean) {
    const storeMock = {
      user:            signal(null),
      isAuthenticated: signal(false),
      permissions:     signal<string[]>([]),
      hasPermission:   () => hasPermission,
    };
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [{ provide: UserStore, useValue: storeMock }],
    });
    return TestBed.createComponent(TestHostComponent);
  }

  it('hides element when user lacks permission', () => {
    const fixture = setup(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.target'))).toBeNull();
  });

  it('shows element when user has permission', () => {
    const fixture = setup(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.target'))).not.toBeNull();
  });

  it('shows element when permission input is null', () => {
    @Component({
      imports: [PermissionDirective],
      template: `<ng-container *appHasPermission="null"><div class="free">free</div></ng-container>`,
    })
    class FreeHostComponent {}

    const storeMock = {
      user: signal(null), isAuthenticated: signal(false),
      permissions: signal<string[]>([]), hasPermission: () => false,
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FreeHostComponent],
      providers: [{ provide: UserStore, useValue: storeMock }],
    });
    const fixture = TestBed.createComponent(FreeHostComponent);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.free'))).not.toBeNull();
  });
});
