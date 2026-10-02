import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, of, Subject, switchMap } from 'rxjs';
import {
  WorkOrderMachineRefError,
  WorkOrdersService,
  WorkOrderValidationError,
} from '../../data-access/work-order.service';
import { errorStatus } from '@core/api/api-error';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { MachinesService } from '@features/machines/data-access/machines.service';
import { PartsService } from '@features/machines/data-access/parts.service';
import { Machine } from '@features/machines/models/machine.model';
import { buildPartTree, Part } from '@features/machines/models/part.model';
import { Form, WorkOrderFormValue } from '../../components/form/form';
import { WorkOrderCreateRequest } from '../../models/work-order.model';
import { canCreateWorkOrder, creatableTypes } from '../../models/work-order.permissions';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-work-order-create',
  imports: [Form, Button, Alert],
  templateUrl: './work-order-create.html',
  styleUrl: './work-order-create.scss',
})
export class WorkOrderCreate implements OnInit {
  private readonly workOrderService = inject(WorkOrdersService);
  private readonly machinesService = inject(MachinesService);
  private readonly partsService = inject(PartsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private activateRoute = inject(Router);
  // Cada elección de máquina (o su limpieza) dispara la carga de sus partes; `switchMap` descarta la
  // respuesta de una carga anterior si el usuario cambió de máquina mientras llegaba.
  private readonly machineSelection = new Subject<string | null>();

  readonly isSubmitting = signal(false);
  // Errores de la API que la página muestra en su lugar (spec 018, REQ-9.3 y 9.4).
  readonly machineRefError = signal<string | null>(null);
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  // La página decide qué tipos ofrece según el rol; el formulario solo los muestra.
  readonly allowedTypes = computed(() => creatableTypes(this.authService.currentUser()));

  readonly machines = signal<Machine[]>([]);
  readonly machinesError = signal(false);
  // Partes de la máquina elegida (planas): de acá se arma el árbol que se muestra y el breadcrumb.
  private readonly parts = signal<Part[]>([]);
  readonly partsError = signal(false);
  readonly partNodes = computed(() => buildPartTree(this.parts()).roots);

  ngOnInit(): void {
    this.loadMachines();

    this.machineSelection
      .pipe(
        switchMap((machineId) => {
          if (machineId === null) {
            return of<Part[]>([]);
          }

          return this.partsService.getByMachine(machineId).pipe(
            catchError(() => {
              this.partsError.set(true);
              return of<Part[]>([]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((parts) => this.parts.set(parts));
  }

  loadMachines(): void {
    this.machinesError.set(false);
    this.machinesService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (machines) => this.machines.set(machines),
        error: () => this.machinesError.set(true),
      });
  }

  onMachineChange(machineId: string | null): void {
    // Las partes de la máquina anterior ya no sirven mientras llegan las de la nueva.
    this.parts.set([]);
    this.partsError.set(false);
    this.machineSelection.next(machineId);
  }

  onSubmit(value: WorkOrderFormValue): void {
    if (this.isSubmitting()) return;

    // Segundo control además de las opciones del formulario y del guard de la ruta: el envío
    // en sí también valida el permiso, sin depender de lo que muestre la UI.
    if (!canCreateWorkOrder(this.authService.currentUser(), value.type)) {
      this.messageService.showWarning(
        'No tiene permiso para crear órdenes de ese tipo.',
        'Acceso denegado',
      );
      return;
    }

    // La máquina es obligatoria para todos los tipos de orden, aunque se invoque el método sin pasar
    // por el formulario.
    const machine = this.machines().find((candidate) => candidate.id === value.machineId);

    if (value.machineId.trim() === '' || !machine) {
      this.messageService.showWarning('Seleccioná una máquina para crear la orden.');
      return;
    }

    const { machineId, partId, comment, ...rest } = value;
    const workOrderData: WorkOrderCreateRequest = {
      ...rest,
      machineRef: { machineId, partId, comment: comment.trim() },
    };

    this.machineRefError.set(null);
    this.fieldErrors.set({});
    this.isSubmitting.set(true);
    this.workOrderService
      .create(workOrderData)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Work order created successfully.');
          this.navigateToWorkOrdersList();
        },
        error: (error: unknown) => this.handleCreateError(error),
      });
  }

  // La máquina o la parte elegida no sirve (se borró o no corresponde) y los campos inválidos se
  // muestran en su lugar y el formulario conserva lo que el usuario escribió. Un `403` ya lo avisó el
  // interceptor ("no tenés permisos"): no se suma otro mensaje.
  private handleCreateError(error: unknown): void {
    if (error instanceof WorkOrderMachineRefError) {
      this.machineRefError.set(error.message);
      return;
    }

    if (error instanceof WorkOrderValidationError) {
      this.fieldErrors.set(error.fieldErrors);
      return;
    }

    if (errorStatus(error) === 403) return;

    this.messageService.showError('Error al crear la orden de trabajo.');
  }

  navigateToWorkOrdersList(): void {
    this.activateRoute.navigate(['/work-orders']);
  }
}
