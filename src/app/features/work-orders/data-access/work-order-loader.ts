import { Injectable, inject, signal } from '@angular/core';

import { WorkOrder } from '../models/work-order.model';
import {
  WorkOrderLoadError,
  WorkOrderLoadErrorKind,
  WorkOrdersService,
} from './work-order.service';

/**
 * Carga una orden de trabajo por id y expone su estado (dato / error) como
 * signals, con reintento. Sin `providedIn: 'root'` a propósito: se provee
 * por componente (`providers: [WorkOrderLoader]`) para que detalle y
 * edición tengan cada una su propia instancia y no compartan estado.
 */
@Injectable()
export class WorkOrderLoader {
  private readonly workOrdersService = inject(WorkOrdersService);
  private lastRequestedId: string | null = null;

  readonly workOrder = signal<WorkOrder | null>(null);
  readonly error = signal<WorkOrderLoadErrorKind | null>(null);

  load(id: string): void {
    this.lastRequestedId = id;
    this.error.set(null);

    this.workOrdersService.getById(id).subscribe({
      next: (workOrder) => {
        this.workOrder.set(workOrder);
        this.error.set(null);
      },
      error: (err: unknown) => {
        this.workOrder.set(null);
        this.error.set(err instanceof WorkOrderLoadError ? err.kind : 'connection');
      },
    });
  }

  retry(): void {
    if (this.lastRequestedId) {
      this.load(this.lastRequestedId);
    }
  }
}
