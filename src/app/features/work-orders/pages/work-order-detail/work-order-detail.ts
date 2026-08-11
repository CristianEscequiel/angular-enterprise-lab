import { Component, inject, signal } from '@angular/core';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder } from '../../models/work-order.model';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-work-order-detail',
  imports: [],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
})
export class WorkOrderDetail {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly route = inject(ActivatedRoute);
  workOrderDetail = signal<WorkOrder | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (Number.isNaN(id)) {
      return;
    }

    this.getWorkOrderDetail(id);
  }

  getWorkOrderDetail(id: number) {
    this.workOrderService.getById(id).subscribe({
      next: (workOrder) => {
        this.workOrderDetail.set(workOrder);
      },
      error: (error) => {
        console.error('Error fetching work order detail:', error);
      },
    });
  }
}
