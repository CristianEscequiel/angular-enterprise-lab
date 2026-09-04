export type WorkOrderPriority = 'low' | 'medium' | 'high';
export type WorkOrderStatus = 'pending' | 'in-progress' | 'completed';

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  asset: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdAt: string;
}

export interface WorkOrderCreateRequest {
  title: string;
  description: string;
  asset: string;
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
