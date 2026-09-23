import { Component, input, output } from '@angular/core';

import { Button } from '@shared/components/button/button';

@Component({
  selector: 'app-header',
  imports: [Button],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  sidebarOpen = input<boolean>(false);
  // null = no hay sesión: no se muestra ni el nombre ni el botón de logout.
  userName = input<string | null>(null);
  viewSidebar = output<void>();
  logout = output<void>();

  onViewClick(): void {
    this.viewSidebar.emit();
  }

  onLogoutClick(): void {
    this.logout.emit();
  }
}
