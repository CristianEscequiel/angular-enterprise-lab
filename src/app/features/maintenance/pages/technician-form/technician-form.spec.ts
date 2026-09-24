import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { API_BASE_URL } from '@core/config/api.config';
import { MessageService } from '@core/services/message.service';
import {
  DuplicateLegajoError,
  TechnicianChanges,
  TechniciansService,
} from '../../data-access/technicians.service';
import { Technician, TechnicianDraft } from '../../models/technician.model';
import { TechnicianForm } from './technician-form';

describe('TechnicianForm', () => {
  let fixture: ComponentFixture<TechnicianForm>;
  let component: TechnicianForm;
  let navigate: ReturnType<typeof vi.spyOn>;

  const ana: Technician = {
    id: '1001',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const validValues = {
    legajo: '1004',
    firstName: 'Luis',
    lastName: 'Paz',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };

  const technicians = {
    create: vi.fn<(draft: TechnicianDraft) => Observable<Technician>>(),
    update: vi.fn<(legajo: string, changes: TechnicianChanges) => Observable<Technician>>(),
    findByLegajo: vi.fn<(legajo: string) => Observable<Technician | null>>(),
  };

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

  function configure(legajo: string | null, extraProviders: unknown[] = []): void {
    technicians.create
      .mockReset()
      .mockImplementation((draft) => of({ ...draft, id: draft.legajo }));
    technicians.update.mockReset().mockReturnValue(of(ana));
    technicians.findByLegajo.mockReset().mockReturnValue(of(ana));
    currentUser.set(administrador);

    TestBed.configureTestingModule({
      imports: [TechnicianForm],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(legajo === null ? {} : { legajo }) },
          },
        },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
        ...(extraProviders.length > 0
          ? extraProviders
          : [{ provide: TechniciansService, useValue: technicians }]),
      ] as never,
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  function start(user: AuthUser | null = administrador): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(TechnicianForm);
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

  function fillForm(values: Partial<typeof validValues>): void {
    for (const [id, value] of Object.entries(values)) {
      const element = field<HTMLInputElement | HTMLSelectElement>(id);
      element.value = value;
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'));
    }
    fixture.detectChanges();
  }

  function submit(): void {
    const form: HTMLFormElement | null = fixture.nativeElement.querySelector('form');
    if (!form) throw new Error('No hay formulario para enviar');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  describe('create mode', () => {
    beforeEach(() => configure(null));

    it('shows an empty form to create a technician, with the legajo editable', () => {
      expect.assertions(4);
      start();

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Crear técnico');
      expect(field<HTMLInputElement>('legajo').disabled).toBe(false);
      expect(field<HTMLInputElement>('legajo').value).toBe('');
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
    });

    it('offers no default specialty or team type: the user has to choose', () => {
      expect.assertions(2);
      start();

      expect(component.form.controls.specialty.value).toBe('');
      expect(component.form.controls.teamType.value).toBe('');
    });

    it.each(['administrador', 'team-leader-mantenimiento'] as const)(
      '%s creates a technician and goes back to the list',
      (role) => {
        expect.assertions(4);
        start({ ...administrador, role });

        fillForm(validValues);
        submit();

        expect(technicians.create).toHaveBeenCalledExactlyOnceWith(validValues);
        expect(message()).toMatchObject({
          variant: 'success',
          message: 'Técnico creado satisfactoriamente.',
        });
        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/maintenance/technicians']);
        expect(technicians.update).not.toHaveBeenCalled();
      },
    );

    it('blocks a duplicated legajo: shows the error, does not navigate and does not report success', () => {
      expect.assertions(5);
      technicians.create.mockReturnValue(throwError(() => new DuplicateLegajoError('1004')));
      start();

      fillForm(validValues);
      submit();

      expect(text()).toContain('Ya existe un técnico con ese legajo.');
      expect(field('legajo').getAttribute('aria-invalid')).toBe('true');
      expect(navigate).not.toHaveBeenCalled();
      expect(message()?.variant).not.toBe('success');
      // Vuelve a estar disponible para corregir y reintentar.
      expect(submitButton().disabled).toBe(false);
    });

    it('clears the duplicate error when the legajo is edited', () => {
      expect.assertions(2);
      technicians.create.mockReturnValueOnce(throwError(() => new DuplicateLegajoError('1004')));
      start();
      fillForm(validValues);
      submit();
      expect(text()).toContain('Ya existe un técnico con ese legajo.');

      fillForm({ legajo: '1005' });

      expect(text()).not.toContain('Ya existe un técnico con ese legajo.');
    });

    it('creates once the duplicated legajo is corrected', () => {
      technicians.create.mockReturnValueOnce(throwError(() => new DuplicateLegajoError('1004')));
      start();
      fillForm(validValues);
      submit();

      fillForm({ legajo: '1005' });
      submit();

      expect(technicians.create).toHaveBeenLastCalledWith({ ...validValues, legajo: '1005' });
      expect(navigate).toHaveBeenCalledWith(['/maintenance/technicians']);
    });

    it('reports an error and stays on the form when creating fails, ready to retry', () => {
      expect.assertions(4);
      technicians.create.mockReturnValueOnce(throwError(() => new Error('down')));
      start();
      fillForm(validValues);

      submit();

      expect(message()).toMatchObject({ variant: 'error', message: 'Error al crear el técnico.' });
      expect(navigate).not.toHaveBeenCalled();
      expect(submitButton().disabled).toBe(false);

      submit();
      expect(technicians.create).toHaveBeenCalledTimes(2);
    });

    describe('validation', () => {
      it.each([
        ['legajo', { legajo: '' }],
        ['firstName', { firstName: '' }],
        ['lastName', { lastName: '' }],
        ['specialty', { specialty: '' }],
        ['teamType', { teamType: '' }],
      ])('does not send with an empty %s and shows its error', (id, override) => {
        expect.assertions(3);
        start();

        fillForm({ ...validValues, ...override });
        submit();

        expect(technicians.create).not.toHaveBeenCalled();
        expect(field(id).getAttribute('aria-invalid')).toBe('true');
        expect(fixture.nativeElement.querySelector(`#${id}-error`)).not.toBeNull();
      });

      it.each([
        ['letters', '12a'],
        ['a path', '../users'],
        ['a space inside', '10 01'],
        ['nine digits', '123456789'],
        ['a sign', '-1'],
      ])('does not send a legajo with %s', (_label, legajo) => {
        expect.assertions(2);
        start();

        fillForm({ ...validValues, legajo });
        submit();

        expect(technicians.create).not.toHaveBeenCalled();
        expect(text()).toContain('El legajo es obligatorio y debe tener entre 1 y 8 dígitos.');
      });

      it.each(['1', '0042', '12345678'])('accepts the legajo %s', (legajo) => {
        start();

        fillForm({ ...validValues, legajo });
        submit();

        expect(technicians.create).toHaveBeenCalledWith(expect.objectContaining({ legajo }));
      });

      it.each([
        ['firstName', 'Nombre'],
        ['lastName', 'Apellido'],
      ])('does not accept a %s made of spaces', (id) => {
        expect.assertions(2);
        start();

        fillForm({ ...validValues, [id]: '   ' });
        submit();

        expect(technicians.create).not.toHaveBeenCalled();
        expect(field(id).getAttribute('aria-invalid')).toBe('true');
      });

      it('shows no errors before the user touches anything', () => {
        start();

        expect(fixture.nativeElement.querySelector('.form-error')).toBeNull();
      });

      it('shows every error at once when submitting an empty form', () => {
        start();

        submit();

        expect(fixture.nativeElement.querySelectorAll('.form-error')).toHaveLength(5);
      });
    });

    describe('double submit protection', () => {
      it('sends a single request when submitted twice while it is in flight', () => {
        expect.assertions(4);
        const inFlight = new Subject<Technician>();
        technicians.create.mockReturnValue(inFlight);
        start();
        fillForm(validValues);

        submit();
        submit();

        expect(technicians.create).toHaveBeenCalledTimes(1);
        expect(submitButton().disabled).toBe(true);
        expect(submitButton().textContent).toContain('Guardando...');

        inFlight.next({ ...ana, legajo: '1004', id: '1004' });
        inFlight.complete();
        fixture.detectChanges();
        expect(submitButton().disabled).toBe(false);
      });

      it('unlocks the form after a failure so it can be retried', () => {
        const inFlight = new Subject<Technician>();
        technicians.create.mockReturnValueOnce(inFlight);
        start();
        fillForm(validValues);
        submit();

        inFlight.error(new Error('down'));
        fixture.detectChanges();

        expect(submitButton().disabled).toBe(false);
      });
    });

    describe('permissions', () => {
      it.each([
        ['personal-produccion', produccion],
        ['no session', null],
      ])('%s cannot create: warning and no request', (_label, user) => {
        expect.assertions(3);
        start(user);

        fillForm(validValues);
        submit();

        expect(technicians.create).not.toHaveBeenCalled();
        expect(message()).toMatchObject({
          variant: 'warning',
          title: 'Acceso denegado',
          message: 'No tiene permiso para crear técnicos.',
        });
        expect(navigate).not.toHaveBeenCalled();
      });
    });

    it('goes back to the list with the back button', () => {
      start();

      const back: HTMLButtonElement | undefined = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((button) => button.textContent?.includes('Volver a Lista'));
      back?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/technicians']);
    });
  });

  describe('create mode against the real service', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      configure(null, [provideHttpClient(), provideHttpClientTesting()]);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('creates the technician without creating a login user for it', () => {
      expect.assertions(2);
      start();

      fillForm(validValues);
      submit();
      httpMock
        .expectOne(`${API_BASE_URL}/tecnicos/1004`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      const post = httpMock.expectOne({ method: 'POST', url: `${API_BASE_URL}/tecnicos` });
      expect(post.request.body).toMatchObject({ id: '1004', legajo: '1004' });
      post.flush(post.request.body);

      expect(navigate).toHaveBeenCalledWith(['/maintenance/technicians']);
      httpMock.expectNone((req) => req.url.startsWith(`${API_BASE_URL}/users`));
    });

    it('shows the duplicated legajo error when the master already has it', () => {
      expect.assertions(1);
      start();

      fillForm(validValues);
      submit();
      httpMock.expectOne(`${API_BASE_URL}/tecnicos/1004`).flush({ ...ana, legajo: '1004' });
      fixture.detectChanges();

      expect(text()).toContain('Ya existe un técnico con ese legajo.');
      httpMock.expectNone({ method: 'POST', url: `${API_BASE_URL}/tecnicos` });
    });
  });

  describe('edit mode', () => {
    beforeEach(() => configure('1001'));

    it('loads the technician by the legajo of the route and fills the form', () => {
      expect.assertions(6);
      start();

      expect(technicians.findByLegajo).toHaveBeenCalledExactlyOnceWith('1001');
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Editar técnico');
      expect(field<HTMLInputElement>('legajo').value).toBe('1001');
      expect(field<HTMLInputElement>('firstName').value).toBe('Ana');
      expect(field<HTMLSelectElement>('specialty').value).toBe('mecanico');
      expect(field<HTMLSelectElement>('teamType').value).toBe('guardia');
    });

    it('keeps the legajo disabled', () => {
      start();

      expect(field<HTMLInputElement>('legajo').disabled).toBe(true);
    });

    it('sends the changes to that legajo and goes back to the list', () => {
      expect.assertions(4);
      start();

      fillForm({ firstName: 'Ana María', specialty: 'general' });
      submit();

      expect(technicians.update).toHaveBeenCalledExactlyOnceWith('1001', {
        firstName: 'Ana María',
        lastName: 'Ruiz',
        specialty: 'general',
        teamType: 'guardia',
      });
      expect(message()).toMatchObject({ variant: 'success' });
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/maintenance/technicians']);
      expect(technicians.create).not.toHaveBeenCalled();
    });

    it('never changes the legajo, even if the control is forced to another value', () => {
      expect.assertions(2);
      start();

      component.form.controls.legajo.enable();
      component.form.controls.legajo.setValue('9999');
      fillForm({ lastName: 'Ruiz Díaz' });
      submit();

      expect(technicians.update).toHaveBeenCalledExactlyOnceWith('1001', expect.any(Object));
      expect(technicians.update.mock.calls[0]?.[1]).not.toHaveProperty('legajo');
    });

    it('warns and sends nothing when nothing changed', () => {
      expect.assertions(3);
      start();

      submit();

      expect(technicians.update).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        message: 'No hubo cambios en el técnico',
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not count surrounding spaces as a change', () => {
      start();

      fillForm({ firstName: '  Ana ' });
      submit();

      expect(technicians.update).not.toHaveBeenCalled();
    });

    it('does not send an invalid edit', () => {
      expect.assertions(2);
      start();

      fillForm({ firstName: '' });
      submit();

      expect(technicians.update).not.toHaveBeenCalled();
      expect(field('firstName').getAttribute('aria-invalid')).toBe('true');
    });

    it('reports an error and stays on the form when the update fails', () => {
      expect.assertions(3);
      technicians.update.mockReturnValue(throwError(() => new Error('down')));
      start();

      fillForm({ lastName: 'Nuevo' });
      submit();

      expect(message()).toMatchObject({
        variant: 'error',
        message: 'Error al actualizar el técnico.',
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(submitButton().disabled).toBe(false);
    });

    it('sends a single update when submitted twice while it is in flight', () => {
      const inFlight = new Subject<Technician>();
      technicians.update.mockReturnValue(inFlight);
      start();
      fillForm({ lastName: 'Nuevo' });

      submit();
      submit();

      expect(technicians.update).toHaveBeenCalledTimes(1);
    });

    it('team leader can edit', () => {
      start(teamLeader);

      fillForm({ lastName: 'Nuevo' });
      submit();

      expect(technicians.update).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s cannot edit: warning and no request', (_label, user) => {
      expect.assertions(2);
      start(user);

      fillForm({ lastName: 'Nuevo' });
      submit();

      expect(technicians.update).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        message: 'No tiene permiso para modificar técnicos.',
      });
    });

    describe('loading states', () => {
      it('shows "not found" without the form when the technician does not exist', () => {
        expect.assertions(3);
        technicians.findByLegajo.mockReturnValue(of(null));
        start();

        expect(text()).toContain('Técnico no encontrado');
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
        expect(technicians.update).not.toHaveBeenCalled();
      });

      it('shows a connection error, not "not found", when the lookup fails', () => {
        expect.assertions(3);
        technicians.findByLegajo.mockReturnValue(throwError(() => new Error('down')));
        start();

        expect(text()).toContain('Error de conexión');
        expect(text()).not.toContain('Técnico no encontrado');
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
      });

      it('retry loads the technician again and shows the form', () => {
        expect.assertions(3);
        technicians.findByLegajo.mockReturnValueOnce(throwError(() => new Error('down')));
        start();
        expect(fixture.nativeElement.querySelector('form')).toBeNull();

        const retry: HTMLButtonElement | undefined = Array.from<HTMLButtonElement>(
          fixture.nativeElement.querySelectorAll('button'),
        ).find((button) => button.textContent?.includes('Reintentar'));
        retry?.click();
        fixture.detectChanges();

        expect(technicians.findByLegajo).toHaveBeenCalledTimes(2);
        expect(field<HTMLInputElement>('firstName').value).toBe('Ana');
      });

      it('does not show the form until the technician is loaded', () => {
        expect.assertions(2);
        const pending = new Subject<Technician | null>();
        technicians.findByLegajo.mockReturnValue(pending);
        start();
        expect(fixture.nativeElement.querySelector('form')).toBeNull();

        pending.next(ana);
        pending.complete();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
      });
    });
  });
});
