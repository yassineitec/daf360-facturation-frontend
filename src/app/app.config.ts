import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors }      from '@angular/common/http';
import { provideClientHydration, withEventReplay }  from '@angular/platform-browser';
import { routes }          from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { UserStore }       from './core/user.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    {
      provide: APP_INITIALIZER,
      useFactory: (store: UserStore) => () => store.loadCurrentUser(),
      deps: [UserStore],
      multi: true,
    },
  ],
};
