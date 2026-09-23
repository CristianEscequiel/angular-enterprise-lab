import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService, InvalidCredentialsError } from '@core/auth/auth.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { sanitizeReturnUrl } from '../../return-url';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, Button, Alert],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loginForm = this.fb.group({
    username: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly returnUrl = computed(() => sanitizeReturnUrl(this.queryParamMap().get('returnUrl')));

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl(this.returnUrl());
    }
  }

  isInvalid(controlName: keyof typeof this.loginForm.controls): boolean {
    const control = this.loginForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  onSubmit(): void {
    if (this.submitting()) return;

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.authService
      .login(this.loginForm.getRawValue())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.returnUrl());
        },
        error: (error: unknown) => {
          // Los errores de conexión ya los notifica el errorInterceptor con un toast;
          // acá solo se muestra inline el rechazo de credenciales.
          if (error instanceof InvalidCredentialsError) {
            this.errorMessage.set(error.message);
          }
        },
      });
  }
}
