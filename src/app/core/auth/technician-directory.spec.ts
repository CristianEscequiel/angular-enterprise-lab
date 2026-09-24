import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { TechnicianDirectory, TechnicianDirectoryEntry } from './technician-directory';

describe('TechnicianDirectory', () => {
  const url = `${API_BASE_URL}/tecnicos`;
  // El `id` lo asigna el servidor y no es el legajo.
  const ana: TechnicianDirectoryEntry = {
    id: 'srv-ana',
    legajo: '1001',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const beto: TechnicianDirectoryEntry = {
    id: 'srv-beto',
    legajo: '1002',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };

  let directory: TechnicianDirectory;
  let httpMock: HttpTestingController;
  let result: unknown;
  let error: unknown;

  const subscribe = (source: Observable<unknown>): void => {
    source.subscribe({
      next: (value) => (result = value),
      error: (e: unknown) => (error = e),
    });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    directory = TestBed.inject(TechnicianDirectory);
    httpMock = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
  });

  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('asks for the whole collection with no filter: ?legajo= would not match a numeric string', () => {
    expect.assertions(3);
    subscribe(directory.find('1001'));

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).toBe(url);
    request.flush([ana]);

    expect(result).toEqual(ana);
  });

  it('never asks for /tecnicos/:legajo: the server id is not the legajo', () => {
    subscribe(directory.find('1001'));

    httpMock.expectNone(`${url}/1001`);
    httpMock.expectOne(url).flush([ana]);
  });

  it('picks the entry with that legajo among several, whatever its server id', () => {
    subscribe(directory.find('1002'));

    httpMock.expectOne(url).flush([ana, beto]);

    expect(result).toEqual(beto);
  });

  it('returns the whole record it finds, typed as the caller asks', () => {
    interface Full extends TechnicianDirectoryEntry {
      firstName: string;
    }
    const full: Full = { ...ana, firstName: 'Ana' };
    let found: Full | null | undefined;

    directory.find<Full>('1001').subscribe((value) => (found = value));
    httpMock.expectOne(url).flush([full]);

    expect(found?.firstName).toBe('Ana');
  });

  it('returns null when no entry has that legajo', () => {
    subscribe(directory.find('9999'));

    httpMock.expectOne(url).flush([ana, beto]);

    expect(result).toBeNull();
    expect(error).toBeUndefined();
  });

  it('returns null for an empty master', () => {
    subscribe(directory.find('1001'));

    httpMock.expectOne(url).flush([]);

    expect(result).toBeNull();
  });

  it('compares the legajo as a string: "0042" is not "42"', () => {
    subscribe(directory.find('0042'));

    httpMock.expectOne(url).flush([{ ...ana, legajo: '42' }]);

    expect(result).toBeNull();
  });

  it('finds a legajo with leading zeros when the master has exactly that value', () => {
    subscribe(directory.find('0042'));

    httpMock.expectOne(url).flush([{ ...ana, legajo: '0042' }]);

    expect(result).toMatchObject({ legajo: '0042' });
  });

  it('returns the first entry when a hand-edited master repeats a legajo', () => {
    subscribe(directory.find('1001'));

    httpMock.expectOne(url).flush([ana, { ...beto, legajo: '1001' }]);

    expect(result).toEqual(ana);
  });

  it.each([
    ['an empty legajo', ''],
    ['a legajo with letters', '12a'],
    ['a path traversal', '../users'],
    ['nine digits', '123456789'],
  ])('returns null without any request for %s', (_label, legajo) => {
    subscribe(directory.find(legajo));

    expect(result).toBeNull();
    httpMock.expectNone(() => true);
  });

  // Un fallo de conexión no es "no existe": quien decide con esta respuesta (login, alta de usuario,
  // borrado) no debe tomarlo como tal.
  it.each([
    ['a 500', { status: 500, statusText: 'Server Error' }],
    ['a 404 of the collection itself (misconfigured server)', { status: 404, statusText: 'Nf' }],
    ['a network failure (status 0)', { status: 0, statusText: 'Unknown Error' }],
  ])('propagates %s instead of reporting "not found"', (_label, status) => {
    subscribe(directory.find('1001'));

    httpMock.expectOne(url).flush(null, status);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(status.status);
    expect(result).toBeUndefined();
  });
});
