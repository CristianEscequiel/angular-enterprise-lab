import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder, WorkOrderCreateRequest } from '../../models/work-order.model';
import { Form } from '../../components/form/form';
import { MessageService } from '../../../../core/services/message.service';
import { Button } from '../../../../shared/components/button/button';

@Component({
  selector: 'app-work-order-edit',
  imports: [Form, Button],
  templateUrl: './work-order-edit.html',
  styleUrl: './work-order-edit.scss',
})
export class WorkOrderEdit implements OnInit {
  private readonly router = inject(ActivatedRoute);
  private readonly route = inject(Router)
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService)

  workOrder = signal<WorkOrder | null>(null);

  ngOnInit() {
    const id = Number(this.router.snapshot.paramMap.get('id'));

    if (!id) return;

    this.workOrdersService.getById(id).subscribe({
      next: workOrder => this.workOrder.set(workOrder)
    });
  }
  onSubmitEdit(workOrderData: WorkOrderCreateRequest): void {
    const current = this.workOrder();

    if (!current) return;

    const hasChanges =
      current.title !== workOrderData.title ||
      current.description !== workOrderData.description ||
      current.asset !== workOrderData.asset ||
      current.priority !== workOrderData.priority;

    if (!hasChanges) {
      this.messageService.showWarning('No hubo cambios en la orden');
      return;
    }

    const updatedWorkOrder: WorkOrder = {
      ...current,
      ...workOrderData
    };

    this.workOrdersService.update(current.id, updatedWorkOrder).subscribe({
      next: (updated) => {
        this.workOrder.set(updated);
        this.messageService.showSuccess(
          'Orden de trabajo actualizada correctamente'
        );
      },
      error: (error) => {
        this.messageService.showError(
          'Error actualizando la orden de trabajo'
        );
        console.error('Error updating work order:', error);
      }
    });
  }
  navigateToWorkOrdersList(): void {
    this.route.navigate(['/work-orders']);
  }
}
