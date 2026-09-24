import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import {
  isTechnicianSpecialty,
  isTechnicianTeamType,
  LEGAJO_PATTERN,
  TECHNICIAN_SPECIALTIES,
  TECHNICIAN_TEAM_TYPES,
  TechnicianSpecialty,
  TechnicianTeamType,
} from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import {
  DuplicateLegajoError,
  TechnicianChanges,
  TechniciansService,
} from '../../data-access/technicians.service';
import { canCreateTechnician, canEditTechnician } from '../../models/maintenance.permissions';
import { SPECIALTY_LABELS, TEAM_TYPE_LABELS } from '../../models/technician.display';
import { Technician } from '../../models/technician.model';

type LoadError = 'not-found' | 'connection';

// Un nombre de solo espacios no es un nombre: `required` lo deja pasar, esto no.
const HAS_TEXT = /\S/;

// Crea y edita técnicos del maestro. Con `:legajo` en la ruta es edición; sin él, alta. Alta y
// edición comparten la página porque comparten campos y validaciones; el legajo es lo único que
// cambia: se ingresa al crear y queda fijo (deshabilitado) al editar, porque es el vínculo con
// `users` y `equipos`. Crear un técnico no crea su usuario de login.
@Component({
  selector: 'app-technician-form',
  imports: [ReactiveFormsModule, Alert, Button],
  templateUrl: './technician-form.html',
})
export class TechnicianForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly techniciansService = inject(TechniciansService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly specialties = TECHNICIAN_SPECIALTIES;
  readonly teamTypes = TECHNICIAN_TEAM_TYPES;
  readonly specialtyLabels = SPECIALTY_LABELS;
  readonly teamTypeLabels = TEAM_TYPE_LABELS;

  // Legajo de la ruta: presente solo en edición.
  readonly editingLegajo = this.route.snapshot.paramMap.get('legajo');
  readonly isEdit = this.editingLegajo !== null;

  readonly isSubmitting = signal(false);
  readonly loadError = signal<LoadError | null>(null);
  // El técnico cargado para editar; con él se detecta si hubo cambios.
  private readonly loaded = signal<Technician | null>(null);
  // En edición el formulario aparece recién cuando el técnico está cargado.
  readonly showForm = computed(() => !this.isEdit || this.loaded() !== null);

  readonly form = this.fb.group({
    legajo: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(LEGAJO_PATTERN)],
    }),
    firstName: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HAS_TEXT)],
    }),
    lastName: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HAS_TEXT)],
    }),
    // Sin valor hasta que el usuario elige: no se asume ninguna especialidad ni tipo de equipo.
    specialty: this.fb.control<TechnicianSpecialty | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    teamType: this.fb.control<TechnicianTeamType | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    if (this.isEdit) {
      this.form.controls.legajo.disable();
      this.loadTechnician();
    }
  }

  loadTechnician(): void {
    if (this.editingLegajo === null) return;

    this.loadError.set(null);
    this.techniciansService
      .findByLegajo(this.editingLegajo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technician) => {
          if (!technician) {
            this.loadError.set('not-found');
            return;
          }
          this.loaded.set(technician);
          this.form.patchValue(technician);
        },
        error: () => this.loadError.set('connection'),
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
    const user = this.authService.currentUser();
    if (!(this.isEdit ? canEditTechnician(user) : canCreateTechnician(user))) {
      this.messageService.showWarning(
        `No tiene permiso para ${this.isEdit ? 'modificar' : 'crear'} técnicos.`,
        'Acceso denegado',
      );
      return;
    }

    const { legajo, firstName, lastName, specialty, teamType } = this.form.getRawValue();

    // Con el formulario válido ambos selects tienen valor; las guardas además acotan el tipo.
    if (this.form.invalid || !isTechnicianSpecialty(specialty) || !isTechnicianTeamType(teamType)) {
      this.form.markAllAsTouched();
      return;
    }

    const fields: TechnicianChanges = { firstName, lastName, specialty, teamType };

    if (this.editingLegajo !== null) {
      this.update(this.editingLegajo, fields);
    } else {
      this.create({ legajo, ...fields });
    }
  }

  navigateToList(): void {
    this.router.navigate(['/maintenance/technicians']);
  }

  private create(draft: TechnicianChanges & { legajo: string }): void {
    this.isSubmitting.set(true);
    this.techniciansService
      .create(draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Técnico creado satisfactoriamente.');
          this.navigateToList();
        },
        error: (error: unknown) => {
          if (error instanceof DuplicateLegajoError) {
            // Se limpia solo al volver a editar el legajo (la validación se recalcula).
            this.form.controls.legajo.setErrors({ duplicate: true });
            this.form.controls.legajo.markAsTouched();
            return;
          }
          this.messageService.showError('Error al crear el técnico.');
        },
      });
  }

  private update(legajo: string, fields: TechnicianChanges): void {
    const current = this.loaded();

    if (
      current &&
      current.firstName === fields.firstName.trim() &&
      current.lastName === fields.lastName.trim() &&
      current.specialty === fields.specialty &&
      current.teamType === fields.teamType
    ) {
      this.messageService.showWarning('No hubo cambios en el técnico');
      return;
    }

    this.isSubmitting.set(true);
    this.techniciansService
      .update(legajo, fields)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Técnico actualizado correctamente.');
          this.navigateToList();
        },
        error: () => this.messageService.showError('Error al actualizar el técnico.'),
      });
  }
}
