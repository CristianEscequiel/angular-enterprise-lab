import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { createInMemoryApi, InMemoryApi, provideInMemoryApi, Row } from './in-memory-api';

// Cada test de este archivo fija un comportamiento REAL de JSON Server (ver la cabecera de
// `in-memory-api.ts`). Si el emulador se volviera "amable", los tests de los servicios de
// `machines` dejarían de probar algo: por eso estos tests existen.
describe('in-memory API (JSON Server emulator)', () => {
  const maquinas = `${API_BASE_URL}/maquinas`;
  const partes = `${API_BASE_URL}/partes`;

  const envasadora: Row = { id: '1', code: 'ENV-01', name: 'Envasadora' };
  const mesa: Row = { id: '1', machineId: '1', parentId: null, name: 'Mesa' };
  const cinta: Row = { id: '2', machineId: '1', parentId: '1', name: 'Cinta 1' };

  let api: InMemoryApi;
  let http: HttpClient;

  const setup = (seed: Record<string, Row[]> = { maquinas: [], partes: [] }): void => {
    api = createInMemoryApi(seed);
    TestBed.configureTestingModule({ providers: [provideInMemoryApi(api)] });
    http = TestBed.inject(HttpClient);
  };

  const get = <T>(url: string): Promise<T> => firstValueFrom(http.get<T>(url));

  const rejection = async (call: Observable<unknown>): Promise<unknown> => {
    try {
      await firstValueFrom(call);
    } catch (error) {
      return error;
    }
    throw new Error('Se esperaba un error y la llamada tuvo éxito');
  };

  const failure = async (call: Observable<unknown>): Promise<HttpErrorResponse> =>
    (await rejection(call)) as HttpErrorResponse;

  // Los interceptores corren dentro del observable de HttpClient: lo que el emulador lanza llega
  // como error de la suscripción, no como excepción síncrona.
  const messageOf = async (call: Observable<unknown>): Promise<string> => {
    const error = await rejection(call);

    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  };

  describe('reading', () => {
    it('lists a collection and starts empty when it has no seed', async () => {
      setup();

      expect(await get(maquinas)).toEqual([]);
      expect(await get(partes)).toEqual([]);
    });

    it('lists the seed rows', async () => {
      setup({ maquinas: [envasadora], partes: [mesa, cinta] });

      expect(await get(partes)).toEqual([mesa, cinta]);
    });

    it('reads one row by id', async () => {
      setup({ maquinas: [envasadora], partes: [] });

      expect(await get(`${maquinas}/1`)).toEqual(envasadora);
    });

    it('answers 404 with { error: "Not Found" } for a missing id', async () => {
      setup({ maquinas: [envasadora] });

      const error = await failure(http.get(`${maquinas}/999`));

      expect(error.status).toBe(404);
      expect(error.error).toEqual({ error: 'Not Found' });
    });

    it('answers 404 for a collection that does not exist', async () => {
      setup();

      expect((await failure(http.get(`${API_BASE_URL}/noexiste`))).status).toBe(404);
      expect((await failure(http.get(`${API_BASE_URL}/noexiste/1`))).status).toBe(404);
    });

    it('decodes the id in the URL before looking it up', async () => {
      setup({ maquinas: [{ id: 'a b', code: 'X', name: 'Con espacio' }] });

      expect(await get(`${maquinas}/${encodeURIComponent('a b')}`)).toEqual({
        id: 'a b',
        code: 'X',
        name: 'Con espacio',
      });
    });

    it('returns copies: changing a result does not change the stored data', async () => {
      setup({ maquinas: [envasadora] });

      const [first] = await get<Row[]>(maquinas);
      first!['name'] = 'Modificada';

      expect((await get<Row[]>(maquinas))[0]!['name']).toBe('Envasadora');
    });

    it('copies the seed: changing it afterwards does not change the stored data', async () => {
      const seed: Row[] = [{ ...envasadora }];
      setup({ maquinas: seed });

      seed[0]!['name'] = 'Modificada';

      expect((await get<Row[]>(maquinas))[0]!['name']).toBe('Envasadora');
    });
  });

  // Hallazgo 1: JSON Server convierte a número los valores numéricos del query string.
  describe('query filters (numeric coercion)', () => {
    beforeEach(() => {
      setup({
        maquinas: [envasadora, { id: '2', code: '0042', name: 'Selladora' }],
        partes: [mesa, cinta],
      });
    });

    it('does NOT find a numeric-looking string id/foreign key: ?machineId=1 → []', async () => {
      expect(await get(`${partes}?machineId=1`)).toEqual([]);
    });

    it('does NOT find a row by numeric-looking id: ?id=1 → []', async () => {
      expect(await get(`${partes}?id=1`)).toEqual([]);
    });

    it('does NOT find a code with leading zeros: ?code=0042 → []', async () => {
      expect(await get(`${maquinas}?code=0042`)).toEqual([]);
    });

    it('does find a non-numeric string: ?code=ENV-01', async () => {
      expect(await get(`${maquinas}?code=ENV-01`)).toEqual([envasadora]);
    });

    it('matches null with ?parentId=null', async () => {
      expect(await get(`${partes}?parentId=null`)).toEqual([mesa]);
    });

    it('combines several filters (AND)', async () => {
      expect(await get(`${partes}?parentId=null&name=Mesa`)).toEqual([mesa]);
      expect(await get(`${partes}?parentId=null&name=Cinta%201`)).toEqual([]);
    });

    // Réplica de `coerceValue` de json-server: no solo los dígitos se convierten.
    describe('coercion rules of json-server', () => {
      const rows: Row[] = [
        { id: 'a', active: true, size: 1000, note: '1e3' },
        { id: 'b', active: false, size: 12, note: ' ' },
      ];

      beforeEach(() => {
        TestBed.resetTestingModule();
        setup({ items: rows });
      });

      const ids = async (query: string) =>
        (await get<Row[]>(`${API_BASE_URL}/items${query}`)).map((row) => row.id);

      it('turns true and false into booleans', async () => {
        expect(await ids('?active=true')).toEqual(['a']);
        expect(await ids('?active=false')).toEqual(['b']);
      });

      it('turns anything Number() accepts into a number, not only digits ("1e3" → 1000)', async () => {
        expect(await ids('?size=1e3')).toEqual(['a']);
        expect(await ids('?size=%2012%20')).toEqual(['b']);
      });

      it('therefore does not match a string that looks like a number (note: "1e3")', async () => {
        expect(await ids('?note=1e3')).toEqual([]);
      });

      it('leaves a blank value as a string', async () => {
        expect(await ids('?note=%20')).toEqual(['b']);
      });
    });

    it('fails loudly on parameters it does not emulate instead of ignoring them', async () => {
      expect(await messageOf(http.get(`${partes}?_sort=name`))).toMatch(/_sort/);
    });
  });

  describe('creating (POST)', () => {
    beforeEach(() => setup({ maquinas: [envasadora], partes: [] }));

    it('generates the id, answers 201 and stores the row', async () => {
      const created = await firstValueFrom(
        http.post<Row>(maquinas, { code: 'SEL-02', name: 'Sel' }),
      );

      expect(created['code']).toBe('SEL-02');
      expect(created.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(api.db['maquinas']).toContainEqual(created);
    });

    it('generates ids that are not numeric-looking and never repeat', async () => {
      const ids: string[] = [];

      for (let index = 0; index < 5; index++) {
        ids.push((await firstValueFrom(http.post<Row>(partes, { name: `p${index}` }))).id);
      }

      expect(new Set(ids).size).toBe(5);
      expect(ids.every((id) => !/^\d+$/.test(id))).toBe(true);
    });

    // Lo comprobado contra json-server: el `id` del cuerpo se descarta. Un servicio que dependa de
    // fijar el id desde el cliente no funciona contra el servidor real.
    it('IGNORES the id sent in the body', async () => {
      const created = await firstValueFrom(
        http.post<Row>(maquinas, { id: '77', code: 'X', name: 'Y' }),
      );

      expect(created.id).not.toBe('77');
      expect(api.db['maquinas']!.some((row) => row.id === '77')).toBe(false);
    });

    it('cannot create two rows with the same id, even when the body asks for it', async () => {
      await firstValueFrom(http.post(maquinas, { id: '1', code: 'DUP', name: 'Duplicada' }));

      expect(api.db['maquinas']!.filter((row) => row.id === '1')).toHaveLength(1);
      expect(api.db['maquinas']).toHaveLength(2);
    });

    // Hallazgo 3: no valida nada. La integridad es del cliente.
    it('ACCEPTS a part whose machine and parent do not exist (201)', async () => {
      const created = await firstValueFrom(
        http.post<Row>(partes, { machineId: '999', parentId: '777', name: 'Huérfana' }),
      );

      expect(created['machineId']).toBe('999');
      expect(api.db['partes']).toContainEqual(created);
    });

    it('ACCEPTS a machine with a repeated code (201)', async () => {
      await firstValueFrom(http.post(maquinas, { code: 'ENV-01', name: 'Otra' }));

      expect(api.db['maquinas']!.filter((row) => row['code'] === 'ENV-01')).toHaveLength(2);
    });

    it('rejects a request without an object body instead of storing garbage', async () => {
      expect(await messageOf(http.post(maquinas, null))).toMatch(/sin un cuerpo objeto/);
      expect(api.db['maquinas']).toEqual([envasadora]);
    });
  });

  describe('replacing (PUT) and merging (PATCH)', () => {
    beforeEach(() => setup({ maquinas: [], partes: [mesa, cinta] }));

    it('PUT replaces the whole row: fields that are not sent disappear', async () => {
      const replaced = await firstValueFrom(http.put<Row>(`${partes}/2`, { name: 'Solo nombre' }));

      expect(replaced).toEqual({ id: '2', name: 'Solo nombre' });
      expect(api.db['partes']![1]).toEqual({ id: '2', name: 'Solo nombre' });
    });

    it('PUT takes the id from the URL, not from the body', async () => {
      const replaced = await firstValueFrom(
        http.put<Row>(`${partes}/2`, { id: 'OTRO', name: 'x' }),
      );

      expect(replaced.id).toBe('2');
      expect(api.db['partes']!.some((row) => row.id === 'OTRO')).toBe(false);
    });

    it('PATCH merges: the other fields stay', async () => {
      const merged = await firstValueFrom(http.patch<Row>(`${partes}/2`, { name: 'Cinta 1 bis' }));

      expect(merged).toEqual({ ...cinta, name: 'Cinta 1 bis' });
      expect(api.db['partes']![1]).toEqual({ ...cinta, name: 'Cinta 1 bis' });
    });

    it('PATCH cannot change the id', async () => {
      const merged = await firstValueFrom(http.patch<Row>(`${partes}/2`, { id: 'OTRO' }));

      expect(merged.id).toBe('2');
    });

    it('answers 404 (and does not create the row) for a missing id', async () => {
      expect((await failure(http.put(`${partes}/999`, { name: 'x' }))).status).toBe(404);
      expect((await failure(http.patch(`${partes}/999`, { name: 'x' }))).status).toBe(404);
      expect(api.db['partes']).toHaveLength(2);
    });
  });

  // Hallazgo 2: no hay cascada.
  describe('deleting (DELETE)', () => {
    beforeEach(() => setup({ maquinas: [envasadora], partes: [mesa, cinta] }));

    it('answers 200 with the deleted row and removes it', async () => {
      const deleted = await firstValueFrom(http.delete<Row>(`${partes}/2`));

      expect(deleted).toEqual(cinta);
      expect(api.db['partes']).toEqual([mesa]);
    });

    it('answers 404 for a missing id', async () => {
      expect((await failure(http.delete(`${partes}/999`))).status).toBe(404);
    });

    it('does NOT cascade: deleting a parent leaves its children pointing at nothing', async () => {
      await firstValueFrom(http.delete(`${partes}/1`));

      const remaining = await get<Row[]>(partes);

      expect(remaining).toEqual([cinta]);
      // El hijo sigue apuntando a un padre que ya no existe.
      expect(remaining.some((row) => row.id === remaining[0]!['parentId'])).toBe(false);
    });

    it('does NOT cascade from a machine to its parts', async () => {
      await firstValueFrom(http.delete(`${maquinas}/1`));

      expect(api.db['maquinas']).toEqual([]);
      expect(api.db['partes']).toEqual([mesa, cinta]);
    });
  });

  describe('test helpers', () => {
    beforeEach(() => setup({ maquinas: [], partes: [mesa] }));

    it('records every request with method, relative url and a copy of the body', async () => {
      await get(`${partes}?parentId=null`);
      await firstValueFrom(http.post(partes, { name: 'Nueva' }));

      expect(api.requests).toEqual([
        { method: 'GET', url: '/partes?parentId=null', body: null },
        { method: 'POST', url: '/partes', body: { name: 'Nueva' } },
      ]);
    });

    it('requestsTo filters by method and path, ignoring the query', async () => {
      await get(`${partes}?parentId=null`);
      await get(partes);
      await firstValueFrom(http.post(partes, { name: 'Nueva' }));

      expect(api.requestsTo('GET', '/partes')).toHaveLength(2);
      expect(api.requestsTo('POST', '/partes')).toHaveLength(1);
      expect(api.requestsTo('DELETE', '/partes')).toEqual([]);
    });

    it('exposes the live state, so a test can simulate another user changing the data', async () => {
      api.db['partes']!.push({ id: '9', machineId: '1', parentId: '1', name: 'Agregada' });

      expect((await get<Row[]>(partes)).map((row) => row.id)).toEqual(['1', '9']);
    });

    it('fail() makes that method and path answer with the given status', async () => {
      api.fail('GET', '/partes', 503);

      expect((await failure(http.get(partes))).status).toBe(503);
    });

    it('fail() defaults to 500, and affects only that method and path', async () => {
      api.fail('GET', '/partes');

      expect((await failure(http.get(partes))).status).toBe(500);
      expect(await get(maquinas)).toEqual([]);
      await expect(firstValueFrom(http.post(partes, { name: 'x' }))).resolves.toBeDefined();
    });

    it('a failed request is still recorded', async () => {
      api.fail('GET', '/partes');

      await failure(http.get(partes));

      expect(api.requestsTo('GET', '/partes')).toHaveLength(1);
    });

    it('clearFailures() restores normal answers', async () => {
      api.fail('GET', '/partes');
      api.clearFailures();

      expect(await get(partes)).toEqual([mesa]);
    });

    it('fails loudly for a verb/route combination it does not emulate', async () => {
      expect(await messageOf(http.post(`${partes}/1`, {}))).toMatch(/no está emulado/);
      expect(await messageOf(http.delete(partes))).toMatch(/no está emulado/);
    });

    it('fails loudly for a URL outside API_BASE_URL instead of hitting the network', async () => {
      expect(await messageOf(http.get('http://otro-host.test/partes'))).toMatch(
        /fuera de API_BASE_URL/,
      );
    });
  });
});
