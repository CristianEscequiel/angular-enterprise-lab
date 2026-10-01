import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { Technician, TechnicianDraft } from '../models/technician.model';
import {
  DuplicateLegajoError,
  InvalidLegajoError,
  TechnicianInUseError,
  TechnicianNotFoundError,
  TechniciansService,
} from './technicians.service';

// Contrato de la API: el legajo identifica al técnico en la URL (`/technicians/{legajo}`); el `id` lo
// asigna el servidor y es distinto del legajo a propósito, para que cualquier código que lo confunda
// falle acá.
describe('TechniciansService', () => {
  const baseUrl = `${API_BASE_URL}/technicians`;
  const ana: Technician = {
    id: '11',
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
  const changes = {
    firstName: 'Ana María',
    lastName: 'Ruiz',
    specialty: 'general',
    teamType: 'guardia',
  } as const;
  const serverError = { status: 500, statusText: 'Server Error' };
  const notFound = { status: 404, statusText: 'Not Found' };
  const conflict = { status: 409, statusText: 'Conflict' };
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
    it('gets the whole master with GET /technicians', () => {
      expect.assertions(2);
      subscribe(service.getAll());

      const request = httpMock.expectOne(baseUrl);
      expect(request.request.method).toBe('GET');
      request.flush([ana]);

      expect(result).toEqual([ana]);
    });
  });

  describe('findByLegajo', () => {
    it('asks GET /technicians/{legajo}, never by server id', () => {
      expect.assertions(3);
      subscribe(service.findByLegajo('1001'));

      const request = httpMock.expectOne(`${baseUrl}/1001`);
      expect(request.request.method).toBe('GET');
      request.flush(ana);

      expect(result).toEqual(ana);
      expect(error).toBeUndefined();
    });

    it('keeps the legajo as a string: "0042" is requested as "0042"', () => {
      subscribe(service.findByLegajo('0042'));

      httpMock.expectOne(`${baseUrl}/0042`).flush({ ...ana, legajo: '0042' });

      expect(result).toMatchObject({ legajo: '0042' });
    });

    it('returns null on a 404', () => {
      expect.assertions(2);
      subscribe(service.findByLegajo('9999'));

      httpMock
        .expectOne(`${baseUrl}/9999`)
        .flush({ code: 'NOT_FOUND', message: 'No existe' }, notFound);

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
    it('POSTs only the master fields to /technicians, without an id, and does not read first', () => {
      expect.assertions(5);
      subscribe(service.create(draft));

      const post = httpMock.expectOne(baseUrl);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        legajo: '1004',
        firstName: 'Luis',
        lastName: 'Paz',
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      });
      expect(post.request.body).not.toHaveProperty('id');
      post.flush({ ...(post.request.body as object), id: '15' });

      expect(result).toMatchObject({ id: '15', legajo: '1004' });
      expect(error).toBeUndefined();
    });

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

      const post = httpMock.expectOne(baseUrl);

      expect(post.request.body).toMatchObject({ firstName: 'Luis', lastName: 'Paz' });
      expect(Object.keys(post.request.body as object).sort()).toEqual([
        'firstName',
        'lastName',
        'legajo',
        'specialty',
        'teamType',
      ]);
      post.flush({ ...(post.request.body as object), id: '15' });
    });

    it('translates 409 DUPLICATE_LEGAJO into DuplicateLegajoError', () => {
      expect.assertions(2);
      subscribe(service.create({ ...draft, legajo: '1001' }));

      httpMock
        .expectOne(baseUrl)
        .flush({ code: 'DUPLICATE_LEGAJO', message: 'Ya existe el legajo 1001' }, conflict);

      expect(error).toBeInstanceOf(DuplicateLegajoError);
      expect(error).toMatchObject({ legajo: '1001' });
    });

    it('propagates any other failure untouched', () => {
      expect.assertions(2);
      subscribe(service.create(draft));

      httpMock.expectOne(baseUrl).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(DuplicateLegajoError);
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
  });

  describe('update', () => {
    it('PUTs the master fields to /technicians/{legajo}, not to the server id', () => {
      expect.assertions(5);
      subscribe(service.update('1001', changes));

      const put = httpMock.expectOne(`${baseUrl}/1001`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ legajo: '1001', ...changes });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush({ id: '11', legajo: '1001', ...changes });

      expect(result).toMatchObject({ id: '11', legajo: '1001', firstName: 'Ana María' });
      expect(error).toBeUndefined();
    });

    it('ignores a different legajo or id carried by the payload', () => {
      expect.assertions(3);
      subscribe(service.update('1001', { ...changes, legajo: '2002', id: '2002' } as never));

      const put = httpMock.expectOne(`${baseUrl}/1001`);

      expect(put.request.body).toMatchObject({ legajo: '1001' });
      expect(put.request.body).not.toMatchObject({ legajo: '2002' });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush(put.request.body);
    });

    it('fails with TechnicianNotFoundError on a 404', () => {
      expect.assertions(2);
      subscribe(service.update('9999', changes));

      httpMock
        .expectOne(`${baseUrl}/9999`)
        .flush({ code: 'NOT_FOUND', message: 'No existe' }, notFound);

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
      expect(error).toMatchObject({ legajo: '9999' });
    });

    it('propagates a server error untouched', () => {
      expect.assertions(1);
      subscribe(service.update('1001', changes));

      httpMock.expectOne(`${baseUrl}/1001`).flush('boom', serverError);

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
    it('sends DELETE /technicians/{legajo} without reading anything first', () => {
      expect.assertions(3);
      const next = vi.fn();
      service.delete('1002').subscribe(next);

      const request = httpMock.expectOne(`${baseUrl}/1002`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(error).toBeUndefined();
    });

    it('fails with TechnicianNotFoundError on a 404', () => {
      expect.assertions(1);
      subscribe(service.delete('9999'));

      httpMock
        .expectOne(`${baseUrl}/9999`)
        .flush({ code: 'NOT_FOUND', message: 'No existe' }, notFound);

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
    });

    it('translates 409 TECHNICIAN_IN_USE into TechnicianInUseError, keeping the API message', () => {
      expect.assertions(3);
      subscribe(service.delete('1001'));

      httpMock.expectOne(`${baseUrl}/1001`).flush(
        {
          code: 'TECHNICIAN_IN_USE',
          message: 'El técnico 1001 tiene usuario de acceso',
        },
        conflict,
      );

      expect(error).toBeInstanceOf(TechnicianInUseError);
      expect(error).toMatchObject({
        legajo: '1001',
        message: 'El técnico 1001 tiene usuario de acceso',
      });
      expect(result).toBeUndefined();
    });

    it('propagates a server error untouched', () => {
      expect.assertions(2);
      subscribe(service.delete('1002'));

      httpMock.expectOne(`${baseUrl}/1002`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(TechnicianInUseError);
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
