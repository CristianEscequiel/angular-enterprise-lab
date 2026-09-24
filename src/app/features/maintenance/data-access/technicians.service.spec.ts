import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { InvalidLegajoError, TechnicianNotFoundError } from '@core/auth/users.service';
import { Technician, TechnicianDraft } from '../models/technician.model';
import { DuplicateLegajoError, TechniciansService } from './technicians.service';

// El `id` de un registro lo genera el servidor y NO es el legajo (json-server descarta el `id` que
// manda el cliente en un POST). Los técnicos de prueba llevan un `id` de servidor distinto del
// legajo a propósito: cualquier código que siga asumiendo `id === legajo` tiene que fallar acá.
describe('TechniciansService', () => {
  const baseUrl = `${API_BASE_URL}/tecnicos`;
  const ana: Technician = {
    id: 'srv-ana',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const beto: Technician = {
    id: 'srv-beto',
    legajo: '1002',
    firstName: 'Beto',
    lastName: 'Gómez',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };
  const master = [beto, ana];
  const draft: TechnicianDraft = {
    legajo: '1004',
    firstName: 'Luis',
    lastName: 'Paz',
    specialty: 'electricista',
    teamType: 'preventivo-correctivo',
  };
  const serverError = { status: 500, statusText: 'Server Error' };
  const notFound = { status: 404, statusText: 'Not Found' };
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

  const noWrites = (): void => {
    httpMock.expectNone((req) => req.method !== 'GET');
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
    it('gets the whole master', () => {
      subscribe(service.getAll());

      const request = httpMock.expectOne(baseUrl);
      expect(request.request.method).toBe('GET');
      request.flush([ana]);

      expect(result).toEqual([ana]);
    });
  });

  describe('findByLegajo', () => {
    // json-server convierte a número el valor de `?legajo=` y no encuentra `"legajo": "1001"`, y
    // `GET /tecnicos/:legajo` solo serviría si `id === legajo`: se pide la colección y se filtra.
    it('asks for the whole collection, with no filter in the URL, and picks the legajo locally', () => {
      expect.assertions(4);
      subscribe(service.findByLegajo('1001'));

      const request = httpMock.expectOne(baseUrl);
      expect(request.request.method).toBe('GET');
      expect(request.request.urlWithParams).toBe(baseUrl);
      expect(request.request.params.keys()).toEqual([]);
      request.flush(master);

      expect(result).toEqual(ana);
    });

    it('finds the technician whatever its server id', () => {
      subscribe(service.findByLegajo('1002'));

      httpMock.expectOne(baseUrl).flush(master);

      expect(result).toEqual(beto);
    });

    it('compares the legajo as a string: "0042" is not "42"', () => {
      subscribe(service.findByLegajo('0042'));

      httpMock.expectOne(baseUrl).flush([{ ...ana, legajo: '42' }]);

      expect(result).toBeNull();
    });

    it('finds a legajo with leading zeros when the master has exactly that value', () => {
      subscribe(service.findByLegajo('0042'));

      httpMock.expectOne(baseUrl).flush([{ ...ana, legajo: '0042' }]);

      expect(result).toMatchObject({ legajo: '0042' });
    });

    it('returns null when no technician has that legajo', () => {
      subscribe(service.findByLegajo('9999'));

      httpMock.expectOne(baseUrl).flush(master);

      expect(result).toBeNull();
      expect(error).toBeUndefined();
    });

    it('returns null for an empty master', () => {
      subscribe(service.findByLegajo('1001'));

      httpMock.expectOne(baseUrl).flush([]);

      expect(result).toBeNull();
    });

    it('propagates a server error instead of reporting "not found"', () => {
      expect.assertions(2);
      subscribe(service.findByLegajo('1001'));

      httpMock.expectOne(baseUrl).flush('boom', serverError);

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
    it('checks that the legajo is free and only then POSTs the master fields, without an id', () => {
      expect.assertions(5);
      subscribe(service.create(draft));

      const check = httpMock.expectOne(baseUrl);
      expect(check.request.method).toBe('GET');
      httpMock.expectNone({ method: 'POST', url: baseUrl });
      check.flush(master);

      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });
      expect(post.request.body).toEqual({
        legajo: '1004',
        firstName: 'Luis',
        lastName: 'Paz',
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      });
      // El servidor descarta cualquier `id` del cliente: mandarlo sería creer que se respeta.
      expect(post.request.body).not.toHaveProperty('id');
      post.flush({ ...(post.request.body as object), id: 'srv-luis' });

      expect(result).toMatchObject({ id: 'srv-luis', legajo: '1004' });
      expect(error).toBeUndefined();
    });

    it('blocks a duplicated legajo: no POST is sent', () => {
      expect.assertions(2);
      subscribe(service.create({ ...draft, legajo: '1001' }));

      httpMock.expectOne(baseUrl).flush(master);

      expect(error).toBeInstanceOf(DuplicateLegajoError);
      expect(error).toMatchObject({ legajo: '1001' });
      noWrites();
    });

    it('allows "42" when only "0042" exists: they are different legajos', () => {
      subscribe(service.create({ ...draft, legajo: '42' }));

      httpMock.expectOne(baseUrl).flush([{ ...ana, legajo: '0042' }]);
      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });

      expect(post.request.body).toMatchObject({ legajo: '42' });
      post.flush({ ...(post.request.body as object), id: 'srv-x' });
    });

    it('never touches the users collection: the technician exists without a login', () => {
      expect.assertions(1);
      subscribe(service.create(draft));

      httpMock.expectOne(baseUrl).flush(master);
      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });
      post.flush({ ...(post.request.body as object), id: 'srv-luis' });

      expect(error).toBeUndefined();
      httpMock.expectNone((req) => req.url.startsWith(`${API_BASE_URL}/users`));
    });

    it('does not write when checking the legajo fails with a server error', () => {
      expect.assertions(2);
      subscribe(service.create(draft));

      httpMock.expectOne(baseUrl).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(DuplicateLegajoError);
      noWrites();
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

      httpMock.expectOne(baseUrl).flush(master);
      const post = httpMock.expectOne({ method: 'POST', url: baseUrl });

      expect(post.request.body).toMatchObject({ firstName: 'Luis', lastName: 'Paz' });
      expect(Object.keys(post.request.body as object).sort()).toEqual([
        'firstName',
        'lastName',
        'legajo',
        'specialty',
        'teamType',
      ]);
      post.flush({ ...(post.request.body as object), id: 'srv-luis' });
    });
  });

  describe('update', () => {
    const changes = {
      firstName: 'Ana María',
      lastName: 'Ruiz',
      specialty: 'general',
      teamType: 'guardia',
    } as const;

    it('finds the technician by legajo and replaces it at its SERVER id, not at the legajo', () => {
      expect.assertions(5);
      subscribe(service.update('1001', changes));

      httpMock.expectOne(baseUrl).flush(master);
      httpMock.expectNone(`${baseUrl}/1001`);
      const put = httpMock.expectOne(`${baseUrl}/srv-ana`);

      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ legajo: '1001', ...changes });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush({ id: 'srv-ana', legajo: '1001', ...changes });

      expect(result).toMatchObject({ id: 'srv-ana', legajo: '1001', firstName: 'Ana María' });
      expect(error).toBeUndefined();
    });

    it('ignores a different legajo or id carried by the payload', () => {
      expect.assertions(3);
      subscribe(service.update('1001', { ...changes, legajo: '2002', id: '2002' } as never));

      httpMock.expectOne(baseUrl).flush(master);
      const put = httpMock.expectOne(`${baseUrl}/srv-ana`);

      expect(put.request.body).toMatchObject({ legajo: '1001' });
      expect(put.request.body).not.toMatchObject({ legajo: '2002' });
      expect(put.request.body).not.toHaveProperty('id');
      put.flush(put.request.body);
    });

    it('fails with TechnicianNotFoundError and writes nothing when the legajo is not in the master', () => {
      expect.assertions(2);
      subscribe(service.update('9999', changes));

      httpMock.expectOne(baseUrl).flush(master);

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
      expect(error).toMatchObject({ legajo: '9999' });
      noWrites();
    });

    it('does not write when looking the technician up fails with a server error', () => {
      expect.assertions(1);
      subscribe(service.update('1001', changes));

      httpMock.expectOne(baseUrl).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      noWrites();
    });

    it('propagates a failure of the PUT itself (deleted meanwhile → 404)', () => {
      expect.assertions(2);
      subscribe(service.update('1001', changes));

      httpMock.expectOne(baseUrl).flush(master);
      httpMock.expectOne(`${baseUrl}/srv-ana`).flush('not found', notFound);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it('encodes the server id in the URL', () => {
      subscribe(service.update('1001', changes));

      httpMock.expectOne(baseUrl).flush([{ ...ana, id: 'a/b' }]);
      httpMock.expectOne(`${baseUrl}/a%2Fb`).flush({ id: 'a/b', legajo: '1001', ...changes });
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
    it('finds the technician by legajo and sends DELETE to its SERVER id', () => {
      expect.assertions(4);
      const next = vi.fn();
      service.delete('1002').subscribe(next);

      httpMock.expectOne(baseUrl).flush(master);
      httpMock.expectNone(`${baseUrl}/1002`);
      const request = httpMock.expectOne(`${baseUrl}/srv-beto`);

      expect(request.request.method).toBe('DELETE');
      request.flush({});

      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(error).toBeUndefined();
      expect(result).toBeUndefined();
    });

    it('fails with TechnicianNotFoundError and deletes nothing when the legajo is not in the master', () => {
      expect.assertions(1);
      subscribe(service.delete('9999'));

      httpMock.expectOne(baseUrl).flush(master);

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
      noWrites();
    });

    it('does not delete when looking the technician up fails with a server error', () => {
      expect.assertions(1);
      subscribe(service.delete('1002'));

      httpMock.expectOne(baseUrl).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
      noWrites();
    });

    it('propagates a failure of the DELETE itself', () => {
      expect.assertions(1);
      subscribe(service.delete('1002'));

      httpMock.expectOne(baseUrl).flush(master);
      httpMock.expectOne(`${baseUrl}/srv-beto`).flush('boom', serverError);

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
