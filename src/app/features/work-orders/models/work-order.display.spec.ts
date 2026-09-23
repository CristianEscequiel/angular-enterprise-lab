import { BadgeVariant } from '@shared/components/badge/badge';
import { PRIORITY_BADGE, PRIORITY_LABELS, STATUS_BADGE, STATUS_LABELS } from './work-order.display';
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WorkOrderPriority,
  WorkOrderStatus,
} from './work-order.model';

describe('work order display maps', () => {
  it.each([
    ['STATUS_LABELS', STATUS_LABELS, WORK_ORDER_STATUSES],
    ['STATUS_BADGE', STATUS_BADGE, WORK_ORDER_STATUSES],
    ['PRIORITY_LABELS', PRIORITY_LABELS, WORK_ORDER_PRIORITIES],
    ['PRIORITY_BADGE', PRIORITY_BADGE, WORK_ORDER_PRIORITIES],
  ] as const)('%s has exactly one entry per model value', (_name, map, values) => {
    expect(Object.keys(map).sort()).toEqual([...values].sort());
  });

  it.each<[WorkOrderStatus, string, BadgeVariant]>([
    ['pending', 'Pendiente', 'pending'],
    ['in-progress', 'En progreso', 'in-progress'],
    ['completed', 'Completada', 'completed'],
  ])('status %s shows "%s" with the %s badge variant', (status, label, variant) => {
    expect(STATUS_LABELS[status]).toBe(label);
    expect(STATUS_BADGE[status]).toBe(variant);
  });

  it.each<[WorkOrderPriority, string, BadgeVariant]>([
    ['low', 'Baja', 'neutral'],
    ['medium', 'Media', 'warning'],
    ['high', 'Alta', 'error'],
  ])('priority %s shows "%s" with the %s badge variant', (priority, label, variant) => {
    expect(PRIORITY_LABELS[priority]).toBe(label);
    expect(PRIORITY_BADGE[priority]).toBe(variant);
  });
});
