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
  const partsUrl = `${API_BASE_URL}/parts`;
  const partsOfMachine1 = `${API_BASE_URL}/machines/1/parts`;
  const notFound = { status: 404, statusText: 'Not Found' };
  const badRequest = { status: 400, statusText: 'Bad Request' };
  const conflict = { status: 409, statusText: 'Conflict' };
  const serverError = { status: 500, statusText: 'Server Error' };

  const part = (id: string, parentId: string | null, machineId = '1'): Part => ({
    id,
    machineId,
    parentId,
    name: `Parte ${id}`,
  });

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

  it('does not expose a global parts listing any more', () => {
    expect(service).not.toHaveProperty('getAll');
  });

  describe('getByMachine', () => {
    it('asks GET /machines/{id}/parts and returns the flat list as received', () => {
      expect.assertions(3);
      const parts = [part('1', null), part('2', '1'), part('3', '2')];
      subscribe(service.getByMachine('1'));

      const request = httpMock.expectOne(partsOfMachine1);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual([]);
      request.flush(parts);

      expect(result).toEqual(parts);
    });

    it('returns an empty list for a machine without parts', () => {
      subscribe(service.getByMachine('1'));

      httpMock.expectOne(partsOfMachine1).flush([]);

      expect(result).toEqual([]);
    });

    it('fails with MachineNotFoundError on a 404', () => {
      expect.assertions(2);
      subscribe(service.getByMachine('1'));

      httpMock.expectOne(partsOfMachine1).flush({ code: 'NOT_FOUND', message: 'x' }, notFound);

      expect(error).toBeInstanceOf(MachineNotFoundError);
      expect(error).toMatchObject({ machineId: '1' });
    });

    it('propagates a server error, not as "machine not found"', () => {
      expect.assertions(2);
      subscribe(service.getByMachine('1'));

      httpMock.expectOne(partsOfMachine1).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(MachineNotFoundError);
    });

    it('fails with MachineNotFoundError for a blank id, with no request', () => {
      expect.assertions(1);
      subscribe(service.getByMachine('  '));

      expect(error).toBeInstanceOf(MachineNotFoundError);
      expectNoRequest();
    });

    it('encodes the machine id in the URL', () => {
      subscribe(service.getByMachine('a/b'));

      httpMock.expectOne(`${API_BASE_URL}/machines/a%2Fb/parts`).flush([]);
    });
  });

  describe('create', () => {
    it('POSTs { name, parentId: null } to /machines/{id}/parts for a first-level part', () => {
      expect.assertions(4);
      subscribe(service.create('1', null, 'Tensor'));

      const post = httpMock.expectOne(partsOfMachine1);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ name: 'Tensor', parentId: null });
      post.flush(part('11', null));

      expect(result).toEqual(part('11', null));
      expect(error).toBeUndefined();
    });

    it('POSTs the parentId for a sub-part, without looking anything up first', () => {
      expect.assertions(2);
      subscribe(service.create('1', '3', 'Tensor'));

      const post = httpMock.expectOne(partsOfMachine1);
      expect(post.request.body).toEqual({ name: 'Tensor', parentId: '3' });
      post.flush(part('11', '3'));

      expect(result).toEqual(part('11', '3'));
    });

    it('sends only name and parentId: never an id nor the machine id in the body', () => {
      expect.assertions(1);
      subscribe(service.create('1', null, 'Tensor'));

      const post = httpMock.expectOne(partsOfMachine1);
      expect(Object.keys(post.request.body as object).sort()).toEqual(['name', 'parentId']);
      post.flush({});
    });

    it('trims the name', () => {
      expect.assertions(1);
      subscribe(service.create('1', null, '  Tensor  '));

      const post = httpMock.expectOne(partsOfMachine1);
      expect(post.request.body).toMatchObject({ name: 'Tensor' });
      post.flush({});
    });

    it('fails with MachineNotFoundError on a 404', () => {
      expect.assertions(2);
      subscribe(service.create('1', null, 'Tensor'));

      httpMock.expectOne(partsOfMachine1).flush({ code: 'NOT_FOUND', message: 'x' }, notFound);

      expect(error).toBeInstanceOf(MachineNotFoundError);
      expect(result).toBeUndefined();
    });

    it('translates 400 PARENT_PART_NOT_FOUND into ParentPartNotFoundError (missing)', () => {
      expect.assertions(2);
      subscribe(service.create('1', '99', 'Tensor'));

      httpMock
        .expectOne(partsOfMachine1)
        .flush({ code: 'PARENT_PART_NOT_FOUND', message: 'No existe la parte 99' }, badRequest);

      expect(error).toBeInstanceOf(ParentPartNotFoundError);
      expect(error).toMatchObject({ parentId: '99', problem: 'missing' });
    });

    it('translates 400 PARENT_PART_OTHER_MACHINE into ParentPartNotFoundError (other-machine)', () => {
      expect.assertions(2);
      subscribe(service.create('1', '8', 'Tensor'));

      httpMock
        .expectOne(partsOfMachine1)
        .flush({ code: 'PARENT_PART_OTHER_MACHINE', message: 'Otra máquina' }, badRequest);

      expect(error).toBeInstanceOf(ParentPartNotFoundError);
      expect(error).toMatchObject({ parentId: '8', problem: 'other-machine' });
    });

    it.each([
      ['a server error', serverError],
      ['a network failure', { status: 0, statusText: 'Unknown Error' }],
    ])('propagates %s untouched, not as a "does not exist" error', (_label, response) => {
      expect.assertions(3);
      subscribe(service.create('1', '3', 'Tensor'));

      httpMock.expectOne(partsOfMachine1).flush('boom', response);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(MachineNotFoundError);
      expect(error).not.toBeInstanceOf(ParentPartNotFoundError);
    });

    it.each([
      ['a blank machine id', [' ', null, 'Tensor']],
      ['a blank parent id', ['1', '  ', 'Tensor']],
      ['a blank name', ['1', null, '   ']],
      ['an empty name', ['1', '3', '']],
    ] as const)('fails with InvalidPartError and sends nothing for %s', (_label, args) => {
      expect.assertions(1);
      subscribe(service.create(args[0], args[1], args[2]));

      expect(error).toBeInstanceOf(InvalidPartError);
      expectNoRequest();
    });

    it('encodes the machine id in the URL', () => {
      subscribe(service.create('a/b', null, 'Tensor'));

      httpMock.expectOne(`${API_BASE_URL}/machines/a%2Fb/parts`).flush({});
    });
  });

  describe('update', () => {
    it('PATCHes exactly { name } at /parts/{id}: machineId and parentId never travel', () => {
      expect.assertions(4);
      subscribe(service.update('5', 'Cinta 2B'));

      const patch = httpMock.expectOne(`${partsUrl}/5`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ name: 'Cinta 2B' });
      patch.flush({ ...part('5', '1'), name: 'Cinta 2B' });

      expect(result).toMatchObject({ id: '5', name: 'Cinta 2B' });
      expect(error).toBeUndefined();
    });

    it('trims the name', () => {
      expect.assertions(1);
      subscribe(service.update('5', '  Cinta  '));

      const patch = httpMock.expectOne(`${partsUrl}/5`);
      expect(patch.request.body).toEqual({ name: 'Cinta' });
      patch.flush({});
    });

    it.each([
      ['a blank id', [' ', 'Cinta']],
      ['a blank name', ['5', '   ']],
    ] as const)('fails with InvalidPartError and sends nothing for %s', (_label, args) => {
      expect.assertions(1);
      subscribe(service.update(args[0], args[1]));

      expect(error).toBeInstanceOf(InvalidPartError);
      expectNoRequest();
    });

    it('propagates a 404 (the part was deleted meanwhile) as the HTTP error', () => {
      expect.assertions(2);
      subscribe(service.update('5', 'Cinta'));

      httpMock.expectOne(`${partsUrl}/5`).flush('x', notFound);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.update('a/b', 'Cinta'));

      httpMock.expectOne(`${partsUrl}/a%2Fb`).flush({});
    });
  });

  describe('delete', () => {
    it('sends a single DELETE /parts/{id}, without asking for the children first', () => {
      expect.assertions(3);
      subscribe(service.delete('5'));

      const request = httpMock.expectOne(`${partsUrl}/5`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
      expect(error).toBeUndefined();
    });

    it('translates 409 PART_HAS_CHILDREN into PartHasChildrenError keeping the API message', () => {
      expect.assertions(3);
      subscribe(service.delete('1'));

      httpMock
        .expectOne(`${partsUrl}/1`)
        .flush({ code: 'PART_HAS_CHILDREN', message: 'La parte 1 tiene 2 sub-partes' }, conflict);

      expect(error).toBeInstanceOf(PartHasChildrenError);
      expect(error).toMatchObject({ partId: '1', message: 'La parte 1 tiene 2 sub-partes' });
      expect(completed).toBe(false);
    });

    it('falls back to a generic message when the API message is empty', () => {
      expect.assertions(1);
      subscribe(service.delete('1'));

      httpMock
        .expectOne(`${partsUrl}/1`)
        .flush({ code: 'PART_HAS_CHILDREN', message: '' }, conflict);

      expect((error as PartHasChildrenError).message).toContain('sub-partes');
    });

    it.each(['', '   '])('fails with InvalidPartError for the blank id %j, no request', (id) => {
      expect.assertions(1);
      subscribe(service.delete(id));

      expect(error).toBeInstanceOf(InvalidPartError);
      expectNoRequest();
    });

    it.each([
      ['already deleted (404)', notFound],
      ['a server error', serverError],
    ])('propagates %s untouched', (_label, response) => {
      expect.assertions(2);
      subscribe(service.delete('5'));

      httpMock.expectOne(`${partsUrl}/5`).flush('x', response);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(PartHasChildrenError);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.delete('a/b'));

      httpMock.expectOne(`${partsUrl}/a%2Fb`).flush(null);
    });
  });
});
