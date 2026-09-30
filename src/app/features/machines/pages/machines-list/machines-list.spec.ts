import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthUser, TechnicianUser, USER_ROLES, UserRole } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { MachineHasPartsError, MachinesService } from '../../data-access/machines.service';
import { PartsService } from '../../data-access/parts.service';
import { Machine } from '../../models/machine.model';
import { Part } from '../../models/part.model';
import { MachinesList } from './machines-list';

describe('MachinesList', () => {
  let fixture: ComponentFixture<MachinesList>;
  let component: MachinesList;
  let navigate: ReturnType<typeof vi.spyOn>;

  const envasadora: Machine = { id: 'm1', code: 'ENV-01', name: 'Envasadora' };
  const selladora: Machine = { id: 'm2', code: 'SEL-02', name: 'Selladora' };
  const rotuladora: Machine = { id: 'm3', code: 'ROT-03', name: 'Rotuladora' };
  const part = (id: string, machineId: string): Part => ({
    id,
    machineId,
    parentId: null,
    name: `Parte ${id}`,
  });
  // Envasadora: 3 partes, Selladora: 1, Rotuladora: ninguna, y una parte de una máquina que no está.
  const allParts = [
    part('p1', 'm1'),
    part('p2', 'm1'),
    part('p3', 'm1'),
    part('p4', 'm2'),
    part('p9', 'no-listada'),
  ];

  const machines = {
    getAll: vi.fn<() => Observable<Machine[]>>(),
    delete: vi.fn<(id: string) => Observable<void>>(),
  };
  const parts = {
    getAll: vi.fn<() => Observable<Part[]>>(),
  };

  const userWithRole = (role: UserRole): AuthUser => {
    if (role === 'tecnico') {
      const technician: TechnicianUser = {
        id: 't',
        username: 'tecnico',
        displayName: 'Técnico',
        email: 'tecnico@enterprise-lab.dev',
        role: 'tecnico',
        legajo: '1001',
        specialty: 'mecanico',
        teamType: 'guardia',
      };
      return technician;
    }

    return {
      id: role,
      username: role,
      displayName: role,
      email: `${role}@enterprise-lab.dev`,
      role,
    };
  };
  const teamLeader = userWithRole('team-leader-mantenimiento');
  const currentUser = signal<AuthUser | null>(teamLeader);

  beforeEach(async () => {
    machines.getAll.mockReset().mockReturnValue(of([envasadora, selladora, rotuladora]));
    machines.delete.mockReset().mockReturnValue(of(undefined));
    parts.getAll.mockReset().mockReturnValue(of(allParts));
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [MachinesList],
      providers: [
        provideRouter([]),
        { provide: MachinesService, useValue: machines },
        { provide: PartsService, useValue: parts },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function startAs(user: AuthUser | null = teamLeader): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(MachinesList);
    component = fixture.componentInstance;
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';

  function rows(): string[][] {
    const trs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
    return trs.map((tr) =>
      Array.from(tr.querySelectorAll('td'))
        .slice(0, 3)
        .map((cell) => cell.textContent?.trim() ?? ''),
    );
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

  const rowButton = (label: string): HTMLButtonElement => {
    const button = fixture.nativeElement.querySelector(`tbody button[aria-label="${label}"]`);
    if (!button) throw new Error(`No hay un botón "${label}"`);
    return button;
  };

  function confirmDeletion(machine: Machine): void {
    component.openDeleteModal(machine);
    fixture.detectChanges();
    const confirmButton = fixture.nativeElement.querySelector('[role="dialog"] .btn--danger');
    if (!confirmButton) throw new Error('No se abrió la confirmación de eliminación');
    (confirmButton as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  // Spec 014 (REQ-3.1, 3.4): bajo md la fila se muestra como tarjeta. El CSS toma la etiqueta de
  // cada valor de `data-label`, que tiene que coincidir con el encabezado de su columna.
  describe('card layout on small screens', () => {
    it('labels every cell with the header of its column', () => {
      startAs();

      const headers = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('thead th'),
      ).map((header) => header.textContent?.trim());
      const cells = Array.from<HTMLElement>(
        fixture.nativeElement.querySelector('tbody tr').querySelectorAll('td'),
      );

      expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual(headers);
    });

    it('groups every action of the row in a wrapping container', () => {
      startAs();

      const row: HTMLElement = fixture.nativeElement.querySelector('tbody tr');
      const buttons = row.querySelectorAll('button');

      expect(buttons.length).toBeGreaterThan(0);
      expect(row.querySelectorAll('.row-actions button')).toHaveLength(buttons.length);
      expect(row.querySelector('td.row-actions-cell')).not.toBeNull();
    });
  });

  describe('listing', () => {
    it('shows code, name and number of parts of every machine', () => {
      startAs();

      expect(rows()).toEqual([
        ['ENV-01', 'Envasadora', '3 partes'],
        ['SEL-02', 'Selladora', '1 parte'],
        ['ROT-03', 'Rotuladora', '0 partes'],
      ]);
    });

    it('counts the parts with a single request for the whole collection', () => {
      startAs();

      expect(machines.getAll).toHaveBeenCalledTimes(1);
      expect(parts.getAll).toHaveBeenCalledTimes(1);
    });

    it('ignores the parts of a machine that is not listed', () => {
      startAs();

      expect(text()).not.toContain('no-listada');
      expect(rows()).toHaveLength(3);
    });

    it('shows an empty state when there are no machines', () => {
      machines.getAll.mockReturnValue(of([]));
      parts.getAll.mockReturnValue(of([]));
      startAs();

      expect(text()).toContain('No existen máquinas registradas.');
      expect(fixture.nativeElement.querySelector('table')).toBeNull();
    });

    it('announces how many machines were found', () => {
      startAs();
      expect(text()).toContain('3 máquinas encontradas.');
    });

    it('announces a single machine and no machines with the right wording', () => {
      machines.getAll.mockReturnValue(of([envasadora]));
      startAs();
      expect(text()).toContain('1 máquina encontrada.');

      fixture.destroy();
      machines.getAll.mockReturnValue(of([]));
      startAs();
      expect(text()).toContain('No se encontraron máquinas.');
    });

    describe('errors', () => {
      it('shows an error with a retry that loads the list again', () => {
        machines.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
        startAs();

        expect(text()).toContain('No se pudieron cargar las máquinas');
        expect(fixture.nativeElement.querySelector('table')).toBeNull();

        buttonByText('Reintentar')?.click();
        fixture.detectChanges();

        expect(machines.getAll).toHaveBeenCalledTimes(2);
        expect(rows()).toHaveLength(3);
        expect(text()).not.toContain('No se pudieron cargar');
      });

      it('shows the error, not a list without counts, when the parts cannot be loaded', () => {
        parts.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
        startAs();

        expect(text()).toContain('No se pudieron cargar las máquinas');
        expect(fixture.nativeElement.querySelector('table')).toBeNull();
      });

      it('does not announce results while there is an error', () => {
        machines.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
        startAs();

        expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('');
      });
    });
  });

  // Criterio 3 del spec: solo `administrador` y `team-leader-mantenimiento` gestionan.
  describe('permissions', () => {
    describe.each(['administrador', 'team-leader-mantenimiento'] as const)('as %s', (role) => {
      beforeEach(() => startAs(userWithRole(role)));

      it('shows the create button and the three actions of every row', () => {
        expect(buttonByText('Nueva máquina')).toBeDefined();
        expect(rowActionLabels()).toEqual([
          'Ver partes de Envasadora',
          'Editar Envasadora',
          'Eliminar Envasadora',
          'Ver partes de Selladora',
          'Editar Selladora',
          'Eliminar Selladora',
          'Ver partes de Rotuladora',
          'Editar Rotuladora',
          'Eliminar Rotuladora',
        ]);
        expect(text()).toContain('Acciones');
      });

      it('can delete: the confirmed deletion reaches the service', () => {
        confirmDeletion(rotuladora);

        expect(machines.delete).toHaveBeenCalledExactlyOnceWith('m3');
      });
    });

    describe.each(['personal-produccion', 'tecnico'] as const)('as %s', (role) => {
      beforeEach(() => startAs(userWithRole(role)));

      it('shows no create button and no actions', () => {
        expect(buttonByText('Nueva máquina')).toBeUndefined();
        expect(rowActionLabels()).toEqual([]);
        expect(text()).not.toContain('Acciones');
      });

      it('does not open the deletion even if the method is called', () => {
        component.openDeleteModal(envasadora);
        fixture.detectChanges();

        expect(component.deleteModalOpen()).toBe(false);
        expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
        expect(message()).toMatchObject({ variant: 'warning', title: 'Acceso denegado' });
      });

      it('does NOT reach the service when deleteMachine is invoked directly', () => {
        component.deleteMachine('m1');

        expect(machines.delete).not.toHaveBeenCalled();
        expect(message()).toMatchObject({
          variant: 'warning',
          title: 'Acceso denegado',
          message: 'No tiene permiso para eliminar máquinas.',
        });
      });
    });

    it('does NOT reach the service without a session either', () => {
      startAs(null);

      component.deleteMachine('m1');
      component.openDeleteModal(envasadora);

      expect(machines.delete).not.toHaveBeenCalled();
      expect(component.deleteModalOpen()).toBe(false);
    });

    // Si se agrega un rol nuevo, este test obliga a decidir qué ve en esta página.
    it.each(USER_ROLES)('has a decision for role %s', (role) => {
      startAs(userWithRole(role));
      const manager = role === 'administrador' || role === 'team-leader-mantenimiento';

      expect(rowActionLabels().length > 0).toBe(manager);
    });
  });

  describe('deleting', () => {
    beforeEach(() => startAs());

    it('opens a confirmation that names the machine and warns it must have no parts', () => {
      rowButton('Eliminar Selladora').click();
      fixture.detectChanges();

      const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
      expect(dialog.textContent).toContain('Selladora');
      expect(dialog.textContent).toContain('SEL-02');
      expect(dialog.textContent).toContain('no tiene partes');
      expect(machines.delete).not.toHaveBeenCalled();
    });

    it('does not delete when the confirmation is cancelled', () => {
      rowButton('Eliminar Rotuladora').click();
      fixture.detectChanges();
      buttonByText('Cancelar')?.click();
      fixture.detectChanges();

      expect(machines.delete).not.toHaveBeenCalled();
    });

    it('deletes, says so and reloads the list from the server', () => {
      machines.getAll.mockReturnValue(of([envasadora, selladora]));

      confirmDeletion(rotuladora);

      expect(machines.delete).toHaveBeenCalledExactlyOnceWith('m3');
      expect(message()).toMatchObject({
        variant: 'success',
        message: 'Máquina eliminada satisfactoriamente.',
      });
      expect(machines.getAll).toHaveBeenCalledTimes(2);
      expect(rows().map((row) => row[0])).toEqual(['ENV-01', 'SEL-02']);
    });

    // El bloqueo lo decide `MachinesService.delete` con datos frescos; la página no lo repite.
    it('leaves the decision to the service even when the list shows parts', () => {
      confirmDeletion(envasadora);

      expect(machines.delete).toHaveBeenCalledExactlyOnceWith('m1');
    });

    describe('a machine that has parts (blocked by the service)', () => {
      beforeEach(() => {
        machines.delete.mockReturnValue(throwError(() => new MachineHasPartsError('m1', 3)));
        confirmDeletion(envasadora);
      });

      it('warns with the reason and does not say it was deleted', () => {
        expect(message()).toMatchObject({
          variant: 'warning',
          title: 'No se puede eliminar',
        });
        expect(message()?.message).toContain('3 partes');
        expect(message()?.message).toContain('Elimine primero');
      });

      it('keeps the machine in the list', () => {
        expect(rows().map((row) => row[0])).toEqual(['ENV-01', 'SEL-02', 'ROT-03']);
      });

      it('reloads the list, since the part counts on screen may be stale', () => {
        expect(machines.getAll).toHaveBeenCalledTimes(2);
        expect(parts.getAll).toHaveBeenCalledTimes(2);
      });
    });

    describe('any other failure', () => {
      beforeEach(() => {
        machines.delete.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
        );
        confirmDeletion(rotuladora);
      });

      it('shows a generic error and does not claim success', () => {
        expect(message()).toMatchObject({
          variant: 'error',
          message: 'Error al eliminar la máquina.',
        });
      });

      it('does not reload nor change the list', () => {
        expect(machines.getAll).toHaveBeenCalledTimes(1);
        expect(rows()).toHaveLength(3);
      });
    });
  });

  describe('navigation', () => {
    beforeEach(() => startAs());

    it('goes to the creation form', () => {
      buttonByText('Nueva máquina')?.click();

      expect(navigate).toHaveBeenCalledWith(['/machines/new']);
    });

    it('goes to the edit form of that machine', () => {
      rowButton('Editar Selladora').click();

      expect(navigate).toHaveBeenCalledWith(['/machines', 'm2', 'edit']);
    });

    it('goes to the parts tree of that machine', () => {
      rowButton('Ver partes de Rotuladora').click();

      expect(navigate).toHaveBeenCalledWith(['/machines', 'm3', 'parts']);
    });
  });
});
