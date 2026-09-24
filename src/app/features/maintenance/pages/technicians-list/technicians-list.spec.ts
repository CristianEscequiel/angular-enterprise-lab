import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { UsersService } from '@core/auth/users.service';
import { MessageService } from '@core/services/message.service';
import { TeamsService } from '../../data-access/teams.service';
import { TechniciansService } from '../../data-access/technicians.service';
import { Team } from '../../models/team.model';
import { Technician } from '../../models/technician.model';
import { TechniciansList } from './technicians-list';

describe('TechniciansList', () => {
  let fixture: ComponentFixture<TechniciansList>;
  let component: TechniciansList;

  const ana: Technician = {
    id: '1001',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const luis: Technician = {
    id: '1002',
    legajo: '1002',
    firstName: 'Luis',
    lastName: 'Paz',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };
  // Existe en el maestro sin usuario de login ni equipo.
  const marta: Technician = {
    id: '1003',
    legajo: '1003',
    firstName: 'Marta',
    lastName: 'Gómez',
    specialty: 'general',
    teamType: 'preventivo-correctivo',
  };
  const team = (name: string, memberLegajos: string[]): Team => ({
    id: name,
    name,
    type: 'guardia',
    memberLegajos,
  });

  const technicians = {
    getAll: vi.fn<() => Observable<Technician[]>>(),
    delete: vi.fn<(legajo: string) => Observable<void>>(),
  };
  const users = { hasTechnicianAccount: vi.fn<(legajo: string) => Observable<boolean>>() };
  const teams = { getAll: vi.fn<() => Observable<Team[]>>() };

  const administrador: AuthUser = {
    id: '1',
    username: 'admin',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'administrador',
  };
  const teamLeader: AuthUser = {
    ...administrador,
    id: '3',
    username: 'teamleader',
    role: 'team-leader-mantenimiento',
  };
  const produccion: AuthUser = {
    ...administrador,
    id: '4',
    username: 'produccion',
    role: 'personal-produccion',
  };
  const currentUser = signal<AuthUser | null>(administrador);

  beforeEach(async () => {
    technicians.getAll.mockReset().mockReturnValue(of([ana, luis, marta]));
    technicians.delete.mockReset().mockReturnValue(of(undefined));
    users.hasTechnicianAccount.mockReset().mockReturnValue(of(false));
    teams.getAll.mockReset().mockReturnValue(of([]));
    currentUser.set(administrador);

    await TestBed.configureTestingModule({
      imports: [TechniciansList],
      providers: [
        provideRouter([]),
        { provide: TechniciansService, useValue: technicians },
        { provide: UsersService, useValue: users },
        { provide: TeamsService, useValue: teams },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function startAs(user: AuthUser | null = administrador): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(TechniciansList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';

  function rowLegajos(): string[] {
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

  function createButton(): HTMLButtonElement | undefined {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    return buttons.find((button) => button.textContent?.includes('Crear técnico'));
  }

  function search(value: string): void {
    component.searchControl.setValue(value);
    fixture.detectChanges();
  }

  function confirmDeletion(technician: Technician): void {
    component.openDeleteModal(technician);
    fixture.detectChanges();
    const confirmButton = fixture.nativeElement.querySelector('[role="dialog"] .btn--danger');
    if (!confirmButton) throw new Error('No se abrió la confirmación de eliminación');
    (confirmButton as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  describe('listing', () => {
    it('shows legajo, name, specialty and team type of every technician', () => {
      expect.assertions(4);
      startAs();

      expect(rowLegajos()).toEqual(['1001', '1002', '1003']);
      expect(text()).toContain('Ruiz, Ana');
      expect(text()).toContain('Electricista');
      expect(text()).toContain('Preventivo-correctivo');
    });

    it('lists a technician that has no login user and does not look up users to do it', () => {
      expect.assertions(2);
      startAs();

      expect(rowLegajos()).toContain('1003');
      expect(users.hasTechnicianAccount).not.toHaveBeenCalled();
    });

    it('shows an empty state when there are no technicians', () => {
      technicians.getAll.mockReturnValue(of([]));
      startAs();

      expect(text()).toContain('No existen técnicos registrados.');
      expect(fixture.nativeElement.querySelector('table')).toBeNull();
    });

    it('shows an error with a retry that loads the list again', () => {
      expect.assertions(4);
      technicians.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
      startAs();

      expect(text()).toContain('No se pudieron cargar los técnicos');
      expect(fixture.nativeElement.querySelector('table')).toBeNull();

      const retry: HTMLButtonElement | undefined = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((button) => button.textContent?.includes('Reintentar'));
      retry?.click();
      fixture.detectChanges();

      expect(technicians.getAll).toHaveBeenCalledTimes(2);
      expect(rowLegajos()).toEqual(['1001', '1002', '1003']);
    });

    it('announces the number of results in a live region that is always in the DOM', () => {
      expect.assertions(3);
      startAs();
      const region = () => fixture.nativeElement.querySelector('[aria-live="polite"]');

      expect(region().textContent).toContain('3 técnicos encontrados.');
      search('ruiz');
      expect(region().textContent).toContain('1 técnico encontrado.');
      search('zzz');
      expect(region().textContent).toContain('No se encontraron técnicos.');
    });
  });

  describe('search', () => {
    it.each([
      ['a legajo', '1002', ['1002']],
      ['part of a legajo', '100', ['1001', '1002', '1003']],
      ['a first name, ignoring case', 'ANA', ['1001']],
      ['a last name', 'paz', ['1002']],
      ['a name with an accent', 'gómez', ['1003']],
      ['the "Apellido, Nombre" form', 'ruiz, ana', ['1001']],
      ['surrounding spaces', '  luis  ', ['1002']],
    ])('filters by %s', (_label, term, expected) => {
      startAs();

      search(term);

      expect(rowLegajos()).toEqual(expected);
    });

    it('does not send any request while filtering', () => {
      startAs();

      search('ana');

      expect(technicians.getAll).toHaveBeenCalledTimes(1);
    });

    it('says so when nothing matches and restores the list when cleared', () => {
      expect.assertions(3);
      startAs();

      search('nadie');
      expect(text()).toContain('No hay técnicos que coincidan con la búsqueda.');

      search('');
      expect(rowLegajos()).toEqual(['1001', '1002', '1003']);
      expect(text()).not.toContain('No hay técnicos que coincidan');
    });
  });

  describe('permissions in the UI', () => {
    it('administrador sees create, edit and delete', () => {
      expect.assertions(2);
      startAs(administrador);

      expect(createButton()).toBeDefined();
      expect(rowActionLabels()).toEqual([
        'Editar Ruiz, Ana',
        'Eliminar Ruiz, Ana',
        'Editar Paz, Luis',
        'Eliminar Paz, Luis',
        'Editar Gómez, Marta',
        'Eliminar Gómez, Marta',
      ]);
    });

    it('team leader sees create and edit but no Eliminar button', () => {
      expect.assertions(3);
      startAs(teamLeader);

      expect(createButton()).toBeDefined();
      expect(rowActionLabels()).toEqual([
        'Editar Ruiz, Ana',
        'Editar Paz, Luis',
        'Editar Gómez, Marta',
      ]);
      expect(rowActionLabels().some((label) => label.startsWith('Eliminar'))).toBe(false);
    });

    it('a role without permissions sees the list but no actions at all', () => {
      expect.assertions(3);
      startAs(produccion);

      expect(createButton()).toBeUndefined();
      expect(rowActionLabels()).toEqual([]);
      expect(fixture.nativeElement.querySelector('th.u-text-center')).toBeNull();
    });
  });

  describe('navigation', () => {
    it('create goes to the technician form', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      startAs();

      createButton()?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/technicians/new']);
    });

    it('edit goes to the form of that legajo', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      startAs();

      const edit: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '[aria-label="Editar Paz, Luis"]',
      );
      edit?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/technicians', '1002', 'edit']);
    });
  });

  describe('deleting', () => {
    it('administrador confirms and DELETE goes out for a technician that is not in use', () => {
      expect.assertions(4);
      startAs(administrador);

      confirmDeletion(marta);

      expect(users.hasTechnicianAccount).toHaveBeenCalledExactlyOnceWith('1003');
      expect(technicians.delete).toHaveBeenCalledExactlyOnceWith('1003');
      expect(message()?.variant).toBe('success');
      // Vuelve a cargar el listado.
      expect(technicians.getAll).toHaveBeenCalledTimes(2);
    });

    it('asks for confirmation naming the technician, and cancelling deletes nothing', () => {
      expect.assertions(5);
      startAs(administrador);

      component.openDeleteModal(ana);
      fixture.detectChanges();

      expect(component.deleteModalOpen()).toBe(true);
      expect(fixture.nativeElement.querySelector('[role="dialog"]')?.textContent).toContain(
        'Ruiz, Ana (legajo 1001)',
      );
      const cancel: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '[role="dialog"] .btn--secondary',
      );
      if (!cancel) throw new Error('No se encontró el botón Cancelar');
      cancel.click();
      fixture.detectChanges();

      expect(component.deleteModalOpen()).toBe(false);
      expect(technicians.delete).not.toHaveBeenCalled();
      expect(users.hasTechnicianAccount).not.toHaveBeenCalled();
    });

    it('team leader cannot open the confirmation nor delete: no DELETE and a warning', () => {
      expect.assertions(6);
      startAs(teamLeader);

      component.openDeleteModal(ana);
      expect(component.deleteModalOpen()).toBe(false);
      expect(message()?.title).toBe('Acceso denegado');

      component.deleteTechnician('1001');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(users.hasTechnicianAccount).not.toHaveBeenCalled();
      expect(teams.getAll).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        title: 'Acceso denegado',
        message: 'No tiene permiso para eliminar técnicos.',
      });
    });

    it.each([
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s cannot delete either', (_label, user) => {
      expect.assertions(2);
      startAs(user);

      component.deleteTechnician('1001');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(message()?.title).toBe('Acceso denegado');
    });

    it('blocks a technician that has a login user: warning and no DELETE', () => {
      expect.assertions(4);
      users.hasTechnicianAccount.mockReturnValue(of(true));
      startAs(administrador);

      component.deleteTechnician('1001');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(message()?.variant).toBe('warning');
      expect(message()?.message).toContain('usuario de acceso');
      expect(technicians.getAll).toHaveBeenCalledTimes(1);
    });

    it('blocks a technician that belongs to a team, naming the team', () => {
      expect.assertions(4);
      teams.getAll.mockReturnValue(
        of([team('Guardia mecánica', ['1001', '1002']), team('Otro equipo', ['1002'])]),
      );
      startAs(administrador);

      component.deleteTechnician('1001');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(message()?.variant).toBe('warning');
      expect(message()?.message).toContain('Guardia mecánica');
      expect(message()?.message).not.toContain('Otro equipo');
    });

    it('lists every team when the technician belongs to several', () => {
      teams.getAll.mockReturnValue(of([team('Equipo A', ['1001']), team('Equipo B', ['1001'])]));
      startAs(administrador);

      component.deleteTechnician('1001');

      expect(message()?.message).toContain('Equipo A, Equipo B');
    });

    it('reports both reasons when the technician has a login and is in a team', () => {
      expect.assertions(3);
      users.hasTechnicianAccount.mockReturnValue(of(true));
      teams.getAll.mockReturnValue(of([team('Guardia mecánica', ['1001'])]));
      startAs(administrador);

      component.deleteTechnician('1001');

      expect(message()?.message).toContain('usuario de acceso');
      expect(message()?.message).toContain('Guardia mecánica');
      expect(technicians.delete).not.toHaveBeenCalled();
    });

    it('deletes when the teams exist but none has that technician', () => {
      teams.getAll.mockReturnValue(of([team('Otro equipo', ['1002'])]));
      startAs(administrador);

      component.deleteTechnician('1003');

      expect(technicians.delete).toHaveBeenCalledExactlyOnceWith('1003');
    });

    it('does not delete when the users lookup fails: a failure is not "no references"', () => {
      expect.assertions(4);
      users.hasTechnicianAccount.mockReturnValue(throwError(() => new Error('down')));
      startAs(administrador);

      component.deleteTechnician('1003');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(message()?.variant).toBe('error');
      expect(message()?.message).toContain('No se eliminó');
      expect(technicians.getAll).toHaveBeenCalledTimes(1);
    });

    it('does not delete when the teams lookup fails', () => {
      expect.assertions(2);
      teams.getAll.mockReturnValue(throwError(() => new Error('down')));
      startAs(administrador);

      component.deleteTechnician('1003');

      expect(technicians.delete).not.toHaveBeenCalled();
      expect(message()?.variant).toBe('error');
    });

    it('waits for both lookups before deciding', () => {
      expect.assertions(2);
      const pendingTeams = new Subject<Team[]>();
      teams.getAll.mockReturnValue(pendingTeams);
      startAs(administrador);

      component.deleteTechnician('1003');
      expect(technicians.delete).not.toHaveBeenCalled();

      pendingTeams.next([]);
      pendingTeams.complete();
      expect(technicians.delete).toHaveBeenCalledExactlyOnceWith('1003');
    });

    it('reports an error and keeps the list when DELETE fails', () => {
      expect.assertions(3);
      technicians.delete.mockReturnValue(throwError(() => new Error('down')));
      startAs(administrador);

      component.deleteTechnician('1003');

      expect(message()).toMatchObject({
        variant: 'error',
        message: 'Error al eliminar el técnico.',
      });
      expect(technicians.getAll).toHaveBeenCalledTimes(1);
      expect(rowLegajos()).toContain('1003');
    });
  });
});
