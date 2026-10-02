import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { MachinesService } from '@features/machines/data-access/machines.service';
import { PartsService } from '@features/machines/data-access/parts.service';
import { Machine } from '@features/machines/models/machine.model';
import { Part } from '@features/machines/models/part.model';
import { WorkOrderCreate } from './work-order-create';
import {
  WorkOrderMachineRefError,
  WorkOrdersService,
  WorkOrderValidationError,
} from '../../data-access/work-order.service';
import { WorkOrderFormValue } from '../../components/form/form';
import {
  WORK_ORDER_TYPES,
  WorkOrder,
  WorkOrderCreateRequest,
  WorkOrderType,
} from '../../models/work-order.model';

const MACHINES: Machine[] = [
  { id: '1', code: 'ENV-01', name: 'Envasadora línea 1', partCount: 0 },
  { id: '2', code: 'SEL-02', name: 'Selladora', partCount: 0 },
];

const PARTS_OF_MACHINE_1: Part[] = [
  { id: '1', machineId: '1', parentId: null, name: 'Mesa de transporte' },
  { id: '2', machineId: '1', parentId: '1', name: 'Cinta 1' },
  { id: '3', machineId: '1', parentId: '2', name: 'Motor de cinta' },
];

describe('WorkOrderCreate', () => {
  let component: WorkOrderCreate;
  let fixture: ComponentFixture<WorkOrderCreate>;

  // Lo que emite el formulario: la máquina/parte viaja como campos sueltos, sin breadcrumb.
  const payload: WorkOrderFormValue = {
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    machineId: '1',
    partId: null,
    comment: '',
    type: 'correctivo',
    priority: 'medium',
  };

  // Lo que la página le pide al servicio para ese envío.
  const expectedRequest: WorkOrderCreateRequest = {
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    machineRef: { machineId: '1', partId: null, comment: '' },
    type: 'correctivo',
    priority: 'medium',
  };

  const created: WorkOrder = {
    id: '1',
    ...expectedRequest,
    machineRef: { ...expectedRequest.machineRef, breadcrumb: 'Envasadora línea 1' },
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const workOrdersServiceMock = {
    create: vi.fn<(...args: unknown[]) => Observable<WorkOrder>>(),
  };
  const machinesServiceMock = {
    getAll: vi.fn<() => Observable<Machine[]>>(),
  };
  const partsServiceMock = {
    getByMachine: vi.fn<(machineId: string) => Observable<Part[]>>(),
  };
  const routerMock = {
    navigate: vi.fn(),
  };

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const produccion: AuthUser = {
    id: '4',
    username: 'produccion',
    displayName: 'Producción',
    email: 'produccion@enterprise-lab.dev',
    role: 'personal-produccion',
  };
  const currentUser = signal<AuthUser | null>(teamLeader);

  const message = () => TestBed.inject(MessageService).message();

  beforeEach(async () => {
    workOrdersServiceMock.create.mockReset().mockReturnValue(of(created));
    machinesServiceMock.getAll.mockReset().mockReturnValue(of(MACHINES));
    partsServiceMock.getByMachine
      .mockReset()
      .mockImplementation((machineId) => of(machineId === '1' ? PARTS_OF_MACHINE_1 : []));
    routerMock.navigate.mockReset();
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
      providers: [
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
        { provide: MachinesService, useValue: machinesServiceMock },
        { provide: PartsService, useValue: partsServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the machines and offers them in the selector', () => {
    const select = fixture.nativeElement.querySelector('#machine-select') as HTMLSelectElement;

    expect(machinesServiceMock.getAll).toHaveBeenCalledTimes(1);
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', '1', '2']);
  });

  it('creates the work order and navigates to the list on success', () => {
    component.onSubmit(payload);

    expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith(expectedRequest);
    expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
  });

  it('sends a single create request when a second submit arrives while the first is still pending', () => {
    const pending = new Subject<WorkOrder>();
    workOrdersServiceMock.create.mockReturnValue(pending);

    component.onSubmit(payload);
    component.onSubmit(payload);

    expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it('re-enables submitting after a failed create so a retry is possible', () => {
    expect.assertions(2);
    workOrdersServiceMock.create.mockReturnValueOnce(throwError(() => new Error('boom')));

    component.onSubmit(payload);
    expect(component.isSubmitting()).toBe(false);

    workOrdersServiceMock.create.mockReturnValueOnce(of(created));
    component.onSubmit(payload);
    expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(2);
  });

  it("reflects the pending state on the nested form's submit button", () => {
    expect.assertions(2);
    const pending = new Subject<WorkOrder>();
    workOrdersServiceMock.create.mockReturnValue(pending);

    component.onSubmit(payload);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const submitButton = buttons.find((button) => button.textContent?.includes('Guardando'));
    expect(submitButton).toBeDefined();
    expect(submitButton?.disabled).toBe(true);
  });

  describe('machine and part reference (spec 013d)', () => {
    const lastRequest = (): WorkOrderCreateRequest =>
      workOrdersServiceMock.create.mock.calls[0]?.[0] as WorkOrderCreateRequest;

    it('blocks the submit without a machine: no request, warning shown', () => {
      expect.assertions(3);

      component.onSubmit({ ...payload, machineId: '' });

      expect(workOrdersServiceMock.create).not.toHaveBeenCalled();
      expect(routerMock.navigate).not.toHaveBeenCalled();
      expect(message()?.variant).toBe('warning');
    });

    it('blocks the submit for a machine that is not in the loaded list', () => {
      component.onSubmit({ ...payload, machineId: '999' });

      expect(workOrdersServiceMock.create).not.toHaveBeenCalled();
    });

    // Sin excepción por tipo de orden. El mapa es exhaustivo: un tipo nuevo obliga a decidir qué rol
    // lo crea y a cubrirlo acá.
    const creatorOf: Record<WorkOrderType, AuthUser> = {
      preventivo: teamLeader,
      correctivo: teamLeader,
      'pronto-intervencion': produccion,
    };

    it.each(WORK_ORDER_TYPES)('requires a machine for a %s order too', (type) => {
      expect.assertions(2);
      currentUser.set(creatorOf[type]);

      component.onSubmit({ ...payload, type, machineId: '' });
      expect(workOrdersServiceMock.create).not.toHaveBeenCalled();

      component.onSubmit({ ...payload, type });
      expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(1);
    });

    it('stops at the machine: partId null, and no breadcrumb travels (the server builds it)', () => {
      expect.assertions(2);

      component.onSubmit({ ...payload, machineId: '2', partId: null });

      expect(lastRequest().machineRef).toEqual({ machineId: '2', partId: null, comment: '' });
      expect(lastRequest().machineRef).not.toHaveProperty('breadcrumb');
    });

    it('sends the chosen part as is, without looking for it in the loaded tree', () => {
      component.onMachineChange('1');

      component.onSubmit({ ...payload, machineId: '1', partId: '3' });

      expect(lastRequest().machineRef).toEqual({ machineId: '1', partId: '3', comment: '' });
    });

    it('keeps the failure comment in its own field, trimmed', () => {
      expect.assertions(2);
      component.onMachineChange('1');

      component.onSubmit({ ...payload, partId: '3', comment: '  Vibración en el arranque  ' });

      expect(lastRequest().machineRef.comment).toBe('Vibración en el arranque');
      expect(Object.keys(lastRequest())).not.toContain('comment');
    });

    describe('errors answered by the API', () => {
      it.each(['MACHINE_NOT_FOUND', 'PART_NOT_FOUND', 'PART_OTHER_MACHINE'])(
        '%s: shows the reason in an alert, keeps the form and does not navigate',
        (code) => {
          expect.assertions(5);
          workOrdersServiceMock.create.mockReturnValue(
            throwError(() => new WorkOrderMachineRefError(code, 'La parte 9 no existe')),
          );

          component.onSubmit(payload);
          fixture.detectChanges();

          expect(component.machineRefError()).toBe('La parte 9 no existe');
          expect(fixture.nativeElement.textContent).toContain('La parte 9 no existe');
          expect(fixture.nativeElement.querySelector('app-form')).not.toBeNull();
          expect(routerMock.navigate).not.toHaveBeenCalled();
          expect(component.isSubmitting()).toBe(false);
        },
      );

      it('clears the reference error on the next attempt', () => {
        expect.assertions(2);
        workOrdersServiceMock.create.mockReturnValueOnce(
          throwError(() => new WorkOrderMachineRefError('PART_NOT_FOUND', 'x')),
        );
        component.onSubmit(payload);
        expect(component.machineRefError()).toBe('x');

        component.onSubmit(payload);

        expect(component.machineRefError()).toBeNull();
      });

      it('a validation error shows each message next to its field and keeps what was typed', () => {
        expect.assertions(4);
        workOrdersServiceMock.create.mockReturnValue(
          throwError(
            () =>
              new WorkOrderValidationError({
                title: 'Debe tener entre 3 y 150 caracteres',
                description: 'Debe tener entre 10 y 2000 caracteres',
              }),
          ),
        );

        component.onSubmit(payload);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('#title-server-error')?.textContent).toContain(
          'entre 3 y 150',
        );
        expect(
          fixture.nativeElement.querySelector('#description-server-error')?.textContent,
        ).toContain('entre 10 y 2000');
        expect(routerMock.navigate).not.toHaveBeenCalled();
        expect(message()).toBeNull();
      });

      it('a 403 adds no message of its own: the interceptor already said "no permissions"', () => {
        expect.assertions(2);
        workOrdersServiceMock.create.mockReturnValue(
          throwError(() => ({ status: 403, message: 'No tenés permisos' })),
        );

        component.onSubmit(payload);

        expect(message()).toBeNull();
        expect(routerMock.navigate).not.toHaveBeenCalled();
      });

      it('any other failure shows the generic error', () => {
        workOrdersServiceMock.create.mockReturnValue(throwError(() => ({ status: 500 })));

        component.onSubmit(payload);

        expect(message()).toMatchObject({
          variant: 'error',
          message: 'Error al crear la orden de trabajo.',
        });
      });
    });

    it('loads the parts of the chosen machine and shows them as a tree', () => {
      const select = fixture.nativeElement.querySelector('#machine-select') as HTMLSelectElement;
      select.value = '1';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(partsServiceMock.getByMachine).toHaveBeenCalledExactlyOnceWith('1');
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.part-tree__name')).map((el) =>
          (el as HTMLElement).textContent?.trim(),
        ),
      ).toEqual(['Mesa de transporte', 'Cinta 1', 'Motor de cinta']);
    });

    it('discards the answer of an earlier parts request when the machine changed meanwhile', () => {
      expect.assertions(2);
      const slow = new Subject<Part[]>();
      partsServiceMock.getByMachine.mockImplementation((machineId) =>
        machineId === '1' ? slow : of([]),
      );

      component.onMachineChange('1');
      component.onMachineChange('2');
      slow.next(PARTS_OF_MACHINE_1);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.part-tree__name')).toHaveLength(0);
      expect(component.partNodes()).toEqual([]);
    });

    it('shows an error with a retry when the machines cannot be loaded, and no form', () => {
      expect.assertions(4);
      machinesServiceMock.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
      const failed = TestBed.createComponent(WorkOrderCreate);
      failed.detectChanges();

      expect(failed.componentInstance.machinesError()).toBe(true);
      expect(failed.nativeElement.textContent).toContain('No se pudieron cargar las máquinas');
      expect(failed.nativeElement.querySelector('app-form')).toBeNull();

      failed.componentInstance.loadMachines();
      failed.detectChanges();

      expect(failed.nativeElement.querySelector('app-form')).not.toBeNull();
    });

    it('warns when the parts cannot be loaded but still lets the order be created on the machine', () => {
      expect.assertions(3);
      partsServiceMock.getByMachine.mockReturnValue(throwError(() => new Error('down')));

      component.onMachineChange('1');
      fixture.detectChanges();
      expect(component.partsError()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las partes');

      component.onSubmit({ ...payload, machineId: '1', partId: null });
      expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(1);
    });

    it('does not ask for parts when the machine is cleared, and forgets the previous ones', () => {
      component.onMachineChange('1');
      partsServiceMock.getByMachine.mockClear();

      component.onMachineChange(null);

      expect(partsServiceMock.getByMachine).not.toHaveBeenCalled();
      expect(component.partNodes()).toEqual([]);
    });

    it('clears the parts warning when another machine is chosen', () => {
      partsServiceMock.getByMachine.mockReturnValueOnce(throwError(() => new Error('down')));
      component.onMachineChange('1');
      expect(component.partsError()).toBe(true);

      component.onMachineChange('2');

      expect(component.partsError()).toBe(false);
    });
  });

  describe('permissions by role', () => {
    const pronto: WorkOrderFormValue = { ...payload, type: 'pronto-intervencion' };
    const preventiva: WorkOrderFormValue = { ...payload, type: 'preventivo' };

    function createFor(user: AuthUser | null): ComponentFixture<WorkOrderCreate> {
      currentUser.set(user);
      const created = TestBed.createComponent(WorkOrderCreate);
      created.detectChanges();
      return created;
    }

    function offeredTypes(target: ComponentFixture<WorkOrderCreate>): string[] {
      const select = target.nativeElement.querySelector('#type') as HTMLSelectElement | null;
      return Array.from(select?.options ?? []).map((option) => option.value);
    }

    function warning() {
      return TestBed.inject(MessageService).message();
    }

    it('offers a team leader only preventivo and correctivo', () => {
      expect(offeredTypes(createFor(teamLeader))).toEqual(['preventivo', 'correctivo']);
    });

    it('offers personal-produccion only pronto-intervencion', () => {
      expect(offeredTypes(createFor(produccion))).toEqual(['pronto-intervencion']);
    });

    it('lets personal-produccion create a pronto-intervencion order', () => {
      expect.assertions(3);
      const target = createFor(produccion);

      target.componentInstance.onSubmit(pronto);

      expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith({
        ...expectedRequest,
        type: 'pronto-intervencion',
      });
      expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
      expect(warning()?.variant).toBe('success');
    });

    it.each<WorkOrderFormValue['type']>(['preventivo', 'correctivo'])(
      'blocks personal-produccion from creating a %s order: no request, warning shown',
      (type) => {
        expect.assertions(4);
        const target = createFor(produccion);

        target.componentInstance.onSubmit({ ...payload, type });

        expect(workOrdersServiceMock.create).not.toHaveBeenCalled();
        expect(routerMock.navigate).not.toHaveBeenCalled();
        expect(warning()?.variant).toBe('warning');
        expect(warning()?.title).toBe('Acceso denegado');
      },
    );

    it('blocks a team leader from creating a pronto-intervencion order', () => {
      expect.assertions(3);
      const target = createFor(teamLeader);

      target.componentInstance.onSubmit(pronto);

      expect(workOrdersServiceMock.create).not.toHaveBeenCalled();
      expect(warning()?.variant).toBe('warning');
      expect(target.componentInstance.isSubmitting()).toBe(false);
    });

    it('lets a team leader create a preventivo order', () => {
      const target = createFor(teamLeader);

      target.componentInstance.onSubmit(preventiva);

      expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith({
        ...expectedRequest,
        type: 'preventivo',
      });
    });

    it.each<[string, AuthUser | null]>([
      ['administrador', { ...teamLeader, role: 'administrador' }],
      [
        'tecnico',
        {
          ...teamLeader,
          role: 'tecnico',

          legajo: '1001',
          specialty: 'mecanico',
          teamType: 'guardia',
        },
      ],
      ['no session', null],
    ])('blocks %s from creating any order and offers no types', (_label, user) => {
      expect.assertions(3);
      const target = createFor(user);

      expect(offeredTypes(target)).toEqual([]);
      target.componentInstance.onSubmit(preventiva);
      target.componentInstance.onSubmit(pronto);

      expect(workOrdersServiceMock.create).not.toHaveBeenCalled();
      expect(warning()?.variant).toBe('warning');
    });
  });
});
