import { Component, inject, signal } from '@angular/core';

import { WorkOrder } from '../../models/work-order.model';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Router } from '@angular/router';
import { Badge } from '../../../../shared/components/badge/badge';

@Component({
  selector: 'app-work-orders-list',
  imports: [Alert, Button, Badge],
  templateUrl: './work-orders-list.html',
  styleUrl: './work-orders-list.scss',
})
export class WorkOrdersList {
  private readonly route = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  readonly workOrders = signal<WorkOrder[]>([]);
  readonly error = signal<string | null>(null);
  constructor() {
    this.loadWorkOrders();
  }

  loadWorkOrders(): void {
    this.error.set(null);

    this.workOrdersService
      .getAll()
      .subscribe({
        next: (workOrders) => {
          this.workOrders.set(workOrders);
        },
        error: () => {
          this.error.set('No se pudieron cargar las órdenes de trabajo.');
        },
      });
  }

  viewWorkOrder(id: number): void {
    this.route.navigate(['/work-orders', id]);
  }
}
