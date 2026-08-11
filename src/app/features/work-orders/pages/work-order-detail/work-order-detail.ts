import { Component, inject } from '@angular/core';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { LoadingService } from '../../../../core/services/loading.service';
import { Spinner } from '../../../../shared/components/spinner/spinner';
import { WorkOrder } from '../../models/work-order.model';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-work-order-detail',
  imports: [Spinner],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
})
export class WorkOrderDetail {
  private readonly workOrderService = inject(WorkOrdersService);
  readonly loadingService = inject(LoadingService);
  private readonly route = inject(ActivatedRoute);

  workOrderDetail: WorkOrder | null = null;
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
        this.workOrderDetail = workOrder;
      },
      error: (error) => {
        console.error('Error fetching work order detail:', error);
      },
    });
  }
}
