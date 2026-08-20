import { Component, inject } from '@angular/core';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { MessageService } from '../../../../core/services/message.service';
import { Form } from '../../components/form/form';
import { WorkOrderCreateRequest } from '../../models/work-order.model';
import { Button } from '../../../../shared/components/button/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-work-order-create',
  imports: [Form, Button],
  templateUrl: './work-order-create.html',
  styleUrl: './work-order-create.scss',
})
export class WorkOrderCreate {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService);
  private activateRoute = inject(Router)

  onSubmit(workOrder: WorkOrderCreateRequest): void {

    const workOrderData: WorkOrderCreateRequest = workOrder;
    this.workOrderService.create(workOrderData).subscribe({
      next: (createdWorkOrder) => {
        this.messageService.showSuccess('Work order created successfully.');
        console.log('Work order created successfully:', createdWorkOrder);
      },
      error: (error) => {
        console.error('Error creating work order:', error);
      },
    });
  }
  navigateToWorkOrdersList(): void {
    this.activateRoute.navigate(['/work-orders']);
  }

}
