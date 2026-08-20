import { Component, inject, OnInit, signal } from '@angular/core';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder } from '../../models/work-order.model';
import { ActivatedRoute, Router } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { Button } from '../../../../shared/components/button/button';

@Component({
  selector: 'app-work-order-detail',
  imports: [Button],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
})
export class WorkOrderDetail implements OnInit {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly router = inject(ActivatedRoute);
  private readonly route = inject(Router)
  workOrderDetail = signal<WorkOrder | null>(null);

  ngOnInit() {
    const id = Number(this.router.paramMap.pipe(
      map((params) => Number(params.get('id'))),
      switchMap((id) =>
        this.workOrderService.getById(id)
      )
    ).subscribe((workOrder) => {
      this.workOrderDetail.set(workOrder);
    }));

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
  navigateToWorkOrdersList(): void {
    this.route.navigate(['/work-orders']);
  }

}
