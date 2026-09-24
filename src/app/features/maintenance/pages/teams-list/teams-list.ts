import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import { TeamsService } from '../../data-access/teams.service';
import { canManageTeams } from '../../models/maintenance.permissions';
import { TEAM_TYPE_LABELS } from '../../models/technician.display';
import { Team } from '../../models/team.model';

@Component({
  selector: 'app-teams-list',
  imports: [Alert, Button, Modal],
  templateUrl: './teams-list.html',
})
export class TeamsList implements OnInit {
  private readonly router = inject(Router);
  private readonly teamsService = inject(TeamsService);
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly typeLabels = TEAM_TYPE_LABELS;

  // Crear, modificar y eliminar equipos es exclusivo del TeamLeader (una sola política para las
  // tres acciones). La plantilla oculta las acciones y los métodos de abajo vuelven a comprobarlo,
  // para no depender de lo que muestre la UI.
  readonly canManage = computed(() => canManageTeams(this.authService.currentUser()));

  readonly teams = signal<Team[]>([]);
  readonly error = signal<string | null>(null);
  readonly teamToDelete = signal<Team | null>(null);
  readonly deleteModalOpen = signal(false);

  readonly deleteMessage = computed(() => {
    const team = this.teamToDelete();
    const which = team ? `el equipo "${team.name}"` : 'el equipo';

    return `¿Estás seguro de que querés eliminar ${which}? Sus técnicos no se eliminan, solo dejan de pertenecer a él. Esta acción no se puede deshacer.`;
  });

  // Región live siempre presente en el DOM para que el anuncio sea confiable.
  readonly resultsAnnouncement = computed(() => {
    if (this.error()) return '';
    const count = this.teams().length;
    if (count === 0) return 'No se encontraron equipos.';
    return count === 1 ? '1 equipo encontrado.' : `${count} equipos encontrados.`;
  });

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    this.error.set(null);
    this.teamsService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (teams) => this.teams.set(teams),
        error: () => this.error.set('No se pudieron cargar los equipos. Intentá nuevamente.'),
      });
  }

  membersLabel(team: Team): string {
    const count = team.memberLegajos.length;
    return count === 1 ? '1 miembro' : `${count} miembros`;
  }

  navigateToCreate(): void {
    this.router.navigate(['/maintenance/teams/new']);
  }

  editTeam(id: string): void {
    this.router.navigate(['/maintenance/teams', id, 'edit']);
  }

  openDeleteModal(team: Team): void {
    if (!this.canManage()) {
      this.warnDenied();
      return;
    }
    this.teamToDelete.set(team);
    this.deleteModalOpen.set(true);
  }

  deleteTeam(id: string): void {
    if (!this.canManage()) {
      this.warnDenied();
      return;
    }

    this.teamsService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Equipo eliminado satisfactoriamente.');
          this.loadTeams();
        },
        error: () => this.messageService.showError('Error al eliminar el equipo.'),
      });
  }

  private warnDenied(): void {
    this.messageService.showWarning('No tiene permiso para eliminar equipos.', 'Acceso denegado');
  }
}
