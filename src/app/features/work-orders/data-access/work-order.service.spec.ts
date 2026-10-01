import { API_BASE_URL } from '@core/config/api.config';
import { MACHINE_REF_FIXTURE } from '../testing/work-order.fixtures';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  ClosedWorkOrderStatus,
  PaginatedResponse,
  WorkOrder,
  WorkOrderClosingNote,
  WorkOrderCreateRequest,
  WorkOrderTaker,
} from '../models/work-order.model';
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

  // Tomar, cerrar y liberar (spec 013d). Toda transición LEE la orden fresca y solo después escribe.
  describe('state transitions', () => {
    const url = `${apiUrl}/1`;
    const taker: WorkOrderTaker = {
      id: '2',
      name: 'Técnico Mecánico de Guardia',
      at: '2026-09-25T10:00:00.000Z',
    };
    const otherTaker: WorkOrderTaker = { id: '5', name: 'Técnico Electricista', at: taker.at };
    const note: WorkOrderClosingNote = {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: taker.id,
      authorName: taker.name,
      at: '2026-09-25T15:00:00.000Z',
    };
    const inProgress: WorkOrder = { ...order, status: 'in-progress', takenBy: taker };

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

    const flushGet = (body: WorkOrder) => {
      const request = httpMock.expectOne(url);
      expect(request.request.method).toBe('GET');
      request.flush(body);
    };
    const noWrites = () => httpMock.expectNone((request) => request.method !== 'GET');
    const noRequestAtAll = () => httpMock.expectNone(() => true);
    const stateError = (outcome: Outcome<unknown>): WorkOrderStateError => {
      expect(outcome.error).toBeInstanceOf(WorkOrderStateError);
      return outcome.error as WorkOrderStateError;
    };

    describe('close', () => {
      it.each<[string, string]>([
        ['an empty comment', ''],
        ['a 49-character comment', 'x'.repeat(49)],
        ['a comment of only spaces', ' '.repeat(80)],
        ['a comment that is long only because of its edge spaces', ' '.repeat(60) + 'x'.repeat(10)],
        ['a comment over 500 characters', 'x'.repeat(501)],
      ])('rejects %s without sending any request', (_label, comment) => {
        const outcome = run(service.close('1', 'completed', { ...note, comment }));

        expect(outcome.error).toBeInstanceOf(InvalidClosingNoteError);
        noRequestAtAll();
      });

      it('rejects a note without an author, without any request', () => {
        const outcome = run(service.close('1', 'completed', { ...note, authorId: '' }));

        expect(outcome.error).toBeInstanceOf(InvalidClosingNoteError);
        noRequestAtAll();
      });

      it('rejects a destination that is not a closed status, without any request', () => {
        const outcome = run(service.close('1', 'in-progress' as ClosedWorkOrderStatus, note));

        expect(outcome.error).toBeInstanceOf(InvalidClosingNoteError);
        noRequestAtAll();
      });

      it.each<ClosedWorkOrderStatus>(['completed', 'cancelled'])(
        'reads the order and then PATCHes exactly { status: %s, closingNote }',
        (outcome) => {
          const result = run(service.close('1', outcome, note));
          flushGet(inProgress);

          const patch = httpMock.expectOne(url);
          expect(patch.request.method).toBe('PATCH');
          expect(patch.request.body).toEqual({ status: outcome, closingNote: note });
          const closed = { ...inProgress, status: outcome, closingNote: note };
          patch.flush(closed);

          expect(result.value).toEqual(closed);
        },
      );

      it('stores the trimmed comment', () => {
        run(service.close('1', 'completed', { ...note, comment: `   ${note.comment}   ` }));
        flushGet(inProgress);

        const patch = httpMock.expectOne(url);
        expect(
          (patch.request.body as { closingNote: WorkOrderClosingNote }).closingNote.comment,
        ).toBe(note.comment);
        patch.flush(inProgress);
      });

      it.each<[string, WorkOrder]>([
        ['a pending order', order],
        ['a released order', { ...order, takenBy: null }],
      ])('refuses to close %s: not-in-progress and no write', (_label, current) => {
        const outcome = run(service.close('1', 'completed', note));
        flushGet(current);

        expect(stateError(outcome).reason).toBe('not-in-progress');
        expect(outcome.done).toBe(true);
        noWrites();
      });

      it.each<ClosedWorkOrderStatus>(['completed', 'cancelled'])(
        'refuses to close an order that is already %s',
        (status) => {
          const outcome = run(service.close('1', 'completed', note));
          flushGet({ ...inProgress, status, closingNote: note });

          const error = stateError(outcome);
          expect(error.reason).toBe('not-in-progress');
          expect(error.message).toBe('La orden ya fue cerrada.');
          noWrites();
        },
      );

      it('refuses to let another technician close an order taken by someone else', () => {
        const outcome = run(service.close('1', 'completed', note));
        flushGet({ ...inProgress, takenBy: otherTaker });

        const error = stateError(outcome);
        expect(error.reason).toBe('taken-by-other');
        expect(error.takenBy).toEqual(otherTaker);
        expect(error.message).toBe('La orden está siendo ejecutada por Técnico Electricista.');
        noWrites();
      });

      it('propagates a failure of the fresh read as an HTTP error, without writing', () => {
        const outcome = run(service.close('1', 'completed', note));

        httpMock.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });

        expect(outcome.error).toBeInstanceOf(HttpErrorResponse);
        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
        noWrites();
      });
    });

    describe('take', () => {
      it('reads the order, PATCHes { status: in-progress, takenBy } and reads it again', () => {
        const result = run(service.take('1', taker));
        flushGet(order);

        const patch = httpMock.expectOne(url);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toEqual({ status: 'in-progress', takenBy: taker });
        patch.flush(inProgress);

        flushGet(inProgress);
        expect(result.value).toEqual(inProgress);
        expect(result.done).toBe(true);
      });

      it('takes a released order (takenBy null) like a pending one', () => {
        const result = run(service.take('1', taker));
        flushGet({ ...order, takenBy: null });
        httpMock.expectOne(url).flush(inProgress);
        flushGet(inProgress);

        expect(result.value?.takenBy).toEqual(taker);
      });

      it('refuses an order that another technician is running: names them and does not write', () => {
        const outcome = run(service.take('1', taker));
        flushGet({ ...inProgress, takenBy: otherTaker });

        const error = stateError(outcome);
        expect(error.reason).toBe('not-pending');
        expect(error.takenBy).toEqual(otherTaker);
        expect(error.message).toBe('La orden está siendo ejecutada por Técnico Electricista.');
        expect(outcome.done).toBe(true);
        noWrites();
      });

      it.each<ClosedWorkOrderStatus>(['completed', 'cancelled'])(
        'never reopens an order that is %s: not-pending and no write',
        (status) => {
          const outcome = run(service.take('1', taker));
          flushGet({ ...inProgress, status, closingNote: note });

          const error = stateError(outcome);
          expect(error.reason).toBe('not-pending');
          expect(error.message).toBe('La orden ya fue cerrada.');
          noWrites();
        },
      );

      it('tells the caller when somebody else wrote in between (the re-read shows another owner)', () => {
        const outcome = run(service.take('1', taker));
        flushGet(order);
        httpMock.expectOne(url).flush(inProgress);
        flushGet({ ...inProgress, takenBy: otherTaker });

        const error = stateError(outcome);
        expect(error.reason).toBe('taken-by-other');
        expect(error.takenBy).toEqual(otherTaker);
      });

      it('propagates a failure of the fresh read as an HTTP error, without writing', () => {
        const outcome = run(service.take('1', taker));

        httpMock.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });

        expect(outcome.error).toBeInstanceOf(HttpErrorResponse);
        expect(outcome.error).not.toBeInstanceOf(WorkOrderStateError);
        noWrites();
      });
    });

    describe('release', () => {
      it('PATCHes { status: pending, takenBy: null } on an in-progress order', () => {
        const result = run(service.release('1'));
        flushGet(inProgress);

        const patch = httpMock.expectOne(url);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toEqual({ status: 'pending', takenBy: null });
        const released = { ...order, takenBy: null };
        patch.flush(released);

        expect(result.value).toEqual(released);
        expect(result.done).toBe(true);
      });

      it.each<[string, WorkOrder]>([
        ['a pending order', order],
        ['a completed order', { ...inProgress, status: 'completed', closingNote: note }],
        ['a cancelled order', { ...inProgress, status: 'cancelled', closingNote: note }],
      ])(
        'refuses to release %s: not-in-progress and no write (a closed order is never reopened)',
        (_label, current) => {
          const outcome = run(service.release('1'));
          flushGet(current);

          expect(stateError(outcome).reason).toBe('not-in-progress');
          noWrites();
        },
      );

      it('propagates a failure of the fresh read as an HTTP error, without writing', () => {
        const outcome = run(service.release('1'));

        httpMock.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });

        expect(outcome.error).toBeInstanceOf(HttpErrorResponse);
        noWrites();
      });
    });

    describe('orders that carry no owner (data written before spec 013d)', () => {
      const legacyInProgress: WorkOrder = { ...order, status: 'in-progress' };

      it('take on an in-progress order with no owner recorded is refused as not pending, naming nobody', () => {
        const outcome = run(service.take('1', taker));
        flushGet(legacyInProgress);

        const error = stateError(outcome);
        expect(error.reason).toBe('not-pending');
        expect(error.takenBy).toBeNull();
        expect(error.message).toBe('La orden ya no está pendiente.');
        noWrites();
      });

      it('take reports taken-by-other, without a name, when the re-read shows no owner at all', () => {
        const outcome = run(service.take('1', taker));
        flushGet(order);
        httpMock.expectOne(url).flush(legacyInProgress);
        flushGet(legacyInProgress);

        const error = stateError(outcome);
        expect(error.reason).toBe('taken-by-other');
        expect(error.takenBy).toBeNull();
      });

      it('close refuses an in-progress order with no owner: nobody can prove it is theirs', () => {
        const outcome = run(service.close('1', 'completed', note));
        flushGet(legacyInProgress);

        const error = stateError(outcome);
        expect(error.reason).toBe('taken-by-other');
        expect(error.takenBy).toBeNull();
        noWrites();
      });

      it('release works on an in-progress order with no owner recorded', () => {
        const result = run(service.release('1'));
        flushGet(legacyInProgress);

        const patchRequest = httpMock.expectOne(url);
        expect(patchRequest.request.body).toEqual({ status: 'pending', takenBy: null });
        patchRequest.flush({ ...order, takenBy: null });
        expect(result.done).toBe(true);
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
          new WorkOrderStateError('not-pending', otherTaker, 'in-progress'),
          'La orden está siendo ejecutada por Técnico Electricista.',
        ],
        [
          'it is closed, even with an owner',
          new WorkOrderStateError('not-pending', otherTaker, 'completed'),
          'La orden ya fue cerrada.',
        ],
      ])('%s', (_label, error, message) => {
        expect(error.message).toBe(message);
      });
    });
  });
});
