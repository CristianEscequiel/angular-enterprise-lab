import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { firstValueFrom } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Contrasta la sesión guardada con `GET /auth/me` antes de la primera navegación; no falla nunca
    // (sin conexión conserva la sesión), así que no puede bloquear el arranque.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).revalidate())),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, errorInterceptor])),
  ],
};
