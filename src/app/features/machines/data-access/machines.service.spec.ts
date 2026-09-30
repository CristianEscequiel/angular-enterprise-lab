import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { Machine, MachineDraft } from '../models/machine.model';
import { Part } from '../models/part.model';
import {
  DuplicateMachineCodeError,
  InvalidMachineError,
  MachineHasPartsError,
  MachineLoadError,
  MachinesService,
} from './machines.service';

describe('MachinesService', () => {
  const machinesUrl = `${API_BASE_URL}/maquinas`;
  const partsUrl = `${API_BASE_URL}/partes`;
  const notFound = { status: 404, statusText: 'Not Found' };
  const serverError = { status: 500, statusText: 'Server Error' };
  const networkFailure = { status: 0, statusText: 'Unknown Error' };

  // Los `id` los asigna el servidor.
  const envasadora: Machine = { id: 'srv-1', code: 'ENV-01', name: 'Envasadora' };
  const selladora: Machine = { id: 'srv-2', code: '0042', name: 'Selladora' };
  const machines = [envasadora, selladora];
  const draft: MachineDraft = { code: 'ROT-03', name: 'Rotuladora' };

  const part = (id: string, machineId: string, parentId: string | null = null): Part => ({
    id,
    machineId,
    parentId,
    name: `Parte ${id}`,
  });

  let service: MachinesService;
  let httpMock: HttpTestingController;
  let result: unknown;
  let error: unknown;
  let completed: boolean;

  const subscribe = (source: Observable<unknown>): void => {
    source.subscribe({
      next: (value) => (result = value),
      error: (e: unknown) => (error = e),
      complete: () => (completed = true),
    });
  };

  const expectNoRequest = (): void => httpMock.expectNone(() => true);
  const expectNoWrite = (): void => httpMock.expectNone((req) => req.method !== 'GET');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MachinesService);
    httpMock = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
    completed = false;
  });

  // Si un test falla dejando un pedido sin responder, `verify()` lanza: el módulo se reinicia igual
  // para que ese fallo no contagie a los tests que siguen.
  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  describe('getAll', () => {
    it('gets the whole collection', () => {
      subscribe(service.getAll());

      const request = httpMock.expectOne(machinesUrl);
      expect(request.request.method).toBe('GET');
      request.flush(machines);

      expect(result).toEqual(machines);
    });
  });

  describe('getById', () => {
    it('gets the machine by its id', () => {
      subscribe(service.getById('srv-1'));

      const request = httpMock.expectOne(`${machinesUrl}/srv-1`);
      expect(request.request.method).toBe('GET');
      request.flush(envasadora);

      expect(result).toEqual(envasadora);
    });

    it('answers MachineLoadError "not-found" for a 404', () => {
      subscribe(service.getById('nope'));

      httpMock.expectOne(`${machinesUrl}/nope`).flush(null, notFound);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect((error as MachineLoadError).kind).toBe('not-found');
    });

    // Un corte de red no es "la máquina no existe".
    it.each([
      ['a 500', serverError],
      ['a 503', { status: 503, statusText: 'Unavailable' }],
      ['a network failure (status 0)', networkFailure],
    ])('answers MachineLoadError "connection" for %s', (_label, status) => {
      subscribe(service.getById('srv-1'));

      httpMock.expectOne(`${machinesUrl}/srv-1`).flush(null, status);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect((error as MachineLoadError).kind).toBe('connection');
    });

    it.each([
      ['an empty id', ''],
      ['a blank id', '   '],
    ])(
      'answers "not-found" for %s without any request (it would fetch the whole collection)',
      (_l, id) => {
        subscribe(service.getById(id));

        expect((error as MachineLoadError).kind).toBe('not-found');
        expectNoRequest();
      },
    );

    it('encodes the id in the URL', () => {
      subscribe(service.getById('../users'));

      httpMock.expectOne(`${machinesUrl}/..%2Fusers`).flush(envasadora);
    });
  });

  describe('create', () => {
    it('checks that the code is free and only then POSTs { code, name }, without an id', () => {
      expect.assertions(5);
      subscribe(service.create(draft));

      const check = httpMock.expectOne(machinesUrl);
      expect(check.request.method).toBe('GET');
      // Hasta que el chequeo no responde, no se escribe nada.
      httpMock.expectNone({ method: 'POST', url: machinesUrl });
      check.flush(machines);

      const post = httpMock.expectOne({ method: 'POST', url: machinesUrl });
      expect(post.request.body).toEqual({ code: 'ROT-03', name: 'Rotuladora' });
      expect(post.request.body).not.toHaveProperty('id');
      post.flush({ id: 'srv-3', code: 'ROT-03', name: 'Rotuladora' });

      expect(result).toEqual({ id: 'srv-3', code: 'ROT-03', name: 'Rotuladora' });
      expect(completed).toBe(true);
    });

    it('checks with the whole collection and no filter: ?code= would not match "0042"', () => {
      subscribe(service.create(draft));

      const check = httpMock.expectOne(machinesUrl);

      expect(check.request.urlWithParams).toBe(machinesUrl);
      check.flush(machines);
      httpMock.expectOne({ method: 'POST', url: machinesUrl }).flush({ id: 'x', ...draft });
    });

    it('normalizes the code (trim + uppercase) and trims the name before writing', () => {
      subscribe(service.create({ code: '  rot-03 ', name: '  Rotuladora  ' }));

      httpMock.expectOne(machinesUrl).flush(machines);
      const post = httpMock.expectOne({ method: 'POST', url: machinesUrl });

      expect(post.request.body).toEqual({ code: 'ROT-03', name: 'Rotuladora' });
      post.flush({ id: 'x', ...(post.request.body as object) });
    });

    it('writes only code and name: nothing else from the draft', () => {
      subscribe(service.create({ ...draft, id: 'mine', password: 'x' } as MachineDraft));

      httpMock.expectOne(machinesUrl).flush(machines);
      const post = httpMock.expectOne({ method: 'POST', url: machinesUrl });

      expect(Object.keys(post.request.body as object).sort()).toEqual(['code', 'name']);
      post.flush({ id: 'x', ...draft });
    });

    describe('duplicated code', () => {
      it('blocks an identical code: no POST is sent', () => {
        subscribe(service.create({ code: 'ENV-01', name: 'Otra' }));

        httpMock.expectOne(machinesUrl).flush(machines);

        expect(error).toBeInstanceOf(DuplicateMachineCodeError);
        expect((error as DuplicateMachineCodeError).code).toBe('ENV-01');
        expect(completed).toBe(false);
        expectNoWrite();
      });

      it.each(['env-01', 'Env-01', ' ENV-01 ', '\tenv-01\n'])(
        'blocks "%s": it is the same code as ENV-01 (case and edge spaces do not count)',
        (code) => {
          subscribe(service.create({ code, name: 'Otra' }));

          httpMock.expectOne(machinesUrl).flush(machines);

          expect(error).toBeInstanceOf(DuplicateMachineCodeError);
          expect((error as DuplicateMachineCodeError).code).toBe('ENV-01');
          expectNoWrite();
        },
      );

      it('blocks a code whose stored twin was hand-edited to lowercase', () => {
        subscribe(service.create({ code: 'ENV-01', name: 'Otra' }));

        httpMock.expectOne(machinesUrl).flush([{ ...envasadora, code: 'env-01' }]);

        expect(error).toBeInstanceOf(DuplicateMachineCodeError);
        expectNoWrite();
      });

      it('blocks a numeric-looking code that exists: "0042"', () => {
        subscribe(service.create({ code: '0042', name: 'Otra' }));

        httpMock.expectOne(machinesUrl).flush(machines);

        expect(error).toBeInstanceOf(DuplicateMachineCodeError);
        expectNoWrite();
      });

      it('allows "42" when only "0042" exists: they are different codes', () => {
        subscribe(service.create({ code: '42', name: 'Otra' }));

        httpMock.expectOne(machinesUrl).flush(machines);
        const post = httpMock.expectOne({ method: 'POST', url: machinesUrl });

        expect(post.request.body).toMatchObject({ code: '42' });
        post.flush({ id: 'x', code: '42', name: 'Otra' });
      });

      it('tolerates a stored machine without a usable code instead of crashing', () => {
        subscribe(service.create(draft));

        httpMock.expectOne(machinesUrl).flush([{ id: 'x', name: 'Sin código' }, envasadora]);
        httpMock.expectOne({ method: 'POST', url: machinesUrl }).flush({ id: 'y', ...draft });

        expect(error).toBeUndefined();
      });

      it('allows the first machine of an empty collection', () => {
        subscribe(service.create(draft));

        httpMock.expectOne(machinesUrl).flush([]);
        httpMock.expectOne({ method: 'POST', url: machinesUrl }).flush({ id: 'x', ...draft });

        expect(error).toBeUndefined();
      });
    });

    describe('invalid input: no request at all', () => {
      it.each([
        ['an empty code', { code: '', name: 'X' }],
        ['a blank code', { code: '   ', name: 'X' }],
        ['a code with spaces inside', { code: 'ENV 01', name: 'X' }],
        ['a code that starts with a hyphen', { code: '-ENV', name: 'X' }],
        ['a path traversal as code', { code: '../users', name: 'X' }],
        ['a code longer than 20 characters', { code: 'A'.repeat(21), name: 'X' }],
        ['an empty name', { code: 'ROT-03', name: '' }],
        ['a blank name', { code: 'ROT-03', name: '   ' }],
      ])('rejects %s with InvalidMachineError', (_label, invalid) => {
        subscribe(service.create(invalid));

        expect(error).toBeInstanceOf(InvalidMachineError);
        expectNoRequest();
      });
    });

    // Un error de conexión no es "el código está libre" ni "está repetido".
    it.each([
      ['a 500', serverError],
      ['a network failure (status 0)', networkFailure],
    ])('does not write when checking the code fails with %s', (_label, status) => {
      subscribe(service.create(draft));

      httpMock.expectOne(machinesUrl).flush(null, status);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(status.status);
      expect(error).not.toBeInstanceOf(DuplicateMachineCodeError);
      expectNoWrite();
    });

    it('propagates a failure of the POST itself', () => {
      subscribe(service.create(draft));

      httpMock.expectOne(machinesUrl).flush(machines);
      httpMock.expectOne({ method: 'POST', url: machinesUrl }).flush(null, serverError);

      expect((error as HttpErrorResponse).status).toBe(500);
    });
  });

  describe('update', () => {
    it('checks the codes, then PUTs { code, name } at the machine id, without an id in the body', () => {
      expect.assertions(5);
      subscribe(service.update('srv-1', { code: 'ENV-01', name: 'Envasadora nueva' }));

      const check = httpMock.expectOne(machinesUrl);
      expect(check.request.method).toBe('GET');
      httpMock.expectNone(`${machinesUrl}/srv-1`);
      check.flush(machines);

      const put = httpMock.expectOne(`${machinesUrl}/srv-1`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ code: 'ENV-01', name: 'Envasadora nueva' });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush({ id: 'srv-1', code: 'ENV-01', name: 'Envasadora nueva' });

      expect(result).toEqual({ id: 'srv-1', code: 'ENV-01', name: 'Envasadora nueva' });
    });

    it('does not count the machine itself as a duplicate: it can keep its own code', () => {
      subscribe(service.update('srv-1', { code: 'ENV-01', name: 'Otro nombre' }));

      httpMock.expectOne(machinesUrl).flush(machines);
      httpMock.expectOne(`${machinesUrl}/srv-1`).flush(envasadora);

      expect(error).toBeUndefined();
    });

    it('lets the machine change only the case of its own code', () => {
      subscribe(service.update('srv-1', { code: 'env-01', name: 'Envasadora' }));

      httpMock.expectOne(machinesUrl).flush(machines);
      const put = httpMock.expectOne(`${machinesUrl}/srv-1`);

      expect(put.request.body).toEqual({ code: 'ENV-01', name: 'Envasadora' });
      put.flush(envasadora);
    });

    it('lets the machine take a free code', () => {
      subscribe(service.update('srv-1', { code: 'ENV-02', name: 'Envasadora' }));

      httpMock.expectOne(machinesUrl).flush(machines);
      const put = httpMock.expectOne(`${machinesUrl}/srv-1`);

      expect(put.request.body).toMatchObject({ code: 'ENV-02' });
      put.flush({ id: 'srv-1', code: 'ENV-02', name: 'Envasadora' });
    });

    it('blocks a code that belongs to ANOTHER machine, whatever the case: no PUT', () => {
      subscribe(service.update('srv-1', { code: '0042', name: 'Envasadora' }));

      httpMock.expectOne(machinesUrl).flush(machines);

      expect(error).toBeInstanceOf(DuplicateMachineCodeError);
      expect((error as DuplicateMachineCodeError).code).toBe('0042');
      expectNoWrite();
    });

    it('blocks the code of another machine written in lowercase', () => {
      subscribe(service.update('srv-2', { code: 'env-01', name: 'Selladora' }));

      httpMock.expectOne(machinesUrl).flush(machines);

      expect(error).toBeInstanceOf(DuplicateMachineCodeError);
      expectNoWrite();
    });

    it('fails with MachineLoadError "not-found" and writes nothing when the machine no longer exists', () => {
      subscribe(service.update('srv-9', { code: 'ROT-03', name: 'Rotuladora' }));

      httpMock.expectOne(machinesUrl).flush(machines);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect((error as MachineLoadError).kind).toBe('not-found');
      expectNoWrite();
    });

    it.each([
      ['an empty id', '', { code: 'ROT-03', name: 'X' }],
      ['a blank id', '  ', { code: 'ROT-03', name: 'X' }],
      ['an invalid code', 'srv-1', { code: 'a b', name: 'X' }],
      ['an empty name', 'srv-1', { code: 'ROT-03', name: '  ' }],
    ])('rejects %s with InvalidMachineError and sends nothing', (_label, id, invalid) => {
      subscribe(service.update(id, invalid));

      expect(error).toBeInstanceOf(InvalidMachineError);
      expectNoRequest();
    });

    it.each([
      ['a 500', serverError],
      ['a network failure (status 0)', networkFailure],
    ])('does not write when checking the codes fails with %s', (_label, status) => {
      subscribe(service.update('srv-1', draft));

      httpMock.expectOne(machinesUrl).flush(null, status);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expectNoWrite();
    });

    it('propagates a failure of the PUT itself', () => {
      subscribe(service.update('srv-1', draft));

      httpMock.expectOne(machinesUrl).flush(machines);
      httpMock.expectOne(`${machinesUrl}/srv-1`).flush(null, notFound);

      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.update('a/b', draft));

      httpMock.expectOne(machinesUrl).flush([{ id: 'a/b', code: 'X', name: 'Y' }]);
      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush({ id: 'a/b', ...draft });
    });
  });

  describe('delete', () => {
    // Criterio 2 del spec, para máquinas: nunca dejar partes sin máquina.
    describe('a machine with parts', () => {
      it('is blocked with MachineHasPartsError and DELETE never goes out', () => {
        subscribe(service.delete('srv-1'));

        httpMock.expectOne(partsUrl).flush([part('p1', 'srv-1'), part('p2', 'srv-1', 'p1')]);

        expect(error).toBeInstanceOf(MachineHasPartsError);
        expect((error as MachineHasPartsError).machineId).toBe('srv-1');
        expect((error as MachineHasPartsError).partCount).toBe(2);
        expect(completed).toBe(false);
        httpMock.expectNone(`${machinesUrl}/srv-1`);
      });

      it('explains what to do, with singular and plural', () => {
        subscribe(service.delete('srv-1'));
        httpMock.expectOne(partsUrl).flush([part('p1', 'srv-1'), part('p2', 'srv-1')]);
        expect((error as Error).message).toContain('2 partes');
        expect((error as Error).message).toContain('Elimine primero');

        subscribe(service.delete('srv-1'));
        httpMock.expectOne(partsUrl).flush([part('p1', 'srv-1')]);
        expect((error as Error).message).toContain('1 parte.');
      });

      it('counts a part that is orphaned inside its tree: it still points at the machine', () => {
        subscribe(service.delete('srv-1'));

        httpMock.expectOne(partsUrl).flush([part('p9', 'srv-1', 'no-existe')]);

        expect(error).toBeInstanceOf(MachineHasPartsError);
        httpMock.expectNone(`${machinesUrl}/srv-1`);
      });
    });

    describe('a machine without parts', () => {
      it('checks the parts first and then sends DELETE', () => {
        subscribe(service.delete('srv-2'));

        const check = httpMock.expectOne(partsUrl);
        expect(check.request.method).toBe('GET');
        expect(check.request.urlWithParams).toBe(partsUrl);
        httpMock.expectNone(`${machinesUrl}/srv-2`);
        check.flush([]);

        const remove = httpMock.expectOne(`${machinesUrl}/srv-2`);
        expect(remove.request.method).toBe('DELETE');
        remove.flush(selladora);

        expect(result).toBeUndefined();
        expect(completed).toBe(true);
        expect(error).toBeUndefined();
      });

      it('is not blocked by the parts of OTHER machines', () => {
        subscribe(service.delete('srv-2'));

        httpMock.expectOne(partsUrl).flush([part('p1', 'srv-1'), part('p2', 'srv-1', 'p1')]);
        httpMock.expectOne(`${machinesUrl}/srv-2`).flush(selladora);

        expect(error).toBeUndefined();
        expect(completed).toBe(true);
      });
    });

    // El chequeo no puede apoyarse en lo que la pantalla tenga cargado: se repite cada vez.
    it('uses fresh data: a part added meanwhile blocks the second delete', () => {
      subscribe(service.delete('srv-2'));
      httpMock.expectOne(partsUrl).flush([]);
      httpMock.expectOne(`${machinesUrl}/srv-2`).flush(selladora);
      expect(error).toBeUndefined();

      // Otro usuario le agrega una parte a la máquina. Mismo servicio: se bloquea.
      subscribe(service.delete('srv-2'));
      httpMock.expectOne(partsUrl).flush([part('p9', 'srv-2')]);

      expect(error).toBeInstanceOf(MachineHasPartsError);
      httpMock.expectNone(`${machinesUrl}/srv-2`);
    });

    it.each([
      ['a 500', serverError],
      ['a network failure (status 0)', networkFailure],
    ])('does not delete when checking the parts fails with %s', (_label, status) => {
      subscribe(service.delete('srv-2'));

      httpMock.expectOne(partsUrl).flush(null, status);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(MachineHasPartsError);
      httpMock.expectNone(`${machinesUrl}/srv-2`);
    });

    it('propagates a failure of the DELETE itself (already deleted → 404)', () => {
      subscribe(service.delete('srv-2'));

      httpMock.expectOne(partsUrl).flush([]);
      httpMock.expectOne(`${machinesUrl}/srv-2`).flush(null, notFound);

      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it.each([
      ['an empty id', ''],
      ['a blank id', '  '],
    ])('rejects %s with InvalidMachineError and sends nothing', (_label, id) => {
      subscribe(service.delete(id));

      expect(error).toBeInstanceOf(InvalidMachineError);
      expectNoRequest();
    });

    it('encodes the id in the URL', () => {
      subscribe(service.delete('a/b'));

      httpMock.expectOne(partsUrl).flush([]);
      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush({});
    });
  });
});
