import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { BottomNav } from '../bottom-nav/bottom-nav';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, Header, Sidebar, BottomNav],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly userName = computed(() => this.authService.currentUser()?.displayName ?? null);
  // Sin sesión (p. ej. /login) no hay navegación: ni sidebar ni barra inferior.
  readonly isAuthenticated = this.authService.isAuthenticated;

  toastOpen = signal(false);
  toastType = signal<'success' | 'error' | 'warning'>('success');
  toastTitle = signal('');
  toastMessage = signal('');

  showToast(type: 'success' | 'error' | 'warning', title: string, message: string): void {
    this.toastType.set(type);
    this.toastTitle.set(title);
    this.toastMessage.set(message);
    this.toastOpen.set(true);
  }

  closeToast(): void {
    this.toastOpen.set(false);
  }

  // Header solo emite; acá se decide qué implica cerrar sesión.
  onLogout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
