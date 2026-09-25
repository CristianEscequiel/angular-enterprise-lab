import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { WorkOrderLoader } from '../../data-access/work-order-loader';
import {
  InvalidClosingNoteError,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from '../../models/work-order.display';
import {
  CLOSED_WORK_ORDER_STATUSES,
  CLOSING_NOTE_MAX_LENGTH,
  CLOSING_NOTE_MIN_LENGTH,
  ClosedWorkOrderStatus,
  isClosedStatus,
  isValidClosingComment,
  WorkOrderClosingNote,
} from '../../models/work-order.model';
import { canResolveWorkOrder, canTakeWorkOrder } from '../../models/work-order.permissions';

// Por qué no se muestra el formulario (o `ok` si se muestra). El orden importa: primero se comprueba
// que el técnico pueda atender ese tipo de orden, después el estado de la orden y por último de quién es.
type Access = 'ok' | 'denied' | 'closed' | 'pending' | 'other';

// Un comentario de cierre válido: entre 50 y 500 caracteres sin contar los espacios de los bordes.
// Es la misma regla (`isValidClosingComment`) que aplican el modelo y el servicio.
function closingCommentValidator(control: AbstractControl): ValidationErrors | null {
  return isValidClosingComment(control.value) ? null : { closingComment: true };
}

// Página de cierre de una orden (spec 013d): el técnico que la tomó la ve en solo lectura y solo puede
// elegir el resultado (completada o cancelada) y dejar su comentario, que es obligatorio. La lógica de
// negocio vive acá (CLAUDE.md): el formulario solo recoge datos, el servicio protege el estado.
@Component({
  selector: 'app-work-order-resolve',
  imports: [ReactiveFormsModule, Alert, Button],
  templateUrl: './work-order-resolve.html',
  providers: [WorkOrderLoader],
})
export class WorkOrderResolve implements OnInit {
  private readonly loader = inject(WorkOrderLoader);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);

  readonly workOrder = this.loader.workOrder;
  readonly loadError = this.loader.error;
  readonly isSubmitting = signal(false);

  readonly typeLabels = TYPE_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly outcomes = CLOSED_WORK_ORDER_STATUSES;
  readonly statusLabels = STATUS_LABELS;
  readonly minLength = CLOSING_NOTE_MIN_LENGTH;
  readonly maxLength = CLOSING_NOTE_MAX_LENGTH;

  // Sin valor por defecto: el técnico tiene que elegir el resultado a propósito.
  readonly form = this.fb.group({
    outcome: this.fb.control<ClosedWorkOrderStatus | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    comment: this.fb.control('', {
      nonNullable: true,
      validators: [closingCommentValidator],
    }),
  });

  readonly access = computed<Access | null>(() => {
    const order = this.workOrder();

    if (!order) {
      return null;
    }

    const user = this.authService.currentUser();

    if (!user || !canTakeWorkOrder(user, order)) return 'denied';
    if (isClosedStatus(order.status)) return 'closed';
    if (order.status === 'pending') return 'pending';

    return canResolveWorkOrder(user, order) ? 'ok' : 'other';
  });

  // Aviso cuando la orden la ejecuta otro. Una orden en progreso sin dueño registrado (dato anterior
  // a la spec) no nombra a nadie.
  readonly otherMessage = computed(() => {
    const name = this.workOrder()?.takenBy?.name;

    return name ? `La orden está siendo ejecutada por ${name}.` : 'La orden ya está en ejecución.';
  });

  ngOnInit(): void {
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

  // Caracteres que cuentan del comentario (sin los espacios de los bordes), para el contador.
  commentLength(): number {
    return this.form.controls.comment.value.trim().length;
  }

  isInvalid(name: 'outcome' | 'comment'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.dirty || control.touched);
  }

  submit(): void {
    if (this.isSubmitting()) return;

    const order = this.workOrder();
    const user = this.authService.currentUser();

    if (!order || !user) return;

    // Segundo control además de lo que muestre la plantilla y del guard de la ruta: el envío vuelve a
    // comprobar que la orden es de este técnico, sin depender de la UI.
    if (!canResolveWorkOrder(user, order)) {
      this.messageService.showWarning(
        'No tiene permiso para cerrar esta orden.',
        'Acceso denegado',
      );
      return;
    }

    const { outcome, comment } = this.form.getRawValue();

    if (this.form.invalid || !isClosedStatus(outcome)) {
      this.form.markAllAsTouched();
      return;
    }

    const note: WorkOrderClosingNote = {
      comment: comment.trim(),
      authorId: user.id,
      authorName: user.displayName,
      at: new Date().toISOString(),
    };

    this.isSubmitting.set(true);
    this.workOrdersService
      .close(order.id, outcome, note)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Orden cerrada correctamente.');
          this.navigateToWorkOrdersList();
        },
        error: (error: unknown) => {
          if (error instanceof WorkOrderStateError) {
            // La orden cambió mientras se escribía el comentario (la liberaron, la cerraron o la tomó
            // otro técnico): se avisa y se recarga para mostrar el estado real. No se pisa nada.
            this.messageService.showWarning(error.message, 'No se pudo cerrar');
            this.loader.retry();
            return;
          }

          this.messageService.showError(
            error instanceof InvalidClosingNoteError
              ? error.message
              : 'Error al cerrar la orden de trabajo.',
          );
        },
      });
  }

  navigateToWorkOrdersList(): void {
    this.router.navigate(['/work-orders']);
  }
}
