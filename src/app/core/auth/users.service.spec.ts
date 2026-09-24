import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api.config';
import { AuthUser } from './auth.model';
import { InvalidUserRecordError } from './auth.service';
import {
  InvalidLegajoError,
  LegajoAlreadyLinkedError,
  TechnicianNotFoundError,
  UserDraft,
  UsersService,
} from './users.service';

describe('UsersService.create', () => {
  const usersUrl = `${API_BASE_URL}/users`;
  const tecnicoDraft: UserDraft = {
    username: 'ana',
    password: 'ana123',
    displayName: 'Ana Ruiz',
    email: 'ana@enterprise-lab.dev',
    role: 'tecnico',
    legajo: '1001',
  };
  const staffDraft: UserDraft = {
    username: 'lider',
    password: 'lider123',
    displayName: 'Líder',
    email: 'lider@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const master = {
    id: '1001',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };

  let service: UsersService;
  let httpMock: HttpTestingController;
  let created: AuthUser | undefined;
  let error: unknown;

  const masterUrl = (legajo: string) => `${API_BASE_URL}/tecnicos/${legajo}`;
  const isMasterRequest = (req: { url: string }) => req.url.startsWith(`${API_BASE_URL}/tecnicos`);
  const expectGetTechnicianUsers = () =>
    httpMock.expectOne(
      (req) => req.method === 'GET' && req.url === usersUrl && req.params.get('role') === 'tecnico',
    );
  const expectPost = () => httpMock.expectOne({ method: 'POST', url: usersUrl });
  const expectNoPost = () => httpMock.expectNone({ method: 'POST', url: usersUrl });

  function create(draft: UserDraft): void {
    service.create(draft).subscribe({
      next: (user) => (created = user),
      error: (e: unknown) => (error = e),
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsersService);
    httpMock = TestBed.inject(HttpTestingController);
    created = undefined;
    error = undefined;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('technician role', () => {
    it('creates the login when the legajo exists in the master and has no user yet', () => {
      expect.assertions(4);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush([]);
      const post = expectPost();
      expect(post.request.body).toEqual({
        username: 'ana',
        password: 'ana123',
        displayName: 'Ana Ruiz',
        email: 'ana@enterprise-lab.dev',
        role: 'tecnico',
        legajo: '1001',
      });
      post.flush({ ...post.request.body, id: '7' });

      expect(created).toEqual({
        id: '7',
        username: 'ana',
        displayName: 'Ana Ruiz',
        email: 'ana@enterprise-lab.dev',
        role: 'tecnico',
        legajo: '1001',
        specialty: 'mecanico',
        teamType: 'guardia',
      });
      expect(created).not.toHaveProperty('password');
      expect(error).toBeUndefined();
    });

    it('blocks a legajo that does not exist in the master: no user is written', () => {
      expect.assertions(2);
      create({ ...tecnicoDraft, legajo: '9999' });

      httpMock
        .expectOne(masterUrl('9999'))
        .flush('not found', { status: 404, statusText: 'Not Found' });

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
      expect(error).toMatchObject({ legajo: '9999' });
      expectNoPost();
    });

    it('does not even look for other users when the technician does not exist', () => {
      create({ ...tecnicoDraft, legajo: '9999' });

      httpMock
        .expectOne(masterUrl('9999'))
        .flush('not found', { status: 404, statusText: 'Not Found' });

      httpMock.expectNone((req) => req.url === usersUrl);
    });

    it('blocks a legajo that already has a login: no second user is written', () => {
      expect.assertions(1);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush([{ id: '2', role: 'tecnico', legajo: '1001' }]);

      expect(error).toBeInstanceOf(LegajoAlreadyLinkedError);
      expectNoPost();
    });

    it('allows the legajo when only other technicians have a login', () => {
      expect.assertions(2);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush([{ id: '5', role: 'tecnico', legajo: '1002' }]);
      const post = expectPost();
      post.flush({ ...post.request.body, id: '8' });

      expect(error).toBeUndefined();
      expect(created).toMatchObject({ id: '8', legajo: '1001' });
    });

    it.each([
      ['no legajo', undefined],
      ['an empty legajo', ''],
      ['a legajo with letters', '12a'],
      ['a path traversal', '../users'],
      ['nine digits', '123456789'],
    ])('fails with InvalidLegajoError and sends no request for %s', (_label, legajo) => {
      expect.assertions(1);
      create({ ...tecnicoDraft, legajo } as UserDraft);

      expect(error).toBeInstanceOf(InvalidLegajoError);
      httpMock.expectNone(() => true);
    });

    it('keeps the leading zeros of the legajo in the master URL', () => {
      create({ ...tecnicoDraft, legajo: '0042' });

      httpMock.expectOne(masterUrl('0042')).flush('not found', { status: 404, statusText: 'x' });

      expect(error).toBeInstanceOf(TechnicianNotFoundError);
    });

    it('propagates a server error from the master lookup instead of reporting "not found"', () => {
      expect.assertions(2);
      create(tecnicoDraft);

      httpMock
        .expectOne(masterUrl('1001'))
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(TechnicianNotFoundError);
      expectNoPost();
    });

    it('propagates a server error while looking for an existing login, without writing', () => {
      expect.assertions(2);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(LegajoAlreadyLinkedError);
      expectNoPost();
    });

    it('refuses to write when the master profile is corrupt, leaving no half-created login', () => {
      expect.assertions(1);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush({ ...master, specialty: 'plomero' });
      expectGetTechnicianUsers().flush([]);

      expect(error).toBeInstanceOf(InvalidUserRecordError);
      expectNoPost();
    });

    it('never writes profile attributes into the user record, even if the draft carries them', () => {
      expect.assertions(2);
      create({
        ...tecnicoDraft,
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      } as UserDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush([]);
      const post = expectPost();
      post.flush({ ...post.request.body, id: '9' });

      expect(post.request.body).not.toHaveProperty('specialty');
      expect(created).toMatchObject({ specialty: 'mecanico', teamType: 'guardia' });
    });

    it('fails with InvalidUserRecordError if the server answers with an unusable record', () => {
      expect.assertions(1);
      create(tecnicoDraft);

      httpMock.expectOne(masterUrl('1001')).flush(master);
      expectGetTechnicianUsers().flush([]);
      expectPost().flush({});

      expect(error).toBeInstanceOf(InvalidUserRecordError);
    });
  });

  describe('non-technician roles', () => {
    it('writes the user directly, without consulting the technician master', () => {
      expect.assertions(3);
      create(staffDraft);

      const post = expectPost();
      expect(post.request.body).toEqual(staffDraft);
      post.flush({ ...staffDraft, id: '3' });

      expect(created).toEqual({
        id: '3',
        username: 'lider',
        displayName: 'Líder',
        email: 'lider@enterprise-lab.dev',
        role: 'team-leader-mantenimiento',
      });
      expect(created).not.toHaveProperty('password');
      httpMock.expectNone(isMasterRequest);
    });

    it.each(['administrador', 'team-leader-mantenimiento', 'personal-produccion'] as const)(
      'rejects a %s carrying a legajo without sending any request',
      (role) => {
        expect.assertions(1);
        create({ ...staffDraft, role, legajo: '1001' });

        expect(error).toBeInstanceOf(InvalidLegajoError);
        httpMock.expectNone(() => true);
      },
    );

    it('rejects an unknown role before writing', () => {
      expect.assertions(1);
      create({ ...staffDraft, role: 'superuser' } as unknown as UserDraft);

      expect(error).toBeInstanceOf(InvalidUserRecordError);
      httpMock.expectNone(() => true);
    });

    it('propagates a server error from the write', () => {
      expect.assertions(1);
      create(staffDraft);

      expectPost().flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('hasTechnicianAccount', () => {
    it('is true when a technician user carries that legajo', () => {
      let result: boolean | undefined;
      service.hasTechnicianAccount('1001').subscribe((value) => (result = value));

      expectGetTechnicianUsers().flush([
        { id: '5', role: 'tecnico', legajo: '1002' },
        { id: '2', role: 'tecnico', legajo: '1001' },
      ]);

      expect(result).toBe(true);
    });

    it('is false when only other technicians have a login', () => {
      let result: boolean | undefined;
      service.hasTechnicianAccount('1003').subscribe((value) => (result = value));

      expectGetTechnicianUsers().flush([{ id: '2', role: 'tecnico', legajo: '1001' }]);

      expect(result).toBe(false);
    });

    it('compares the legajo as an exact string ("0042" is not "42")', () => {
      let result: boolean | undefined;
      service.hasTechnicianAccount('42').subscribe((value) => (result = value));

      expectGetTechnicianUsers().flush([{ id: '2', role: 'tecnico', legajo: '0042' }]);

      expect(result).toBe(false);
    });

    it('is false without any request for a legajo with an invalid format', () => {
      let result: boolean | undefined;
      service.hasTechnicianAccount('../users').subscribe((value) => (result = value));

      expect(result).toBe(false);
      httpMock.expectNone(() => true);
    });

    it('propagates a server error instead of answering "no account"', () => {
      let failure: unknown;
      service.hasTechnicianAccount('1001').subscribe({ error: (e: unknown) => (failure = e) });

      expectGetTechnicianUsers().flush('boom', { status: 500, statusText: 'Server Error' });

      expect(failure).toBeInstanceOf(HttpErrorResponse);
    });
  });
});
