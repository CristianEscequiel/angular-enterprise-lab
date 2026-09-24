import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import {
  DuplicateMachineCodeError,
  MachineLoadError,
  MachinesService,
} from '../../data-access/machines.service';
import {
  Machine,
  MachineDraft,
  MACHINE_CODE_PATTERN,
  normalizeMachineCode,
} from '../../models/machine.model';
import { canManageMachines } from '../../models/machines.permissions';

type LoadError = 'not-found' | 'connection';

// Un nombre de solo espacios no es un nombre: `required` lo deja pasar, esto no.
const HAS_TEXT = /\S/;

// El formato se valida sobre el código YA normalizado (sin espacios en los bordes y en mayúsculas):
// quien escribe `env-01` no comete un error, porque se guarda como `ENV-01`.
function machineCodeFormat(control: AbstractControl<string>): ValidationErrors | null {
  return MACHINE_CODE_PATTERN.test(normalizeMachineCode(control.value)) ? null : { pattern: true };
}

// Crea y edita máquinas. Con `:id` en la ruta es edición; sin él, alta. Comparten la página porque
// comparten campos y validaciones. Las partes de la máquina se gestionan en otra pantalla
// (`/machines/:id/parts`); acá solo se edita la máquina.
@Component({
  selector: 'app-machine-form',
  imports: [ReactiveFormsModule, Alert, Button],
  templateUrl: './machine-form.html',
})
export class MachineForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly machinesService = inject(MachinesService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  // Id de la ruta: presente solo en edición.
  readonly editingId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.editingId !== null;

  readonly isSubmitting = signal(false);
  readonly loadError = signal<LoadError | null>(null);
  // La máquina cargada para editar; con ella se detecta si hubo cambios.
  private readonly loaded = signal<Machine | null>(null);
  // En edición el formulario aparece recién cuando la máquina está cargada.
  readonly showForm = computed(() => !this.isEdit || this.loaded() !== null);

  readonly form = this.fb.group({
    code: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, machineCodeFormat],
    }),
    name: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HAS_TEXT)],
    }),
  });

  ngOnInit(): void {
    if (this.isEdit) {
      this.loadMachine();
    }
  }

  loadMachine(): void {
    if (this.editingId === null) return;

    this.loadError.set(null);
    this.machinesService
      .getById(this.editingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (machine) => {
          this.loaded.set(machine);
          this.form.patchValue(machine);
        },
        error: (error: unknown) =>
          this.loadError.set(
            error instanceof MachineLoadError && error.kind === 'not-found'
              ? 'not-found'
              : 'connection',
          ),
      });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  onSubmit(): void {
    if (this.isSubmitting()) return;

    // Segundo control además del guard de la ruta: el envío también valida el permiso, sin
    // depender de lo que muestre la UI.
    if (!canManageMachines(this.authService.currentUser())) {
      this.messageService.showWarning(
        `No tiene permiso para ${this.isEdit ? 'modificar' : 'crear'} máquinas.`,
        'Acceso denegado',
      );
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { code, name } = this.form.getRawValue();
    const draft: MachineDraft = { code: normalizeMachineCode(code), name: name.trim() };

    if (this.editingId !== null) {
      this.update(this.editingId, draft);
    } else {
      this.create(draft);
    }
  }

  navigateToList(): void {
    this.router.navigate(['/machines']);
  }

  private create(draft: MachineDraft): void {
    this.isSubmitting.set(true);
    this.machinesService
      .create(draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Máquina creada satisfactoriamente.');
          this.navigateToList();
        },
        error: (error: unknown) => {
          if (!this.markDuplicate(error)) {
            this.messageService.showError('Error al crear la máquina.');
          }
        },
      });
  }

  private update(id: string, draft: MachineDraft): void {
    const current = this.loaded();

    if (current && current.code === draft.code && current.name === draft.name) {
      this.messageService.showWarning('No hubo cambios en la máquina');
      return;
    }

    this.isSubmitting.set(true);
    this.machinesService
      .update(id, draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Máquina actualizada correctamente.');
          this.navigateToList();
        },
        error: (error: unknown) => {
          if (this.markDuplicate(error)) return;

          this.messageService.showError(
            error instanceof MachineLoadError && error.kind === 'not-found'
              ? 'La máquina ya no existe.'
              : 'Error al actualizar la máquina.',
          );
        },
      });
  }

  // Un código repetido es un error del campo, no un aviso general: el usuario lo corrige ahí. Se
  // limpia solo al volver a editar el código (la validación se recalcula).
  private markDuplicate(error: unknown): boolean {
    if (!(error instanceof DuplicateMachineCodeError)) return false;

    this.form.controls.code.setErrors({ duplicate: true });
    this.form.controls.code.markAsTouched();
    return true;
  }
}
