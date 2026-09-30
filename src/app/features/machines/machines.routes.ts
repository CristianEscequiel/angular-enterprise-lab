import { Routes, UrlMatcher } from '@angular/router';

import { requireUser } from '@core/auth/auth.guard';
import { canManageMachines } from './models/machines.permissions';

// Los ids de máquina los genera el servidor (`"o89hc_hyt6A"`) y los de los datos de prueba son
// numéricos (`"1"`): letras, dígitos, guion y guion bajo, hasta 64. Un segmento que no lo cumpla no es
// una máquina reconocible por la app: debe caer en el wildcard 404 de app.routes.ts, no en una página
// que arme un request con `../users` u otra cosa.
export const MACHINE_ID_ROUTE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Dos segmentos exactos: `<id>/<sufijo>`. Devuelve el id como parámetro `id`.
function matchMachineSubpage(suffix: string): UrlMatcher {
  return (segments) => {
    const [idSegment, suffixSegment] = segments;

    if (
      segments.length !== 2 ||
      !idSegment ||
      suffixSegment?.path !== suffix ||
      !MACHINE_ID_ROUTE_PATTERN.test(idSegment.path)
    ) {
      return null;
    }
    return { consumed: segments, posParams: { id: idSegment } };
  };
}

export const matchMachineEdit: UrlMatcher = matchMachineSubpage('edit');
export const matchMachineParts: UrlMatcher = matchMachineSubpage('parts');

// Gestionar máquinas y su árbol de partes es lo mismo para Administrador y TeamLeader (una sola
// política). Todas las rutas exigen sesión (el grupo padre en app.routes.ts) y, además, ese permiso.
// Con sesión pero sin permiso: aviso + /dashboard; sin sesión: login con retorno a la URL pedida (lo
// resuelve `requireUser`).
const manageMachines = requireUser((user) => canManageMachines(user));

export const MACHINES_ROUTES: Routes = [
  {
    path: '',
    title: 'Máquinas | Angular Enterprise Lab',
    canActivate: [manageMachines],
    loadComponent: () => import('./pages/machines-list/machines-list').then((m) => m.MachinesList),
  },
  {
    path: 'new',
    title: 'Nueva máquina | Angular Enterprise Lab',
    canActivate: [manageMachines],
    loadComponent: () => import('./pages/machine-form/machine-form').then((m) => m.MachineForm),
  },
  {
    matcher: matchMachineEdit,
    title: 'Editar máquina | Angular Enterprise Lab',
    canActivate: [manageMachines],
    loadComponent: () => import('./pages/machine-form/machine-form').then((m) => m.MachineForm),
  },
  {
    matcher: matchMachineParts,
    title: 'Partes de la máquina | Angular Enterprise Lab',
    canActivate: [manageMachines],
    loadComponent: () => import('./pages/machine-parts/machine-parts').then((m) => m.MachineParts),
  },
];
