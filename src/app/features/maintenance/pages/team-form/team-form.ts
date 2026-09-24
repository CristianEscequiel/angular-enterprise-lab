import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  concat,
  distinctUntilChanged,
  EMPTY,
  finalize,
  map,
  merge,
  Observable,
  of,
  Subject,
  switchMap,
  timer,
} from 'rxjs';

import {
  isLegajo,
  isTechnicianTeamType,
  TECHNICIAN_TEAM_TYPES,
  TechnicianTeamType,
} from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { TeamLoadError, TeamsService } from '../../data-access/teams.service';
import { TechniciansService } from '../../data-access/technicians.service';
import { canManageTeams } from '../../models/maintenance.permissions';
import { SPECIALTY_LABELS, TEAM_TYPE_LABELS } from '../../models/technician.display';
import { fullName, Technician } from '../../models/technician.model';
import { addMember, removeMember, Team } from '../../models/team.model';

// Resultado de la validación en tiempo real del legajo tipeado. Cada uno lleva el legajo al que
// corresponde; el estado nunca describe un legajo distinto del que está en el campo.
export type LegajoLookup =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'invalid-format' }
  | { kind: 'found'; technician: Technician }
  | { kind: 'not-found' }
  | { kind: 'already-member' }
  | { kind: 'error' };

type LoadError = 'not-found' | 'connection';

// Tiempo sin tipear antes de consultar el legajo.
const LOOKUP_DEBOUNCE_MS = 300;

// Un nombre de solo espacios no es un nombre: `required` lo deja pasar, esto no.
const HAS_TEXT = /\S/;

// Crea y edita equipos. Con `:id` en la ruta es edición; sin él, alta. Los miembros se guardan
// como lista de legajos junto con el equipo (un solo `PUT`): agregar o quitar modifica la lista
// local y se persiste con "Guardar". Solo el TeamLeader gestiona equipos.
@Component({
  selector: 'app-team-form',
  imports: [ReactiveFormsModule, Alert, Button],
  templateUrl: './team-form.html',
  styleUrl: './team-form.scss',
})
export class TeamForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamsService = inject(TeamsService);
  private readonly techniciansService = inject(TechniciansService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly teamTypes = TECHNICIAN_TEAM_TYPES;
  readonly teamTypeLabels = TEAM_TYPE_LABELS;

  // Id de la ruta: presente solo en edición.
  readonly editingId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.editingId !== null;

  readonly isSubmitting = signal(false);
  readonly loadError = signal<LoadError | null>(null);
  private readonly loaded = signal<Team | null>(null);
  // En edición el formulario aparece recién cuando el equipo está cargado.
  readonly showForm = computed(() => !this.isEdit || this.loaded() !== null);

  readonly form = this.fb.group({
    name: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HAS_TEXT)],
    }),
    // Sin valor hasta que el usuario elige: no se asume ningún tipo de equipo.
    type: this.fb.control<TechnicianTeamType | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  // --- Miembros ---
  readonly memberLegajos = signal<string[]>([]);
  // Datos de los técnicos para mostrar nombres. Los miembros ya guardados solo tienen legajo;
  // si no se pueden cargar, la lista muestra el legajo solo.
  private readonly knownTechnicians = signal<ReadonlyMap<string, Technician>>(new Map());

  // --- Agregar por legajo, con validación en tiempo real ---
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly lookup = signal<LegajoLookup>({ kind: 'idle' });
  private readonly refreshLookup = new Subject<void>();

  readonly canAdd = computed(() => this.lookup().kind === 'found');
  readonly lookupMessage = computed(() => {
    const state = this.lookup();

    switch (state.kind) {
      case 'idle':
        return '';
      case 'checking':
        return 'Buscando técnico…';
      case 'invalid-format':
        return 'El legajo debe tener entre 1 y 8 dígitos.';
      case 'found':
        return `Técnico encontrado: ${fullName(state.technician)} (${SPECIALTY_LABELS[state.technician.specialty]}).`;
      case 'not-found':
        return 'No existe un técnico con ese legajo.';
      case 'already-member':
        return 'Ese técnico ya es miembro del equipo.';
      case 'error':
        return 'No se pudo verificar el legajo. Intentá nuevamente.';
    }
  });
  // Solo el "encontrado" es una buena noticia; el resto de los mensajes se muestra como error.
  readonly lookupIsProblem = computed(() =>
    ['invalid-format', 'not-found', 'already-member', 'error'].includes(this.lookup().kind),
  );

  ngOnInit(): void {
    this.watchLegajo();

    if (this.isEdit) {
      this.loadTeam();
    }
  }

  loadTeam(): void {
    if (this.editingId === null) return;

    this.loadError.set(null);
    this.teamsService
      .getById(this.editingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (team) => {
          this.loaded.set(team);
          this.form.patchValue({ name: team.name, type: team.type });
          this.memberLegajos.set([...team.memberLegajos]);
          this.loadMemberNames();
        },
        error: (error: unknown) =>
          this.loadError.set(
            error instanceof TeamLoadError && error.kind === 'not-found'
              ? 'not-found'
              : 'connection',
          ),
      });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  memberLabel(legajo: string): string {
    const technician = this.knownTechnicians().get(legajo);
    return technician ? `${fullName(technician)} (legajo ${legajo})` : `Legajo ${legajo}`;
  }

  // Suma el técnico encontrado a la lista local. Solo se puede con el legajo validado ("encontrado")
  // y, aun así, `addMember` vuelve a impedir un duplicado.
  addTechnician(): void {
    const state = this.lookup();
    if (state.kind !== 'found') return;

    const { technician } = state;
    const result = addMember(this.memberLegajos(), technician.legajo);

    if (!result.added) {
      this.lookup.set({ kind: 'already-member' });
      return;
    }

    this.memberLegajos.set(result.memberLegajos);
    this.knownTechnicians.update((known) => new Map(known).set(technician.legajo, technician));
    // Vaciar el campo dispara el flujo de búsqueda, que vuelve a "idle".
    this.searchControl.setValue('');
  }

  // Dentro del formulario, Enter enviaría el equipo entero: acá solo agrega al técnico encontrado.
  onSearchEnter(event: Event): void {
    event.preventDefault();
    this.addTechnician();
  }

  removeTechnician(legajo: string): void {
    this.memberLegajos.update((members) => removeMember(members, legajo));
    // Si ese legajo estaba tipeado como "ya es miembro", ahora se puede agregar: se revalida.
    this.refreshLookup.next();
  }

  onSubmit(): void {
    if (this.isSubmitting()) return;

    // Segundo control además del guard de la ruta: el envío también valida el permiso.
    if (!canManageTeams(this.authService.currentUser())) {
      this.messageService.showWarning(
        `No tiene permiso para ${this.isEdit ? 'modificar' : 'crear'} equipos.`,
        'Acceso denegado',
      );
      return;
    }

    const { name, type } = this.form.getRawValue();

    // Con el formulario válido el tipo tiene valor; la guarda además acota el tipo.
    if (this.form.invalid || !isTechnicianTeamType(type)) {
      this.form.markAllAsTouched();
      return;
    }

    const draft = { name, type, memberLegajos: this.memberLegajos() };

    if (this.editingId !== null) {
      this.update(this.editingId, draft);
    } else {
      this.create(draft);
    }
  }

  navigateToList(): void {
    this.router.navigate(['/maintenance/teams']);
  }

  // debounce + cancelación inmediata: cada cambio del campo descarta la consulta anterior aunque
  // todavía esté en vuelo, así una respuesta tardía nunca pisa el estado de un legajo más nuevo.
  // (Con `debounceTime` + `switchMap` la consulta vieja solo se cancelaría al vencer la espera.)
  private watchLegajo(): void {
    merge(
      // `distinctUntilChanged` sobre lo tipeado (no sobre lo debounceado): un espacio de más no
      // reinicia la consulta, pero tipear y volver al mismo legajo sí la repite y no queda "buscando".
      this.searchControl.valueChanges.pipe(
        map((value) => value.trim()),
        distinctUntilChanged(),
      ),
      this.refreshLookup.pipe(map(() => this.searchControl.value.trim())),
    )
      .pipe(
        switchMap((legajo) => this.lookupFor(legajo)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.lookup.set(state));
  }

  private lookupFor(legajo: string): Observable<LegajoLookup> {
    if (legajo === '') {
      return of({ kind: 'idle' });
    }

    // Mientras se espera (y durante la consulta) no puede quedar el resultado de otro legajo.
    return concat(
      of<LegajoLookup>({ kind: 'checking' }),
      timer(LOOKUP_DEBOUNCE_MS).pipe(switchMap(() => this.resolve(legajo))),
    );
  }

  private resolve(legajo: string): Observable<LegajoLookup> {
    if (!isLegajo(legajo)) {
      return of({ kind: 'invalid-format' });
    }

    // Se resuelve localmente, sin HTTP.
    if (this.memberLegajos().includes(legajo)) {
      return of({ kind: 'already-member' });
    }

    return this.techniciansService.findByLegajo(legajo).pipe(
      map((technician): LegajoLookup =>
        technician ? { kind: 'found', technician } : { kind: 'not-found' },
      ),
      // Un fallo de red no es "no existe": estado propio, y el flujo sigue vivo.
      catchError(() => of<LegajoLookup>({ kind: 'error' })),
    );
  }

  private loadMemberNames(): void {
    this.techniciansService
      .getAll()
      .pipe(
        // Sin nombres la lista se ve igual, con el legajo solo: no es un error para el usuario.
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((technicians) =>
        this.knownTechnicians.update((known) => {
          const merged = new Map(known);
          technicians.forEach((technician) => merged.set(technician.legajo, technician));
          return merged;
        }),
      );
  }

  private create(draft: { name: string; type: TechnicianTeamType; memberLegajos: string[] }): void {
    this.isSubmitting.set(true);
    this.teamsService
      .create(draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Equipo creado satisfactoriamente.');
          this.navigateToList();
        },
        error: () => this.messageService.showError('Error al crear el equipo.'),
      });
  }

  private update(
    id: string,
    draft: { name: string; type: TechnicianTeamType; memberLegajos: string[] },
  ): void {
    const current = this.loaded();

    if (
      current &&
      current.name === draft.name.trim() &&
      current.type === draft.type &&
      current.memberLegajos.length === draft.memberLegajos.length &&
      current.memberLegajos.every((legajo, index) => legajo === draft.memberLegajos[index])
    ) {
      this.messageService.showWarning('No hubo cambios en el equipo');
      return;
    }

    this.isSubmitting.set(true);
    this.teamsService
      .update(id, draft)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Equipo actualizado correctamente.');
          this.navigateToList();
        },
        error: () => this.messageService.showError('Error al actualizar el equipo.'),
      });
  }
}
