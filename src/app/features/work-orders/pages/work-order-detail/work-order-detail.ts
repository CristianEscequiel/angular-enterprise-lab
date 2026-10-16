import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { errorStatus } from '@core/api/api-error';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { WorkOrderLoader } from '../../data-access/work-order-loader';
import {
  WorkOrderLoadError,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';
import { canCancelWorkOrder } from '../../models/work-order.permissions';
import {
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../../models/work-order.display';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';

@Component({
  selector: 'app-work-order-detail',
  imports: [Alert, Badge, Button, DatePipe, Modal],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
  providers: [WorkOrderLoader],
})
export class WorkOrderDetail implements OnInit {
  private readonly loader = inject(WorkOrderLoader);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workOrderDetail = this.loader.workOrder;
  readonly loadError = this.loader.error;
  readonly typeLabels = TYPE_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statusBadge = STATUS_BADGE;

  readonly canCancel = computed<boolean>(() => {
    const order = this.workOrderDetail();
    return order ? canCancelWorkOrder(this.authService.currentUser(), order) : false;
  });
  readonly cancelModalOpen = signal(false);
  readonly cancelling = signal(false);
  readonly cancelMessage = computed<string>(() => {
    const order = this.workOrderDetail();
    return `La orden${order ? ` "${order.title}"` : ''} pasa a Cancelada y ya no se podrá tomar. Esta acción no se puede deshacer.`;
  });

  openCancelModal(): void {
    if (!this.canCancel()) {
      this.messageService.showWarning('No tiene permiso para cancelar órdenes.', 'Acceso denegado');
      return;
    }
    this.cancelModalOpen.set(true);
  }

  confirmCancel(): void {
    const order = this.workOrderDetail();
    if (!order) return;

    if (!this.canCancel()) {
      this.messageService.showWarning('No tiene permiso para cancelar órdenes.', 'Acceso denegado');
      return;
    }

    if (this.cancelling()) return;

    this.cancelling.set(true);
    this.workOrdersService
      .cancel(order.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cancelling.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.messageService.showSuccess('Orden cancelada.');
          this.loader.workOrder.set(updated);
        },
        error: (error: unknown) => {
          if (error instanceof WorkOrderStateError) {
            this.messageService.showWarning(error.message, 'No se puede cancelar');
            this.loader.retry();
            return;
          }

          if (error instanceof WorkOrderLoadError && error.kind === 'not-found') {
            this.loader.workOrder.set(null);
            this.loader.error.set('not-found');
            return;
          }

          if (errorStatus(error) === 403) return;

          this.messageService.showError(
            'No se pudo cancelar la orden. Verificá tu conexión e intentá nuevamente.',
          );
        },
      });
  }

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

  navigateToWorkOrdersList(): void {
    this.router.navigate(['/work-orders']);
  }
}
