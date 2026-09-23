import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Form } from '../../components/form/form';
import { WorkOrderCreateRequest } from '../../models/work-order.model';
import { canCreateWorkOrder, creatableTypes } from '../../models/work-order.permissions';
import { Button } from '@shared/components/button/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-work-order-create',
  imports: [Form, Button],
  templateUrl: './work-order-create.html',
  styleUrl: './work-order-create.scss',
})
export class WorkOrderCreate {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private activateRoute = inject(Router);

  readonly isSubmitting = signal(false);
  // La página decide qué tipos ofrece según el rol; el formulario solo los muestra.
  readonly allowedTypes = computed(() => creatableTypes(this.authService.currentUser()));

  onSubmit(workOrder: WorkOrderCreateRequest): void {
    if (this.isSubmitting()) return;

    // Segundo control además de las opciones del formulario y del guard de la ruta: el envío
    // en sí también valida el permiso, sin depender de lo que muestre la UI.
    if (!canCreateWorkOrder(this.authService.currentUser(), workOrder.type)) {
      this.messageService.showWarning(
        'No tiene permiso para crear órdenes de ese tipo.',
        'Acceso denegado',
      );
      return;
    }

    this.isSubmitting.set(true);
    const workOrderData: WorkOrderCreateRequest = workOrder;
    this.workOrderService
      .create(workOrderData)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Work order created successfully.');
          this.navigateToWorkOrdersList();
        },
        error: () => {
          this.messageService.showError('Error al crear la orden de trabajo.');
        },
      });
  }
  navigateToWorkOrdersList(): void {
    this.activateRoute.navigate(['/work-orders']);
  }
}
