import { Component, input, output } from '@angular/core';

import { Button } from '@shared/components/button/button';

@Component({
  selector: 'app-header',
  imports: [Button],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  // null = no hay sesión: no se muestra ni el nombre ni el botón de logout.
  userName = input<string | null>(null);
  logout = output<void>();

  onLogoutClick(): void {
    this.logout.emit();
  }
}
