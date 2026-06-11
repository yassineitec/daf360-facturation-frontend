import { Component, OnInit, inject } from '@angular/core';
import { Router }      from '@angular/router';
import { UserStore }   from './user.store';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-auth-callback',
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                font-family:'Inter',sans-serif;color:#44474c;font-size:0.9375rem;">
      Authentification en cours…
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  private store  = inject(UserStore);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.store.loadCurrentUser();
    if (this.store.isAuthenticated()) {
      await this.router.navigateByUrl('/fact/affaires');
    } else {
      window.location.href = `${environment.portalUrl}/oauth2/authorization/azure`;
    }
  }
}
