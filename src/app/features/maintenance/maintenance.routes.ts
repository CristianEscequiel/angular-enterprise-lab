import { Routes, UrlMatcher } from '@angular/router';

import { requireUser } from '@core/auth/auth.guard';
import { isLegajo } from '@core/auth/auth.model';
import {
  canCreateTechnician,
  canEditTechnician,
  canManageTeams,
  canViewTechnicians,
} from './models/maintenance.permissions';

// El legajo del técnico es un identificador con formato propio (1 a 8 dígitos). Un segmento que
// no lo cumpla no es un técnico reconocible por la app: debe caer en el wildcard 404 de
// app.routes.ts, no en TechnicianForm (que ni siquiera debe armar un request con ese legajo).
export const matchTechnicianEdit: UrlMatcher = (segments) => {
  const [legajoSegment, suffixSegment] = segments;

  if (
    segments.length !== 2 ||
    !legajoSegment ||
    suffixSegment?.path !== 'edit' ||
    !isLegajo(legajoSegment.path)
  ) {
    return null;
  }
  return { consumed: segments, posParams: { legajo: legajoSegment } };
};

// Todas las rutas exigen sesión (el grupo padre en app.routes.ts) y, además, el permiso de la
// política de cada una. Con sesión pero sin permiso: aviso + /dashboard; sin sesión: login con
// retorno a la URL pedida (lo resuelve `requireUser`).
export const MAINTENANCE_ROUTES: Routes = [
  { path: '', redirectTo: 'technicians', pathMatch: 'full' },
  {
    path: 'technicians',
    children: [
      {
        path: '',
        title: 'Técnicos | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canViewTechnicians(user))],
        loadComponent: () =>
          import('./pages/technicians-list/technicians-list').then((m) => m.TechniciansList),
      },
      {
        path: 'new',
        title: 'Crear técnico | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canCreateTechnician(user))],
        loadComponent: () =>
          import('./pages/technician-form/technician-form').then((m) => m.TechnicianForm),
      },
      {
        matcher: matchTechnicianEdit,
        title: 'Editar técnico | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canEditTechnician(user))],
        loadComponent: () =>
          import('./pages/technician-form/technician-form').then((m) => m.TechnicianForm),
      },
    ],
  },
  {
    path: 'teams',
    children: [
      {
        path: '',
        title: 'Equipos | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canManageTeams(user))],
        loadComponent: () => import('./pages/teams-list/teams-list').then((m) => m.TeamsList),
      },
      {
        path: 'new',
        title: 'Crear equipo | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canManageTeams(user))],
        loadComponent: () => import('./pages/team-form/team-form').then((m) => m.TeamForm),
      },
      {
        path: ':id/edit',
        title: 'Editar equipo | Angular Enterprise Lab',
        canActivate: [requireUser((user) => canManageTeams(user))],
        loadComponent: () => import('./pages/team-form/team-form').then((m) => m.TeamForm),
      },
    ],
  },
];
