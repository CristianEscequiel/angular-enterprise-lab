import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import { TechnicianInUseError, TechniciansService } from '../../data-access/technicians.service';
import {
  canCreateTechnician,
  canDeleteTechnician,
  canEditTechnician,
} from '../../models/maintenance.permissions';
import { SPECIALTY_LABELS, TEAM_TYPE_LABELS } from '../../models/technician.display';
import { fullName, Technician } from '../../models/technician.model';

@Component({
  selector: 'app-technicians-list',
  imports: [Alert, Button, Modal, ReactiveFormsModule],
  templateUrl: './technicians-list.html',
})
export class TechniciansList implements OnInit {
  private readonly router = inject(Router);
  private readonly techniciansService = inject(TechniciansService);
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly specialtyLabels = SPECIALTY_LABELS;
  readonly teamTypeLabels = TEAM_TYPE_LABELS;
  readonly fullName = fullName;

  // Permisos que la política resuelve por rol: la plantilla oculta las acciones y los métodos de
  // abajo vuelven a comprobarlos, para no depender de lo que muestre la UI.
  readonly canCreate = computed(() => canCreateTechnician(this.authService.currentUser()));
  readonly canEdit = computed(() => canEditTechnician(this.authService.currentUser()));
  readonly canDelete = computed(() => canDeleteTechnician(this.authService.currentUser()));

  readonly technicians = signal<Technician[]>([]);
  readonly error = signal<string | null>(null);
  readonly technicianToDelete = signal<Technician | null>(null);
  readonly deleteModalOpen = signal(false);

  // El maestro es chico y ya está cargado: se filtra en el cliente, sin debounce ni requests.
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly visibleTechnicians = computed(() => {
    const term = this.searchText().trim().toLowerCase();

    if (term === '') {
      return this.technicians();
    }

    return this.technicians().filter(
      (technician) =>
        technician.legajo.includes(term) ||
        technician.firstName.toLowerCase().includes(term) ||
        technician.lastName.toLowerCase().includes(term) ||
        fullName(technician).toLowerCase().includes(term),
    );
  });
  readonly hasSearch = computed(() => this.searchText().trim() !== '');

  readonly deleteMessage = computed(() => {
    const technician = this.technicianToDelete();
    const who = technician
      ? `a ${fullName(technician)} (legajo ${technician.legajo})`
      : 'al técnico';

    return `¿Estás seguro de que querés eliminar ${who}? Esta acción no se puede deshacer.`;
  });

  // Región live siempre presente en el DOM para que el anuncio sea confiable.
  readonly resultsAnnouncement = computed(() => {
    if (this.error()) return '';
    const count = this.visibleTechnicians().length;
    if (count === 0) return 'No se encontraron técnicos.';
    return count === 1 ? '1 técnico encontrado.' : `${count} técnicos encontrados.`;
  });

  ngOnInit(): void {
    this.loadTechnicians();
  }

  loadTechnicians(): void {
    this.error.set(null);
    this.techniciansService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (technicians) => this.technicians.set(technicians),
        error: () => this.error.set('No se pudieron cargar los técnicos. Intentá nuevamente.'),
      });
  }

  navigateToCreate(): void {
    this.router.navigate(['/maintenance/technicians/new']);
  }

  editTechnician(legajo: string): void {
    this.router.navigate(['/maintenance/technicians', legajo, 'edit']);
  }

  openDeleteModal(technician: Technician): void {
    if (!this.canDelete()) {
      this.warnDeleteDenied();
      return;
    }
    this.technicianToDelete.set(technician);
    this.deleteModalOpen.set(true);
  }

  // Un técnico con usuario de acceso, o miembro de algún equipo, no se elimina: la API responde `409
  // TECHNICIAN_IN_USE` con el motivo y el técnico queda en el listado.
  deleteTechnician(legajo: string): void {
    if (!this.canDelete()) {
      this.warnDeleteDenied();
      return;
    }

    this.techniciansService
      .delete(legajo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Técnico eliminado satisfactoriamente.');
          this.loadTechnicians();
        },
        error: (error: unknown) => {
          if (error instanceof TechnicianInUseError) {
            this.messageService.showWarning(error.message, 'No se puede eliminar');
            return;
          }

          this.messageService.showError('Error al eliminar el técnico.');
        },
      });
  }

  private warnDeleteDenied(): void {
    this.messageService.showWarning('No tiene permiso para eliminar técnicos.', 'Acceso denegado');
  }
}
