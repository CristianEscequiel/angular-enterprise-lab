import { API_BASE_URL } from '@core/config/api.config';
import { MACHINE_REF_FIXTURE } from '../testing/work-order.fixtures';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Observable } from 'rxjs';

import { PaginatedResponse, WorkOrder, WorkOrderCreateRequest } from '../models/work-order.model';
import {
  InvalidClosingNoteError,
  WorkOrderLoadError,
  WorkOrderMachineRefError,
  WorkOrderStateError,
  WorkOrderValidationError,
  WorkOrdersCriteria,
  WorkOrdersService,
} from './work-order.service';

describe('WorkOrdersService', () => {
  const apiUrl = `${API_BASE_URL}/work-orders`;
  let service: WorkOrdersService;
  let httpMock: HttpTestingController;

  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    machineRef: MACHINE_REF_FIXTURE,
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };
  const page: PaginatedResponse<WorkOrder> = {
    data: [order],
    page: 1,
    size: 10,
    totalItems: 1,
    totalPages: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WorkOrdersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const criteria: WorkOrdersCriteria = {
    title: '',
    status: '',
    priority: '',
    page: 1,
    perPage: 10,
  };

  it('search sends page, size and title to GET /work-orders', () => {
    let result: PaginatedResponse<WorkOrder> | undefined;
    service.search({ ...criteria, title: 'motor', page: 2 }).subscribe((value) => (result = value));

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('title')).toBe('motor');
    request.flush(page);

    expect(result).toEqual(page);
  });

  it('search sends title, status and priority together in the same request', () => {
    service
      .search({ title: 'motor', status: 'in-progress', priority: 'high', page: 2, perPage: 10 })
      .subscribe();

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('title')).toBe('motor');
    expect(request.request.params.get('status')).toBe('in-progress');
    expect(request.request.params.get('priority')).toBe('high');
    request.flush(page);
  });

  it('search omits empty criteria instead of sending empty parameters', () => {
    service.search(criteria).subscribe();

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.params.has('title:contains')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    expect(request.request.params.has('priority')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page);
  });

  it('search sends a single filter without the others', () => {
    service.search({ ...criteria, status: 'pending' }).subscribe();

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.params.get('status')).toBe('pending');
    expect(request.request.params.has('priority')).toBe(false);
    expect(request.request.params.has('title:contains')).toBe(false);
    request.flush(page);
  });

  it('search maps HTTP failures to a friendly error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let error: Error | undefined;
    service.search({ ...criteria, title: 'motor' }).subscribe({ error: (err) => (error = err) });

    httpMock
      .expectOne((req) => req.url === apiUrl)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(error?.message).toBe('No se pudieron buscar las órdenes de trabajo');
  });

  it('getById sends GET to /work-orders/:id', () => {
    let result: WorkOrder | undefined;
    service.getById('7').subscribe((value) => (result = value));

    const request = httpMock.expectOne(`${apiUrl}/7`);
    expect(request.request.method).toBe('GET');
    request.flush(order);

    expect(result).toEqual(order);
  });

  it('getById maps a 404 response to a not-found load error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let error: WorkOrderLoadError | undefined;
    service.getById('missing').subscribe({ error: (err) => (error = err) });

    httpMock
      .expectOne(`${apiUrl}/missing`)
      .flush('not found', { status: 404, statusText: 'Not Found' });

    expect(error).toBeInstanceOf(WorkOrderLoadError);
    expect(error?.kind).toBe('not-found');
  });

  it.each([0, 500, 503])('getById maps a %i response to a connection load error', (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let error: WorkOrderLoadError | undefined;
    service.getById('7').subscribe({ error: (err) => (error = err) });

    httpMock.expectOne(`${apiUrl}/7`).flush('boom', { status, statusText: 'Error' });

    expect(error).toBeInstanceOf(WorkOrderLoadError);
    expect(error?.kind).toBe('connection');
  });

  it('search never sends the json-server style parameters', () => {
    expect.assertions(2);
    service
      .search({ title: 'motor', status: 'pending', priority: 'low', page: 3, perPage: 5 })
      .subscribe();

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.params.keys().sort()).toEqual([
      'page',
      'priority',
      'size',
      'status',
      'title',
    ]);
    expect(request.request.params.get('page')).toBe('3');
    request.flush(page);
  });

  it('listByStatus asks the first page with the maximum size and only that status', () => {
    expect.assertions(4);
    let result: PaginatedResponse<WorkOrder> | undefined;
    service.listByStatus('in-progress').subscribe((value) => (result = value));

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'size', 'status']);
    expect(request.request.params.get('size')).toBe('100');
    request.flush({ ...page, size: 100, totalItems: 250, totalPages: 3 });

    expect(result?.totalItems).toBe(250);
  });

  describe('update', () => {
    const changes = {
      title: 'Nuevo título',
      description: 'Nueva descripción larga',
      priority: 'high',
    } as const;

    it('issues PUT /work-orders/:id with only title, description and priority', () => {
      expect.assertions(4);
      let result: WorkOrder | undefined;
      service.update('1', changes).subscribe((value) => (result = value));

      const request = httpMock.expectOne(`${apiUrl}/1`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual(changes);
      request.flush({ ...order, ...changes });

      expect(result).toMatchObject(changes);
      expect(result?.id).toBe('1');
    });

    it('drops anything else the caller passes (type, machine, status, owner)', () => {
      expect.assertions(1);
      service
        .update('1', { ...changes, ...order, status: 'completed', takenBy: null } as never)
        .subscribe();

      const request = httpMock.expectOne(`${apiUrl}/1`);
      expect(Object.keys(request.request.body as object).sort()).toEqual([
        'description',
        'priority',
        'title',
      ]);
      request.flush(order);
    });

    it('translates a 404 into WorkOrderLoadError "not-found"', () => {
      expect.assertions(2);
      let error: unknown;
      service.update('1', changes).subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${apiUrl}/1`)
        .flush(
          { code: 'NOT_FOUND', message: 'No existe' },
          { status: 404, statusText: 'Not Found' },
        );

      expect(error).toBeInstanceOf(WorkOrderLoadError);
      expect(error).toMatchObject({ kind: 'not-found' });
    });

    it('translates a 400 VALIDATION_ERROR into a WorkOrderValidationError with one message per field', () => {
      expect.assertions(2);
      let error: unknown;
      service.update('1', changes).subscribe({ error: (e: unknown) => (error = e) });

      httpMock.expectOne(`${apiUrl}/1`).flush(
        {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: { title: 'Debe tener entre 3 y 150 caracteres', priority: 7 },
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(error).toBeInstanceOf(WorkOrderValidationError);
      // Solo los mensajes de texto: un valor que no lo es se descarta.
      expect((error as WorkOrderValidationError).fieldErrors).toEqual({
        title: 'Debe tener entre 3 y 150 caracteres',
      });
    });

    it('lets a 403 through untouched', () => {
      expect.assertions(1);
      let error: unknown;
      service.update('1', changes).subscribe({ error: (e: unknown) => (error = e) });

      httpMock.expectOne(`${apiUrl}/1`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error).toMatchObject({ status: 403 });
    });
  });

  describe('delete', () => {
    it('issues DELETE /work-orders/:id', () => {
      let completed = false;
      service.delete('7').subscribe({ complete: () => (completed = true) });

      const request = httpMock.expectOne(`${apiUrl}/7`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null);

      expect(completed).toBe(true);
    });

    it('translates a 404 into WorkOrderLoadError "not-found"', () => {
      expect.assertions(1);
      let error: unknown;
      service.delete('7').subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(`${apiUrl}/7`)
        .flush({ code: 'NOT_FOUND', message: 'x' }, { status: 404, statusText: 'Not Found' });

      expect(error).toBeInstanceOf(WorkOrderLoadError);
    });

    it('lets a 403 through untouched', () => {
      expect.assertions(1);
      let error: unknown;
      service.delete('7').subscribe({ error: (e: unknown) => (error = e) });

      httpMock.expectOne(`${apiUrl}/7`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error).toMatchObject({ status: 403 });
    });
  });

  describe('create', () => {
    const payload: WorkOrderCreateRequest = {
      title: 'Falla en cinta',
      description: 'La cinta transportadora se detuvo por completo.',
      machineRef: { machineId: '1', partId: '3', comment: 'Vibración en el arranque' },
      type: 'pronto-intervencion',
      priority: 'high',
    };

    it('issues POST /work-orders with exactly what the user chose', () => {
      expect.assertions(4);
      let result: WorkOrder | undefined;
      service.create(payload).subscribe((value) => (result = value));

      const request = httpMock.expectOne(apiUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(payload);
      request.flush({
        ...order,
        ...payload,
        machineRef: { ...MACHINE_REF_FIXTURE, ...payload.machineRef },
      });

      expect(result?.type).toBe('pronto-intervencion');
      expect(result?.machineRef.breadcrumb).toBe(MACHINE_REF_FIXTURE.breadcrumb);
    });

    it('does not send status, createdAt nor breadcrumb: the server sets them', () => {
      expect.assertions(3);
      service.create(payload).subscribe();

      const request = httpMock.expectOne(apiUrl);
      const body = request.request.body as Record<string, unknown>;
      expect(body).not.toHaveProperty('status');
      expect(body).not.toHaveProperty('createdAt');
      expect(body['machineRef']).not.toHaveProperty('breadcrumb');
      request.flush(order);
    });

    it('keeps the failure comment as its own field, apart from the breadcrumb', () => {
      expect.assertions(3);
      service.create(payload).subscribe();

      const request = httpMock.expectOne(apiUrl);
      const body = request.request.body as { machineRef: Record<string, unknown> };
      expect(body.machineRef['comment']).toBe('Vibración en el arranque');
      expect(Object.keys(body)).not.toContain('comment');
      expect(Object.keys(body)).not.toContain('asset');
      request.flush(order);
    });

    it.each(['preventivo', 'correctivo', 'pronto-intervencion'] as const)(
      'keeps the %s type untouched in the request body',
      (type) => {
        service.create({ ...payload, type }).subscribe();

        const request = httpMock.expectOne(apiUrl);
        expect((request.request.body as { type: string }).type).toBe(type);
        request.flush({ ...order, type });
      },
    );

    it.each(['MACHINE_NOT_FOUND', 'PART_NOT_FOUND', 'PART_OTHER_MACHINE'])(
      'translates 400 %s into WorkOrderMachineRefError keeping the API message',
      (code) => {
        expect.assertions(3);
        let error: unknown;
        service.create(payload).subscribe({ error: (e: unknown) => (error = e) });

        httpMock
          .expectOne(apiUrl)
          .flush(
            { code, message: 'La parte 3 no existe' },
            { status: 400, statusText: 'Bad Request' },
          );

        expect(error).toBeInstanceOf(WorkOrderMachineRefError);
        expect(error).toMatchObject({ code, message: 'La parte 3 no existe' });
        expect(error).not.toBeInstanceOf(WorkOrderValidationError);
      },
    );

    it('translates 400 VALIDATION_ERROR into WorkOrderValidationError', () => {
      expect.assertions(2);
      let error: unknown;
      service.create(payload).subscribe({ error: (e: unknown) => (error = e) });

      httpMock.expectOne(apiUrl).flush(
        {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: { description: 'Debe tener entre 10 y 2000 caracteres' },
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(error).toBeInstanceOf(WorkOrderValidationError);
      expect((error as WorkOrderValidationError).fieldErrors).toEqual({
        description: 'Debe tener entre 10 y 2000 caracteres',
      });
    });

    it.each([
      [403, 'Forbidden'],
      [500, 'Server Error'],
    ])('lets a %i through untouched', (status, statusText) => {
      expect.assertions(2);
      let error: unknown;
      service.create(payload).subscribe({ error: (e: unknown) => (error = e) });

      httpMock.expectOne(apiUrl).flush('x', { status, statusText });

      expect(error).toMatchObject({ status });
      expect(error).not.toBeInstanceOf(WorkOrderMachineRefError);
    });
  });

  // Tomar, cerrar y liberar (spec 013d, contrato de la API). Cada transición es un solo `POST` sin
  // lectura previa: el dueño sale del token y el servidor valida y responde `409` si no corresponde.
  describe('state transitions', () => {
    const url = `${apiUrl}/1`;
    const owner = { id: '5', name: 'Técnico Electricista' };
    const comment = 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.';
    const taken: WorkOrder = {
      ...order,
      status: 'in-progress',
      takenBy: { id: '2', name: 'Técnico Mecánico de Guardia', at: '2026-09-25T10:00:00.000Z' },
    };
    const conflict = { status: 409, statusText: 'Conflict' };

    interface Outcome<T> {
      value?: T;
      error?: unknown;
      done: boolean;
    }

    function run<T>(source: Observable<T>): Outcome<T> {
      const outcome: Outcome<T> = { done: false };

      source.subscribe({
        next: (value) => (outcome.value = value),
        error: (error: unknown) => {
          outcome.error = error;
          outcome.done = true;
        },
        complete: () => (outcome.done = true),
      });

      return outcome;
    }

    const stateError = (outcome: Outcome<unknown>): WorkOrderStateError =>
      outcome.error as WorkOrderStateError;

    describe('take', () => {
      it('sends a single POST /work-orders/{id}/take without a body, and returns the order', () => {
        expect.assertions(4);
        const outcome = run(service.take('1'));

        const request = httpMock.expectOne(`${url}/take`);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toBeNull();
        request.flush(taken);

        expect(outcome.value).toEqual(taken);
        expect(outcome.done).toBe(true);
      });

      it('never sends the owner: it comes from the token', () => {
        expect.assertions(1);
        run(service.take('1'));

        const request = httpMock.expectOne(`${url}/take`);
        expect(request.request.body).toBeNull();
        request.flush(taken);
      });

      it('translates 409 WORK_ORDER_NOT_PENDING with the real status and the owner', () => {
        expect.assertions(5);
        const outcome = run(service.take('1'));

        httpMock.expectOne(`${url}/take`).flush(
          {
            code: 'WORK_ORDER_NOT_PENDING',
            message: 'La orden 1 no está pendiente',
            details: { status: 'in-progress', takenById: '5', takenByName: owner.name },
          },
          conflict,
        );

        expect(outcome.error).toBeInstanceOf(WorkOrderStateError);
        expect(stateError(outcome).reason).toBe('not-pending');
        expect(stateError(outcome).status).toBe('in-progress');
        expect(stateError(outcome).takenBy).toEqual(owner);
        expect(stateError(outcome).message).toBe(
          `La orden está siendo ejecutada por ${owner.name}.`,
        );
      });

      it.each(['completed', 'cancelled'] as const)(
        'translates 409 on a %s order as "already closed", never reopening it',
        (status) => {
          expect.assertions(2);
          const outcome = run(service.take('1'));

          httpMock
            .expectOne(`${url}/take`)
            .flush({ code: 'WORK_ORDER_NOT_PENDING', message: 'x', details: { status } }, conflict);

          expect(stateError(outcome).message).toBe('La orden ya fue cerrada.');
          expect(stateError(outcome).takenBy).toBeNull();
        },
      );

      it('translates a 409 without owner details into an error that names nobody', () => {
        expect.assertions(2);
        const outcome = run(service.take('1'));

        httpMock
          .expectOne(`${url}/take`)
          .flush(
            { code: 'WORK_ORDER_NOT_PENDING', message: 'x', details: { status: 'in-progress' } },
            conflict,
          );

        expect(stateError(outcome).takenBy).toBeNull();
        expect(stateError(outcome).message).toBe('La orden ya no está pendiente.');
      });

      it('lets a 403 (team that does not attend this type) through untouched', () => {
        expect.assertions(2);
        const outcome = run(service.take('1'));

        httpMock
          .expectOne(`${url}/take`)
          .flush({ code: 'FORBIDDEN', message: 'x' }, { status: 403, statusText: 'Forbidden' });

        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
        expect(outcome.error).toMatchObject({ status: 403 });
      });

      it('lets a network failure through untouched', () => {
        expect.assertions(1);
        const outcome = run(service.take('1'));

        httpMock.expectOne(`${url}/take`).error(new ProgressEvent('error'));

        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
      });

      it('encodes the id in the URL', () => {
        run(service.take('a/b'));

        httpMock.expectOne(`${apiUrl}/a%2Fb/take`).flush(taken);
      });
    });

    describe('close', () => {
      it('sends a single POST /work-orders/{id}/close with { outcome, comment } and nothing else', () => {
        expect.assertions(4);
        const outcome = run(service.close('1', 'completed', comment));

        const request = httpMock.expectOne(`${url}/close`);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ outcome: 'completed', comment });
        request.flush({ ...taken, status: 'completed' });

        expect((outcome.value as WorkOrder).status).toBe('completed');
        expect(outcome.done).toBe(true);
      });

      it.each(['completed', 'cancelled'] as const)('closes with the outcome %s', (result) => {
        run(service.close('1', result, comment));

        const request = httpMock.expectOne(`${url}/close`);
        expect(request.request.body).toMatchObject({ outcome: result });
        request.flush({ ...taken, status: result });
      });

      it('trims the comment before sending', () => {
        expect.assertions(1);
        run(service.close('1', 'completed', `   ${comment}  `));

        const request = httpMock.expectOne(`${url}/close`);
        expect((request.request.body as { comment: string }).comment).toBe(comment);
        request.flush(taken);
      });

      it('never sends the author: it comes from the token', () => {
        expect.assertions(1);
        run(service.close('1', 'completed', comment));

        const request = httpMock.expectOne(`${url}/close`);
        expect(Object.keys(request.request.body as object).sort()).toEqual(['comment', 'outcome']);
        request.flush(taken);
      });

      it.each([
        ['an empty comment', ''],
        ['a blank comment', '   '],
        ['49 characters', 'x'.repeat(49)],
        ['501 characters', 'x'.repeat(501)],
        ['49 characters plus edge spaces', `  ${'x'.repeat(49)}  `],
      ])('refuses %s with InvalidClosingNoteError and sends nothing', (_label, text) => {
        expect.assertions(1);
        const outcome = run(service.close('1', 'completed', text));

        expect(outcome.error).toBeInstanceOf(InvalidClosingNoteError);
        httpMock.expectNone(() => true);
      });

      it.each(['50 characters', '500 characters'])('accepts the boundary of %s', (label) => {
        const text = 'x'.repeat(label.startsWith('50 ') ? 50 : 500);
        const outcome = run(service.close('1', 'cancelled', text));

        httpMock.expectOne(`${url}/close`).flush({ ...taken, status: 'cancelled' });

        expect(outcome.error).toBeUndefined();
      });

      it.each(['pending', 'in-progress', 'bogus'])(
        'refuses %s as an outcome with InvalidClosingNoteError and sends nothing',
        (value) => {
          expect.assertions(1);
          const outcome = run(service.close('1', value as 'completed', comment));

          expect(outcome.error).toBeInstanceOf(InvalidClosingNoteError);
          httpMock.expectNone(() => true);
        },
      );

      it.each([
        ['WORK_ORDER_NOT_IN_PROGRESS', 'not-in-progress'],
        ['WORK_ORDER_TAKEN_BY_OTHER', 'taken-by-other'],
      ] as const)('translates 409 %s into reason %s', (code, reason) => {
        expect.assertions(3);
        const outcome = run(service.close('1', 'completed', comment));

        httpMock.expectOne(`${url}/close`).flush(
          {
            code,
            message: 'x',
            details: { status: 'in-progress', takenById: '5', takenByName: owner.name },
          },
          conflict,
        );

        expect(outcome.error).toBeInstanceOf(WorkOrderStateError);
        expect(stateError(outcome).reason).toBe(reason);
        expect(stateError(outcome).takenBy).toEqual(owner);
      });

      it('lets a 400 validation error through untouched', () => {
        expect.assertions(2);
        const outcome = run(service.close('1', 'completed', comment));

        httpMock
          .expectOne(`${url}/close`)
          .flush(
            { code: 'VALIDATION_ERROR', message: 'x', details: { comment: 'corto' } },
            { status: 400, statusText: 'Bad Request' },
          );

        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
        expect(outcome.error).toMatchObject({ status: 400 });
      });
    });

    describe('release', () => {
      it('sends a single POST /work-orders/{id}/release without a body', () => {
        expect.assertions(4);
        const outcome = run(service.release('1'));

        const request = httpMock.expectOne(`${url}/release`);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toBeNull();
        request.flush({ ...order, takenBy: null });

        expect((outcome.value as WorkOrder).status).toBe('pending');
        expect(outcome.done).toBe(true);
      });

      it('translates 409 WORK_ORDER_NOT_IN_PROGRESS (a closed order is never reopened)', () => {
        expect.assertions(3);
        const outcome = run(service.release('1'));

        httpMock.expectOne(`${url}/release`).flush(
          {
            code: 'WORK_ORDER_NOT_IN_PROGRESS',
            message: 'x',
            details: { status: 'completed' },
          },
          conflict,
        );

        expect(stateError(outcome).reason).toBe('not-in-progress');
        expect(stateError(outcome).status).toBe('completed');
        expect(stateError(outcome).message).toBe('La orden ya fue cerrada.');
      });

      it('lets a 403 through untouched', () => {
        expect.assertions(1);
        const outcome = run(service.release('1'));

        httpMock.expectOne(`${url}/release`).flush(null, { status: 403, statusText: 'Forbidden' });

        expect(outcome.error).toMatchObject({ status: 403 });
      });
    });

    describe('409 with an unknown code', () => {
      it('is not turned into a WorkOrderStateError', () => {
        expect.assertions(1);
        const outcome = run(service.take('1'));

        httpMock.expectOne(`${url}/take`).flush({ code: 'SOMETHING_ELSE', message: 'x' }, conflict);

        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
      });
    });

    describe('WorkOrderStateError messages', () => {
      it.each<[string, WorkOrderStateError, string]>([
        [
          'pending expected, nobody named',
          new WorkOrderStateError('not-pending'),
          'La orden ya no está pendiente.',
        ],
        [
          'in-progress expected, nobody named',
          new WorkOrderStateError('not-in-progress'),
          'La orden ya no está en progreso.',
        ],
        [
          'someone runs it',
          new WorkOrderStateError('not-pending', owner, 'in-progress'),
          'La orden está siendo ejecutada por Técnico Electricista.',
        ],
        [
          'it is closed, even with an owner',
          new WorkOrderStateError('not-pending', owner, 'completed'),
          'La orden ya fue cerrada.',
        ],
      ])('%s', (_label, error, message) => {
        expect(error.message).toBe(message);
      });
    });
  });
});
