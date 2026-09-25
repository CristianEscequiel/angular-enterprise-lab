import { UrlSegment } from '@angular/router';

import {
  matchWorkOrderId,
  matchWorkOrderIdEdit,
  matchWorkOrderIdResolve,
} from './work-orders.routes';

function segment(path: string): UrlSegment {
  return new UrlSegment(path, {});
}

describe('matchWorkOrderId', () => {
  it('matches a single numeric segment', () => {
    const segments = [segment('42')];

    const result = matchWorkOrderId(segments, undefined as never, undefined as never);

    expect(result).toEqual({ consumed: segments, posParams: { id: segments[0] } });
  });

  it('rejects a non-numeric segment', () => {
    expect(matchWorkOrderId([segment('abc')], undefined as never, undefined as never)).toBeNull();
  });

  it('rejects more than one segment', () => {
    expect(
      matchWorkOrderId([segment('42'), segment('extra')], undefined as never, undefined as never),
    ).toBeNull();
  });

  it('rejects an empty list of segments', () => {
    expect(matchWorkOrderId([], undefined as never, undefined as never)).toBeNull();
  });
});

describe('matchWorkOrderIdEdit', () => {
  it('matches <numeric id>/edit', () => {
    const segments = [segment('42'), segment('edit')];

    const result = matchWorkOrderIdEdit(segments, undefined as never, undefined as never);

    expect(result).toEqual({ consumed: segments, posParams: { id: segments[0] } });
  });

  it('rejects a non-numeric id', () => {
    expect(
      matchWorkOrderIdEdit(
        [segment('abc'), segment('edit')],
        undefined as never,
        undefined as never,
      ),
    ).toBeNull();
  });

  it('rejects a suffix other than "edit"', () => {
    expect(
      matchWorkOrderIdEdit(
        [segment('42'), segment('delete')],
        undefined as never,
        undefined as never,
      ),
    ).toBeNull();
  });

  it('rejects a single segment', () => {
    expect(
      matchWorkOrderIdEdit([segment('42')], undefined as never, undefined as never),
    ).toBeNull();
  });
});

describe('matchWorkOrderIdResolve', () => {
  const match = (...paths: string[]) =>
    matchWorkOrderIdResolve(paths.map(segment), undefined as never, undefined as never);

  it('matches <numeric id>/resolve', () => {
    const segments = [segment('42'), segment('resolve')];

    expect(matchWorkOrderIdResolve(segments, undefined as never, undefined as never)).toEqual({
      consumed: segments,
      posParams: { id: segments[0] },
    });
  });

  it.each([
    ['a non-numeric id', ['abc', 'resolve']],
    ['a path-like id', ['..', 'resolve']],
    ['another suffix', ['42', 'edit']],
    ['a single segment', ['42']],
    ['extra segments', ['42', 'resolve', 'x']],
    ['no segments', []],
  ])('rejects %s', (_label, paths) => {
    expect(match(...paths)).toBeNull();
  });
});
