import { WorkOrder } from '../models/work-order.model';

export const WORK_ORDERS_MOCK: WorkOrder[] = [
  {
    id: 1,
    title: 'Revisar motor principal',
    description: 'El motor presenta vibraciones fuera del rango normal.',
    asset: 'Línea de producción 01',
    priority: 'high',
    status: 'pending',
    createdAt: '2026-08-01T10:30:00',
  },
  {
    id: 2,
    title: 'Cambio de filtro hidráulico',
    description: 'Realizar el cambio preventivo del filtro.',
    asset: 'Prensa hidráulica 02',
    priority: 'medium',
    status: 'in-progress',
    createdAt: '2026-08-02T08:15:00',
  },
  {
    id: 3,
    title: 'Inspección de tablero eléctrico',
    description: 'Verificar conexiones y temperatura de componentes.',
    asset: 'Tablero general',
    priority: 'low',
    status: 'completed',
    createdAt: '2026-08-03T14:00:00',
  },
];
