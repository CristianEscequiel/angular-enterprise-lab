import { computed, inject, Signal } from '@angular/core';

import { AuthService } from '@core/auth/auth.service';
import { canManageMachines } from '@features/machines/models/machines.permissions';
import {
  canManageTeams,
  canViewTechnicians,
} from '@features/maintenance/models/maintenance.permissions';

export interface NavItem {
  label: string;
  path: string;
}

// Las secciones que ve el usuario actual, en el orden en que se muestran. Las comparten el sidebar
// (desde md) y la barra inferior (mobile): ninguno de los dos decide permisos por su cuenta.
//
// Solo se ofrecen las secciones que la política le permite al rol. Es UX: el permiso real lo exige
// el guard de cada ruta (un link oculto no protege nada). Inicio y Órdenes van siempre; que no haya
// navegación sin sesión lo decide el shell, no esta lista.
//
// Hay que llamarla en un contexto de inyección (inicializador de campo de un componente).
export function injectNavItems(): Signal<NavItem[]> {
  const authService = inject(AuthService);

  return computed(() => {
    const user = authService.currentUser();
    const items: NavItem[] = [
      { label: 'Inicio', path: '/dashboard' },
      { label: 'Órdenes', path: '/work-orders' },
    ];

    if (canViewTechnicians(user)) {
      items.push({ label: 'Técnicos', path: '/maintenance/technicians' });
    }
    if (canManageTeams(user)) {
      items.push({ label: 'Equipos', path: '/maintenance/teams' });
    }
    // Máquinas y su árbol de partes: Administrador y TeamLeader, con el mismo nivel de permiso.
    if (canManageMachines(user)) {
      items.push({ label: 'Máquinas', path: '/machines' });
    }

    return items;
  });
}
