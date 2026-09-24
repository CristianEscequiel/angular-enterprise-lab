import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { TeamLoadError, TeamsService } from '../../data-access/teams.service';
import { TechniciansService } from '../../data-access/technicians.service';
import { Team, TeamDraft } from '../../models/team.model';
import { Technician } from '../../models/technician.model';
import { TeamForm } from './team-form';

describe('TeamForm', () => {
  let fixture: ComponentFixture<TeamForm>;
  let component: TeamForm;
  let navigate: ReturnType<typeof vi.spyOn>;

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
  const master = [ana, luis];
  const guardia: Team = {
    id: '1',
    name: 'Guardia mecánica',
    type: 'guardia',
    memberLegajos: ['1001'],
  };

  const teams = {
    getById: vi.fn<(id: string) => Observable<Team>>(),
    create: vi.fn<(draft: TeamDraft) => Observable<Team>>(),
    update: vi.fn<(id: string, draft: TeamDraft) => Observable<Team>>(),
  };
  const technicians = {
    findByLegajo: vi.fn<(legajo: string) => Observable<Technician | null>>(),
    getAll: vi.fn<() => Observable<Technician[]>>(),
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

  function configure(id: string | null): void {
    teams.getById.mockReset().mockReturnValue(of(guardia));
    teams.create.mockReset().mockImplementation((draft) => of({ ...draft, id: '9' }));
    teams.update.mockReset().mockImplementation((teamId, draft) => of({ ...draft, id: teamId }));
    technicians.findByLegajo
      .mockReset()
      .mockImplementation((legajo) => of(master.find((t) => t.legajo === legajo) ?? null));
    technicians.getAll.mockReset().mockReturnValue(of(master));
    currentUser.set(teamLeader);

    TestBed.configureTestingModule({
      imports: [TeamForm],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) } },
        },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
        { provide: TeamsService, useValue: teams },
        { provide: TechniciansService, useValue: technicians },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  function start(user: AuthUser | null = teamLeader): void {
    currentUser.set(user);
    fixture = TestBed.createComponent(TeamForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';
  const feedback = (): string =>
    (fixture.nativeElement.querySelector('#member-feedback')?.textContent ?? '').trim();
  const legajoInput = (): HTMLInputElement => fixture.nativeElement.querySelector('#member-legajo');
  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');
  const buttonByText = (label: string): HTMLButtonElement | undefined =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label,
    );
  const addButton = (): HTMLButtonElement => {
    const button = buttonByText('Agregar');
    if (!button) throw new Error('No existe el botón Agregar');
    return button;
  };
  const memberItems = (): string[] =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.team-form__member')).map(
      (item) => item.querySelector('span')?.textContent?.trim() ?? '',
    );

  function typeLegajo(value: string): void {
    legajoInput().value = value;
    legajoInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  // Tipea y deja pasar el debounce: la consulta ya salió (o se resolvió si responde en el acto).
  function lookUp(value: string): void {
    typeLegajo(value);
    advance(300);
  }

  function fillTeam(name: string, type: string): void {
    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('#name');
    nameInput.value = name;
    nameInput.dispatchEvent(new Event('input'));
    const typeSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#type');
    typeSelect.value = type;
    typeSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function submit(): void {
    const form: HTMLFormElement | null = fixture.nativeElement.querySelector('form');
    if (!form) throw new Error('No hay formulario para enviar');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  describe('adding a technician by legajo (create mode)', () => {
    beforeEach(() => {
      configure(null);
      start();
    });

    it('validates in real time: "found" feedback shows before confirming, then Agregar adds the technician', () => {
      expect.assertions(9);

      typeLegajo('1001');
      // Antes de vencer la espera: todavía buscando, sin consulta y sin poder agregar.
      expect(feedback()).toBe('Buscando técnico…');
      expect(addButton().disabled).toBe(true);
      advance(299);
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
      advance(1);

      // Feedback de "encontrado" ANTES de confirmar; la lista todavía no cambió.
      expect(technicians.findByLegajo).toHaveBeenCalledExactlyOnceWith('1001');
      expect(feedback()).toBe('Técnico encontrado: Ruiz, Ana (Mecánico).');
      expect(memberItems()).toEqual([]);

      addButton().click();
      fixture.detectChanges();

      expect(memberItems()).toEqual(['Ruiz, Ana (legajo 1001)']);
      expect(legajoInput().value).toBe('');
      expect(feedback()).toBe('');
    });

    it('does not let a nonexistent legajo be added: says so, Agregar stays disabled', () => {
      expect.assertions(4);

      lookUp('9999');

      expect(feedback()).toBe('No existe un técnico con ese legajo.');
      expect(addButton().disabled).toBe(true);

      component.addTechnician();
      fixture.detectChanges();

      expect(memberItems()).toEqual([]);
      expect(component.memberLegajos()).toEqual([]);
    });

    it('blocks a legajo already in the team with a clear message and without asking the server', () => {
      expect.assertions(5);
      lookUp('1001');
      addButton().click();
      fixture.detectChanges();
      technicians.findByLegajo.mockClear();

      lookUp('1001');

      expect(feedback()).toBe('Ese técnico ya es miembro del equipo.');
      expect(addButton().disabled).toBe(true);
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#member-feedback').classList).toContain(
        'form-error',
      );
      expect(component.memberLegajos()).toEqual(['1001']);
    });

    it('never ends up with duplicated members, even if "found" is forced for a current member', () => {
      expect.assertions(3);
      lookUp('1001');
      addButton().click();
      fixture.detectChanges();

      component.lookup.set({ kind: 'found', technician: ana });
      component.addTechnician();

      expect(component.memberLegajos()).toEqual(['1001']);
      expect(component.lookup().kind).toBe('already-member');
      expect(memberItems()).toHaveLength(1);
    });

    it.each([
      ['letters', '12a'],
      ['a path', '../users'],
      ['nine digits', '123456789'],
      ['a sign', '-1'],
    ])('says the format is wrong for %s, without asking the server', (_label, value) => {
      expect.assertions(3);

      lookUp(value);

      expect(feedback()).toBe('El legajo debe tener entre 1 y 8 dígitos.');
      expect(addButton().disabled).toBe(true);
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
    });

    it('does not say "not found" when the lookup fails: it reports a connection problem and keeps working', () => {
      expect.assertions(4);
      technicians.findByLegajo.mockReturnValueOnce(throwError(() => new Error('down')));

      lookUp('1001');

      expect(feedback()).toBe('No se pudo verificar el legajo. Intentá nuevamente.');
      expect(feedback()).not.toContain('No existe');
      expect(addButton().disabled).toBe(true);

      // El flujo sigue vivo: el siguiente intento anda.
      lookUp('1002');
      expect(feedback()).toContain('Técnico encontrado: Paz, Luis');
    });

    it('clears a previous "found" as soon as the legajo changes, before any new lookup', () => {
      expect.assertions(4);
      lookUp('1001');
      expect(addButton().disabled).toBe(false);

      typeLegajo('1002');

      expect(feedback()).toBe('Buscando técnico…');
      expect(addButton().disabled).toBe(true);
      expect(technicians.findByLegajo).toHaveBeenCalledTimes(1);
    });

    it('waits for the user to stop typing: a burst of keystrokes sends a single request', () => {
      expect.assertions(2);

      typeLegajo('1');
      advance(100);
      typeLegajo('10');
      advance(100);
      typeLegajo('100');
      advance(100);
      typeLegajo('1001');
      advance(300);

      expect(technicians.findByLegajo).toHaveBeenCalledTimes(1);
      expect(technicians.findByLegajo).toHaveBeenCalledWith('1001');
    });

    it('goes back to idle when the field is cleared', () => {
      expect.assertions(3);
      lookUp('1001');

      typeLegajo('');

      expect(feedback()).toBe('');
      expect(addButton().disabled).toBe(true);
      // Vaciar el campo no consulta nada.
      advance(500);
      expect(technicians.findByLegajo).toHaveBeenCalledTimes(1);
    });

    describe('responses that arrive out of order', () => {
      it('keeps only the answer for the last legajo when an older response arrives late', () => {
        expect.assertions(4);
        const first = new Subject<Technician | null>();
        const second = new Subject<Technician | null>();
        technicians.findByLegajo.mockReturnValueOnce(first).mockReturnValueOnce(second);

        lookUp('1001');
        lookUp('1002');
        // La consulta vieja ya fue descartada.
        expect(first.observed).toBe(false);

        second.next(luis);
        fixture.detectChanges();
        expect(feedback()).toBe('Técnico encontrado: Paz, Luis (Electricista).');

        first.next(ana);
        fixture.detectChanges();
        expect(feedback()).toBe('Técnico encontrado: Paz, Luis (Electricista).');

        addButton().click();
        fixture.detectChanges();
        expect(component.memberLegajos()).toEqual(['1002']);
      });

      it('ignores the response of the previous legajo when it arrives while the new one is still being typed', () => {
        expect.assertions(4);
        const first = new Subject<Technician | null>();
        technicians.findByLegajo.mockReturnValueOnce(first);

        lookUp('1001');
        // El usuario cambia el legajo; todavía no venció la espera de la nueva consulta.
        typeLegajo('1002');
        first.next(ana);
        fixture.detectChanges();

        expect(first.observed).toBe(false);
        expect(feedback()).toBe('Buscando técnico…');
        expect(addButton().disabled).toBe(true);
        expect(component.memberLegajos()).toEqual([]);
      });
    });

    it('asks again when the user edits the legajo and goes back to the same value', () => {
      expect.assertions(3);
      lookUp('1001');
      expect(technicians.findByLegajo).toHaveBeenCalledTimes(1);

      typeLegajo('1001x');
      lookUp('1001');

      // No queda "buscando" para siempre: se volvió a resolver.
      expect(technicians.findByLegajo).toHaveBeenCalledTimes(2);
      expect(feedback()).toContain('Técnico encontrado: Ruiz, Ana');
    });

    it('does not restart the lookup because of surrounding spaces', () => {
      expect.assertions(3);
      lookUp('1001');

      typeLegajo(' 1001 ');
      advance(500);

      expect(technicians.findByLegajo).toHaveBeenCalledTimes(1);
      expect(feedback()).toContain('Técnico encontrado: Ruiz, Ana');
      expect(addButton().disabled).toBe(false);
    });

    it('does nothing when Agregar is triggered without a validated technician', () => {
      expect.assertions(2);
      typeLegajo('1001');

      component.addTechnician();

      expect(component.memberLegajos()).toEqual([]);
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
    });

    describe('Enter key in the legajo field', () => {
      it('adds the found technician and does not submit the whole team form', () => {
        expect.assertions(3);
        lookUp('1001');
        const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

        legajoInput().dispatchEvent(enter);
        fixture.detectChanges();

        expect(enter.defaultPrevented).toBe(true);
        expect(memberItems()).toEqual(['Ruiz, Ana (legajo 1001)']);
        expect(teams.create).not.toHaveBeenCalled();
      });

      it('adds nothing when the legajo is not validated, and still does not submit', () => {
        expect.assertions(3);
        lookUp('9999');
        const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

        legajoInput().dispatchEvent(enter);
        fixture.detectChanges();

        expect(enter.defaultPrevented).toBe(true);
        expect(memberItems()).toEqual([]);
        expect(teams.create).not.toHaveBeenCalled();
      });
    });

    describe('removing members', () => {
      it('Quitar removes only that member', () => {
        expect.assertions(2);
        lookUp('1001');
        addButton().click();
        lookUp('1002');
        addButton().click();
        fixture.detectChanges();
        expect(memberItems()).toHaveLength(2);

        const remove: HTMLButtonElement | null = fixture.nativeElement.querySelector(
          '[aria-label="Quitar Ruiz, Ana (legajo 1001)"]',
        );
        remove?.click();
        fixture.detectChanges();

        expect(memberItems()).toEqual(['Paz, Luis (legajo 1002)']);
      });

      it('shows a hint while there are no members', () => {
        expect(text()).toContain('Todavía no hay miembros en el equipo.');
      });

      it('makes a legajo addable again right after removing it, without retyping it', () => {
        expect.assertions(4);
        lookUp('1001');
        addButton().click();
        fixture.detectChanges();
        lookUp('1001');
        expect(feedback()).toBe('Ese técnico ya es miembro del equipo.');

        const remove: HTMLButtonElement | null = fixture.nativeElement.querySelector(
          '[aria-label="Quitar Ruiz, Ana (legajo 1001)"]',
        );
        remove?.click();
        advance(300);

        expect(feedback()).toContain('Técnico encontrado: Ruiz, Ana');
        expect(addButton().disabled).toBe(false);
        expect(memberItems()).toEqual([]);
      });
    });
  });

  describe('saving (create mode)', () => {
    beforeEach(() => {
      configure(null);
      start();
    });

    it('team leader creates the team with the members that were added, and goes back to the list', () => {
      expect.assertions(4);
      fillTeam('Guardia nocturna', 'guardia');
      lookUp('1001');
      addButton().click();
      lookUp('1002');
      addButton().click();

      submit();

      expect(teams.create).toHaveBeenCalledExactlyOnceWith({
        name: 'Guardia nocturna',
        type: 'guardia',
        memberLegajos: ['1001', '1002'],
      });
      expect(message()).toMatchObject({
        variant: 'success',
        message: 'Equipo creado satisfactoriamente.',
      });
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/maintenance/teams']);
      expect(teams.update).not.toHaveBeenCalled();
    });

    it('creates a team without members', () => {
      fillTeam('Equipo vacío', 'preventivo-correctivo');

      submit();

      expect(teams.create).toHaveBeenCalledExactlyOnceWith({
        name: 'Equipo vacío',
        type: 'preventivo-correctivo',
        memberLegajos: [],
      });
    });

    it('does not offer a default type: the user has to choose', () => {
      expect(component.form.controls.type.value).toBe('');
    });

    it.each([
      ['name', '', 'guardia'],
      ['a blank name', '   ', 'guardia'],
      ['type', 'Equipo', ''],
    ])('does not send with an empty %s and shows the error', (_label, name, type) => {
      expect.assertions(2);
      fillTeam(name, type);

      submit();

      expect(teams.create).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelectorAll('.form-error').length).toBeGreaterThan(0);
    });

    it('sends a single request when submitted twice while it is in flight, and unlocks after', () => {
      expect.assertions(4);
      const inFlight = new Subject<Team>();
      teams.create.mockReturnValue(inFlight);
      fillTeam('Equipo', 'guardia');

      submit();
      submit();

      expect(teams.create).toHaveBeenCalledTimes(1);
      expect(submitButton().disabled).toBe(true);
      expect(submitButton().textContent).toContain('Guardando...');

      inFlight.error(new Error('down'));
      fixture.detectChanges();
      expect(submitButton().disabled).toBe(false);
    });

    it('reports an error and stays on the form when creating fails', () => {
      expect.assertions(3);
      teams.create.mockReturnValueOnce(throwError(() => new Error('down')));
      fillTeam('Equipo', 'guardia');

      submit();

      expect(message()).toMatchObject({ variant: 'error', message: 'Error al crear el equipo.' });
      expect(navigate).not.toHaveBeenCalled();
      expect(submitButton().disabled).toBe(false);
    });

    it.each([
      ['administrador', administrador],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s cannot manage teams: warning and no request', (_label, user) => {
      expect.assertions(3);
      currentUser.set(user);
      fillTeam('Equipo', 'guardia');

      submit();

      expect(teams.create).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        title: 'Acceso denegado',
        message: 'No tiene permiso para crear equipos.',
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('goes back to the list with the back button', () => {
      buttonByText('Volver a Lista')?.click();

      expect(navigate).toHaveBeenCalledWith(['/maintenance/teams']);
    });
  });

  describe('edit mode', () => {
    beforeEach(() => configure('1'));

    it('loads the team by the id of the route with its name, type and members', () => {
      expect.assertions(5);
      start();

      expect(teams.getById).toHaveBeenCalledExactlyOnceWith('1');
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Editar equipo');
      expect((fixture.nativeElement.querySelector('#name') as HTMLInputElement).value).toBe(
        'Guardia mecánica',
      );
      expect((fixture.nativeElement.querySelector('#type') as HTMLSelectElement).value).toBe(
        'guardia',
      );
      expect(memberItems()).toEqual(['Ruiz, Ana (legajo 1001)']);
    });

    it('shows the legajo alone when the names of the technicians cannot be loaded', () => {
      expect.assertions(2);
      technicians.getAll.mockReturnValue(throwError(() => new Error('down')));
      start();

      expect(memberItems()).toEqual(['Legajo 1001']);
      expect(text()).not.toContain('No pudimos conectar');
    });

    it('recognizes an existing member as "ya es miembro" without asking the server', () => {
      expect.assertions(2);
      start();

      lookUp('1001');

      expect(feedback()).toBe('Ese técnico ya es miembro del equipo.');
      expect(technicians.findByLegajo).not.toHaveBeenCalled();
    });

    it('saves the added and removed members with one update to that team', () => {
      expect.assertions(3);
      start();

      lookUp('1002');
      addButton().click();
      fixture.detectChanges();
      (
        fixture.nativeElement.querySelector(
          '[aria-label="Quitar Ruiz, Ana (legajo 1001)"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      submit();

      expect(teams.update).toHaveBeenCalledExactlyOnceWith('1', {
        name: 'Guardia mecánica',
        type: 'guardia',
        memberLegajos: ['1002'],
      });
      expect(message()).toMatchObject({ variant: 'success' });
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/maintenance/teams']);
    });

    it('warns and sends nothing when nothing changed', () => {
      expect.assertions(3);
      start();

      submit();

      expect(teams.update).not.toHaveBeenCalled();
      expect(message()).toMatchObject({
        variant: 'warning',
        message: 'No hubo cambios en el equipo',
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('counts a change of the members alone as a change', () => {
      start();

      lookUp('1002');
      addButton().click();
      fixture.detectChanges();
      submit();

      expect(teams.update).toHaveBeenCalledTimes(1);
    });

    it('reports an error and stays when the update fails', () => {
      expect.assertions(2);
      teams.update.mockReturnValue(throwError(() => new Error('down')));
      start();
      fillTeam('Otro nombre', 'guardia');

      submit();

      expect(message()).toMatchObject({
        variant: 'error',
        message: 'Error al actualizar el equipo.',
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a role without permission cannot modify: warning and no request', () => {
      expect.assertions(2);
      start(administrador);
      fillTeam('Otro nombre', 'guardia');

      submit();

      expect(teams.update).not.toHaveBeenCalled();
      expect(message()?.message).toBe('No tiene permiso para modificar equipos.');
    });

    describe('loading states', () => {
      it('shows "not found" without the form when the team does not exist', () => {
        expect.assertions(3);
        teams.getById.mockReturnValue(throwError(() => new TeamLoadError('not-found', 'x')));
        start();

        expect(text()).toContain('Equipo no encontrado');
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
        expect(technicians.getAll).not.toHaveBeenCalled();
      });

      it('shows a connection error, not "not found", when loading fails', () => {
        expect.assertions(2);
        teams.getById.mockReturnValue(throwError(() => new TeamLoadError('connection', 'x')));
        start();

        expect(text()).toContain('Error de conexión');
        expect(text()).not.toContain('Equipo no encontrado');
      });

      it('treats any unexpected error as a connection problem', () => {
        teams.getById.mockReturnValue(throwError(() => new Error('boom')));
        start();

        expect(text()).toContain('Error de conexión');
      });

      it('retry loads the team again and shows the form', () => {
        expect.assertions(3);
        teams.getById.mockReturnValueOnce(throwError(() => new TeamLoadError('connection', 'x')));
        start();
        expect(fixture.nativeElement.querySelector('form')).toBeNull();

        buttonByText('Reintentar')?.click();
        fixture.detectChanges();

        expect(teams.getById).toHaveBeenCalledTimes(2);
        expect(memberItems()).toEqual(['Ruiz, Ana (legajo 1001)']);
      });

      it('does not show the form until the team is loaded', () => {
        expect.assertions(2);
        const pending = new Subject<Team>();
        teams.getById.mockReturnValue(pending);
        start();
        expect(fixture.nativeElement.querySelector('form')).toBeNull();

        pending.next(guardia);
        pending.complete();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
      });
    });
  });
});
