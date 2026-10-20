import { UserRole } from '@core/auth/auth.model';

export type RoleActionId =
  | 'create-preventive-corrective'
  | 'create-urgent'
  | 'edit-orders'
  | 'delete-orders'
  | 'release-orders'
  | 'cancel-orders'
  | 'take-orders'
  | 'close-orders'
  | 'manage-machines'
  | 'manage-technicians'
  | 'manage-teams';

export interface RoleCard {
  role: UserRole;
  title: string;
  actions: readonly { id: RoleActionId; label: string }[];
}
export interface AreaCard {
  title: string;
  description: string;
}
export interface OrderStep {
  title: string;
  description: string;
}

export interface AboutContent {
  heroTagline: string;
  steps: readonly OrderStep[];
  roles: readonly RoleCard[];
  areas: readonly AreaCard[];
}

export const ABOUT_CONTENT: AboutContent = {
  heroTagline:
    'Gestión de órdenes de mantenimiento de la planta: quién pide un trabajo, quién lo toma y cómo se cierra.',
  steps: [
    {
      title: 'Crear',
      description:
        'Producción o el team leader registran la falla indicando la máquina y, si corresponde, la parte afectada.',
    },
    {
      title: 'Tomar',
      description: 'Un técnico habilitado toma la orden pendiente y queda como su responsable.',
    },
    {
      title: 'Cerrar',
      description:
        'El técnico la cierra como completada o cancelada, con un comentario obligatorio.',
    },
    {
      title: 'Liberar',
      description:
        'Si la orden está en curso y el técnico no puede seguir, se libera y vuelve a pendiente.',
    },
    {
      title: 'Cancelar',
      description:
        'Una orden pendiente que ya no hace falta la cancela el administrador o el team leader.',
    },
  ],
  roles: [
    {
      role: 'administrador',
      title: 'Administrador',
      actions: [
        { id: 'edit-orders', label: 'Editar órdenes' },
        { id: 'delete-orders', label: 'Eliminar órdenes' },
        { id: 'release-orders', label: 'Liberar órdenes' },
        { id: 'cancel-orders', label: 'Cancelar órdenes' },
        { id: 'manage-machines', label: 'Gestionar máquinas' },
        { id: 'manage-technicians', label: 'Gestionar técnicos' },
      ],
    },
    {
      role: 'team-leader-mantenimiento',
      title: 'Team Leader de Mantenimiento',
      actions: [
        { id: 'create-preventive-corrective', label: 'Crear órdenes preventivas y correctivas' },
        { id: 'edit-orders', label: 'Editar órdenes' },
        { id: 'release-orders', label: 'Liberar órdenes' },
        { id: 'cancel-orders', label: 'Cancelar órdenes' },
        { id: 'manage-machines', label: 'Gestionar máquinas' },
        { id: 'manage-technicians', label: 'Gestionar técnicos' },
        { id: 'manage-teams', label: 'Gestionar equipos' },
      ],
    },
    {
      role: 'personal-produccion',
      title: 'Personal de Producción',
      actions: [{ id: 'create-urgent', label: 'Crear órdenes de pronto intervención' }],
    },
    {
      role: 'tecnico',
      title: 'Técnico',
      actions: [
        { id: 'take-orders', label: 'Tomar órdenes según su tipo de equipo' },
        { id: 'close-orders', label: 'Cerrar las órdenes que tomó' },
      ],
    },
  ],
  areas: [
    {
      title: 'Órdenes de trabajo',
      description: 'Registro, búsqueda y seguimiento de las órdenes por estado y prioridad.',
    },
    {
      title: 'Máquinas y partes',
      description:
        'Cada máquina con el árbol de sus partes, para ubicar con precisión dónde ocurre la falla.',
    },
    {
      title: 'Técnicos y equipos',
      description:
        'Alta de técnicos con su legajo, especialidad y tipo de equipo, y armado de equipos de trabajo.',
    },
    {
      title: 'Tablero de turno',
      description:
        'Resumen del turno: órdenes pendientes y en curso, las suyas en curso y las cerradas hoy.',
    },
  ],
};
