import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { WorkOrderLoader } from '../../data-access/work-order-loader';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder, WorkOrderCreateRequest } from '../../models/work-order.model';
import { Form } from '../../components/form/form';
import { MessageService } from '../../../../core/services/message.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';

@Component({
  selector: 'app-work-order-edit',
  imports: [Form, Alert, Button],
  templateUrl: './work-order-edit.html',
  styleUrl: './work-order-edit.scss',
  providers: [WorkOrderLoader],
})
export class WorkOrderEdit implements OnInit {
  private readonly loader = inject(WorkOrderLoader);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService);

  readonly workOrder = this.loader.workOrder;
  readonly loadError = this.loader.error;
  readonly isSubmitting = signal(false);

  ngOnInit() {
    const id = this.activatedRoute.snapshot.paramMap.get('id');
    if (!id) {
      this.loader.error.set('not-found');
      return;
    }
    this.loader.load(id);
  }

  retry(): void {
    this.loader.retry();
  }
  onSubmitEdit(workOrderData: WorkOrderCreateRequest): void {
    if (this.isSubmitting()) return;

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
      ...workOrderData,
    };

    this.isSubmitting.set(true);
    this.workOrdersService
      .update(current.id, updatedWorkOrder)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (updated) => {
          this.workOrder.set(updated);
          this.messageService.showSuccess('Orden de trabajo actualizada correctamente');
          this.navigateToWorkOrdersList();
        },
        error: (error) => {
          this.messageService.showError('Error actualizando la orden de trabajo');
          console.error('Error updating work order:', error);
        },
      });
  }
  navigateToWorkOrdersList(): void {
    this.router.navigate(['/work-orders']);
  }
}
