import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
  sidebarOpen = signal(false);
  toastOpen = signal(false);
  toastType = signal<'success' | 'error' | 'warning'>('success');
  toastTitle = signal('');
  toastMessage = signal('');

  showToast(
    type: 'success' | 'error' | 'warning',
    title: string,
    message: string
  ): void {
    this.toastType.set(type);
    this.toastTitle.set(title);
    this.toastMessage.set(message);
    this.toastOpen.set(true);
  }

  closeToast(): void {
    this.toastOpen.set(false);
  }
  openSidebar() {
    this.sidebarOpen.set(true);
  }
  closeSidebar() {
    this.sidebarOpen.set(false);
  }

}
