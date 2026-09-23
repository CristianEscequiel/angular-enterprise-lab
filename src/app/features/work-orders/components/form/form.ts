import { Component, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TYPE_LABELS } from '../../models/work-order.display';
import {
  WORK_ORDER_TYPES,
  WorkOrderCreateRequest,
  WorkOrderPriority,
  WorkOrderType,
} from '../../models/work-order.model';
import { Button } from '@shared/components/button/button';

@Component({
  selector: 'app-form',
  imports: [ReactiveFormsModule, Button],
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
  sendData = output<WorkOrderCreateRequest>();

  readonly typeLabels = TYPE_LABELS;

  readonly workOrderForm = this.fb.group({
    title: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),

    description: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10)],
    }),

    asset: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required],
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

  ngOnInit() {
    const data = this.inputData();

    if (data) {
      this.workOrderForm.patchValue(data);
    } else {
      this.workOrderForm.controls.type.setValue(this.allowedTypes()[0] ?? null);
    }

    if (this.lockType()) {
      this.workOrderForm.controls.type.disable();
    }
  }

  isInvalid(controlName: keyof typeof this.workOrderForm.controls): boolean {
    const control = this.workOrderForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
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
