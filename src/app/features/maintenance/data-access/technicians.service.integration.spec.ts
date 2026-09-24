import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';

import { TechnicianNotFoundError, UsersService } from '@core/auth/users.service';
import { API_BASE_URL } from '@core/config/api.config';
import {
  createInMemoryApi,
  InMemoryApi,
  provideInMemoryApi,
  Row,
} from '@core/testing/in-memory-api';
import { TechnicianDraft } from '../models/technician.model';
import { DuplicateLegajoError, TechniciansService } from './technicians.service';

// Ida y vuelta de `TechniciansService` contra un emulador FIEL de JSON Server: el servidor descarta
// el `id` que manda el cliente en un `POST` y asigna uno propio. Con `HttpTestingController` (que
// solo devuelve lo que el test le dice) esto pasó inadvertido: el servicio creaba técnicos con
// `id === legajo`, el servidor les ponía otro `id`, y después `GET /tecnicos/:legajo` daba 404.
describe('TechniciansService against an in-memory JSON Server', () => {
  const baseUrl = `${API_BASE_URL}/tecnicos`;
  // Dato de prueba "de época": el `id` coincide con el legajo (como en el `db.json` sembrado).
  const seeded: Row = {
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

  let api: InMemoryApi;
  let service: TechniciansService;
  let http: HttpClient;

  const rows = (): Row[] => api.db['tecnicos'] ?? [];
  const failure = async (call: Observable<unknown>): Promise<unknown> => {
    try {
      await firstValueFrom(call);
    } catch (error) {
      return error;
    }
    throw new Error('Se esperaba un error y la llamada tuvo éxito');
  };

  beforeEach(() => {
    api = createInMemoryApi({ tecnicos: [seeded], users: [], equipos: [] });
    TestBed.configureTestingModule({ providers: [provideInMemoryApi(api)] });
    service = TestBed.inject(TechniciansService);
    http = TestBed.inject(HttpClient);
  });

  describe('a technician created from the app', () => {
    it('gets a server id that is NOT its legajo, and the app never sends one', async () => {
      const created = await firstValueFrom(service.create(draft));

      expect(created.legajo).toBe('1004');
      expect(created.id).not.toBe('1004');
      expect(api.requestsTo('POST', '/tecnicos')[0]?.body).not.toHaveProperty('id');
    });

    it('can be found by legajo right after creating it', async () => {
      const created = await firstValueFrom(service.create(draft));

      expect(await firstValueFrom(service.findByLegajo('1004'))).toEqual(created);
    });

    // Lo que fallaba en producción de desarrollo: el técnico recién creado era inalcanzable.
    it('can be edited by legajo: the record is replaced at its server id', async () => {
      const created = await firstValueFrom(service.create(draft));

      const updated = await firstValueFrom(
        service.update('1004', {
          firstName: 'Luis Alberto',
          lastName: 'Paz',
          specialty: 'general',
          teamType: 'guardia',
        }),
      );

      expect(updated).toMatchObject({ id: created.id, legajo: '1004', firstName: 'Luis Alberto' });
      expect(rows().filter((row) => row['legajo'] === '1004')).toEqual([updated]);
      expect(rows()).toHaveLength(2);
    });

    it('can be deleted by legajo, and is then gone', async () => {
      await firstValueFrom(service.create(draft));

      await firstValueFrom(service.delete('1004'));

      expect(await firstValueFrom(service.findByLegajo('1004'))).toBeNull();
      expect(rows()).toEqual([seeded]);
    });

    it('is the reason the old lookup by path cannot work: GET /tecnicos/:legajo is a 404', async () => {
      await firstValueFrom(service.create(draft));

      const error = await failure(http.get(`${baseUrl}/1004`));

      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it('can be given a login user, because the directory finds it', async () => {
      await firstValueFrom(service.create(draft));

      const user = await firstValueFrom(
        TestBed.inject(UsersService).create({
          username: 'luis',
          password: 'luis123',
          displayName: 'Luis Paz',
          email: 'luis@enterprise-lab.dev',
          role: 'tecnico',
          legajo: '1004',
        }),
      );

      expect(user).toMatchObject({ role: 'tecnico', legajo: '1004', specialty: 'electricista' });
      expect(api.db['users']).toHaveLength(1);
    });
  });

  describe('a legajo that is already taken', () => {
    it('is rejected and leaves a single row', async () => {
      await firstValueFrom(service.create(draft));

      const error = await failure(service.create({ ...draft, firstName: 'Otro' }));

      expect(error).toBeInstanceOf(DuplicateLegajoError);
      expect(rows().filter((row) => row['legajo'] === '1004')).toHaveLength(1);
    });

    it('is rejected when it belongs to a seeded technician too', async () => {
      const error = await failure(service.create({ ...draft, legajo: '1001' }));

      expect(error).toBeInstanceOf(DuplicateLegajoError);
      expect(rows()).toEqual([seeded]);
    });
  });

  describe('a seeded technician (id === legajo)', () => {
    it('can still be edited and deleted by legajo', async () => {
      const updated = await firstValueFrom(
        service.update('1001', {
          firstName: 'Ana María',
          lastName: 'Ruiz',
          specialty: 'mecanico',
          teamType: 'guardia',
        }),
      );

      expect(updated).toMatchObject({ id: '1001', firstName: 'Ana María' });

      await firstValueFrom(service.delete('1001'));

      expect(rows()).toEqual([]);
    });
  });

  describe('a legajo that does not exist', () => {
    it('cannot be edited or deleted, and nothing is written', async () => {
      expect(await failure(service.update('9999', { ...draft }))).toBeInstanceOf(
        TechnicianNotFoundError,
      );
      expect(await failure(service.delete('9999'))).toBeInstanceOf(TechnicianNotFoundError);

      expect(api.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    });
  });

  describe('when the server fails while looking the technician up', () => {
    it('does not write anything', async () => {
      api.fail('GET', '/tecnicos', 500);

      expect(await failure(service.create(draft))).toBeInstanceOf(HttpErrorResponse);
      expect(await failure(service.update('1001', draft))).toBeInstanceOf(HttpErrorResponse);
      expect(await failure(service.delete('1001'))).toBeInstanceOf(HttpErrorResponse);

      expect(api.requests.filter((request) => request.method !== 'GET')).toEqual([]);
      expect(rows()).toEqual([seeded]);
    });
  });
});
