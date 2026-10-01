import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { Machine, MachineDraft } from '../models/machine.model';
import {
  DuplicateMachineCodeError,
  InvalidMachineError,
  MachineHasPartsError,
  MachineLoadError,
  MachinesService,
} from './machines.service';

describe('MachinesService', () => {
  const machinesUrl = `${API_BASE_URL}/machines`;
  const notFound = { status: 404, statusText: 'Not Found' };
  const conflict = { status: 409, statusText: 'Conflict' };
  const serverError = { status: 500, statusText: 'Server Error' };
  const networkFailure = { status: 0, statusText: 'Unknown Error' };

  // Los `id` los asigna el servidor y `partCount` lo calcula.
  const envasadora: Machine = { id: '1', code: 'ENV-01', name: 'Envasadora', partCount: 7 };
  const selladora: Machine = { id: '2', code: '0042', name: 'Selladora', partCount: 0 };
  const draft: MachineDraft = { code: 'ROT-03', name: 'Rotuladora' };

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

  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  describe('getAll', () => {
    it('gets the whole collection with GET /machines, partCount included', () => {
      expect.assertions(3);
      subscribe(service.getAll());

      const request = httpMock.expectOne(machinesUrl);
      expect(request.request.method).toBe('GET');
      request.flush([envasadora, selladora]);

      expect(result).toEqual([envasadora, selladora]);
      expect((result as Machine[])[0]?.partCount).toBe(7);
    });
  });

  describe('getById', () => {
    it('gets the machine by its id', () => {
      expect.assertions(2);
      subscribe(service.getById('1'));

      const request = httpMock.expectOne(`${machinesUrl}/1`);
      expect(request.request.method).toBe('GET');
      request.flush(envasadora);

      expect(result).toEqual(envasadora);
    });

    it('answers MachineLoadError "not-found" for a 404', () => {
      expect.assertions(2);
      subscribe(service.getById('99'));

      httpMock
        .expectOne(`${machinesUrl}/99`)
        .flush({ code: 'NOT_FOUND', message: 'No existe' }, notFound);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect(error).toMatchObject({ kind: 'not-found' });
    });

    it.each([
      ['a server error', serverError],
      ['a network failure', networkFailure],
    ])('answers MachineLoadError "connection" for %s, not "not found"', (_label, response) => {
      expect.assertions(2);
      subscribe(service.getById('1'));

      httpMock.expectOne(`${machinesUrl}/1`).flush('boom', response);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect(error).toMatchObject({ kind: 'connection' });
    });

    it.each(['', '   '])('answers "not-found" for the blank id %j without any request', (id) => {
      expect.assertions(1);
      subscribe(service.getById(id));

      expect(error).toMatchObject({ kind: 'not-found' });
      expectNoRequest();
    });

    it('encodes the id in the URL', () => {
      subscribe(service.getById('a/b'));

      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush(envasadora);
    });
  });

  describe('create', () => {
    it('sends a single POST /machines with { code, name } and no id, without reading first', () => {
      expect.assertions(5);
      subscribe(service.create(draft));

      const post = httpMock.expectOne(machinesUrl);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ code: 'ROT-03', name: 'Rotuladora' });
      expect(post.request.body).not.toHaveProperty('id');
      post.flush({ id: '4', ...draft, partCount: 0 });

      expect(result).toEqual({ id: '4', ...draft, partCount: 0 });
      expect(error).toBeUndefined();
    });

    it('normalizes the code (trim + uppercase) and trims the name before writing', () => {
      expect.assertions(1);
      subscribe(service.create({ code: '  rot-03 ', name: '  Rotuladora ' }));

      const post = httpMock.expectOne(machinesUrl);
      expect(post.request.body).toEqual({ code: 'ROT-03', name: 'Rotuladora' });
      post.flush({});
    });

    it('writes only code and name: nothing else from the draft', () => {
      expect.assertions(1);
      subscribe(service.create({ ...draft, id: 'x', partCount: 9, extra: true } as MachineDraft));

      const post = httpMock.expectOne(machinesUrl);
      expect(Object.keys(post.request.body as object).sort()).toEqual(['code', 'name']);
      post.flush({});
    });

    it('translates 409 DUPLICATE_MACHINE_CODE into DuplicateMachineCodeError with the normalized code', () => {
      expect.assertions(3);
      subscribe(service.create({ code: 'env-01', name: 'Otra' }));

      httpMock
        .expectOne(machinesUrl)
        .flush({ code: 'DUPLICATE_MACHINE_CODE', message: 'Ya existe ENV-01' }, conflict);

      expect(error).toBeInstanceOf(DuplicateMachineCodeError);
      expect(error).toMatchObject({ code: 'ENV-01' });
      expect(result).toBeUndefined();
    });

    it.each([
      ['a blank code', { code: '   ', name: 'Rotuladora' }],
      ['a code with spaces inside', { code: 'ROT 03', name: 'Rotuladora' }],
      ['a path traversal code', { code: '../users', name: 'Rotuladora' }],
      ['a code longer than 20 characters', { code: 'A'.repeat(21), name: 'Rotuladora' }],
      ['a blank name', { code: 'ROT-03', name: '   ' }],
    ])('fails with InvalidMachineError and sends nothing for %s', (_label, invalid) => {
      expect.assertions(1);
      subscribe(service.create(invalid));

      expect(error).toBeInstanceOf(InvalidMachineError);
      expectNoRequest();
    });

    it('propagates any other failure of the POST untouched', () => {
      expect.assertions(2);
      subscribe(service.create(draft));

      httpMock.expectOne(machinesUrl).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(DuplicateMachineCodeError);
    });
  });

  describe('update', () => {
    it('sends a single PUT /machines/{id} with { code, name } and no id in the body', () => {
      expect.assertions(4);
      subscribe(service.update('1', { code: ' env-02 ', name: ' Envasadora 2 ' }));

      const put = httpMock.expectOne(`${machinesUrl}/1`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ code: 'ENV-02', name: 'Envasadora 2' });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush({ id: '1', code: 'ENV-02', name: 'Envasadora 2', partCount: 7 });

      expect(result).toMatchObject({ id: '1', code: 'ENV-02' });
    });

    it('translates 409 DUPLICATE_MACHINE_CODE into DuplicateMachineCodeError', () => {
      expect.assertions(2);
      subscribe(service.update('1', { code: 'sel-02', name: 'Envasadora' }));

      httpMock
        .expectOne(`${machinesUrl}/1`)
        .flush({ code: 'DUPLICATE_MACHINE_CODE', message: 'Ya existe SEL-02' }, conflict);

      expect(error).toBeInstanceOf(DuplicateMachineCodeError);
      expect(error).toMatchObject({ code: 'SEL-02' });
    });

    it('fails with MachineLoadError "not-found" on a 404', () => {
      expect.assertions(2);
      subscribe(service.update('99', draft));

      httpMock
        .expectOne(`${machinesUrl}/99`)
        .flush({ code: 'NOT_FOUND', message: 'No existe' }, notFound);

      expect(error).toBeInstanceOf(MachineLoadError);
      expect(error).toMatchObject({ kind: 'not-found' });
    });

    it.each([
      ['a blank id', ['  ', draft] as const],
      ['an invalid code', ['1', { code: 'a b', name: 'x' }] as const],
      ['a blank name', ['1', { code: 'ROT-03', name: ' ' }] as const],
    ])('fails with InvalidMachineError and sends nothing for %s', (_label, [id, input]) => {
      expect.assertions(1);
      subscribe(service.update(id, input));

      expect(error).toBeInstanceOf(InvalidMachineError);
      expectNoRequest();
    });

    it('propagates any other failure of the PUT untouched', () => {
      expect.assertions(1);
      subscribe(service.update('1', draft));

      httpMock.expectOne(`${machinesUrl}/1`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.update('a/b', draft));

      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush({});
    });
  });

  describe('delete', () => {
    it('sends a single DELETE /machines/{id}, without asking for the parts first', () => {
      expect.assertions(3);
      subscribe(service.delete('2'));

      const request = httpMock.expectOne(`${machinesUrl}/2`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
      expect(error).toBeUndefined();
    });

    it('translates 409 MACHINE_HAS_PARTS into MachineHasPartsError keeping the API message', () => {
      expect.assertions(3);
      subscribe(service.delete('1'));

      httpMock
        .expectOne(`${machinesUrl}/1`)
        .flush({ code: 'MACHINE_HAS_PARTS', message: 'La máquina 1 tiene 7 partes' }, conflict);

      expect(error).toBeInstanceOf(MachineHasPartsError);
      expect(error).toMatchObject({ machineId: '1', message: 'La máquina 1 tiene 7 partes' });
      expect(completed).toBe(false);
    });

    it('falls back to a generic message when the API message is empty', () => {
      expect.assertions(1);
      subscribe(service.delete('1'));

      httpMock
        .expectOne(`${machinesUrl}/1`)
        .flush({ code: 'MACHINE_HAS_PARTS', message: '' }, conflict);

      expect((error as MachineHasPartsError).message).toContain('tiene partes');
    });

    it.each(['', '   '])('fails with InvalidMachineError for the blank id %j, no request', (id) => {
      expect.assertions(1);
      subscribe(service.delete(id));

      expect(error).toBeInstanceOf(InvalidMachineError);
      expectNoRequest();
    });

    it.each([
      ['already deleted (404)', notFound],
      ['a server error', serverError],
    ])('propagates %s untouched', (_label, response) => {
      expect.assertions(2);
      subscribe(service.delete('1'));

      httpMock.expectOne(`${machinesUrl}/1`).flush('x', response);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(MachineHasPartsError);
    });

    it('encodes the id in the URL', () => {
      subscribe(service.delete('a/b'));

      httpMock.expectOne(`${machinesUrl}/a%2Fb`).flush(null);
    });
  });
});
