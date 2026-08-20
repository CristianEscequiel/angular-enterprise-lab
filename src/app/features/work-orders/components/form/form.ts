import { Component, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkOrderPriority, WorkOrderCreateRequest } from '../../models/work-order.model';
import { Button } from '../../../../shared/components/button/button';

@Component({
  selector: 'app-form',
  imports: [ReactiveFormsModule, Button],
  templateUrl: './form.html',
  styleUrl: './form.scss',
})
export class Form implements OnInit {
  private readonly fb = inject(FormBuilder);
  inputData = input<WorkOrderCreateRequest>();
  sendData = output<WorkOrderCreateRequest>();

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

    priority: this.fb.control<WorkOrderPriority>('low', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit() {
    const data = this.inputData();

    if (data) {
      this.workOrderForm.patchValue(data);
    }
  }

  isInvalid(controlName: keyof typeof this.workOrderForm.controls): boolean {
    const control = this.workOrderForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  onSubmit(): void {
    this.sendData.emit(this.workOrderForm.getRawValue());
  }

}
