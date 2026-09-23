import { Component, computed, DOCUMENT, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, Header, Sidebar],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly userName = computed(() => this.authService.currentUser()?.displayName ?? null);

  sidebarOpen = signal(false);
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
  // Mismo patrón que Modal (spec 005): se recuerda quién abrió el panel
  // para devolverle el foco al cerrarlo, en vez de perderlo en el body.
  private readonly document = inject(DOCUMENT);
  private previouslyFocusedElement: HTMLElement | null = null;

  openSidebar() {
    this.previouslyFocusedElement = this.document.activeElement as HTMLElement | null;
    this.sidebarOpen.set(true);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
    this.previouslyFocusedElement?.focus();
    this.previouslyFocusedElement = null;
  }

  // Header solo emite; acá se decide qué implica cerrar sesión.
  onLogout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
