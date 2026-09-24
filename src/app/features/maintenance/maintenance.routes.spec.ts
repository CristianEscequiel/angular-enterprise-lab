import { UrlSegment } from '@angular/router';

import { MAINTENANCE_ROUTES, matchTechnicianEdit } from './maintenance.routes';

function segment(path: string): UrlSegment {
  return new UrlSegment(path, {});
}

const match = (...paths: string[]) =>
  matchTechnicianEdit(paths.map(segment), undefined as never, undefined as never);

describe('matchTechnicianEdit', () => {
  it.each(['1001', '0042', '1', '12345678'])('matches <legajo %s>/edit', (legajo) => {
    const segments = [segment(legajo), segment('edit')];

    const result = matchTechnicianEdit(segments, undefined as never, undefined as never);

    expect(result).toEqual({ consumed: segments, posParams: { legajo: segments[0] } });
  });

  it.each([
    ['letters', 'abc'],
    ['digits and letters', '12a'],
    ['nine digits', '123456789'],
    ['a dot path', '..'],
    ['a sign', '-1'],
    ['an empty legajo', ''],
  ])('rejects a legajo with %s', (_label, legajo) => {
    expect(match(legajo, 'edit')).toBeNull();
  });

  it('rejects a suffix other than "edit"', () => {
    expect(match('1001', 'delete')).toBeNull();
  });

  it('rejects a single segment', () => {
    expect(match('1001')).toBeNull();
  });

  it('rejects more than two segments', () => {
    expect(match('1001', 'edit', 'extra')).toBeNull();
  });

  it('rejects an empty list of segments', () => {
    expect(match()).toBeNull();
  });
});

describe('MAINTENANCE_ROUTES', () => {
  it('redirects the feature root to the technicians list', () => {
    expect(MAINTENANCE_ROUTES[0]).toMatchObject({
      path: '',
      redirectTo: 'technicians',
      pathMatch: 'full',
    });
  });

  it('protects every page route with a guard', () => {
    const pages = MAINTENANCE_ROUTES.flatMap((route) => route.children ?? []);

    expect(pages).toHaveLength(6);
    for (const page of pages) {
      expect(page.canActivate).toHaveLength(1);
      expect(page.loadComponent).toBeTypeOf('function');
      expect(page.title).toContain('Angular Enterprise Lab');
    }
  });
});
