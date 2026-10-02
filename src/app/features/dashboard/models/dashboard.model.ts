import {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from '@features/work-orders/models/work-order.model';

// Período que el resumen usó para `closedInPeriod` y `averageResolutionMinutes`: fechas `YYYY-MM-DD`
// en UTC, ambas incluidas. Sin `from` ni `to` en el pedido, la API usa los 30 días que terminan hoy.
export interface DashboardPeriod {
  from: string;
  to: string;
}

export interface ClosedInPeriod {
  completed: number;
  cancelled: number;
  total: number;
}

// `GET /dashboard/summary`. Los conteos por estado, prioridad y tipo son sobre TODAS las órdenes; solo
// `closedInPeriod` y `averageResolutionMinutes` dependen del período. `averageResolutionMinutes` es
// `null` si no hubo ninguna orden completada en el período.
export interface DashboardSummary {
  period: DashboardPeriod;
  byStatus: Record<WorkOrderStatus, number>;
  byPriority: Record<WorkOrderPriority, number>;
  byType: Record<WorkOrderType, number>;
  total: number;
  open: number;
  closedInPeriod: ClosedInPeriod;
  averageResolutionMinutes: number | null;
}

// `GET /dashboard/workload`: un técnico con órdenes `in-progress` y cuántas tiene.
export interface WorkloadItem {
  takenById: string;
  takenByName: string;
  inProgress: number;
}

// Duración legible para el promedio de resolución: "45 min", "2 h", "2 h 30 min", "3 d 4 h". Sin dato
// (`null`) o un valor que no es un número finito y no negativo, "Sin datos".
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return 'Sin datos';
  }

  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;

  if (days > 0) {
    return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  }

  if (hours > 0) {
    return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  }

  return `${mins} min`;
}
