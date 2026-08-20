import { Component, inject, OnInit, signal } from '@angular/core';

import { WorkOrder } from '../../models/work-order.model';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Router } from '@angular/router';
import { Badge } from '../../../../shared/components/badge/badge';
import { MessageService } from '../../../../core/services/message.service';
import { Modal } from '../../../../shared/components/modal/modal';

@Component({
  selector: 'app-work-orders-list',
  imports: [Alert, Button, Badge, Modal],
  templateUrl: './work-orders-list.html',
  styleUrl: './work-orders-list.scss',
})
export class WorkOrdersList implements OnInit {
  private readonly route = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService)
  readonly workOrders = signal<WorkOrder[]>([]);
  readonly error = signal<string | null>(null);
  readonly isModalOpen = signal<boolean>(false)

  ngOnInit() {
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
  editWorkOrder(id: number): void {
    this.route.navigate(['/work-orders', id, 'edit'], {
      state: { id }
    });
  }
  navigateToCreateWorkOrder(): void {
    this.route.navigate(['/work-orders/new']);
  }
  readonly deleteModalOpen = signal(false);

  openDeleteModal(): void {
    this.deleteModalOpen.set(true);
  }

  deleteWorkOrder(id: number): void {
    this.workOrdersService.delete(id).subscribe({
      next: () => {
        this.messageService.showSuccess('Orden eliminada satisfactoriamente.');
        console.log('Work order deleted successfully.');
      },
      error: (error) => {
        this.messageService.showError('Error al eliminar la orden!')
        console.error('Error deleting work order:', error);
      },
    });
  }
}
