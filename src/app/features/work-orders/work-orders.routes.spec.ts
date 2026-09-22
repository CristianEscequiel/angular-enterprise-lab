import { UrlSegment } from '@angular/router';

import { matchWorkOrderId, matchWorkOrderIdEdit } from './work-orders.routes';

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
