import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { InvalidLegajoError } from '@core/auth/users.service';
import { Technician, TechnicianDraft } from '../models/technician.model';
import { DuplicateLegajoError, TechniciansService } from './technicians.service';

describe('TechniciansService', () => {
  const baseUrl = `${API_BASE_URL}/tecnicos`;
  const ana: Technician = {
    id: '1001',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const draft: TechnicianDraft = {
    legajo: '1004',
    firstName: 'Luis',
    lastName: 'Paz',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };
  const notFound = { status: 404, statusText: 'Not Found' };
  const serverError = { status: 500, statusText: 'Server Error' };
  const invalidLegajos = [
    ['an empty legajo', ''],
    ['a legajo with letters', '12a'],
    ['a path traversal', '../users'],
    ['nine digits', '123456789'],
  ] as const;

  let service: TechniciansService;
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
    service = TestBed.inject(TechniciansService);
    httpMock = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getAll', () => {
    it('gets the whole master', () => {
      subscribe(service.getAll());

      const request = httpMock.expectOne(baseUrl);
      expect(request.request.method).toBe('GET');
      request.flush([ana]);

      expect(result).toEqual([ana]);
    });
  });

  describe('findByLegajo', () => {
    it('looks the technician up by path, not by query string', () => {
      expect.assertions(3);
      subscribe(service.findByLegajo('1001'));

      const request = httpMock.expectOne(`${baseUrl}/1001`);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual([]);
      request.flush(ana);

      expect(result).toEqual(ana);
    });

    it('keeps the leading zeros of the legajo', () => {
      subscribe(service.findByLegajo('0042'));

      httpMock.expectOne(`${baseUrl}/0042`).flush(null, notFound);

      expect(result).toBeNull();
    });

    it('returns null when the technician does not exist (404)', () => {
      subscribe(service.findByLegajo('9999'));

      httpMock.expectOne(`${baseUrl}/9999`).flush('not found', notFound);

      expect(result).toBeNull();
      expect(error).toBeUndefined();
    });

    it('propagates a server error instead of reporting "not found"', () => {
      expect.assertions(2);
      subscribe(service.findByLegajo('1001'));

      httpMock.expectOne(`${baseUrl}/1001`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(result).toBeUndefined();
    });

    it.each(invalidLegajos)('returns null without any request for %s', (_label, legajo) => {
      expect.assertions(1);
      subscribe(service.findByLegajo(legajo));

      expect(result).toBeNull();
      httpMock.expectNone(() => true);
    });
  });

  describe('create', () => {
    it('checks that the legajo is free and only then writes the record with id === legajo', () => {
      expect.assertions(4);
      subscribe(service.create(draft));

      const check = httpMock.expectOne(`${baseUrl}/1004`);
      expect(check.request.method).toBe('GET');
      httpMock.expectNone({ method: 'POST', url: baseUrl });
      check.flush('not found', notFound);

      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });
      expect(post.request.body).toEqual({
        id: '1004',
        legajo: '1004',
        firstName: 'Luis',
        lastName: 'Paz',
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      });
      post.flush(post.request.body);

      expect(result).toMatchObject({ id: '1004', legajo: '1004' });
      expect(error).toBeUndefined();
    });

    it('blocks a duplicated legajo: no POST is sent', () => {
      expect.assertions(2);
      subscribe(service.create({ ...draft, legajo: '1001' }));

      httpMock.expectOne(`${baseUrl}/1001`).flush(ana);

      expect(error).toBeInstanceOf(DuplicateLegajoError);
      expect(error).toMatchObject({ legajo: '1001' });
      httpMock.expectNone({ method: 'POST', url: baseUrl });
    });

    it('never touches the users collection: the technician exists without a login', () => {
      expect.assertions(1);
      subscribe(service.create(draft));

      httpMock.expectOne(`${baseUrl}/1004`).flush('not found', notFound);
      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });
      post.flush(post.request.body);

      expect(error).toBeUndefined();
      httpMock.expectNone((req) => req.url.startsWith(`${API_BASE_URL}/users`));
    });

    it('does not write when checking the legajo fails with a server error', () => {
      expect.assertions(2);
      subscribe(service.create(draft));

      httpMock.expectOne(`${baseUrl}/1004`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(DuplicateLegajoError);
      httpMock.expectNone({ method: 'POST', url: baseUrl });
    });

    it.each(invalidLegajos)(
      'fails with InvalidLegajoError and sends no request for %s',
      (_label, legajo) => {
        expect.assertions(1);
        subscribe(service.create({ ...draft, legajo }));

        expect(error).toBeInstanceOf(InvalidLegajoError);
        httpMock.expectNone(() => true);
      },
    );

    it('trims the names and writes only the master fields', () => {
      expect.assertions(2);
      subscribe(
        service.create({
          ...draft,
          firstName: '  Luis ',
          lastName: ' Paz  ',
          id: 'other',
          password: 'x',
        } as TechnicianDraft),
      );

      httpMock.expectOne(`${baseUrl}/1004`).flush('not found', notFound);
      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });

      expect(post.request.body).toMatchObject({ id: '1004', firstName: 'Luis', lastName: 'Paz' });
      expect(Object.keys(post.request.body as object).sort()).toEqual([
        'firstName',
        'id',
        'lastName',
        'legajo',
        'specialty',
        'teamType',
      ]);
      post.flush(post.request.body);
    });
  });

  describe('update', () => {
    const changes = {
      firstName: 'Ana María',
      lastName: 'Ruiz',
      specialty: 'general',
      teamType: 'guardia',
    } as const;

    it('replaces the record at /tecnicos/:legajo keeping id and legajo', () => {
      expect.assertions(3);
      subscribe(service.update('1001', changes));

      const put = httpMock.expectOne(`${baseUrl}/1001`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ id: '1001', legajo: '1001', ...changes });
      put.flush(put.request.body);

      expect(result).toMatchObject({ legajo: '1001', firstName: 'Ana María' });
    });

    it('ignores a different legajo or id carried by the payload', () => {
      expect.assertions(3);
      subscribe(service.update('1001', { ...changes, legajo: '2002', id: '2002' } as never));

      const put = httpMock.expectOne(`${baseUrl}/1001`);

      expect(put.request.body).toMatchObject({ id: '1001', legajo: '1001' });
      expect(put.request.body).not.toMatchObject({ legajo: '2002' });
      expect(put.request.url).toBe(`${baseUrl}/1001`);
      put.flush(put.request.body);
    });

    it('propagates a 404 for a technician that no longer exists', () => {
      expect.assertions(1);
      subscribe(service.update('1001', changes));

      httpMock.expectOne(`${baseUrl}/1001`).flush('not found', notFound);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });

    it.each(invalidLegajos)(
      'fails with InvalidLegajoError and sends no request for %s',
      (_label, legajo) => {
        expect.assertions(1);
        subscribe(service.update(legajo, changes));

        expect(error).toBeInstanceOf(InvalidLegajoError);
        httpMock.expectNone(() => true);
      },
    );
  });

  describe('delete', () => {
    it('sends DELETE to /tecnicos/:legajo', () => {
      expect.assertions(2);
      const next = vi.fn();
      service.delete('1003').subscribe(next);

      const request = httpMock.expectOne(`${baseUrl}/1003`);
      expect(request.request.method).toBe('DELETE');
      request.flush({});

      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it('propagates a server error', () => {
      expect.assertions(1);
      subscribe(service.delete('1003'));

      httpMock.expectOne(`${baseUrl}/1003`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });

    it.each(invalidLegajos)(
      'fails with InvalidLegajoError and sends no request for %s',
      (_label, legajo) => {
        expect.assertions(1);
        subscribe(service.delete(legajo));

        expect(error).toBeInstanceOf(InvalidLegajoError);
        httpMock.expectNone(() => true);
      },
    );
  });
});
