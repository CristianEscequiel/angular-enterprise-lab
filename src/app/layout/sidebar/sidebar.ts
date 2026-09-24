import { Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import {
  canManageTeams,
  canViewTechnicians,
} from '@features/maintenance/models/maintenance.permissions';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly authService = inject(AuthService);

  closed = output<void>();

  // Solo se ofrecen las secciones que la política le permite al rol. Es UX: el permiso real lo
  // exige el guard de cada ruta (un link oculto no protege nada).
  readonly showTechnicians = computed(() => canViewTechnicians(this.authService.currentUser()));
  readonly showTeams = computed(() => canManageTeams(this.authService.currentUser()));

  closeSidebar(): void {
    this.closed.emit();
  }
}
