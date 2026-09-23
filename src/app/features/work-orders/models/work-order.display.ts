import { BadgeVariant } from '@shared/components/badge/badge';
import { WorkOrderPriority, WorkOrderStatus } from './work-order.model';

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: 'Pendiente',
  'in-progress': 'En progreso',
  completed: 'Completada',
};

export const PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const STATUS_BADGE: Record<WorkOrderStatus, BadgeVariant> = {
  pending: 'pending',
  'in-progress': 'in-progress',
  completed: 'completed',
};

export const PRIORITY_BADGE: Record<WorkOrderPriority, BadgeVariant> = {
  low: 'neutral',
  medium: 'warning',
  high: 'error',
};
