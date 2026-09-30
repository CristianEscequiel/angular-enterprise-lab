import { UrlSegment } from '@angular/router';

import { MachineForm } from './pages/machine-form/machine-form';
import { MachineParts } from './pages/machine-parts/machine-parts';
import { MachinesList } from './pages/machines-list/machines-list';
import {
  MACHINE_ID_ROUTE_PATTERN,
  MACHINES_ROUTES,
  matchMachineEdit,
  matchMachineParts,
} from './machines.routes';

const segment = (path: string): UrlSegment => new UrlSegment(path, {});

const run = (matcher: typeof matchMachineEdit, ...paths: string[]) =>
  matcher(paths.map(segment), undefined as never, undefined as never);

describe.each([
  ['matchMachineEdit', matchMachineEdit, 'edit', 'parts'],
  ['matchMachineParts', matchMachineParts, 'parts', 'edit'],
] as const)('%s', (_name, matcher, suffix, otherSuffix) => {
  it.each(['1', 'srv-1', 'o89hc_hyt6A', 'A-b_C-9', '0042', 'x'.repeat(64)])(
    `matches <id %s>/${suffix}`,
    (id) => {
      const segments = [segment(id), segment(suffix)];

      const result = matcher(segments, undefined as never, undefined as never);

      expect(result).toEqual({ consumed: segments, posParams: { id: segments[0] } });
    },
  );

  it('exposes the id as the "id" route parameter', () => {
    const result = run(matcher, 'srv-1', suffix);

    expect(result?.posParams?.['id']?.path).toBe('srv-1');
  });

  it.each([
    ['a dot path', '..'],
    ['a single dot', '.'],
    ['a dot inside', 'a.b'],
    ['a space', 'a b'],
    ['an at sign', 'a@b'],
    ['a slash-like character', 'a%2Fb'],
    ['a colon', 'a:b'],
    ['an accented letter', 'máquina'],
    ['an empty id', ''],
    ['65 characters', 'x'.repeat(65)],
  ])('rejects an id with %s', (_label, id) => {
    expect(run(matcher, id, suffix)).toBeNull();
  });

  it(`rejects a suffix other than "${suffix}"`, () => {
    expect(run(matcher, 'srv-1', otherSuffix)).toBeNull();
    expect(run(matcher, 'srv-1', 'delete')).toBeNull();
    expect(run(matcher, 'srv-1', suffix.toUpperCase())).toBeNull();
  });

  it('rejects a single segment', () => {
    expect(run(matcher, 'srv-1')).toBeNull();
    expect(run(matcher, suffix)).toBeNull();
  });

  it('rejects more than two segments', () => {
    expect(run(matcher, 'srv-1', suffix, 'extra')).toBeNull();
  });

  it('rejects an empty list of segments', () => {
    expect(run(matcher)).toBeNull();
  });
});

describe('MACHINE_ID_ROUTE_PATTERN', () => {
  it('accepts the shapes of the ids the server generates and the seeded ones', () => {
    for (const id of ['1', 'o89hc_hyt6A', 'fRMxqKL-ODo', 'srv-1']) {
      expect(MACHINE_ID_ROUTE_PATTERN.test(id)).toBe(true);
    }
  });

  it('does not accept a trailing newline', () => {
    expect(MACHINE_ID_ROUTE_PATTERN.test('srv-1\n')).toBe(false);
  });
});

describe('MACHINES_ROUTES', () => {
  it('has the four pages: list, create, edit and parts', () => {
    expect(MACHINES_ROUTES).toHaveLength(4);
    expect(MACHINES_ROUTES[0]).toMatchObject({ path: '' });
    expect(MACHINES_ROUTES[1]).toMatchObject({ path: 'new' });
    expect(MACHINES_ROUTES[2]?.matcher).toBe(matchMachineEdit);
    expect(MACHINES_ROUTES[3]?.matcher).toBe(matchMachineParts);
  });

  it('protects EVERY page with a guard', () => {
    for (const route of MACHINES_ROUTES) {
      expect(route.canActivate, String(route.path ?? route.title)).toHaveLength(1);
    }
  });

  it('lazy-loads every page as a component', () => {
    for (const route of MACHINES_ROUTES) {
      expect(route.loadComponent).toBeTypeOf('function');
    }
  });

  it('gives every page its own title', () => {
    const titles = MACHINES_ROUTES.map((route) => route.title);

    expect(new Set(titles).size).toBe(4);
    for (const title of titles) {
      expect(title).toContain('Angular Enterprise Lab');
    }
  });

  it('shares one guard instance across the pages: they all apply the same policy', () => {
    const guards = MACHINES_ROUTES.map((route) => route.canActivate?.[0]);

    expect(new Set(guards).size).toBe(1);
  });

  // Por identidad con las clases reales: el compilador les cambia el `name` (`_MachinesList`).
  it('loads the right component for each page', async () => {
    const loaded = await Promise.all(
      MACHINES_ROUTES.map((route) => (route.loadComponent as () => Promise<unknown>)()),
    );

    expect(loaded).toEqual([MachinesList, MachineForm, MachineForm, MachineParts]);
  });
});
