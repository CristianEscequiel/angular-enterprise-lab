import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { createInMemoryApi, InMemoryApi, provideInMemoryApi } from '@core/testing/in-memory-api';
import { buildPartTree, flattenPartTree, hasChildren, Part } from '../models/part.model';
import { MachineHasPartsError, MachinesService } from './machines.service';
import {
  MachineNotFoundError,
  ParentPartNotFoundError,
  PartHasChildrenError,
  PartsService,
} from './parts.service';

// Especificación ejecutable de los criterios de aceptación 1 y 2 de 013a. `MachinesService` y
// `PartsService` REALES contra un emulador fiel de JSON Server (`core/testing/in-memory-api.ts`):
// acepta huérfanos, no hace cascada, descarta el `id` del cliente y no filtra por claves numéricas.
// Si los servicios dejaran de proteger el árbol, acá se vería: el "servidor" no lo va a proteger.
//
// Lo que esto prueba es la serialización y las reglas del cliente. La persistencia real contra
// `pnpm api` se comprueba a mano (ver "Verificación" del plan).
describe('machines and parts tree, end to end against an in-memory JSON Server', () => {
  let api: InMemoryApi;
  let machines: MachinesService;
  let parts: PartsService;
  let http: HttpClient;

  const run = <T>(source: Observable<T>): Promise<T> => firstValueFrom(source);

  const rejection = async (source: Observable<unknown>): Promise<unknown> => {
    try {
      await firstValueFrom(source);
    } catch (error) {
      return error;
    }
    throw new Error('Se esperaba un error y la llamada tuvo éxito');
  };

  const treeOf = async (machineId: string) =>
    buildPartTree(await run(parts.getByMachine(machineId)));

  // El árbol en texto, un nodo por línea y con sangría por nivel: legible en un diff de test.
  const outline = async (machineId: string): Promise<string[]> =>
    flattenPartTree((await treeOf(machineId)).roots).map(
      ({ part, depth }) => `${'  '.repeat(depth)}${part.name}`,
    );

  const rows = (): Part[] => (api.db['partes'] ?? []) as unknown as Part[];

  // Regla de integridad que el servidor NO garantiza: toda parte apunta a una máquina y a un padre
  // (o a `null`) que existen, y el padre es de su misma máquina.
  const expectNoOrphans = async (machineId: string): Promise<void> => {
    const stored = rows();
    const machineIds = (api.db['maquinas'] ?? []).map((machine) => machine.id);

    for (const part of stored) {
      expect(machineIds).toContain(part.machineId);

      if (part.parentId !== null) {
        const parent = stored.find((candidate) => candidate.id === part.parentId);

        expect(parent, `la parte "${part.name}" quedó sin padre`).toBeDefined();
        expect(parent?.machineId).toBe(part.machineId);
      }
    }

    expect((await treeOf(machineId)).orphans).toEqual([]);
  };

  const add = (machineId: string, parentId: string | null, name: string): Promise<Part> =>
    run(parts.create(machineId, parentId, name));

  // Árbol de referencia, de 5 niveles, con una hoja hermana en el nivel 2 y una segunda raíz:
  //   Mesa de transporte
  //   ├─ Cinta 1 ─ Motor de cinta ─ Rodamiento ─ Sello
  //   └─ Cinta 2                         (hoja hermana de "Cinta 1")
  //   Cabezal de sellado
  const REFERENCE_OUTLINE = [
    'Mesa de transporte',
    '  Cinta 1',
    '    Motor de cinta',
    '      Rodamiento',
    '        Sello',
    '  Cinta 2',
    'Cabezal de sellado',
  ];

  async function buildReference() {
    const machine = await run(machines.create({ code: 'ENV-01', name: 'Envasadora' }));
    const mesa = await add(machine.id, null, 'Mesa de transporte');
    const cinta1 = await add(machine.id, mesa.id, 'Cinta 1');
    const motor = await add(machine.id, cinta1.id, 'Motor de cinta');
    const rodamiento = await add(machine.id, motor.id, 'Rodamiento');
    const sello = await add(machine.id, rodamiento.id, 'Sello');
    const cinta2 = await add(machine.id, mesa.id, 'Cinta 2');
    const cabezal = await add(machine.id, null, 'Cabezal de sellado');

    return { machine, mesa, cinta1, motor, rodamiento, sello, cinta2, cabezal };
  }

  function configure(seed?: Parameters<typeof createInMemoryApi>[0]): void {
    api = createInMemoryApi(seed ?? { maquinas: [], partes: [] });
    TestBed.configureTestingModule({ providers: [provideInMemoryApi(api)] });
    machines = TestBed.inject(MachinesService);
    parts = TestBed.inject(PartsService);
    http = TestBed.inject(HttpClient);
  }

  beforeEach(() => configure());

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('criterio 1: la estructura persiste y se recupera completa, en orden jerárquico', () => {
    it('creates a machine with a 5-level tree and gets it back complete, in hierarchical order', async () => {
      const { machine } = await buildReference();

      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
    });

    it('does not flatten it: only the first-level parts are roots and every level is nested', async () => {
      const { machine } = await buildReference();

      const { roots, orphans } = await treeOf(machine.id);

      expect(orphans).toEqual([]);
      expect(roots.map((node) => node.part.name)).toEqual([
        'Mesa de transporte',
        'Cabezal de sellado',
      ]);
      expect(flattenPartTree(roots).map((item) => item.depth)).toEqual([0, 1, 2, 3, 4, 1, 0]);
      expect(flattenPartTree(roots)).toHaveLength(7);
    });

    it('keeps every part pointing at its real parent in what is stored (nothing lost on the wire)', async () => {
      const { machine, mesa, cinta1, motor, rodamiento } = await buildReference();

      expect(
        Object.fromEntries(rows().map((row) => [row.name, [row.machineId, row.parentId]])),
      ).toEqual({
        'Mesa de transporte': [machine.id, null],
        'Cinta 1': [machine.id, mesa.id],
        'Motor de cinta': [machine.id, cinta1.id],
        Rodamiento: [machine.id, motor.id],
        Sello: [machine.id, rodamiento.id],
        'Cinta 2': [machine.id, mesa.id],
        'Cabezal de sellado': [machine.id, null],
      });
    });

    it('sends the parent that the server generated for each level, never a made-up id', async () => {
      await buildReference();

      const bodies = api.requestsTo('POST', '/partes').map((request) => request.body as Part);
      const generated = rows().map((row) => row.id);

      // La primera parte es raíz; cada una de las demás apunta a un id que el servidor ya había dado.
      expect(bodies[0]?.parentId).toBeNull();
      for (const body of bodies.slice(1, 6)) {
        expect(generated).toContain(body.parentId);
      }
      // Nunca se manda un `id`: el servidor lo descarta y se pensaría que se respeta.
      expect(bodies.every((body) => !('id' in body))).toBe(true);
    });

    it('never filters by ?machineId= (the server would return []): it reads all and filters locally', async () => {
      const { machine } = await buildReference();

      await outline(machine.id);

      const reads = api.requestsTo('GET', '/partes');
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((read) => read.url === '/partes')).toBe(true);
    });

    it('keeps the parts of different machines apart', async () => {
      const { machine } = await buildReference();
      const other = await run(machines.create({ code: 'SEL-02', name: 'Selladora' }));
      await add(other.id, null, 'Cabezal ajeno');

      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
      expect(await outline(other.id)).toEqual(['Cabezal ajeno']);
    });

    it('returns siblings in creation order, not alphabetical', async () => {
      const machine = await run(machines.create({ code: 'ENV-01', name: 'Envasadora' }));
      const root = await add(machine.id, null, 'Raíz');
      await add(machine.id, root.id, 'Zeta');
      await add(machine.id, root.id, 'Alfa');
      await add(machine.id, root.id, 'Medio');

      expect(await outline(machine.id)).toEqual(['Raíz', '  Zeta', '  Alfa', '  Medio']);
    });

    it('grows below an existing leaf at any depth: a 6th level extends the tree', async () => {
      const { machine, sello } = await buildReference();

      await add(machine.id, sello.id, 'Junta');

      expect(await outline(machine.id)).toEqual([
        'Mesa de transporte',
        '  Cinta 1',
        '    Motor de cinta',
        '      Rodamiento',
        '        Sello',
        '          Junta',
        '  Cinta 2',
        'Cabezal de sellado',
      ]);
    });

    it('keeps a part in place when it is renamed', async () => {
      const { machine, motor } = await buildReference();

      await run(parts.update(motor.id, 'Motor principal'));

      expect(await outline(machine.id)).toEqual(
        REFERENCE_OUTLINE.map((line) =>
          line.trim() === 'Motor de cinta' ? '    Motor principal' : line,
        ),
      );
      await expectNoOrphans(machine.id);
    });

    it('rejects a part under a parent of ANOTHER machine, and leaves both trees untouched', async () => {
      const { machine, mesa } = await buildReference();
      const other = await run(machines.create({ code: 'SEL-02', name: 'Selladora' }));
      const before = structuredClone(rows());

      const error = await rejection(parts.create(other.id, mesa.id, 'Cruzada'));

      expect(error).toBeInstanceOf(ParentPartNotFoundError);
      expect((error as ParentPartNotFoundError).problem).toBe('other-machine');
      expect(rows()).toEqual(before);
      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
      expect(await outline(other.id)).toEqual([]);
    });

    it('rejects a part under a parent that does not exist, and stores nothing', async () => {
      const { machine } = await buildReference();
      const before = structuredClone(rows());

      const error = await rejection(parts.create(machine.id, 'no-existe', 'Huérfana'));

      expect(error).toBeInstanceOf(ParentPartNotFoundError);
      expect(rows()).toEqual(before);
    });

    it('rejects a part in a machine that does not exist, and stores nothing', async () => {
      const before = structuredClone(rows());

      const error = await rejection(parts.create('no-existe', null, 'Suelta'));

      expect(error).toBeInstanceOf(MachineNotFoundError);
      expect(rows()).toEqual(before);
    });

    // El `db.json` sembrado tiene ids numéricos escritos a mano ("1"): con ellos el servidor real
    // devuelve [] para `?machineId=1`. Leer todo y filtrar en el cliente es lo que lo hace andar.
    describe('with seeded, numeric-looking ids (as in db.json)', () => {
      beforeEach(() => {
        TestBed.resetTestingModule();
        configure({
          maquinas: [{ id: '1', code: 'SEED-01', name: 'Sembrada' }],
          partes: [
            { id: '1', machineId: '1', parentId: null, name: 'Raíz sembrada' },
            { id: '2', machineId: '1', parentId: '1', name: 'Hija sembrada' },
          ],
        });
      });

      it('reads the seeded tree even though ?machineId=1 would return nothing', async () => {
        const viaQuery = await run(http.get<unknown[]>(`${API_BASE_URL}/partes?machineId=1`));

        expect(viaQuery).toEqual([]);
        expect(await outline('1')).toEqual(['Raíz sembrada', '  Hija sembrada']);
      });

      it('can extend a seeded tree with parts created from the app', async () => {
        await add('1', '2', 'Nieta creada');

        expect(await outline('1')).toEqual([
          'Raíz sembrada',
          '  Hija sembrada',
          '    Nieta creada',
        ]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  describe('criterio 2: eliminar un padre nunca deja sub-partes huérfanas', () => {
    it('blocks deleting EVERY part that has children, at any depth, and the tree stays intact', async () => {
      const { machine } = await buildReference();
      const withChildren = rows().filter((row) => hasChildren(rows(), row.id));

      // Mesa, Cinta 1, Motor de cinta y Rodamiento: cuatro niveles distintos.
      expect(withChildren.map((row) => row.name)).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Motor de cinta',
        'Rodamiento',
      ]);

      for (const parent of withChildren) {
        const error = await rejection(parts.delete(parent.id));

        expect(error, parent.name).toBeInstanceOf(PartHasChildrenError);
      }

      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
      expect(api.requestsTo('DELETE', '/partes')).toEqual([]);
      await expectNoOrphans(machine.id);
    });

    it('empties the tree from the leaves up, with no orphans at any step', async () => {
      const { machine } = await buildReference();
      let steps = 0;

      for (let all = rows(); all.length > 0; all = rows()) {
        // La hoja más profunda que quede.
        const deepest = flattenPartTree((await treeOf(machine.id)).roots)
          .filter(({ part }) => !hasChildren(all, part.id))
          .sort((a, b) => b.depth - a.depth)[0];

        expect(deepest).toBeDefined();
        await run(parts.delete(deepest!.part.id));
        await expectNoOrphans(machine.id);
        steps++;
      }

      expect(steps).toBe(7);
      expect((await treeOf(machine.id)).roots).toEqual([]);
    });

    it('deletes a leaf and only that leaf', async () => {
      const { machine, cinta2 } = await buildReference();

      await run(parts.delete(cinta2.id));

      expect(await outline(machine.id)).toEqual(
        REFERENCE_OUTLINE.filter((line) => line.trim() !== 'Cinta 2'),
      );
      await expectNoOrphans(machine.id);
    });

    it('a part that gains a child while the screen still shows it as a leaf is not deleted', async () => {
      const { machine, cinta2 } = await buildReference();
      // Otro usuario le agrega una hija a "Cinta 2" (que en esta pantalla es una hoja).
      api.db['partes']!.push({
        id: 'otro-usuario',
        machineId: machine.id,
        parentId: cinta2.id,
        name: 'Agregada por otro',
      });

      const error = await rejection(parts.delete(cinta2.id));

      expect(error).toBeInstanceOf(PartHasChildrenError);
      expect(rows().some((row) => row.id === cinta2.id)).toBe(true);
      await expectNoOrphans(machine.id);
    });

    it('a machine with parts is not deleted; once it has none, it can be', async () => {
      const { machine } = await buildReference();

      const error = await rejection(machines.delete(machine.id));

      expect(error).toBeInstanceOf(MachineHasPartsError);
      expect((error as MachineHasPartsError).partCount).toBe(7);
      expect(api.db['maquinas']).toHaveLength(1);

      for (let all = rows(); all.length > 0; all = rows()) {
        const leaf = all.find((row) => !hasChildren(all, row.id))!;
        await run(parts.delete(leaf.id));
      }
      await run(machines.delete(machine.id));

      expect(api.db['maquinas']).toEqual([]);
      expect(rows()).toEqual([]);
    });

    it('never leaves parts pointing at a deleted machine', async () => {
      const { machine } = await buildReference();
      const other = await run(machines.create({ code: 'SEL-02', name: 'Selladora' }));

      // Una máquina vacía se borra sin tocar las partes de la otra.
      await run(machines.delete(other.id));

      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
      await expectNoOrphans(machine.id);
    });

    // Prueba de que el test SÍ detecta el problema: sin las reglas del cliente, el servidor los deja.
    it('WITHOUT the guard, a raw DELETE of a parent does leave orphans (what the service prevents)', async () => {
      const { machine, cinta1 } = await buildReference();

      await run(http.delete(`${API_BASE_URL}/partes/${cinta1.id}`));

      const { orphans } = await treeOf(machine.id);
      expect(orphans.map((orphan) => orphan.name)).toEqual([
        'Motor de cinta',
        'Rodamiento',
        'Sello',
      ]);
    });

    it('WITHOUT the guard, a raw POST with a missing parent is accepted (what the service prevents)', async () => {
      const { machine } = await buildReference();

      await run(
        http.post(`${API_BASE_URL}/partes`, {
          machineId: machine.id,
          parentId: 'no-existe',
          name: 'Suelta',
        }),
      );

      expect((await treeOf(machine.id)).orphans.map((orphan) => orphan.name)).toEqual(['Suelta']);
    });

    it('a cross-machine part written without the service is an orphan of ITS machine, never in the other tree', async () => {
      const { machine, mesa } = await buildReference();
      const other = await run(machines.create({ code: 'SEL-02', name: 'Selladora' }));

      await run(
        http.post(`${API_BASE_URL}/partes`, {
          machineId: other.id,
          parentId: mesa.id,
          name: 'Cruzada',
        }),
      );

      expect(await outline(machine.id)).toEqual(REFERENCE_OUTLINE);
      expect((await treeOf(machine.id)).orphans).toEqual([]);
      expect((await treeOf(other.id)).orphans.map((orphan) => orphan.name)).toEqual(['Cruzada']);
      expect((await treeOf(other.id)).roots).toEqual([]);
    });

    // Secuencia determinista y variada de altas, renombres y bajas (permitidas o bloqueadas):
    // pase lo que pase, nunca hay una parte sin padre ni sin máquina.
    it('a long mixed sequence of allowed and blocked operations never leaves an orphan', async () => {
      const machine = await run(machines.create({ code: 'ENV-01', name: 'Envasadora' }));
      let seed = 20260924;
      const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const counts = { created: 0, renamed: 0, deleted: 0, blocked: 0 };

      for (let step = 0; step < 120; step++) {
        const all = await run(parts.getByMachine(machine.id));
        const roll = random();
        const target = all.length > 0 ? all[Math.floor(random() * all.length)] : undefined;

        if (!target || roll < 0.5) {
          const parent = target && random() < 0.85 ? target : undefined;

          await add(machine.id, parent?.id ?? null, `parte ${step}`);
          counts.created++;
        } else if (roll < 0.85) {
          if (hasChildren(all, target.id)) {
            expect(await rejection(parts.delete(target.id))).toBeInstanceOf(PartHasChildrenError);
            counts.blocked++;
          } else {
            await run(parts.delete(target.id));
            counts.deleted++;
          }
        } else {
          await run(parts.update(target.id, `renombrada ${step}`));
          counts.renamed++;
        }

        await expectNoOrphans(machine.id);
      }

      // La secuencia no es vacua: hizo de todo, incluidos bloqueos.
      expect(counts.created).toBeGreaterThan(20);
      expect(counts.deleted).toBeGreaterThan(5);
      expect(counts.blocked).toBeGreaterThan(5);
      expect(counts.renamed).toBeGreaterThan(5);
    });
  });
});
