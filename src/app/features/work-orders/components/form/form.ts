import { Component, computed, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Machine } from '@features/machines/models/machine.model';
import { PartNode } from '@features/machines/models/part.model';
import { TYPE_LABELS } from '../../models/work-order.display';
import {
  WORK_ORDER_TYPES,
  WorkOrderCreateRequest,
  WorkOrderPriority,
  WorkOrderType,
} from '../../models/work-order.model';
import { MachinePartPicker } from '../machine-part-picker/machine-part-picker';
import { Button } from '@shared/components/button/button';

// Un comentario de falla es "corto" (spec 013d).
export const MACHINE_COMMENT_MAX_LENGTH = 200;

// Lo que emite el formulario. NO lleva el `breadcrumb`: la ruta de la parte la arma la página al
// crear la orden (CLAUDE.md: la lógica de negocio vive en las páginas), con las partes que cargó.
export type WorkOrderFormValue = Omit<WorkOrderCreateRequest, 'machineRef'> & {
  machineId: string;
  partId: string | null;
  comment: string;
};

@Component({
  selector: 'app-form',
  imports: [ReactiveFormsModule, Button, MachinePartPicker],
  templateUrl: './form.html',
  styleUrl: './form.scss',
})
export class Form implements OnInit {
  private readonly fb = inject(FormBuilder);
  inputData = input<WorkOrderCreateRequest>();
  submitting = input<boolean>(false);
  // La página decide qué tipos puede elegir el usuario; el formulario solo los muestra.
  allowedTypes = input<readonly WorkOrderType[]>(WORK_ORDER_TYPES);
  // En edición el tipo no se cambia: el select se deshabilita pero su valor se sigue emitiendo.
  lockType = input<boolean>(false);
  // Las máquinas y las partes de la elegida las carga la página; el formulario solo las muestra.
  machines = input<readonly Machine[]>([]);
  partNodes = input<readonly PartNode[]>([]);
  // La máquina/parte de una orden no cambia después de creada (spec 013d): en edición se muestra la
  // referencia guardada, sin selector, y el valor original se sigue emitiendo.
  lockMachine = input<boolean>(false);
  sendData = output<WorkOrderFormValue>();
  // La página carga las partes de la máquina elegida.
  machineChange = output<string | null>();

  readonly typeLabels = TYPE_LABELS;
  readonly commentMaxLength = MACHINE_COMMENT_MAX_LENGTH;

  readonly workOrderForm = this.fb.group({
    title: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),

    description: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10)],
    }),

    // La selección de máquina es obligatoria para todos los tipos de orden. `''` = sin elegir.
    machineId: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required],
    }),

    // `null` = intervención sobre la máquina completa.
    partId: this.fb.control<string | null>(null),

    // Descripción corta de la falla en el punto elegido. Opcional; va SEPARADA de la ruta.
    comment: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.maxLength(MACHINE_COMMENT_MAX_LENGTH)],
    }),

    // Sin valor hasta que ngOnInit lo resuelve (dato inicial o primer tipo permitido).
    type: this.fb.control<WorkOrderType | null>(null, {
      validators: [Validators.required],
    }),

    priority: this.fb.control<WorkOrderPriority>('low', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  // Ruta guardada de la orden que se edita (solo lectura).
  readonly lockedBreadcrumb = computed(() => this.inputData()?.machineRef.breadcrumb ?? '');

  ngOnInit() {
    const data = this.inputData();

    if (data) {
      const { machineRef, ...rest } = data;

      this.workOrderForm.patchValue({
        ...rest,
        machineId: machineRef.machineId,
        partId: machineRef.partId,
        comment: machineRef.comment,
      });
    } else {
      this.workOrderForm.controls.type.setValue(this.allowedTypes()[0] ?? null);
    }

    if (this.lockType()) {
      this.workOrderForm.controls.type.disable();
    }

    if (this.lockMachine()) {
      this.workOrderForm.controls.machineId.disable();
      this.workOrderForm.controls.partId.disable();
      this.workOrderForm.controls.comment.disable();
    }
  }

  isInvalid(controlName: keyof typeof this.workOrderForm.controls): boolean {
    const control = this.workOrderForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  onMachineChange(machineId: string | null): void {
    const controls = this.workOrderForm.controls;

    controls.machineId.setValue(machineId ?? '');
    controls.machineId.markAsDirty();
    controls.machineId.markAsTouched();
    // La parte pertenecía a la máquina anterior.
    controls.partId.setValue(null);
    this.machineChange.emit(machineId);
  }

  onPartChange(partId: string | null): void {
    this.workOrderForm.controls.partId.setValue(partId);
  }

  onSubmit(): void {
    const { type, ...rest } = this.workOrderForm.getRawValue();

    if (this.submitting() || this.workOrderForm.invalid || type === null) {
      this.workOrderForm.markAllAsTouched();
      return;
    }
    this.sendData.emit({ ...rest, type });
  }
}
