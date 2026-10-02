import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { API_BASE_URL } from '@core/config/api.config';
import { MessageService } from '@core/services/message.service';
import { WorkOrderCreate } from './work-order-create';

// La página de alta con los servicios REALES (máquinas, partes, órdenes) y las respuestas de la API
// simuladas: fija qué pedidos salen, con qué cuerpo, y qué se muestra de cada respuesta.
describe('work order creation against the API contract', () => {
  const machinesUrl = `${API_BASE_URL}/machines`;
  const partsUrl = `${API_BASE_URL}/machines/1/parts`;
  const ordersUrl = `${API_BASE_URL}/work-orders`;

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const machines = [
    { id: '1', code: 'ENV-01', name: 'Envasadora línea 1', partCount: 3 },
    { id: '2', code: 'SEL-02', name: 'Selladora', partCount: 0 },
  ];
  const parts = [
    { id: '1', machineId: '1', parentId: null, name: 'Mesa de transporte' },
    { id: '2', machineId: '1', parentId: '1', name: 'Cinta 1' },
    { id: '3', machineId: '1', parentId: '2', name: 'Motor de cinta' },
  ];

  let fixture: ComponentFixture<WorkOrderCreate>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: signal(teamLeader).asReadonly() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(WorkOrderCreate);
    fixture.detectChanges();
    httpMock.expectOne(machinesUrl).flush(machines);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const text = (): string => fixture.nativeElement.textContent ?? '';

  function type(selector: string, value: string): void {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function chooseMachine(id: string): void {
    const select = fixture.nativeElement.querySelector('#machine-select') as HTMLSelectElement;
    select.value = id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function fillAndSubmit(): void {
    type('#title', 'Revisar motor');
    type('#description', 'Vibración fuera de rango en el arranque');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('asks the parts of the chosen machine through its own route, not a global listing', () => {
    expect.assertions(2);
    chooseMachine('1');

    const request = httpMock.expectOne(partsUrl);
    expect(request.request.method).toBe('GET');
    request.flush(parts);
    fixture.detectChanges();

    expect(text()).toContain('Motor de cinta');
  });

  it('stopping at the machine posts partId null and no breadcrumb, then goes back to the list', () => {
    expect.assertions(4);
    chooseMachine('2');
    httpMock.expectOne(`${API_BASE_URL}/machines/2/parts`).flush([]);

    fillAndSubmit();
    const post = httpMock.expectOne({ method: 'POST', url: ordersUrl });
    expect(post.request.body).toEqual({
      title: 'Revisar motor',
      description: 'Vibración fuera de rango en el arranque',
      type: 'preventivo',
      priority: 'low',
      machineRef: { machineId: '2', partId: null, comment: '' },
    });
    expect(post.request.body.machineRef).not.toHaveProperty('breadcrumb');
    post.flush({ id: '33', status: 'pending' });

    expect(navigate).toHaveBeenCalledWith(['/work-orders']);
    expect(TestBed.inject(MessageService).message()?.variant).toBe('success');
  });

  it('a part of the tree travels as its id, with the comment apart', () => {
    expect.assertions(1);
    chooseMachine('1');
    httpMock.expectOne(partsUrl).flush(parts);
    fixture.detectChanges();
    const motor = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.part-tree__name'),
    ).find((element) => element.textContent?.trim() === 'Motor de cinta');
    motor?.click();
    fixture.detectChanges();
    type('#comment', '  Hace ruido  ');

    fillAndSubmit();

    const post = httpMock.expectOne({ method: 'POST', url: ordersUrl });
    expect(post.request.body.machineRef).toEqual({
      machineId: '1',
      partId: '3',
      comment: 'Hace ruido',
    });
    post.flush({ id: '33' });
  });

  it('shows the API reason, keeps the form and does not leave when the part is rejected (400)', () => {
    expect.assertions(4);
    chooseMachine('2');
    httpMock.expectOne(`${API_BASE_URL}/machines/2/parts`).flush([]);

    fillAndSubmit();
    httpMock
      .expectOne({ method: 'POST', url: ordersUrl })
      .flush(
        { code: 'PART_NOT_FOUND', message: 'No existe la parte 9' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(text()).toContain('No existe la parte 9');
    expect(fixture.nativeElement.querySelector('#title')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('#title') as HTMLInputElement).value).toBe(
      'Revisar motor',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows each field error returned by a 400 VALIDATION_ERROR next to its field', () => {
    expect.assertions(2);
    chooseMachine('2');
    httpMock.expectOne(`${API_BASE_URL}/machines/2/parts`).flush([]);

    fillAndSubmit();
    httpMock.expectOne({ method: 'POST', url: ordersUrl }).flush(
      {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: { description: 'Debe tener entre 10 y 2000 caracteres' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#description-server-error')?.textContent).toContain(
      'entre 10 y 2000',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
