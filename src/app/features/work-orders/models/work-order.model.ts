export const WORK_ORDER_PRIORITIES = ['low', 'medium', 'high'] as const;
export const WORK_ORDER_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled'] as const;
// Estados cerrados: son terminales (una orden cerrada no se reabre) y exigen un comentario de cierre.
export const CLOSED_WORK_ORDER_STATUSES = ['completed', 'cancelled'] as const;

// El comentario de cierre del técnico (spec 013d) tiene que ser sustancial: entre 50 y 500
// caracteres, sin contar los espacios de los bordes.
export const CLOSING_NOTE_MIN_LENGTH = 50;
export const CLOSING_NOTE_MAX_LENGTH = 500;
export const WORK_ORDER_TYPES = ['preventivo', 'correctivo', 'pronto-intervencion'] as const;

export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];
export type ClosedWorkOrderStatus = (typeof CLOSED_WORK_ORDER_STATUSES)[number];

export function isWorkOrderPriority(value: unknown): value is WorkOrderPriority {
  return WORK_ORDER_PRIORITIES.some((priority) => priority === value);
}

export function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return WORK_ORDER_STATUSES.some((status) => status === value);
}

export function isWorkOrderType(value: unknown): value is WorkOrderType {
  return WORK_ORDER_TYPES.some((type) => type === value);
}

export function isClosedStatus(value: unknown): value is ClosedWorkOrderStatus {
  return CLOSED_WORK_ORDER_STATUSES.some((status) => status === value);
}

// Única regla del comentario de cierre: la comparten el modelo, el servicio y el formulario. Los
// espacios de los bordes no cuentan (60 espacios y 10 letras no son un comentario de 70).
export function isValidClosingComment(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const length = value.trim().length;

  return length >= CLOSING_NOTE_MIN_LENGTH && length <= CLOSING_NOTE_MAX_LENGTH;
}

// Quién tomó la orden (spec 013d): `name` es un snapshot del `displayName`, como el breadcrumb.
export interface WorkOrderTaker {
  id: string;
  name: string;
  at: string;
}

// Comentario con el que el técnico cierra la orden (completada o cancelada). El estado dice el
// resultado; el comentario no lo repite. `authorId` es quien la cerró y coincide con quien la tomó.
export interface WorkOrderClosingNote {
  comment: string;
  authorId: string;
  authorName: string;
  at: string;
}

export function isWorkOrderTaker(value: unknown): value is WorkOrderTaker {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isNonBlankString(record['id']) &&
    isNonBlankString(record['name']) &&
    isNonBlankString(record['at'])
  );
}

export function isWorkOrderClosingNote(value: unknown): value is WorkOrderClosingNote {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isValidClosingComment(record['comment']) &&
    isNonBlankString(record['authorId']) &&
    isNonBlankString(record['authorName']) &&
    isNonBlankString(record['at'])
  );
}

// Referencia de la orden al maestro de máquinas y partes (spec 013a). `breadcrumb` es un SNAPSHOT de
// los nombres al crear la orden (máquina > nivel 1 > … > parte): no se recalcula, así que la orden
// conserva el nombre que tenía la parte aunque luego se renombre en el maestro. `comment` describe la
// falla en ese punto y va SEPARADO, nunca dentro del breadcrumb. `partId` en `null` es una
// intervención sobre la máquina completa.
export interface WorkOrderMachineRef {
  machineId: string;
  partId: string | null;
  breadcrumb: string;
  comment: string;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// `comment` puede ser vacío (es opcional); `machineId` y `breadcrumb` no.
export function isWorkOrderMachineRef(value: unknown): value is WorkOrderMachineRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const partId = record['partId'];

  return (
    isNonBlankString(record['machineId']) &&
    (partId === null || isNonBlankString(partId)) &&
    isNonBlankString(record['breadcrumb']) &&
    typeof record['comment'] === 'string'
  );
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  machineRef: WorkOrderMachineRef;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdAt: string;
  // Quién la tiene (spec 013d). Invariantes: `pending` → sin dueño (`null` = liberada); `in-progress`
  // → con dueño; cerrada → con dueño y `closingNote` (con `authorId` igual al dueño).
  takenBy?: WorkOrderTaker | null;
  closingNote?: WorkOrderClosingNote;
}

export interface WorkOrderCreateRequest {
  title: string;
  description: string;
  machineRef: WorkOrderMachineRef;
  type: WorkOrderType;
  priority: WorkOrderPriority;
}

// Página de un listado de la API: `page` va desde 1 y `size` es el tamaño pedido. Una página fuera de
// rango devuelve `data` vacío con los totales reales.
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
