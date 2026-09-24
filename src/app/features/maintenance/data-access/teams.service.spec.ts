import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { InvalidLegajoError } from '@core/auth/users.service';
import { API_BASE_URL } from '@core/config/api.config';
import { Team, TeamDraft } from '../models/team.model';
import { TeamLoadError, TeamsService } from './teams.service';

describe('TeamsService', () => {
  const baseUrl = `${API_BASE_URL}/equipos`;
  const guardia: Team = {
    id: '1',
    name: 'Guardia mecánica',
    type: 'guardia',
    memberLegajos: ['1001', '1002'],
  };
  const draft: TeamDraft = {
    name: 'Preventivo eléctrico',
    type: 'preventivo-correctivo',
    memberLegajos: ['1002'],
  };
  const serverError = { status: 500, statusText: 'Server Error' };

  let service: TeamsService;
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
    service = TestBed.inject(TeamsService);
    httpMock = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getAll', () => {
    it('gets every team', () => {
      expect.assertions(2);
      subscribe(service.getAll());

      const request = httpMock.expectOne(baseUrl);
      expect(request.request.method).toBe('GET');
      request.flush([guardia]);

      expect(result).toEqual([guardia]);
    });
  });

  describe('getById', () => {
    it('gets one team by id', () => {
      expect.assertions(2);
      subscribe(service.getById('1'));

      const request = httpMock.expectOne(`${baseUrl}/1`);
      expect(request.request.method).toBe('GET');
      request.flush(guardia);

      expect(result).toEqual(guardia);
    });

    it('encodes the id in the URL (json-server generates ids such as "-F0Rxw22vkQ")', () => {
      subscribe(service.getById('-F0R/x'));

      httpMock.expectOne(`${baseUrl}/-F0R%2Fx`).flush(guardia);

      expect(result).toEqual(guardia);
    });

    it('fails with a not-found TeamLoadError on a 404', () => {
      expect.assertions(2);
      subscribe(service.getById('99'));

      httpMock.expectOne(`${baseUrl}/99`).flush('not found', { status: 404, statusText: 'x' });

      expect(error).toBeInstanceOf(TeamLoadError);
      expect(error).toMatchObject({ kind: 'not-found' });
    });

    it('fails with a connection TeamLoadError on a server error, not as "not found"', () => {
      expect.assertions(2);
      subscribe(service.getById('1'));

      httpMock.expectOne(`${baseUrl}/1`).flush('boom', serverError);

      expect(error).toBeInstanceOf(TeamLoadError);
      expect(error).toMatchObject({ kind: 'connection' });
    });

    it('fails with a connection TeamLoadError on a network error', () => {
      expect.assertions(2);
      subscribe(service.getById('1'));

      httpMock.expectOne(`${baseUrl}/1`).error(new ProgressEvent('error'));

      expect(error).toBeInstanceOf(TeamLoadError);
      expect(error).toMatchObject({ kind: 'connection' });
    });
  });

  describe('create', () => {
    it('posts the team without an id (json-server generates it)', () => {
      expect.assertions(3);
      subscribe(service.create(draft));

      const post = httpMock.expectOne(baseUrl);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual(draft);
      post.flush({ id: '7', ...draft });

      expect(result).toEqual({ id: '7', ...draft });
    });

    it('trims the name and persists the members without repeats', () => {
      expect.assertions(1);
      subscribe(
        service.create({
          ...draft,
          name: '  Preventivo eléctrico ',
          memberLegajos: ['1002', '1002'],
        }),
      );

      const post = httpMock.expectOne(baseUrl);
      expect(post.request.body).toEqual({ ...draft, memberLegajos: ['1002'] });
      post.flush({});
    });

    it('creates a team without members', () => {
      expect.assertions(1);
      subscribe(service.create({ ...draft, memberLegajos: [] }));

      const post = httpMock.expectOne(baseUrl);
      expect(post.request.body).toMatchObject({ memberLegajos: [] });
      post.flush({});
    });

    it('writes only the team fields, even if the draft carries others', () => {
      expect.assertions(1);
      subscribe(service.create({ ...draft, id: 'x', extra: true } as TeamDraft));

      const post = httpMock.expectOne(baseUrl);
      expect(Object.keys(post.request.body as object).sort()).toEqual([
        'memberLegajos',
        'name',
        'type',
      ]);
      post.flush({});
    });

    it('refuses an invalid member legajo without sending any request', () => {
      expect.assertions(1);
      subscribe(service.create({ ...draft, memberLegajos: ['1002', '../users'] }));

      expect(error).toBeInstanceOf(InvalidLegajoError);
      httpMock.expectNone(() => true);
    });
  });

  describe('update', () => {
    it('replaces the team at /equipos/:id keeping the id from the route', () => {
      expect.assertions(3);
      subscribe(service.update('1', { ...draft, memberLegajos: ['1001', '1003'] }));

      const put = httpMock.expectOne(`${baseUrl}/1`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ id: '1', ...draft, memberLegajos: ['1001', '1003'] });
      put.flush(put.request.body);

      expect(result).toMatchObject({ id: '1', memberLegajos: ['1001', '1003'] });
    });

    it('sends the members without repeats when the draft has duplicates', () => {
      expect.assertions(2);
      subscribe(service.update('1', { ...draft, memberLegajos: ['1001', '1002', '1001'] }));

      const put = httpMock.expectOne(`${baseUrl}/1`);
      expect(put.request.body).toMatchObject({ memberLegajos: ['1001', '1002'] });
      expect(new Set(put.request.body.memberLegajos).size).toBe(2);
      put.flush(put.request.body);
    });

    it('ignores an id carried by the draft', () => {
      expect.assertions(1);
      subscribe(service.update('1', { ...draft, id: '2' } as TeamDraft));

      const put = httpMock.expectOne(`${baseUrl}/1`);
      expect(put.request.body).toMatchObject({ id: '1' });
      put.flush({});
    });

    it('refuses an invalid member legajo without sending any request', () => {
      expect.assertions(1);
      subscribe(service.update('1', { ...draft, memberLegajos: ['12a'] }));

      expect(error).toBeInstanceOf(InvalidLegajoError);
      httpMock.expectNone(() => true);
    });

    it('propagates a server error', () => {
      expect.assertions(1);
      subscribe(service.update('1', draft));

      httpMock.expectOne(`${baseUrl}/1`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('delete', () => {
    it('sends DELETE to /equipos/:id', () => {
      expect.assertions(2);
      const next = vi.fn();
      service.delete('1').subscribe(next);

      const request = httpMock.expectOne(`${baseUrl}/1`);
      expect(request.request.method).toBe('DELETE');
      request.flush({});

      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it('propagates a server error', () => {
      expect.assertions(1);
      subscribe(service.delete('1'));

      httpMock.expectOne(`${baseUrl}/1`).flush('boom', serverError);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });
  });
});
