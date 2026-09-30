import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import { MachineHasPartsError, MachinesService } from '../../data-access/machines.service';
import { PartsService } from '../../data-access/parts.service';
import { Machine } from '../../models/machine.model';
import { canManageMachines } from '../../models/machines.permissions';

@Component({
  selector: 'app-machines-list',
  imports: [Alert, Button, Modal],
  templateUrl: './machines-list.html',
})
export class MachinesList implements OnInit {
  private readonly router = inject(Router);
  private readonly machinesService = inject(MachinesService);
  private readonly partsService = inject(PartsService);
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  // Crear, modificar y eliminar máquinas y sus partes tiene un solo nivel de permiso (Administrador y
  // TeamLeader). La plantilla oculta las acciones y los métodos de abajo vuelven a comprobarlo, para
  // no depender de lo que muestre la UI.
  readonly canManage = computed(() => canManageMachines(this.authService.currentUser()));

  readonly machines = signal<Machine[]>([]);
  // Cantidad de partes por máquina (`machineId` → cantidad), con un solo `GET /partes`.
  private readonly partCounts = signal<ReadonlyMap<string, number>>(new Map());
  readonly error = signal<string | null>(null);
  readonly machineToDelete = signal<Machine | null>(null);
  readonly deleteModalOpen = signal(false);

  readonly deleteMessage = computed(() => {
    const machine = this.machineToDelete();
    const which = machine ? `la máquina "${machine.name}" (${machine.code})` : 'la máquina';

    return `¿Estás seguro de que querés eliminar ${which}? Solo se puede eliminar una máquina que no tiene partes. Esta acción no se puede deshacer.`;
  });

  // Región live siempre presente en el DOM para que el anuncio sea confiable.
  readonly resultsAnnouncement = computed(() => {
    if (this.error()) return '';
    const count = this.machines().length;
    if (count === 0) return 'No se encontraron máquinas.';
    return count === 1 ? '1 máquina encontrada.' : `${count} máquinas encontradas.`;
  });

  ngOnInit(): void {
    this.loadMachines();
  }

  loadMachines(): void {
    this.error.set(null);
    forkJoin({ machines: this.machinesService.getAll(), parts: this.partsService.getAll() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ machines, parts }) => {
          const counts = new Map<string, number>();

          for (const part of parts) {
            counts.set(part.machineId, (counts.get(part.machineId) ?? 0) + 1);
          }

          this.partCounts.set(counts);
          this.machines.set(machines);
        },
        error: () => this.error.set('No se pudieron cargar las máquinas. Intentá nuevamente.'),
      });
  }

  partsLabel(machine: Machine): string {
    const count = this.partCounts().get(machine.id) ?? 0;
    return count === 1 ? '1 parte' : `${count} partes`;
  }

  navigateToCreate(): void {
    this.router.navigate(['/machines/new']);
  }

  editMachine(id: string): void {
    this.router.navigate(['/machines', id, 'edit']);
  }

  openParts(id: string): void {
    this.router.navigate(['/machines', id, 'parts']);
  }

  openDeleteModal(machine: Machine): void {
    if (!this.canManage()) {
      this.warnDenied();
      return;
    }
    this.machineToDelete.set(machine);
    this.deleteModalOpen.set(true);
  }

  // No verifica las partes por su cuenta: `MachinesService.delete` lo hace con datos frescos y
  // bloquea con `MachineHasPartsError`. Acá solo se traduce el resultado a un aviso.
  deleteMachine(id: string): void {
    if (!this.canManage()) {
      this.warnDenied();
      return;
    }

    this.machinesService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Máquina eliminada satisfactoriamente.');
          this.loadMachines();
        },
        error: (error: unknown) => {
          if (error instanceof MachineHasPartsError) {
            this.messageService.showWarning(error.message, 'No se puede eliminar');
            // La cantidad de partes que se veía puede estar desactualizada (otro usuario las agregó).
            this.loadMachines();
            return;
          }

          this.messageService.showError('Error al eliminar la máquina.');
        },
      });
  }

  private warnDenied(): void {
    this.messageService.showWarning('No tiene permiso para eliminar máquinas.', 'Acceso denegado');
  }
}
