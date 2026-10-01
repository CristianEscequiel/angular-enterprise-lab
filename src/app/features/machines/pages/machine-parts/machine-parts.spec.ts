import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { AuthUser, TechnicianUser, UserRole } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import {
  createMachinesApi,
  MachinesApi,
  provideMachinesApi,
  Row,
} from '../../testing/machines-api.fake';
import { signal } from '@angular/core';
import { Part, PartNode } from '../../models/part.model';
import { MachineParts } from './machine-parts';

// La página con los servicios REALES (`MachinesService`, `PartsService`) sobre un servidor en memoria
// que cumple el contrato de la API: lo que se afirma sobre los pedidos y sobre el estado del "servidor"
// es lo que pasaría de verdad, y los cambios de "otro usuario" se simulan tocando ese estado.
describe('MachineParts', () => {
  let fixture: ComponentFixture<MachineParts>;
  let component: MachineParts;
  let api: MachinesApi;
  let navigate: ReturnType<typeof vi.spyOn>;

  const machine = (id: string, code: string, name: string): Row => ({ id, code, name });
  const part = (id: string, parentId: string | null, name: string, machineId = 'srv-1'): Row => ({
    id,
    machineId,
    parentId,
    name,
  });

  // Envasadora:
  //   Mesa de transporte
  //   ├─ Cinta 1 ─ Motor de cinta        (hoja de nivel 3)
  //   └─ Cinta 2                         (hoja de nivel 2)
  //   Cabezal de sellado
  const seed = () => ({
    machines: [
      machine('srv-1', 'ENV-01', 'Envasadora'),
      machine('srv-2', 'SEL-02', 'Selladora'),
      machine('srv-3', 'ROT-03', 'Rotuladora'),
    ],
    parts: [
      part('p1', null, 'Mesa de transporte'),
      part('p2', 'p1', 'Cinta 1'),
      part('p3', 'p2', 'Motor de cinta'),
      part('p4', 'p1', 'Cinta 2'),
      part('p5', null, 'Cabezal de sellado'),
      part('x1', null, 'Parte ajena', 'srv-2'),
    ],
  });

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
  const currentUser = signal<AuthUser | null>(administrador);

  function configure(id: string | null = 'srv-1', data: ReturnType<typeof seed> = seed()): void {
    api = createMachinesApi(data);
    currentUser.set(administrador);

    TestBed.configureTestingModule({
      imports: [MachineParts],
      providers: [
        provideRouter([]),
        provideMachinesApi(api),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) } },
        },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  async function start(user: AuthUser | null = administrador): Promise<void> {
    currentUser.set(user);
    fixture = TestBed.createComponent(MachineParts);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  const message = () => TestBed.inject(MessageService).message();
  const text = (): string => fixture.nativeElement.textContent ?? '';
  const stored = (): Row[] => api.db.parts ?? [];
  const writes = () => api.requests.filter((request) => request.method !== 'GET');

  const treeItems = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="treeitem"]'));
  const nameOf = (element: Element | null | undefined): string =>
    element?.querySelector(':scope > .part-tree__row .part-tree__name')?.textContent?.trim() ?? '';
  const item = (name: string): HTMLElement => {
    const found = treeItems().find((element) => nameOf(element) === name);
    if (!found) throw new Error(`No se renderizó la parte "${name}"`);
    return found;
  };
  const shownNames = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.part-tree__name')).map(
      (el) => (el as HTMLElement).textContent?.trim() ?? '',
    );
  const levelOf = (name: string): string | null => item(name).getAttribute('aria-level');
  const parentNameOf = (name: string): string =>
    nameOf(item(name).parentElement?.closest('[role="treeitem"]'));

  const treeButton = (partName: string, label: string): HTMLButtonElement => {
    const button = item(partName).querySelector<HTMLButtonElement>(
      `:scope > .part-tree__row button[aria-label="${label}"]`,
    );
    if (!button) throw new Error(`No hay un botón "${label}" en "${partName}"`);
    return button;
  };
  const buttonByText = (label: string): HTMLButtonElement | undefined =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label,
    );
  const nameField = (): HTMLInputElement => {
    const input = fixture.nativeElement.querySelector('#part-name');
    if (!input) throw new Error('No está el panel de edición');
    return input;
  };

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await settle();
  }

  async function typeName(value: string): Promise<void> {
    nameField().value = value;
    nameField().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function submitPanel(): Promise<void> {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  async function confirmDeletion(): Promise<void> {
    const confirmButton = fixture.nativeElement.querySelector('[role="dialog"] .btn--danger');
    if (!confirmButton) throw new Error('No se abrió la confirmación de eliminación');
    await click(confirmButton);
  }

  const nodeOf = (id: string): PartNode => ({
    part: stored().find((row) => row.id === id) as unknown as Part,
    children: [],
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('loading', () => {
    beforeEach(() => configure());

    it('shows the machine and its whole tree, in hierarchical order', async () => {
      await start();

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
        'Partes de Envasadora (ENV-01)',
      );
      expect(shownNames()).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Motor de cinta',
        'Cinta 2',
        'Cabezal de sellado',
      ]);
      expect(levelOf('Motor de cinta')).toBe('3');
    });

    it('does not show the parts of another machine', async () => {
      await start();

      expect(shownNames()).not.toContain('Parte ajena');
    });

    it('reads the machine and then all the parts, and writes nothing', async () => {
      await start();

      expect(api.requestsTo('GET', '/machines/srv-1')).toHaveLength(1);
      expect(api.requestsTo('GET', '/machines/srv-1/parts')).toHaveLength(1);
      expect(writes()).toEqual([]);
    });

    it('shows the empty state, with the add button, for a machine without parts', async () => {
      TestBed.resetTestingModule();
      configure('srv-3');
      await start();

      expect(text()).toContain('Esta máquina todavía no tiene partes.');
      expect(buttonByText('Agregar parte')).toBeDefined();
    });

    describe('errors', () => {
      it('says the machine does not exist, with a retry', async () => {
        TestBed.resetTestingModule();
        configure('no-existe');
        await start();

        expect(text()).toContain('Máquina no encontrada');
        expect(text()).not.toContain('Error de conexión');
        expect(fixture.nativeElement.querySelector('[role="tree"]')).toBeNull();
        expect(buttonByText('Agregar parte')).toBeUndefined();
      });

      it('retries a machine that was not found and shows it once it exists', async () => {
        api.db.machines?.splice(0, 1);
        await start();
        expect(text()).toContain('Máquina no encontrada');
        api.db.machines?.unshift(machine('srv-1', 'ENV-01', 'Envasadora'));

        await click(buttonByText('Reintentar')!);

        expect(text()).not.toContain('Máquina no encontrada');
        expect(shownNames()).toHaveLength(5);
      });

      it('says it could not connect when the server fails, which is not "does not exist"', async () => {
        api.fail('GET', '/machines/srv-1', 500);
        await start();

        expect(text()).toContain('Error de conexión');
        expect(text()).not.toContain('Máquina no encontrada');
      });

      it('says it could not connect when the parts cannot be read', async () => {
        api.fail('GET', '/machines/srv-1/parts', 500);
        await start();

        expect(text()).toContain('Error de conexión');
        expect(fixture.nativeElement.querySelector('[role="tree"]')).toBeNull();
      });

      it('retries and shows the tree once the server is back', async () => {
        api.fail('GET', '/machines/srv-1', 500);
        await start();
        api.clearFailures();

        await click(buttonByText('Reintentar')!);

        expect(text()).not.toContain('Error de conexión');
        expect(shownNames()).toHaveLength(5);
      });

      it('treats a route without an id as a machine that does not exist', async () => {
        TestBed.resetTestingModule();
        configure(null);
        await start();

        expect(text()).toContain('Máquina no encontrada');
        expect(api.requests).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('adding parts', () => {
    beforeEach(async () => {
      configure();
      await start();
    });

    describe('a first-level part', () => {
      it('opens the panel with its title and the name field', async () => {
        await click(buttonByText('Agregar parte')!);

        expect(text()).toContain('Nueva parte de primer nivel');
        expect(nameField().value).toBe('');
      });

      it('creates it with parentId null and shows it as a root', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await submitPanel();

        const post = api.requestsTo('POST', '/machines/srv-1/parts')[0];
        expect(post?.body).toEqual({ name: 'Tolva', parentId: null });
        expect(levelOf('Tolva')).toBe('1');
        expect(message()).toMatchObject({
          variant: 'success',
          message: 'Parte creada satisfactoriamente.',
        });
      });

      it('closes the panel and selects the new part', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await submitPanel();

        expect(fixture.nativeElement.querySelector('#part-name')).toBeNull();
        expect(item('Tolva').getAttribute('aria-selected')).toBe('true');
      });

      it('puts the new part last among the roots (creation order)', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await submitPanel();

        expect(shownNames().at(-1)).toBe('Tolva');
      });
    });

    describe('a sub-part', () => {
      // Criterio 1 del spec: crecer un nivel más debajo de una hoja de nivel 3.
      it('adds a child to a level-3 leaf: it is created with that parentId and shows at level 4', async () => {
        expect(levelOf('Motor de cinta')).toBe('3');

        await click(treeButton('Motor de cinta', 'Agregar sub-parte a Motor de cinta'));
        expect(text()).toContain('Nueva sub-parte de "Motor de cinta"');
        await typeName('Rodamiento');
        await submitPanel();

        expect(api.requestsTo('POST', '/machines/srv-1/parts')[0]?.body).toEqual({
          parentId: 'p3',
          name: 'Rodamiento',
        });
        expect(levelOf('Rodamiento')).toBe('4');
        expect(parentNameOf('Rodamiento')).toBe('Motor de cinta');
        expect(shownNames()).toEqual([
          'Mesa de transporte',
          'Cinta 1',
          'Motor de cinta',
          'Rodamiento',
          'Cinta 2',
          'Cabezal de sellado',
        ]);
      });

      it('adds a child to a leaf of level 2 and to a root', async () => {
        await click(treeButton('Cinta 2', 'Agregar sub-parte a Cinta 2'));
        await typeName('Tensor');
        await submitPanel();
        await click(treeButton('Cabezal de sellado', 'Agregar sub-parte a Cabezal de sellado'));
        await typeName('Resistencia');
        await submitPanel();

        expect(parentNameOf('Tensor')).toBe('Cinta 2');
        expect(levelOf('Tensor')).toBe('3');
        expect(parentNameOf('Resistencia')).toBe('Cabezal de sellado');
      });

      it('reads the tree again from the server after saving', async () => {
        const readsBefore = api.requestsTo('GET', '/machines/srv-1/parts').length;

        await click(treeButton('Motor de cinta', 'Agregar sub-parte a Motor de cinta'));
        await typeName('Rodamiento');
        await submitPanel();

        expect(api.requestsTo('GET', '/machines/srv-1/parts').length).toBeGreaterThan(readsBefore);
      });

      it('shows what another user added meanwhile, not just what this screen created', async () => {
        stored().push(part('otro', 'p1', 'Agregada por otro'));

        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await submitPanel();

        expect(shownNames()).toContain('Agregada por otro');
        expect(shownNames()).toContain('Tolva');
      });
    });

    describe('the name', () => {
      it('is trimmed before it is sent', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('   Tolva  ');
        await submitPanel();

        expect(api.requestsTo('POST', '/machines/srv-1/parts')[0]?.body).toMatchObject({
          name: 'Tolva',
        });
      });

      it.each([
        ['empty', ''],
        ['blank', '     '],
      ])('cannot be %s: nothing is sent and the error is shown', async (_label, value) => {
        await click(buttonByText('Agregar parte')!);
        await typeName(value);
        await submitPanel();

        expect(writes()).toEqual([]);
        expect(text()).toContain('El nombre es obligatorio.');
        expect(nameField().getAttribute('aria-invalid')).toBe('true');
        // El panel sigue abierto para corregirlo.
        expect(text()).toContain('Nueva parte de primer nivel');
      });

      it('does not show an error before the user touches the field', async () => {
        await click(buttonByText('Agregar parte')!);

        expect(text()).not.toContain('El nombre es obligatorio.');
      });

      it('lets the user type the name again after an empty attempt', async () => {
        await click(buttonByText('Agregar parte')!);
        await submitPanel();
        await typeName('Tolva');
        await submitPanel();

        expect(shownNames()).toContain('Tolva');
      });
    });

    describe('the panel', () => {
      it('is cancelled without sending anything', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');

        await click(buttonByText('Cancelar')!);

        expect(fixture.nativeElement.querySelector('#part-name')).toBeNull();
        expect(writes()).toEqual([]);
      });

      it('starts empty the next time it is opened, not with the previous text', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await click(buttonByText('Cancelar')!);

        await click(buttonByText('Agregar parte')!);

        expect(nameField().value).toBe('');
      });

      it('moves the focus to the name field when it opens', async () => {
        await click(buttonByText('Agregar parte')!);
        await new Promise((resolve) => setTimeout(resolve));

        expect(document.activeElement).toBe(nameField());
      });

      it('has no panel title while no panel is open', () => {
        expect(component.editor()).toBeNull();
        expect(component.editorTitle()).toBe('');
      });

      it('addPart refuses a blank name when called directly, without sending anything', () => {
        component.addPart(null, '   ');
        component.addPart('p3', '');

        expect(writes()).toEqual([]);
      });

      it('addPart ignores a call while another save is in flight, even without the panel', () => {
        component.isSubmitting.set(true);

        component.addPart(null, 'Tolva');
        component.addPart('p3', 'Rodamiento');

        expect(writes()).toEqual([]);
      });

      it('ignores a second submit while a save is in flight', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        component.isSubmitting.set(true);

        await submitPanel();

        expect(writes()).toEqual([]);
      });
    });

    describe('when something changed meanwhile or fails', () => {
      it('a parent deleted by another user: the API refuses the POST, the page warns and shows the tree as it is now', async () => {
        await click(treeButton('Cinta 2', 'Agregar sub-parte a Cinta 2'));
        await typeName('Tensor');
        stored().splice(
          stored().findIndex((row) => row.id === 'p4'),
          1,
        );

        await submitPanel();

        expect(message()).toMatchObject({ variant: 'warning', title: 'No se pudo guardar' });
        expect(api.requestsTo('POST', '/machines/srv-1/parts')).toHaveLength(1);
        expect(shownNames()).not.toContain('Cinta 2');
        expect(fixture.nativeElement.querySelector('#part-name')).toBeNull();
      });

      it('the machine deleted by another user: says so and shows the not-found state', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        api.db.machines?.splice(0, 1);

        await submitPanel();

        expect(message()).toMatchObject({ variant: 'error', message: 'La máquina ya no existe.' });
        expect(text()).toContain('Máquina no encontrada');
        expect(api.requestsTo('POST', '/machines/srv-1/parts')).toHaveLength(1);
      });

      it('a server failure on the POST: generic error, nothing stored, the panel stays open to retry', async () => {
        api.fail('POST', '/machines/srv-1/parts', 500);
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');

        await submitPanel();

        expect(message()).toMatchObject({ variant: 'error', message: 'Error al crear la parte.' });
        expect(stored().some((row) => row['name'] === 'Tolva')).toBe(false);
        expect(nameField().value).toBe('Tolva');
      });

      it('keeps what it had, and says so, when the tree cannot be refreshed after saving', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        api.fail('GET', '/machines/srv-1/parts', 500);

        await submitPanel();

        expect(stored().some((row) => row['name'] === 'Tolva')).toBe(true);
        expect(message()).toMatchObject({
          variant: 'error',
          message: 'No se pudo actualizar el árbol. Recargá la página.',
        });
        expect(shownNames()).toHaveLength(5);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('renaming parts', () => {
    beforeEach(async () => {
      configure();
      await start();
    });

    it('opens the panel with the current name', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));

      expect(text()).toContain('Renombrar "Motor de cinta"');
      expect(nameField().value).toBe('Motor de cinta');
    });

    it('sends only { name } and keeps the part in its place', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('Motor principal');
      await submitPanel();

      const patch = api.requestsTo('PATCH', '/parts/p3')[0];
      expect(patch?.body).toEqual({ name: 'Motor principal' });
      expect(Object.keys(patch?.body as object)).toEqual(['name']);
      expect(levelOf('Motor principal')).toBe('3');
      expect(parentNameOf('Motor principal')).toBe('Cinta 1');
      expect(message()).toMatchObject({
        variant: 'success',
        message: 'Parte actualizada correctamente.',
      });
    });

    it('never changes where the part hangs: machineId and parentId stay as they were', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('Motor principal');
      await submitPanel();

      expect(stored().find((row) => row.id === 'p3')).toMatchObject({
        machineId: 'srv-1',
        parentId: 'p2',
        name: 'Motor principal',
      });
    });

    it('renamePart refuses a blank name when called directly, without sending anything', () => {
      component.renamePart('p3', '   ');

      expect(writes()).toEqual([]);
    });

    it('renamePart ignores a call while another save is in flight', () => {
      component.isSubmitting.set(true);

      component.renamePart('p3', 'Otro nombre');

      expect(writes()).toEqual([]);
    });

    it('says there are no changes and sends nothing when the name is the same', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('  Motor de cinta ');
      await submitPanel();

      expect(writes()).toEqual([]);
      expect(message()).toMatchObject({
        variant: 'warning',
        message: 'No hubo cambios en la parte',
      });
    });

    it('cannot be renamed to an empty name', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('   ');
      await submitPanel();

      expect(writes()).toEqual([]);
      expect(text()).toContain('El nombre es obligatorio.');
    });

    it('a part deleted by another user: warns and shows the tree as it is now', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('Motor principal');
      stored().splice(
        stored().findIndex((row) => row.id === 'p3'),
        1,
      );

      await submitPanel();

      expect(message()).toMatchObject({ variant: 'warning', title: 'No se pudo guardar' });
      expect(shownNames()).not.toContain('Motor de cinta');
      expect(shownNames()).not.toContain('Motor principal');
    });

    it('a server failure: generic error and the panel stays open', async () => {
      api.fail('PATCH', '/parts/p3', 500);
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));
      await typeName('Motor principal');

      await submitPanel();

      expect(message()).toMatchObject({
        variant: 'error',
        message: 'Error al actualizar la parte.',
      });
      expect(nameField().value).toBe('Motor principal');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('deleting parts (criterio 2: never leave orphans)', () => {
    beforeEach(async () => {
      configure();
      await start();
    });

    it('asks for confirmation naming the part, and deletes nothing until it is confirmed', async () => {
      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));

      const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
      expect(dialog.textContent).toContain('Cinta 2');
      expect(writes()).toEqual([]);
    });

    it('does not delete when the confirmation is cancelled', async () => {
      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));
      await click(buttonByText('Cancelar')!);

      expect(writes()).toEqual([]);
      expect(shownNames()).toContain('Cinta 2');
    });

    it('deletes a leaf, says so and shows the tree without it', async () => {
      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));
      await confirmDeletion();

      expect(api.requestsTo('DELETE', '/parts/p4')).toHaveLength(1);
      expect(shownNames()).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Motor de cinta',
        'Cabezal de sellado',
      ]);
      expect(message()).toMatchObject({
        variant: 'success',
        message: 'Parte eliminada satisfactoriamente.',
      });
    });

    it('warns in the confirmation that a part with sub-parts cannot be deleted before them', async () => {
      await click(treeButton('Cinta 1', 'Eliminar Cinta 1'));

      const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
      expect(dialog.textContent).toContain('Tiene sub-partes');
    });

    it('a part WITH sub-parts is blocked by the API (409): warns and the tree stays the same', async () => {
      const before = shownNames();

      await click(treeButton('Cinta 1', 'Eliminar Cinta 1'));
      await confirmDeletion();

      expect(message()).toMatchObject({ variant: 'warning', title: 'No se puede eliminar' });
      expect(message()?.message).toContain('1 sub-parte');
      expect(api.requestsTo('DELETE', '/parts/p2')).toHaveLength(1);
      expect(shownNames()).toEqual(before);
      expect(stored().some((row) => row.id === 'p3' && row['parentId'] === 'p2')).toBe(true);
    });

    it('a leaf that another user just turned into a parent is blocked and the new child appears', async () => {
      stored().push(part('nueva', 'p4', 'Hija de Cinta 2'));

      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));
      await confirmDeletion();

      expect(message()).toMatchObject({ variant: 'warning', title: 'No se puede eliminar' });
      expect(api.requestsTo('DELETE', '/parts/p4')).toHaveLength(1);
      expect(shownNames()).toContain('Hija de Cinta 2');
    });

    it('empties a branch from the leaves up, leaving no orphan at any step', async () => {
      for (const name of ['Motor de cinta', 'Cinta 1', 'Cinta 2', 'Mesa de transporte']) {
        await click(treeButton(name, `Eliminar ${name}`));
        await confirmDeletion();

        expect(message()?.variant).toBe('success');
        expect(component.orphans()).toEqual([]);
      }

      expect(shownNames()).toEqual(['Cabezal de sellado']);
    });

    it('a part already deleted by another user: warns and shows the tree as it is now', async () => {
      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));
      stored().splice(
        stored().findIndex((row) => row.id === 'p4'),
        1,
      );

      await confirmDeletion();

      expect(message()).toMatchObject({ variant: 'warning', title: 'No se pudo guardar' });
      expect(shownNames()).not.toContain('Cinta 2');
    });

    it('a server failure: generic error and the tree is left as it was', async () => {
      api.fail('DELETE', '/parts/p4', 500);
      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));

      await confirmDeletion();

      expect(message()).toMatchObject({ variant: 'error', message: 'Error al eliminar la parte.' });
      expect(shownNames()).toContain('Cinta 2');
    });

    it('clears the selection when the selected part is deleted', async () => {
      await click(item('Cinta 2').querySelector('.part-tree__name') as HTMLElement);
      expect(item('Cinta 2').getAttribute('aria-selected')).toBe('true');

      await click(treeButton('Cinta 2', 'Eliminar Cinta 2'));
      await confirmDeletion();

      expect(component.selectedId()).toBeNull();
    });

    it('closes a rename panel of the part that gets deleted, but keeps one for another part', async () => {
      await click(treeButton('Motor de cinta', 'Editar Motor de cinta'));

      component.deletePart('p4');
      await settle();

      expect(component.editor()).not.toBeNull();

      component.deletePart('p3');
      await settle();

      expect(component.editor()).toBeNull();
    });

    it('keeps a first-level panel open when some part is deleted', async () => {
      await click(buttonByText('Agregar parte')!);

      component.deletePart('p4');
      await settle();

      expect(text()).toContain('Nueva parte de primer nivel');
    });

    it('closes an open panel that was about to act on the deleted part', async () => {
      await click(treeButton('Cinta 2', 'Agregar sub-parte a Cinta 2'));
      component.deletePart('p4');
      await settle();

      expect(fixture.nativeElement.querySelector('#part-name')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('orphans (data broken by hand: they must not vanish from the view)', () => {
    beforeEach(async () => {
      const data = seed();
      data.parts.push(
        part('o1', 'no-existe', 'Suelta'),
        part('o2', 'o1', 'Nieta suelta'),
        part('o3', 'x1', 'Cruzada'),
      );
      configure('srv-1', data);
      await start();
    });

    it('warns with how many there are', async () => {
      expect(text()).toContain('Partes sin padre');
      expect(text()).toContain('3 partes no cuelgan');
    });

    it('lists them by name, so none is lost', async () => {
      expect(text()).toContain('Suelta');
      expect(text()).toContain('Nieta suelta');
      expect(text()).toContain('Cruzada');
    });

    it('keeps them out of the tree, which is not affected', async () => {
      expect(shownNames()).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Motor de cinta',
        'Cinta 2',
        'Cabezal de sellado',
      ]);
    });

    it('lets the manager delete an orphan leaf', async () => {
      const button = fixture.nativeElement.querySelector(
        'button[aria-label="Eliminar Nieta suelta (sin padre)"]',
      );

      await click(button);
      await confirmDeletion();

      expect(api.requestsTo('DELETE', '/parts/o2')).toHaveLength(1);
      expect(text()).toContain('2 partes no cuelgan');
      expect(text()).not.toContain('Nieta suelta');
    });

    it('blocks deleting an orphan that still has children', async () => {
      const button = fixture.nativeElement.querySelector(
        'button[aria-label="Eliminar Suelta (sin padre)"]',
      );

      await click(button);
      await confirmDeletion();

      expect(message()).toMatchObject({ title: 'No se puede eliminar' });
      expect(api.requestsTo('DELETE', '/parts/o1')).toHaveLength(1);
    });

    it('says "1 parte no cuelga" in the singular', async () => {
      TestBed.resetTestingModule();
      fixture.destroy();
      const data = seed();
      data.parts.push(part('o1', 'no-existe', 'Suelta'));
      configure('srv-1', data);
      await start();

      expect(text()).toContain('1 parte no cuelga');
    });

    it('shows the orphans to someone who cannot manage, but with no way to delete them', async () => {
      TestBed.resetTestingModule();
      fixture.destroy();
      const data = seed();
      data.parts.push(part('o1', 'no-existe', 'Suelta'));
      configure('srv-1', data);
      await start(userWithRole('personal-produccion'));

      expect(text()).toContain('Suelta');
      expect(fixture.nativeElement.querySelector('button[aria-label*="sin padre"]')).toBeNull();
    });

    it('shows no warning when the tree is healthy', async () => {
      TestBed.resetTestingModule();
      fixture.destroy();
      configure();
      await start();

      expect(text()).not.toContain('Partes sin padre');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // Criterio 3 del spec: solo `administrador` y `team-leader-mantenimiento` gestionan.
  describe('permissions', () => {
    describe.each(['administrador', 'team-leader-mantenimiento'] as const)('as %s', (role) => {
      beforeEach(async () => {
        configure();
        await start(userWithRole(role));
      });

      it('sees the add button, the edit-machine button and every action of the tree', () => {
        expect(buttonByText('Agregar parte')).toBeDefined();
        expect(buttonByText('Editar máquina')).toBeDefined();
        expect(fixture.nativeElement.querySelectorAll('app-part-tree app-button')).toHaveLength(
          5 * 3,
        );
      });

      it('can add a part', async () => {
        await click(buttonByText('Agregar parte')!);
        await typeName('Tolva');
        await submitPanel();

        expect(api.requestsTo('POST', '/machines/srv-1/parts')).toHaveLength(1);
      });
    });

    describe.each(['personal-produccion', 'tecnico'] as const)('as %s', (role) => {
      beforeEach(async () => {
        configure();
        await start(userWithRole(role));
      });

      it('still sees the tree, but no add button, no edit-machine button and no action', () => {
        expect(shownNames()).toHaveLength(5);
        expect(buttonByText('Agregar parte')).toBeUndefined();
        expect(buttonByText('Editar máquina')).toBeUndefined();
        expect(fixture.nativeElement.querySelectorAll('app-part-tree app-button')).toHaveLength(0);
      });

      // Aunque la interfaz no los muestre, los métodos no pueden depender de eso.
      it('addPart does NOT reach the service when invoked directly', () => {
        component.addPart(null, 'Tolva');
        component.addPart('p3', 'Rodamiento');

        expect(writes()).toEqual([]);
        expect(message()).toMatchObject({
          variant: 'warning',
          title: 'Acceso denegado',
          message: 'No tiene permiso para crear partes.',
        });
      });

      it('renamePart does NOT reach the service when invoked directly', () => {
        component.renamePart('p3', 'Otro nombre');

        expect(writes()).toEqual([]);
        expect(message()).toMatchObject({
          title: 'Acceso denegado',
          message: 'No tiene permiso para modificar partes.',
        });
      });

      it('deletePart does NOT reach the service when invoked directly', () => {
        component.deletePart('p4');

        expect(writes()).toEqual([]);
        expect(api.requestsTo('GET', '/machines/srv-1/parts')).toHaveLength(1);
        expect(message()).toMatchObject({
          title: 'Acceso denegado',
          message: 'No tiene permiso para eliminar partes.',
        });
      });

      it('cannot even open the panel or the confirmation', () => {
        component.startAddRoot();
        component.startAddChild(nodeOf('p3'));
        component.startRename(nodeOf('p3'));
        component.openDeleteModal(nodeOf('p4').part);
        fixture.detectChanges();

        expect(component.editor()).toBeNull();
        expect(component.deleteModalOpen()).toBe(false);
        expect(fixture.nativeElement.querySelector('#part-name')).toBeNull();
        expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
      });

      it('cannot save a panel that somehow got opened', () => {
        component.editor.set({ kind: 'add-root' });
        component.form.setValue({ name: 'Tolva' });

        component.savePart();

        expect(writes()).toEqual([]);
      });
    });

    it('a visitor without a session cannot write either', async () => {
      configure();
      await start(null);

      component.addPart(null, 'Tolva');
      component.renamePart('p3', 'X');
      component.deletePart('p4');

      expect(writes()).toEqual([]);
    });
  });

  describe('navigation', () => {
    beforeEach(async () => {
      configure();
      await start();
    });

    it('goes back to the list of machines', async () => {
      await click(buttonByText('Volver a Lista')!);

      expect(navigate).toHaveBeenCalledWith(['/machines']);
    });

    it('goes to the edit form of this machine', async () => {
      await click(buttonByText('Editar máquina')!);

      expect(navigate).toHaveBeenCalledWith(['/machines', 'srv-1', 'edit']);
    });

    it('has nothing to refresh when the route has no id: the deletion is the only request', async () => {
      TestBed.resetTestingModule();
      fixture.destroy();
      configure(null);
      fixture = TestBed.createComponent(MachineParts);
      component = fixture.componentInstance;

      component.deletePart('p4');
      await settle();

      expect(api.requestsTo('DELETE', '/parts/p4')).toHaveLength(1);
      // El borrado no lee nada antes (la API decide) y no hay árbol que recargar.
      expect(api.requestsTo('GET', '/machines/srv-1/parts')).toHaveLength(0);
    });

    it('does nothing to edit the machine when the route has no id', () => {
      TestBed.resetTestingModule();
      fixture.destroy();
      configure(null);
      fixture = TestBed.createComponent(MachineParts);
      component = fixture.componentInstance;

      component.navigateToEdit();

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
