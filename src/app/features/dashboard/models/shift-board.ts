import { isSameLocalDay } from '@features/work-orders/models/work-order.dates';
import { isClosedStatus, WorkOrder } from '@features/work-orders/models/work-order.model';

// Lo que muestra el tablero "Turno de hoy" (spec 014, REQ-5). Se arma con una función pura para
// poder probar las reglas (qué cuenta como "de hoy", qué es "mía") sin HTTP ni reloj real.
export interface ShiftBoard {
  // Sin tomar, de la más reciente a la más antigua.
  pending: WorkOrder[];
  // Cuántas de las pendientes son de prioridad alta.
  pendingHigh: number;
  // Tomadas y sin cerrar, de la más reciente a la más antigua.
  inProgress: WorkOrder[];
  // Las de `inProgress` que tomó el usuario actual.
  mine: WorkOrder[];
  // Cerradas (completadas o canceladas) cuyo cierre cae hoy, de la más reciente a la más antigua.
  closedToday: WorkOrder[];
}

function time(iso: string | undefined): number {
  const value = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(value) ? 0 : value;
}

export function buildShiftBoard(
  orders: readonly WorkOrder[],
  userId: string | null,
  now: Date,
): ShiftBoard {
  const newestCreatedFirst = (a: WorkOrder, b: WorkOrder): number =>
    time(b.createdAt) - time(a.createdAt);
  const newestClosedFirst = (a: WorkOrder, b: WorkOrder): number =>
    time(b.closingNote?.at) - time(a.closingNote?.at);

  const pending = orders.filter((order) => order.status === 'pending').sort(newestCreatedFirst);
  const inProgress = orders
    .filter((order) => order.status === 'in-progress')
    .sort(newestCreatedFirst);
  // "De hoy" lo define el momento del cierre, no el de la creación: una orden de la semana pasada
  // que se cerró hoy cuenta. Una cerrada sin nota (dato inconsistente) no tiene fecha: no cuenta.
  const closedToday = orders
    .filter(
      (order) =>
        isClosedStatus(order.status) &&
        order.closingNote !== undefined &&
        isSameLocalDay(order.closingNote.at, now),
    )
    .sort(newestClosedFirst);

  return {
    pending,
    pendingHigh: pending.filter((order) => order.priority === 'high').length,
    inProgress,
    mine: userId === null ? [] : inProgress.filter((order) => order.takenBy?.id === userId),
    closedToday,
  };
}
