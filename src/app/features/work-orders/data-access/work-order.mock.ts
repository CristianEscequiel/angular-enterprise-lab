import { WorkOrder } from '../models/work-order.model';

export const WORK_ORDERS_MOCK: WorkOrder[] = [
  {
    id: '1',
    title: 'Revisar motor principal',
    description: 'El motor presenta vibraciones fuera del rango normal.',
    machineRef: {
      machineId: '1',
      partId: null,
      breadcrumb: 'Envasadora línea 1',
      comment: 'Vibración fuera de rango.',
    },
    type: 'correctivo',
    priority: 'high',
    status: 'pending',
    createdAt: '2026-08-01T10:30:00',
  },
  {
    id: '2',
    title: 'Cambio de filtro hidráulico',
    description: 'Realizar el cambio preventivo del filtro.',
    machineRef: {
      machineId: '2',
      partId: '8',
      breadcrumb: 'Selladora > Cabezal térmico',
      comment: '',
    },
    type: 'preventivo',
    priority: 'medium',
    status: 'in-progress',
    createdAt: '2026-08-02T08:15:00',
    takenBy: {
      id: '5',
      name: 'Técnico Electricista Preventivo',
      at: '2026-08-02T09:15:00.000Z',
    },
  },
  {
    id: '3',
    title: 'Inspección de tablero eléctrico',
    description: 'Verificar conexiones y temperatura de componentes.',
    machineRef: {
      machineId: '1',
      partId: '3',
      breadcrumb: 'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta',
      comment: '',
    },
    type: 'preventivo',
    priority: 'low',
    status: 'completed',
    createdAt: '2026-08-03T14:00:00',
    takenBy: {
      id: '5',
      name: 'Técnico Electricista Preventivo',
      at: '2026-08-03T15:00:00.000Z',
    },
    closingNote: {
      comment:
        'Se limpiaron los contactos del tablero y se ajustó el apriete de las borneras; sin temperatura anormal.',
      authorId: '5',
      authorName: 'Técnico Electricista Preventivo',
      at: '2026-08-03T20:00:00.000Z',
    },
  },
];
