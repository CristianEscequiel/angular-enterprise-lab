export const WORK_ORDER_PRIORITIES = ['low', 'medium', 'high'] as const;
export const WORK_ORDER_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export const WORK_ORDER_TYPES = ['preventivo', 'correctivo', 'pronto-intervencion'] as const;

export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

export function isWorkOrderPriority(value: unknown): value is WorkOrderPriority {
  return WORK_ORDER_PRIORITIES.some((priority) => priority === value);
}

export function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return WORK_ORDER_STATUSES.some((status) => status === value);
}

export function isWorkOrderType(value: unknown): value is WorkOrderType {
  return WORK_ORDER_TYPES.some((type) => type === value);
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  asset: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdAt: string;
}

export interface WorkOrderCreateRequest {
  title: string;
  description: string;
  asset: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
}

export interface PaginatedResponse<T> {
  first: number;
  prev: number | null;
  next: number | null;
  last: number;
  pages: number;
  items: number;
  data: T[];
}
