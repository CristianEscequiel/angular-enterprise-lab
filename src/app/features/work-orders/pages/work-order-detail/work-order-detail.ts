import { Component, inject, OnInit, signal } from '@angular/core';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder } from '../../models/work-order.model';
import { ActivatedRoute, Router } from '@angular/router';
import { Button } from '../../../../shared/components/button/button';

@Component({
  selector: 'app-work-order-detail',
  imports: [Button],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
})
export class WorkOrderDetail implements OnInit {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly workOrderDetail = signal<WorkOrder | null>(null);

  ngOnInit() {
    const id = this.activatedRoute.snapshot.paramMap.get('id');
    if (!id) return;
    this.workOrderService.getById(id).subscribe({
      next: (workOrder) => {
        this.workOrderDetail.set(workOrder);
      },
      error: () => this.router.navigate(['/work-orders'])
    });
  }

  getWorkOrderDetail(id: string) {
    this.workOrderService.getById(id).subscribe({
      next: (workOrder) => {
        this.workOrderDetail.set(workOrder);
      },
      error: (error) => {
        console.error('Error fetching work order detail:', error);
      },
    });
  }
  navigateToWorkOrdersList(): void {
    this.router.navigate(['/work-orders']);
  }

}
