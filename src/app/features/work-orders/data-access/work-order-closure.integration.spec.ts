import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, tap } from 'rxjs';

import { createInMemoryApi, InMemoryApi, provideInMemoryApi } from '@core/testing/in-memory-api';
import { WorkOrder, WorkOrderClosingNote, WorkOrderTaker } from '../models/work-order.model';
import { MACHINE_REF_FIXTURE } from '../testing/work-order.fixtures';
import {
  InvalidClosingNoteError,
  WorkOrdersService,
  WorkOrderStateError,
} from './work-order.service';

// Especificación ejecutable del flujo de tomar y cerrar una orden (spec 013d). `WorkOrdersService` REAL
// contra un emulador fiel de JSON Server: el "servidor" no valida nada, así que si el servicio dejara
// de leer el estado fresco o de exigir el dueño, acá se vería (la orden se pisaría o se reabriría).
describe('take, close and release an order, end to end against an in-memory JSON Server', () => {
  let api: InMemoryApi;
  let service: WorkOrdersService;

  const A: WorkOrderTaker = {
    id: '2',
    name: 'Técnico Mecánico de Guardia',
    at: '2026-09-25T10:00:00.000Z',
  };
  const B: WorkOrderTaker = {
    id: '5',
    name: 'Técnico Electricista Preventivo',
    at: '2026-09-25T10:05:00.000Z',
  };

  const noteBy = (author: WorkOrderTaker, length = 60): WorkOrderClosingNote => ({
    comment: 'x'.repeat(length),
    authorId: author.id,
    authorName: author.name,
    at: '2026-09-25T15:00:00.000Z',
  });

  const pendingOrder = {
    id: '1',
    title: 'Falla en cinta',
    description: 'La cinta transportadora se detuvo por completo.',
    machineRef: MACHINE_REF_FIXTURE,
    type: 'pronto-intervencion',
    priority: 'high',
    status: 'pending',
    createdAt: '2026-09-25T09:00:00Z',
  };

  function configure(extra: HttpInterceptorFn[] = []): void {
    api = createInMemoryApi({ 'work-orders': [structuredClone(pendingOrder)] });
    TestBed.configureTestingModule({
      providers:
        extra.length === 0
          ? [provideInMemoryApi(api)]
          : [provideHttpClient(withInterceptors([...extra, api.interceptor]))],
    });
    service = TestBed.inject(WorkOrdersService);
  }

  const run = <T>(source: Observable<T>): Promise<T> => firstValueFrom(source);

  const rejection = async (source: Observable<unknown>): Promise<unknown> => {
    try {
      await firstValueFrom(source);
    } catch (error) {
      return error;
    }
    throw new Error('Se esperaba un error y la llamada tuvo éxito');
  };

  const stored = (): WorkOrder => (api.db['work-orders'] ?? [])[0] as unknown as WorkOrder;
  const writes = () => api.requestsTo('PATCH', '/work-orders/1');

  beforeEach(() => configure());

  it("taking a pending order leaves it in progress under the technician's name", async () => {
    await run(service.take('1', A));

    expect(stored().status).toBe('in-progress');
    expect(stored().takenBy).toEqual(A);
  });

  it('a second technician cannot take an order that is already running: named, and no second write', async () => {
    await run(service.take('1', A));

    const error = await rejection(service.take('1', B));

    expect(error).toBeInstanceOf(WorkOrderStateError);
    expect((error as WorkOrderStateError).reason).toBe('not-pending');
    expect((error as WorkOrderStateError).message).toBe(
      'La orden está siendo ejecutada por Técnico Mecánico de Guardia.',
    );
    expect(writes()).toHaveLength(1);
    expect(stored().takenBy).toEqual(A);
  });

  it('a second technician cannot close an order that another one is running, and nothing is overwritten', async () => {
    await run(service.take('1', A));
    const before = structuredClone(stored());

    const error = await rejection(service.close('1', 'completed', noteBy(B)));

    expect((error as WorkOrderStateError).reason).toBe('taken-by-other');
    expect(writes()).toHaveLength(1);
    expect(stored()).toEqual(before);
  });

  it('closing with a 49-character comment sends nothing to the server', async () => {
    await run(service.take('1', A));
    const requestsBefore = api.requests.length;

    const error = await rejection(service.close('1', 'completed', noteBy(A, 49)));

    expect(error).toBeInstanceOf(InvalidClosingNoteError);
    expect(api.requests).toHaveLength(requestsBefore);
    expect(stored().status).toBe('in-progress');
  });

  it('closing with 50 characters stores status, owner and closing note, and leaves the failure comment alone', async () => {
    await run(service.take('1', A));

    await run(service.close('1', 'cancelled', noteBy(A, 50)));

    const order = await run(service.getById('1'));
    expect(order.status).toBe('cancelled');
    expect(order.takenBy).toEqual(A);
    expect(order.closingNote).toEqual(noteBy(A, 50));
    expect(order.machineRef).toEqual(MACHINE_REF_FIXTURE);
    expect(order.closingNote?.comment).not.toContain(MACHINE_REF_FIXTURE.comment);
  });

  it('cannot close a pending order: not-in-progress, and no write', async () => {
    const error = await rejection(service.close('1', 'completed', noteBy(A)));

    expect((error as WorkOrderStateError).reason).toBe('not-in-progress');
    expect(writes()).toHaveLength(0);
    expect(stored().status).toBe('pending');
  });

  it('a closed order is never reopened by take or release, nor closed twice', async () => {
    await run(service.take('1', A));
    await run(service.close('1', 'completed', noteBy(A)));
    const closed = structuredClone(stored());

    const errors = [
      await rejection(service.take('1', B)),
      await rejection(service.release('1')),
      await rejection(service.close('1', 'cancelled', noteBy(A))),
    ] as WorkOrderStateError[];

    expect(errors.map((error) => error.reason)).toEqual([
      'not-pending',
      'not-in-progress',
      'not-in-progress',
    ]);
    expect(errors.every((error) => error.message === 'La orden ya fue cerrada.')).toBe(true);
    expect(stored()).toEqual(closed);
    // take + close: las tres operaciones siguientes no escribieron nada.
    expect(writes()).toHaveLength(2);
  });

  describe('release', () => {
    it('sends the order back to pending without an owner, and another technician can take it', async () => {
      await run(service.take('1', A));

      await run(service.release('1'));
      expect(stored().status).toBe('pending');
      expect(stored().takenBy).toBeNull();

      await run(service.take('1', B));
      expect(stored().status).toBe('in-progress');
      expect(stored().takenBy).toEqual(B);
    });

    it('the previous technician can no longer close it once it was released and taken by someone else', async () => {
      await run(service.take('1', A));
      await run(service.release('1'));
      await run(service.take('1', B));
      const before = structuredClone(stored());

      const error = await rejection(service.close('1', 'completed', noteBy(A)));

      expect((error as WorkOrderStateError).reason).toBe('taken-by-other');
      expect(stored()).toEqual(before);
      expect(stored().closingNote).toBeUndefined();
    });

    it('if nobody retook it, the previous technician cannot close it either: not-in-progress', async () => {
      await run(service.take('1', A));
      await run(service.release('1'));

      const error = await rejection(service.close('1', 'completed', noteBy(A)));

      expect((error as WorkOrderStateError).reason).toBe('not-in-progress');
      expect(stored().status).toBe('pending');
    });

    it('cannot release an order that is pending: no write', async () => {
      const error = await rejection(service.release('1'));

      expect((error as WorkOrderStateError).reason).toBe('not-in-progress');
      expect(writes()).toHaveLength(0);
    });
  });

  describe('when somebody else writes between the write and the re-read (simulated race)', () => {
    it('take tells the caller it lost, instead of believing it is the owner', async () => {
      TestBed.resetTestingModule();
      // Justo después de que A escribe su `PATCH`, B pisa al dueño en el "servidor".
      const race: HttpInterceptorFn = (request, next) =>
        next(request).pipe(
          tap((event) => {
            if (event instanceof HttpResponse && request.method === 'PATCH') {
              (api.db['work-orders'] as unknown as WorkOrder[])[0]!.takenBy = B;
            }
          }),
        );
      configure([race]);

      const error = await rejection(service.take('1', A));

      expect(error).toBeInstanceOf(WorkOrderStateError);
      expect((error as WorkOrderStateError).reason).toBe('taken-by-other');
      expect((error as WorkOrderStateError).takenBy).toEqual(B);
    });
  });

  it('a failure of the fresh read (server down) is not read as "the order is not in that state"', async () => {
    api.fail('GET', '/work-orders/1', 500);

    const error = await rejection(service.take('1', A));

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error).not.toBeInstanceOf(WorkOrderStateError);
    expect(writes()).toHaveLength(0);
  });
});
