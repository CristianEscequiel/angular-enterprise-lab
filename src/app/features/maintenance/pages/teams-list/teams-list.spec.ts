import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { TeamsService } from '../../data-access/teams.service';
import { Team } from '../../models/team.model';
import { TeamsList } from './teams-list';

describe('TeamsList', () => {
  let fixture: ComponentFixture<TeamsList>;
  let component: TeamsList;

  const guardia: Team = {
    id: '1',
    name: 'Guardia mecánica',
    type: 'guardia',
    memberLegajos: ['1001', '1002'],
  };
  const preventivo: Team = {
    id: '2',
    name: 'Preventivo eléctrico',
    type: 'preventivo-correctivo',
    memberLegajos: ['1002'],
  };
  const vacio: Team = { id: '3', name: 'Nuevo equipo', type: 'guardia', memberLegajos: [] };

  const teams = {
    getAll: vi.fn<() => Observable<Team[]>>(),
    delete: vi.fn<(id: string) => Observable<void>>(),
  };

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const administrador: AuthUser = { ...teamLeader, id: '1', role: 'administrador' };
  const produccion: AuthUser = { ...teamLeader, id: '4', role: 'personal-produccion' };
  const currentUser = signal<AuthUser | null>(teamLeader);

  beforeEach(async () => {
    teams.getAll.mockReset().mockReturnValue(of([guardia, preventivo, vacio]));
    teams.delete.mockReset().mockReturnValue(of(undefined));
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [TeamsList],
      providers: [
        provideRouter([]),
        { provide: TeamsService, useValue: teams },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function startAs(user: AuthUser | null = teamLeader): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(TeamsList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';

  function rowNames(): string[] {
    const cells: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr td:first-child'),
    );
    return cells.map((cell) => cell.textContent?.trim() ?? '');
  }

  function rowActionLabels(): string[] {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody button'),
    );
    return buttons.map((button) => button.getAttribute('aria-label') ?? '');
  }

  function buttonByText(label: string): HTMLButtonElement | undefined {
    return Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(label),
    );
  }

  function confirmDeletion(team: Team): void {
    component.openDeleteModal(team);
    fixture.detectChanges();
    const confirmButton = fixture.nativeElement.querySelector('[role="dialog"] .btn--danger');
    if (!confirmButton) throw new Error('No se abrió la confirmación de eliminación');
    (confirmButton as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  describe('listing', () => {
    it('shows name, type and number of members of every team', () => {
      expect.assertions(5);
      startAs();

      expect(rowNames()).toEqual(['Guardia mecánica', 'Preventivo eléctrico', 'Nuevo equipo']);
      expect(text()).toContain('Guardia');
      expect(text()).toContain('Preventivo-correctivo');
      expect(text()).toContain('2 miembros');
      expect(text()).toContain('1 miembro');
    });

    it('says a team without members has 0 miembros', () => {
      startAs();

      expect(text()).toContain('0 miembros');
    });

    it('shows an empty state when there are no teams', () => {
      expect.assertions(2);
      teams.getAll.mockReturnValue(of([]));
      startAs();

      expect(text()).toContain('No existen equipos registrados.');
      expect(fixture.nativeElement.querySelector('table')).toBeNull();
    });

    it('shows an error with a retry that loads the list again', () => {
      expect.assertions(4);
      teams.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
      startAs();

      expect(text()).toContain('No se pudieron cargar los equipos');
      expect(fixture.nativeElement.querySelector('table')).toBeNull();

      buttonByText('Reintentar')?.click();
      fixture.detectChanges();

      expect(teams.getAll).toHaveBeenCalledTimes(2);
      expect(rowNames()).toHaveLength(3);
    });

    it('announces the number of teams in a live region that is always in the DOM', () => {
      expect.assertions(2);
      startAs();
      const region = () => fixture.nativeElement.querySelector('[aria-live="polite"]');

      expect(region().textContent).toContain('3 equipos encontrados.');

      teams.getAll.mockReturnValue(of([guardia]));
      component.loadTeams();
      fixture.detectChanges();
      expect(region().textContent).toContain('1 equipo encontrado.');
    });
  });

  describe('permissions in the UI (management is exclusive to the team leader)', () => {
    it('team leader sees create, edit and delete', () => {
      expect.assertions(2);
      startAs(teamLeader);

      expect(buttonByText('Crear equipo')).toBeDefined();
      expect(rowActionLabels()).toEqual([
        'Editar Guardia mecánica',
        'Eliminar Guardia mecánica',
        'Editar Preventivo eléctrico',
        'Eliminar Preventivo eléctrico',
        'Editar Nuevo equipo',
        'Eliminar Nuevo equipo',
      ]);
    });

    it.each([
      ['administrador', administrador],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s sees no actions at all', (_label, user) => {
      expect.assertions(3);
      startAs(user);

      expect(buttonByText('Crear equipo')).toBeUndefined();
      expect(rowActionLabels()).toEqual([]);
      expect(fixture.nativeElement.querySelector('th.u-text-center')).toBeNull();
    });
  });

  describe('navigation', () => {
    it('create goes to the team form', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      startAs();

      buttonByText('Crear equipo')?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/teams/new']);
    });

    it('edit goes to the form of that team', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      startAs();

      const edit: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '[aria-label="Editar Preventivo eléctrico"]',
      );
      edit?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/teams', '2', 'edit']);
    });
  });

  describe('deleting', () => {
    it('team leader confirms and DELETE goes out for that team, then the list reloads', () => {
      expect.assertions(4);
      startAs(teamLeader);

      confirmDeletion(preventivo);

      expect(teams.delete).toHaveBeenCalledExactlyOnceWith('2');
      expect(message()).toMatchObject({
        variant: 'success',
        message: 'Equipo eliminado satisfactoriamente.',
      });
      expect(teams.getAll).toHaveBeenCalledTimes(2);
      expect(component.deleteModalOpen()).toBe(false);
    });

    it('asks for confirmation naming the team, and cancelling deletes nothing', () => {
      expect.assertions(4);
      startAs(teamLeader);

      component.openDeleteModal(guardia);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="dialog"]')?.textContent).toContain(
        'Guardia mecánica',
      );
      const cancel: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '[role="dialog"] .btn--secondary',
      );
      if (!cancel) throw new Error('No se encontró el botón Cancelar');
      cancel.click();
      fixture.detectChanges();

      expect(component.deleteModalOpen()).toBe(false);
      expect(teams.delete).not.toHaveBeenCalled();
      expect(teams.getAll).toHaveBeenCalledTimes(1);
    });

    it('reassures that the technicians of the team are not deleted', () => {
      startAs(teamLeader);

      component.openDeleteModal(guardia);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="dialog"]')?.textContent).toContain(
        'Sus técnicos no se eliminan',
      );
    });

    it.each([
      ['administrador', administrador],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s cannot open the confirmation nor delete: no DELETE and a warning', (_label, user) => {
      expect.assertions(5);
      startAs(user);

      component.openDeleteModal(guardia);
      expect(component.deleteModalOpen()).toBe(false);
      expect(component.teamToDelete()).toBeNull();

      component.deleteTeam('1');

      expect(teams.delete).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        title: 'Acceso denegado',
        message: 'No tiene permiso para eliminar equipos.',
      });
      expect(teams.getAll).toHaveBeenCalledTimes(1);
    });

    it('reports an error and keeps the list when DELETE fails', () => {
      expect.assertions(3);
      teams.delete.mockReturnValue(throwError(() => new Error('down')));
      startAs(teamLeader);

      component.deleteTeam('1');

      expect(message()).toMatchObject({
        variant: 'error',
        message: 'Error al eliminar el equipo.',
      });
      expect(teams.getAll).toHaveBeenCalledTimes(1);
      expect(rowNames()).toContain('Guardia mecánica');
    });
  });
});
