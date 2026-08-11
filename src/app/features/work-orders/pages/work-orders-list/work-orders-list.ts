import { Component, inject, signal } from '@angular/core';

import { WorkOrder } from '../../models/work-order.model';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Spinner } from '../../../../shared/components/spinner/spinner';
import { LoadingService } from '../../../../core/services/loading.service';
import { MessageService } from '../../../../core/services/message.service';
import { Toast } from '../../../../shared/components/toast/toast';
import { Router } from '@angular/router';
import { Badge } from '../../../../shared/components/badge/badge';

@Component({
  selector: 'app-work-orders-list',
  imports: [Alert, Button, Spinner, Toast, Badge],
  templateUrl: './work-orders-list.html',
  styleUrl: './work-orders-list.scss',
})
export class WorkOrdersList {
  private readonly route = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly loadingService = inject(LoadingService)
  private readonly messageService = inject(MessageService);
  readonly isLoading = this.loadingService.isLoading;
  readonly message = this.messageService.message;
  readonly workOrders = signal<WorkOrder[]>([]);
  readonly error = signal<string | null>(null);
  readonly showToast = signal(false);

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
          this.showToast.set(true);
          this.error.set('No se pudieron cargar las órdenes de trabajo.');
        },
      });
  }
  clearMessage(): void {
    this.messageService.clear();
  }
  closeToast() {
    console.log('closeToast called');
    this.showToast.set(false);
    this.messageService.clear();
  }
  viewWorkOrder(id: number): void {
    console.log(`Selected work order with ID: ${id}`);
    this.route.navigate(['/work-orders', id]);
  }
}
