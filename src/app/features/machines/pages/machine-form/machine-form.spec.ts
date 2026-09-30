import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser, TechnicianUser, UserRole } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { createInMemoryApi, InMemoryApi, provideInMemoryApi } from '@core/testing/in-memory-api';
import {
  DuplicateMachineCodeError,
  InvalidMachineError,
  MachineLoadError,
  MachinesService,
} from '../../data-access/machines.service';
import { Machine, MachineDraft } from '../../models/machine.model';
import { MachineForm } from './machine-form';

describe('MachineForm', () => {
  let fixture: ComponentFixture<MachineForm>;
  let component: MachineForm;
  let navigate: ReturnType<typeof vi.spyOn>;

  const envasadora: Machine = { id: 'm1', code: 'ENV-01', name: 'Envasadora' };
  const validValues = { code: 'ROT-03', name: 'Rotuladora' };

  const machines = {
    create: vi.fn<(draft: MachineDraft) => Observable<Machine>>(),
    update: vi.fn<(id: string, draft: MachineDraft) => Observable<Machine>>(),
    getById: vi.fn<(id: string) => Observable<Machine>>(),
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
  const administrador = userWithRole('administrador');
  const teamLeader = userWithRole('team-leader-mantenimiento');
  const currentUser = signal<AuthUser | null>(administrador);

  function configure(id: string | null, extraProviders: unknown[] = []): void {
    machines.create.mockReset().mockImplementation((draft) => of({ ...draft, id: 'srv-new' }));
    machines.update
      .mockReset()
      .mockImplementation((machineId, draft) => of({ ...draft, id: machineId }));
    machines.getById.mockReset().mockReturnValue(of(envasadora));
    currentUser.set(administrador);

    TestBed.configureTestingModule({
      imports: [MachineForm],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) } },
        },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
        ...(extraProviders.length > 0
          ? extraProviders
          : [{ provide: MachinesService, useValue: machines }]),
      ] as never,
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  function start(user: AuthUser | null = administrador): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(MachineForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';
  const field = <T extends HTMLElement>(id: string): T => {
    const element = fixture.nativeElement.querySelector(`#${id}`);
    if (!element) throw new Error(`No existe el campo #${id}`);
    return element as T;
  };
  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');
  const buttonByText = (label: string): HTMLButtonElement | undefined =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(label),
    );

  function fillForm(values: Partial<typeof validValues>): void {
    for (const [id, value] of Object.entries(values)) {
      const element = field<HTMLInputElement>(id);
      element.value = value;
      element.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }

  function submit(): void {
    const form: HTMLFormElement | null = fixture.nativeElement.querySelector('form');
    if (!form) throw new Error('No hay formulario para enviar');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('create mode', () => {
    beforeEach(() => configure(null));

    it('shows an empty form to create a machine, without loading anything', () => {
      start();

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Nueva máquina');
      expect(field<HTMLInputElement>('code').value).toBe('');
      expect(field<HTMLInputElement>('name').value).toBe('');
      expect(machines.getById).not.toHaveBeenCalled();
    });

    it('never loads a machine in create mode, even if loadMachine is called', () => {
      start();

      component.loadMachine();

      expect(machines.getById).not.toHaveBeenCalled();
      expect(component.loadError()).toBeNull();
    });

    it('explains what the code is and that it is stored in uppercase', () => {
      start();

      expect(text()).toContain('Identificador único');
      expect(text()).toContain('mayúsculas');
      expect(field('code').getAttribute('aria-describedby')).toContain('code-help');
    });

    it.each(['administrador', 'team-leader-mantenimiento'] as const)(
      '%s creates a machine and goes back to the list',
      (role) => {
        start(userWithRole(role));

        fillForm(validValues);
        submit();

        expect(machines.create).toHaveBeenCalledExactlyOnceWith(validValues);
        expect(message()).toMatchObject({
          variant: 'success',
          message: 'Máquina creada satisfactoriamente.',
        });
        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/machines']);
        expect(machines.update).not.toHaveBeenCalled();
      },
    );

    it('sends the code normalized (trimmed, uppercase) and the name trimmed', () => {
      start();

      fillForm({ code: '  rot-03 ', name: '  Rotuladora  ' });
      submit();

      expect(machines.create).toHaveBeenCalledExactlyOnceWith({
        code: 'ROT-03',
        name: 'Rotuladora',
      });
    });

    it('accepts a lowercase code: it is not an error, it is stored in uppercase', () => {
      start();

      fillForm({ code: 'rot-03' });

      expect(component.form.controls.code.valid).toBe(true);
    });

    describe('duplicated code', () => {
      beforeEach(() => {
        machines.create.mockReturnValue(throwError(() => new DuplicateMachineCodeError('ROT-03')));
        start();
        fillForm(validValues);
        submit();
      });

      it('shows the error on the field', () => {
        expect(text()).toContain('Ya existe una máquina con ese código.');
        expect(field('code').getAttribute('aria-invalid')).toBe('true');
        expect(field('code').getAttribute('aria-describedby')).toContain('code-error');
      });

      it('does not navigate and does not report success', () => {
        expect(navigate).not.toHaveBeenCalled();
        expect(message()?.variant).not.toBe('success');
      });

      it('leaves the form available to correct it and retry', () => {
        expect(submitButton().disabled).toBe(false);
        expect(submitButton().textContent).toContain('Guardar máquina');
      });

      it('clears the error when the code is edited', () => {
        fillForm({ code: 'ROT-04' });

        expect(text()).not.toContain('Ya existe una máquina con ese código.');
        expect(component.form.controls.code.valid).toBe(true);
      });
    });

    describe('invalid input', () => {
      it('does not send an empty form and shows every error', () => {
        start();

        submit();

        expect(machines.create).not.toHaveBeenCalled();
        expect(text()).toContain('El código es obligatorio');
        expect(text()).toContain('El nombre es obligatorio.');
        expect(navigate).not.toHaveBeenCalled();
      });

      it.each([
        ['an empty code', ''],
        ['a blank code', '   '],
        ['a code with spaces inside', 'ENV 01'],
        ['a code that starts with a hyphen', '-ENV'],
        ['a path traversal as code', '../users'],
        ['a code longer than 20 characters', 'A'.repeat(21)],
        ['a code with symbols', 'ENV_01!'],
      ])('does not send %s', (_label, code) => {
        start();

        fillForm({ code, name: 'Rotuladora' });
        submit();

        expect(machines.create).not.toHaveBeenCalled();
        expect(text()).toContain('El código es obligatorio');
        expect(field('code').getAttribute('aria-invalid')).toBe('true');
      });

      it.each([
        ['an empty name', ''],
        ['a blank name', '    '],
      ])('does not send %s', (_label, name) => {
        start();

        fillForm({ code: 'ROT-03', name });
        submit();

        expect(machines.create).not.toHaveBeenCalled();
        expect(text()).toContain('El nombre es obligatorio.');
      });

      it('does not show errors before the user touches anything', () => {
        start();

        expect(text()).not.toContain('es obligatorio');
        expect(field('code').getAttribute('aria-invalid')).toBe('false');
      });
    });

    describe('while it is saving', () => {
      it('ignores a second submit and disables the button until the request ends', () => {
        const pending = new Subject<Machine>();
        machines.create.mockReturnValue(pending);
        start();
        fillForm(validValues);

        submit();
        submit();

        expect(machines.create).toHaveBeenCalledTimes(1);
        expect(submitButton().disabled).toBe(true);
        expect(submitButton().textContent).toContain('Guardando...');

        pending.next({ ...validValues, id: 'srv-new' });
        pending.complete();
        fixture.detectChanges();

        expect(submitButton().disabled).toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
      });

      it('releases the form after a failure, so the user can retry', () => {
        machines.create.mockReturnValueOnce(throwError(() => new Error('down')));
        start();
        fillForm(validValues);

        submit();

        expect(message()).toMatchObject({
          variant: 'error',
          message: 'Error al crear la máquina.',
        });
        expect(navigate).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(false);

        submit();

        expect(machines.create).toHaveBeenCalledTimes(2);
        expect(navigate).toHaveBeenCalledTimes(1);
      });
    });

    it('treats an InvalidMachineError from the service as a generic failure, not as a duplicate', () => {
      machines.create.mockReturnValue(throwError(() => new InvalidMachineError()));
      start();
      fillForm(validValues);

      submit();

      expect(message()).toMatchObject({ variant: 'error' });
      expect(text()).not.toContain('Ya existe una máquina');
    });

    describe('permissions (criterio 3: the submit checks them too)', () => {
      it.each(['personal-produccion', 'tecnico'] as const)(
        '%s cannot create: nothing is sent, and it is told so',
        (role) => {
          start(userWithRole(role));

          fillForm(validValues);
          submit();

          expect(machines.create).not.toHaveBeenCalled();
          expect(navigate).not.toHaveBeenCalled();
          expect(message()).toMatchObject({
            variant: 'warning',
            title: 'Acceso denegado',
            message: 'No tiene permiso para crear máquinas.',
          });
        },
      );

      it('a visitor without a session cannot create either', () => {
        start(null);

        fillForm(validValues);
        submit();

        expect(machines.create).not.toHaveBeenCalled();
        expect(message()).toMatchObject({ title: 'Acceso denegado' });
      });

      it('checks the permission before the validation: a denied user learns nothing about the form', () => {
        start(userWithRole('tecnico'));

        submit();

        expect(message()).toMatchObject({ title: 'Acceso denegado' });
        expect(text()).not.toContain('El código es obligatorio');
      });
    });

    it('goes back to the list with the back button', () => {
      start();

      buttonByText('Volver a Lista')?.click();

      expect(navigate).toHaveBeenCalledWith(['/machines']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('edit mode', () => {
    beforeEach(() => configure('m1'));

    it('loads the machine by the id of the route and fills the form', () => {
      start();

      expect(machines.getById).toHaveBeenCalledExactlyOnceWith('m1');
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Editar máquina');
      expect(field<HTMLInputElement>('code').value).toBe('ENV-01');
      expect(field<HTMLInputElement>('name').value).toBe('Envasadora');
    });

    it('keeps the code editable: it is a business identifier, not a link', () => {
      start();

      expect(field<HTMLInputElement>('code').disabled).toBe(false);
    });

    it('shows no form until the machine is loaded', () => {
      machines.getById.mockReturnValue(new Subject<Machine>());
      start();

      expect(fixture.nativeElement.querySelector('form')).toBeNull();
    });

    describe('when it cannot be loaded', () => {
      it('says the machine does not exist for a "not-found" error, with a retry', () => {
        machines.getById.mockReturnValueOnce(
          throwError(() => new MachineLoadError('not-found', 'La máquina no existe.')),
        );
        start();

        expect(text()).toContain('Máquina no encontrada');
        expect(text()).not.toContain('Error de conexión');
        expect(fixture.nativeElement.querySelector('form')).toBeNull();

        buttonByText('Reintentar')?.click();
        fixture.detectChanges();

        expect(machines.getById).toHaveBeenCalledTimes(2);
        expect(field<HTMLInputElement>('code').value).toBe('ENV-01');
        expect(text()).not.toContain('Máquina no encontrada');
      });

      it('says it could not connect for a "connection" error, which is not "does not exist"', () => {
        machines.getById.mockReturnValueOnce(
          throwError(() => new MachineLoadError('connection', 'down')),
        );
        start();

        expect(text()).toContain('Error de conexión');
        expect(text()).not.toContain('Máquina no encontrada');
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
      });

      it('retries a connection error and shows the form when the server is back', () => {
        machines.getById.mockReturnValueOnce(
          throwError(() => new MachineLoadError('connection', 'down')),
        );
        start();

        buttonByText('Reintentar')?.click();
        fixture.detectChanges();

        expect(machines.getById).toHaveBeenCalledTimes(2);
        expect(text()).not.toContain('Error de conexión');
        expect(field<HTMLInputElement>('code').value).toBe('ENV-01');
      });

      it('treats an unexpected error as a connection problem', () => {
        machines.getById.mockReturnValueOnce(throwError(() => new Error('boom')));
        start();

        expect(text()).toContain('Error de conexión');
      });
    });

    describe('saving', () => {
      it('sends the changes with the id of the machine and goes back to the list', () => {
        start();

        fillForm({ name: 'Envasadora nueva' });
        submit();

        expect(machines.update).toHaveBeenCalledExactlyOnceWith('m1', {
          code: 'ENV-01',
          name: 'Envasadora nueva',
        });
        expect(message()).toMatchObject({
          variant: 'success',
          message: 'Máquina actualizada correctamente.',
        });
        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/machines']);
        expect(machines.create).not.toHaveBeenCalled();
      });

      it('can change the code, normalized', () => {
        start();

        fillForm({ code: ' env-02 ' });
        submit();

        expect(machines.update).toHaveBeenCalledExactlyOnceWith('m1', {
          code: 'ENV-02',
          name: 'Envasadora',
        });
      });

      it('says there are no changes and sends nothing when nothing changed', () => {
        start();

        submit();

        expect(machines.update).not.toHaveBeenCalled();
        expect(message()).toMatchObject({
          variant: 'warning',
          message: 'No hubo cambios en la máquina',
        });
        expect(navigate).not.toHaveBeenCalled();
      });

      it('does not count a change of case or edge spaces as a change', () => {
        start();

        fillForm({ code: ' env-01 ', name: '  Envasadora ' });
        submit();

        expect(machines.update).not.toHaveBeenCalled();
        expect(message()?.message).toBe('No hubo cambios en la máquina');
      });

      it('validates before sending: an invalid code is not sent', () => {
        start();

        fillForm({ code: 'ENV 02' });
        submit();

        expect(machines.update).not.toHaveBeenCalled();
        expect(text()).toContain('El código es obligatorio');
      });

      it('shows a duplicated code on the field and does not navigate', () => {
        machines.update.mockReturnValue(throwError(() => new DuplicateMachineCodeError('SEL-02')));
        start();

        fillForm({ code: 'SEL-02' });
        submit();

        expect(text()).toContain('Ya existe una máquina con ese código.');
        expect(navigate).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(false);
      });

      it('says the machine no longer exists when it was deleted meanwhile', () => {
        machines.update.mockReturnValue(
          throwError(() => new MachineLoadError('not-found', 'La máquina no existe.')),
        );
        start();

        fillForm({ name: 'Otra' });
        submit();

        expect(message()).toMatchObject({ variant: 'error', message: 'La máquina ya no existe.' });
        expect(navigate).not.toHaveBeenCalled();
      });

      it('shows a generic error for any other failure', () => {
        machines.update.mockReturnValue(throwError(() => new Error('down')));
        start();

        fillForm({ name: 'Otra' });
        submit();

        expect(message()).toMatchObject({
          variant: 'error',
          message: 'Error al actualizar la máquina.',
        });
        expect(navigate).not.toHaveBeenCalled();
      });

      it('ignores a second submit while the update is in flight', () => {
        machines.update.mockReturnValue(new Subject<Machine>());
        start();
        fillForm({ name: 'Otra' });

        submit();
        submit();

        expect(machines.update).toHaveBeenCalledTimes(1);
        expect(submitButton().disabled).toBe(true);
      });
    });

    describe('permissions', () => {
      it.each(['personal-produccion', 'tecnico'] as const)(
        '%s cannot modify: nothing is sent, and it is told so',
        (role) => {
          start(userWithRole(role));

          fillForm({ name: 'Otra' });
          submit();

          expect(machines.update).not.toHaveBeenCalled();
          expect(message()).toMatchObject({
            variant: 'warning',
            title: 'Acceso denegado',
            message: 'No tiene permiso para modificar máquinas.',
          });
        },
      );

      it('the team leader can modify, with the same level as the administrator', () => {
        start(teamLeader);

        fillForm({ name: 'Otra' });
        submit();

        expect(machines.update).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // Con los servicios reales contra un emulador fiel de json-server: lo que el formulario muestra es
  // lo que el servicio decide con los datos del "servidor".
  describe('against the real service', () => {
    let api: InMemoryApi;

    beforeEach(() => {
      api = createInMemoryApi({
        maquinas: [
          { id: 'srv-1', code: 'ENV-01', name: 'Envasadora' },
          { id: 'srv-2', code: '0042', name: 'Selladora' },
        ],
        partes: [],
      });
    });

    it('creates the machine with the normalized code and goes back to the list', async () => {
      configure(null, [provideInMemoryApi(api)]);
      start();

      fillForm({ code: ' rot-03 ', name: ' Rotuladora ' });
      submit();
      await fixture.whenStable();

      expect(api.db['maquinas']?.map((row) => [row['code'], row['name']])).toContainEqual([
        'ROT-03',
        'Rotuladora',
      ]);
      expect(navigate).toHaveBeenCalledWith(['/machines']);
    });

    it('shows a duplicated code that only differs in case, and stores nothing', async () => {
      configure(null, [provideInMemoryApi(api)]);
      start();

      fillForm({ code: 'env-01', name: 'Otra envasadora' });
      submit();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('Ya existe una máquina con ese código.');
      expect(api.db['maquinas']).toHaveLength(2);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('shows a duplicated numeric-looking code ("0042")', async () => {
      configure(null, [provideInMemoryApi(api)]);
      start();

      fillForm({ code: '0042', name: 'Otra' });
      submit();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('Ya existe una máquina con ese código.');
      expect(api.db['maquinas']).toHaveLength(2);
    });

    it('lets a machine keep its own code when it is renamed (it is not its own duplicate)', async () => {
      configure('srv-1', [provideInMemoryApi(api)]);
      start();
      await fixture.whenStable();
      fixture.detectChanges();

      fillForm({ name: 'Envasadora renombrada' });
      submit();
      await fixture.whenStable();

      expect(api.db['maquinas']?.[0]).toMatchObject({
        id: 'srv-1',
        code: 'ENV-01',
        name: 'Envasadora renombrada',
      });
      expect(navigate).toHaveBeenCalledWith(['/machines']);
    });

    it('does not let a machine take the code of another one', async () => {
      configure('srv-1', [provideInMemoryApi(api)]);
      start();
      await fixture.whenStable();
      fixture.detectChanges();

      fillForm({ code: '0042' });
      submit();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('Ya existe una máquina con ese código.');
      expect(api.db['maquinas']?.[0]).toMatchObject({ code: 'ENV-01' });
    });

    it('says "does not exist" for an id that is not in the master, not a connection error', async () => {
      configure('no-existe', [provideInMemoryApi(api)]);
      start();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('Máquina no encontrada');
    });

    it('says "connection error" when the server fails', async () => {
      api.fail('GET', '/maquinas/srv-1', 500);
      configure('srv-1', [provideInMemoryApi(api)]);
      start();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('Error de conexión');
      expect(text()).not.toContain('Máquina no encontrada');
    });
  });
});
