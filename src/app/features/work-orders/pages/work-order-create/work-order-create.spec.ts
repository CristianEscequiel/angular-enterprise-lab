import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { WorkOrderCreate } from './work-order-create';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder, WorkOrderCreateRequest } from '../../models/work-order.model';

describe('WorkOrderCreate', () => {
  let component: WorkOrderCreate;
  let fixture: ComponentFixture<WorkOrderCreate>;

  const payload: WorkOrderCreateRequest = {
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    type: 'correctivo',
    priority: 'medium',
  };

  const created: WorkOrder = {
    id: '1',
    ...payload,
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const workOrdersServiceMock = {
    create: vi.fn<(...args: unknown[]) => Observable<WorkOrder>>(),
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

  beforeEach(async () => {
    workOrdersServiceMock.create.mockReset().mockReturnValue(of(created));
    routerMock.navigate.mockReset();
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
      providers: [
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
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

  it('creates the work order and navigates to the list on success', () => {
    component.onSubmit(payload);

    expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith(payload);
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

  describe('permissions by role', () => {
    const pronto: WorkOrderCreateRequest = { ...payload, type: 'pronto-intervencion' };
    const preventiva: WorkOrderCreateRequest = { ...payload, type: 'preventivo' };

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

      expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith(pronto);
      expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
      expect(warning()?.variant).toBe('success');
    });

    it.each<WorkOrderCreateRequest['type']>(['preventivo', 'correctivo'])(
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

      expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith(preventiva);
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
