import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { Part } from '../models/part.model';
import {
  InvalidPartError,
  MachineNotFoundError,
  ParentPartNotFoundError,
  PartHasChildrenError,
  PartsService,
} from './parts.service';

describe('PartsService', () => {
  const partsUrl = `${API_BASE_URL}/partes`;
  const machinesUrl = `${API_BASE_URL}/maquinas`;
  const notFound = { status: 404, statusText: 'Not Found' };
  const serverError = { status: 500, statusText: 'Server Error' };

  const part = (
    id: string,
    parentId: string | null,
    machineId = '1',
    name = `Parte ${id}`,
  ): Part => ({
    id,
    machineId,
    parentId,
    name,
  });
  const machine = { id: '1', code: 'ENV-01', name: 'Envasadora' };

  let service: PartsService;
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

  // Ninguna llamada HTTP de ningún tipo: para los casos que ni siquiera deben salir.
  const expectNoRequest = (): void => httpMock.expectNone(() => true);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartsService);
    httpMock = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
    completed = false;
  });

  // Si un test falla dejando un pedido sin responder, `verify()` lanza: el módulo se reinicia igual
  // para que ese fallo no contagie a los tests que siguen (y el conteo de fallos sea el real).
  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  describe('getAll', () => {
    it('gets the whole collection', () => {
      const parts = [part('1', null), part('2', '1')];

      subscribe(service.getAll());
      const request = httpMock.expectOne(partsUrl);
      expect(request.request.method).toBe('GET');
      request.flush(parts);

      expect(result).toEqual(parts);
    });
  });

  describe('getByMachine', () => {
    it('does NOT filter with ?machineId= (json-server would coerce it and find nothing)', () => {
      subscribe(service.getByMachine('1'));

      const request = httpMock.expectOne(partsUrl);
      expect(request.request.params.keys()).toEqual([]);
      expect(request.request.urlWithParams).toBe(partsUrl);
      request.flush([]);
    });

    it('returns only the parts of that machine, in the order received', () => {
      subscribe(service.getByMachine('1'));

      httpMock
        .expectOne(partsUrl)
        .flush([
          part('1', null, '1'),
          part('2', null, '2'),
          part('3', '1', '1'),
          part('4', '2', '2'),
        ]);

      expect((result as Part[]).map((item) => item.id)).toEqual(['1', '3']);
    });

    it('returns an empty list for a machine without parts', () => {
      subscribe(service.getByMachine('9'));

      httpMock.expectOne(partsUrl).flush([part('1', null, '1')]);

      expect(result).toEqual([]);
    });

    it('propagates a connection error', () => {
      subscribe(service.getByMachine('1'));

      httpMock.expectOne(partsUrl).flush(null, serverError);

      expect((error as HttpErrorResponse).status).toBe(500);
    });
  });

  describe('create', () => {
    describe('a first-level part', () => {
      it('checks the machine first and only then POSTs, with parentId null', () => {
        subscribe(service.create('1', null, 'Mesa de transporte'));

        const check = httpMock.expectOne(`${machinesUrl}/1`);
        expect(check.request.method).toBe('GET');
        // Hasta que la máquina no responde, no se escribe nada.
        httpMock.expectNone(partsUrl);

        check.flush(machine);

        const post = httpMock.expectOne(partsUrl);
        expect(post.request.method).toBe('POST');
        expect(post.request.body).toEqual({
          machineId: '1',
          parentId: null,
          name: 'Mesa de transporte',
        });
        post.flush(part('7', null, '1', 'Mesa de transporte'));

        expect(result).toEqual(part('7', null, '1', 'Mesa de transporte'));
        expect(completed).toBe(true);
      });

      it('does not look up any parent', () => {
        subscribe(service.create('1', null, 'Mesa'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectNone(`${partsUrl}/null`);
        httpMock.expectOne(partsUrl).flush(part('7', null));
      });
    });

    describe('a child part', () => {
      it('checks the machine, then the parent, then POSTs with that parentId', () => {
        subscribe(service.create('1', '5', 'Cinta 1'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectNone(partsUrl);

        const parentCheck = httpMock.expectOne(`${partsUrl}/5`);
        expect(parentCheck.request.method).toBe('GET');
        httpMock.expectNone(partsUrl);
        parentCheck.flush(part('5', null, '1'));

        const post = httpMock.expectOne(partsUrl);
        expect(post.request.body).toEqual({ machineId: '1', parentId: '5', name: 'Cinta 1' });
        post.flush(part('8', '5'));

        expect(result).toEqual(part('8', '5'));
      });

      it('can add a level below an existing leaf at any depth', () => {
        subscribe(service.create('1', 'hoja-nivel-3', 'Rodamiento'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectOne(`${partsUrl}/hoja-nivel-3`).flush(part('hoja-nivel-3', '2', '1'));
        const post = httpMock.expectOne(partsUrl);

        expect((post.request.body as Part).parentId).toBe('hoja-nivel-3');
        post.flush(part('9', 'hoja-nivel-3'));
      });
    });

    it('sends only machineId, parentId and name: never an id (the server discards it)', () => {
      subscribe(service.create('1', null, 'Mesa'));

      httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
      const post = httpMock.expectOne(partsUrl);
      const body = post.request.body as Record<string, unknown>;

      expect(Object.keys(body).sort()).toEqual(['machineId', 'name', 'parentId']);
      post.flush(part('7', null));
    });

    it('trims the name', () => {
      subscribe(service.create('1', null, '  Mesa  '));

      httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
      const post = httpMock.expectOne(partsUrl);

      expect((post.request.body as Part).name).toBe('Mesa');
      post.flush(part('7', null));
    });

    describe('machine that does not exist', () => {
      it('fails with MachineNotFoundError and never POSTs nor looks up the parent', () => {
        subscribe(service.create('999', '5', 'Cinta'));

        httpMock.expectOne(`${machinesUrl}/999`).flush(null, notFound);

        expect(error).toBeInstanceOf(MachineNotFoundError);
        expect((error as MachineNotFoundError).machineId).toBe('999');
        expect(completed).toBe(false);
        httpMock.expectNone(partsUrl);
        httpMock.expectNone(`${partsUrl}/5`);
      });
    });

    describe('parent that does not exist', () => {
      it('fails with ParentPartNotFoundError (missing) and never POSTs', () => {
        subscribe(service.create('1', '777', 'Huérfana'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectOne(`${partsUrl}/777`).flush(null, notFound);

        expect(error).toBeInstanceOf(ParentPartNotFoundError);
        expect((error as ParentPartNotFoundError).problem).toBe('missing');
        expect((error as ParentPartNotFoundError).parentId).toBe('777');
        httpMock.expectNone(partsUrl);
      });
    });

    describe('parent from another machine', () => {
      it('fails with ParentPartNotFoundError (other-machine) and never POSTs', () => {
        subscribe(service.create('1', '5', 'Cruzada'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectOne(`${partsUrl}/5`).flush(part('5', null, '2'));

        expect(error).toBeInstanceOf(ParentPartNotFoundError);
        expect((error as ParentPartNotFoundError).problem).toBe('other-machine');
        httpMock.expectNone(partsUrl);
      });
    });

    // Un error de conexión no es "no existe": si se confundieran, un corte de red parecería
    // "la máquina fue borrada" y el usuario no sabría que tiene que reintentar.
    describe('connection errors are never read as "does not exist"', () => {
      it.each([
        ['a 500', serverError],
        ['a 503', { status: 503, statusText: 'Unavailable' }],
        ['a network failure (status 0)', { status: 0, statusText: 'Unknown Error' }],
      ])('propagates %s while checking the machine', (_label, status) => {
        subscribe(service.create('1', '5', 'Cinta'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(null, status);

        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(status.status);
        expect(error).not.toBeInstanceOf(MachineNotFoundError);
        httpMock.expectNone(partsUrl);
        httpMock.expectNone(`${partsUrl}/5`);
      });

      it.each([
        ['a 500', serverError],
        ['a network failure (status 0)', { status: 0, statusText: 'Unknown Error' }],
      ])('propagates %s while checking the parent', (_label, status) => {
        subscribe(service.create('1', '5', 'Cinta'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectOne(`${partsUrl}/5`).flush(null, status);

        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(status.status);
        expect(error).not.toBeInstanceOf(ParentPartNotFoundError);
        httpMock.expectNone(partsUrl);
      });

      it('propagates a failure of the POST itself', () => {
        subscribe(service.create('1', null, 'Mesa'));

        httpMock.expectOne(`${machinesUrl}/1`).flush(machine);
        httpMock.expectOne(partsUrl).flush(null, serverError);

        expect((error as HttpErrorResponse).status).toBe(500);
      });
    });

    describe('invalid input: no request at all', () => {
      it.each([
        ['an empty name', '1', null, ''],
        ['a blank name', '1', null, '   '],
        ['an empty machineId', '', null, 'Mesa'],
        ['a blank machineId', '  ', null, 'Mesa'],
        ['an empty parentId (must be null, not "")', '1', '', 'Mesa'],
        ['a blank parentId', '1', '  ', 'Mesa'],
      ])('rejects %s with InvalidPartError', (_label, machineId, parentId, name) => {
        subscribe(service.create(machineId, parentId, name));

        expect(error).toBeInstanceOf(InvalidPartError);
        expectNoRequest();
      });
    });

    it('encodes the ids in the lookup URLs', () => {
      subscribe(service.create('a/b', '../x', 'Cinta'));

      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush(machine);
      httpMock.expectOne(`${partsUrl}/..%2Fx`).flush(part('..x', null, 'a/b'));
      httpMock.expectOne(partsUrl).flush(part('9', '..x', 'a/b'));
    });
  });

  describe('update', () => {
    it('PATCHes exactly { name }: machineId and parentId never travel', () => {
      subscribe(service.update('2', 'Cinta 1 bis'));

      const request = httpMock.expectOne(`${partsUrl}/2`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ name: 'Cinta 1 bis' });
      expect(Object.keys(request.request.body as object)).toEqual(['name']);
      request.flush(part('2', '1', '1', 'Cinta 1 bis'));

      expect(result).toEqual(part('2', '1', '1', 'Cinta 1 bis'));
    });

    it('trims the name', () => {
      subscribe(service.update('2', '  Cinta  '));

      const request = httpMock.expectOne(`${partsUrl}/2`);
      expect(request.request.body).toEqual({ name: 'Cinta' });
      request.flush(part('2', '1'));
    });

    it('does not look up the machine or the parent', () => {
      subscribe(service.update('2', 'Cinta'));

      httpMock.expectOne(`${partsUrl}/2`).flush(part('2', '1'));
      httpMock.expectNone(machinesUrl);
      httpMock.expectNone(partsUrl);
    });

    it.each([
      ['an empty name', '2', ''],
      ['a blank name', '2', '   '],
      ['an empty id', '', 'Cinta'],
      ['a blank id', '  ', 'Cinta'],
    ])('rejects %s with InvalidPartError and sends nothing', (_label, id, name) => {
      subscribe(service.update(id, name));

      expect(error).toBeInstanceOf(InvalidPartError);
      expectNoRequest();
    });

    it('propagates a 404 (the part was deleted meanwhile) as the HTTP error', () => {
      subscribe(service.update('2', 'Cinta'));

      httpMock.expectOne(`${partsUrl}/2`).flush(null, notFound);

      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.update('a/b', 'Cinta'));

      httpMock.expectOne(`${partsUrl}/a%2Fb`).flush(part('a/b', null));
    });
  });

  describe('delete', () => {
    // Criterio 2 del spec: nunca dejar sub-partes huérfanas.
    describe('a part with children', () => {
      const parts = [part('1', null), part('2', '1'), part('3', '1'), part('4', '2')];

      it('is blocked with PartHasChildrenError and DELETE never goes out', () => {
        subscribe(service.delete('1'));

        httpMock.expectOne(partsUrl).flush(parts);

        expect(error).toBeInstanceOf(PartHasChildrenError);
        expect((error as PartHasChildrenError).partId).toBe('1');
        expect((error as PartHasChildrenError).childCount).toBe(2);
        expect(completed).toBe(false);
        httpMock.expectNone(`${partsUrl}/1`);
      });

      it('is blocked at any depth: a middle node with one child', () => {
        subscribe(service.delete('2'));

        httpMock.expectOne(partsUrl).flush(parts);

        expect(error).toBeInstanceOf(PartHasChildrenError);
        expect((error as PartHasChildrenError).childCount).toBe(1);
        httpMock.expectNone(`${partsUrl}/2`);
      });

      it('explains what to do, with singular and plural', () => {
        subscribe(service.delete('1'));
        httpMock.expectOne(partsUrl).flush(parts);
        expect((error as Error).message).toContain('2 sub-partes');
        expect((error as Error).message).toContain('Elimine primero');

        subscribe(service.delete('2'));
        httpMock.expectOne(partsUrl).flush(parts);
        expect((error as Error).message).toContain('1 sub-parte.');
      });

      it('is blocked even if the child belongs to another machine (better than orphaning it)', () => {
        subscribe(service.delete('1'));

        httpMock.expectOne(partsUrl).flush([part('1', null, '1'), part('2', '1', '2')]);

        expect(error).toBeInstanceOf(PartHasChildrenError);
        httpMock.expectNone(`${partsUrl}/1`);
      });
    });

    describe('a leaf', () => {
      it('checks the children first and then sends DELETE', () => {
        subscribe(service.delete('4'));

        const check = httpMock.expectOne(partsUrl);
        expect(check.request.method).toBe('GET');
        httpMock.expectNone(`${partsUrl}/4`);
        check.flush([part('1', null), part('2', '1'), part('4', '2')]);

        const remove = httpMock.expectOne(`${partsUrl}/4`);
        expect(remove.request.method).toBe('DELETE');
        remove.flush(part('4', '2'));

        expect(result).toBeUndefined();
        expect(completed).toBe(true);
        expect(error).toBeUndefined();
      });
    });

    // El chequeo no puede apoyarse en el árbol que la pantalla tiene cargado: se repite cada vez.
    describe('uses fresh data', () => {
      it('asks the server again on every call: a child added meanwhile blocks the second delete', () => {
        // 1) Cuando la pantalla se cargó, la parte "2" era una hoja: el borrado sale.
        subscribe(service.delete('2'));
        httpMock.expectOne(partsUrl).flush([part('1', null), part('2', '1')]);
        httpMock.expectOne(`${partsUrl}/2`).flush(part('2', '1'));
        expect(error).toBeUndefined();

        // 2) Otro usuario le agrega una hija a "2". Mismo servicio, misma "pantalla": se bloquea.
        error = undefined;
        subscribe(service.delete('2'));
        httpMock.expectOne(partsUrl).flush([part('1', null), part('2', '1'), part('9', '2')]);

        expect(error).toBeInstanceOf(PartHasChildrenError);
        httpMock.expectNone(`${partsUrl}/2`);
      });
    });

    describe('when the check itself fails', () => {
      it.each([
        ['a 500', serverError],
        ['a network failure (status 0)', { status: 0, statusText: 'Unknown Error' }],
      ])('does not delete on %s and propagates the HTTP error', (_label, status) => {
        subscribe(service.delete('4'));

        httpMock.expectOne(partsUrl).flush(null, status);

        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(status.status);
        expect(error).not.toBeInstanceOf(PartHasChildrenError);
        httpMock.expectNone(`${partsUrl}/4`);
      });
    });

    it('propagates a failure of the DELETE itself (e.g. already deleted → 404)', () => {
      subscribe(service.delete('4'));

      httpMock.expectOne(partsUrl).flush([part('4', null)]);
      httpMock.expectOne(`${partsUrl}/4`).flush(null, notFound);

      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it.each([
      ['an empty id', ''],
      ['a blank id', '  '],
    ])('rejects %s with InvalidPartError and sends nothing', (_label, id) => {
      subscribe(service.delete(id));

      expect(error).toBeInstanceOf(InvalidPartError);
      expectNoRequest();
    });

    it('encodes the id in the URL', () => {
      subscribe(service.delete('a/b'));

      httpMock.expectOne(partsUrl).flush([part('a/b', null)]);
      httpMock.expectOne(`${partsUrl}/a%2Fb`).flush(part('a/b', null));
    });
  });
});
