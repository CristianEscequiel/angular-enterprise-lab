export type WorkOrderPriority = 'low' | 'medium' | 'high';
export type WorkOrderStatus = 'pending' | 'in-progress' | 'completed';

export interface WorkOrder {
  id: number;
  title: string;
  description: string;
  asset: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdAt: string;
}
