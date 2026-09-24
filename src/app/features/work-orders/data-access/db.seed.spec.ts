import { toAuthUser, USER_ROLES } from '@core/auth/auth.model';
import { isTeamRecord } from '../../maintenance/models/team.model';
import { isTechnicianRecord, Technician } from '../../maintenance/models/technician.model';
import db from './db.json';

// Integridad de los datos de prueba que sirve `pnpm api`. json-server no tiene integridad
// referencial: si estas referencias se rompen a mano (un legajo borrado, un miembro que no existe),
// la app falla recién en el navegador. Acá se comprueba con los mismos validadores del código.
const { users, tecnicos, equipos } = db as unknown as {
  users: Record<string, unknown>[];
  tecnicos: unknown[];
  equipos: unknown[];
};

const technicians = tecnicos.filter(isTechnicianRecord);
// Las listas de legajos son `unknown[]` para poder buscar en ellas valores aún sin validar.
const legajos: unknown[] = technicians.map((technician) => technician.legajo);
const technicianUsers = users.filter((user) => user['role'] === 'tecnico');
const linkedLegajos = technicianUsers.map((user) => user['legajo']);
const teamMembers: unknown[] = equipos.filter(isTeamRecord).flatMap((team) => team.memberLegajos);

function profileOf(legajo: unknown): Technician | undefined {
  return technicians.find((technician) => technician.legajo === legajo);
}

describe('db.json seed data', () => {
  describe('technicians master (tecnicos)', () => {
    it('is not empty and every record is a valid technician', () => {
      expect(tecnicos.length).toBeGreaterThan(0);
      expect(technicians).toHaveLength(tecnicos.length);
    });

    it('has unique legajos (json-server would not reject a repeated id)', () => {
      expect(new Set(legajos).size).toBe(legajos.length);
    });

    it('covers every specialty, to exercise each profile', () => {
      expect(new Set(technicians.map((technician) => technician.specialty)).size).toBe(3);
    });

    it('has a technician without login and without team: the one that can be deleted', () => {
      const deletable = legajos.filter(
        (legajo) => !linkedLegajos.includes(legajo) && !teamMembers.includes(legajo),
      );

      expect(deletable.length).toBeGreaterThan(0);
    });

    it('has a technician without a login user: it exists without being able to log in yet', () => {
      expect(legajos.some((legajo) => !linkedLegajos.includes(legajo))).toBe(true);
    });
  });

  describe('teams (equipos)', () => {
    it('is not empty and every record is a valid team', () => {
      expect(equipos.length).toBeGreaterThan(0);
      expect(equipos.filter(isTeamRecord)).toHaveLength(equipos.length);
    });

    it('only references technicians that exist in the master', () => {
      const unknownMembers = teamMembers.filter((legajo) => !legajos.includes(legajo));

      expect(unknownMembers).toEqual([]);
    });

    it('has a technician that belongs to a team: deleting it has to be blocked', () => {
      expect(teamMembers.length).toBeGreaterThan(0);
    });
  });

  describe('login users (users)', () => {
    it('has unique usernames (the login takes the first match)', () => {
      const usernames = users.map((user) => user['username']);

      expect(new Set(usernames).size).toBe(usernames.length);
    });

    it('has a user for every role', () => {
      expect(new Set(users.map((user) => user['role']))).toEqual(new Set(USER_ROLES));
    });

    it('builds a valid session user for every record', () => {
      const invalid = users.filter((user) => {
        const master = user['role'] === 'tecnico' ? profileOf(user['legajo']) : undefined;
        return toAuthUser(user, master) === null;
      });

      expect(invalid.map((user) => user['username'])).toEqual([]);
    });

    it('links every technician user to a technician of the master', () => {
      expect(technicianUsers.length).toBeGreaterThan(0);
      expect(linkedLegajos.filter((legajo) => !legajos.includes(legajo))).toEqual([]);
    });

    it('has one login per technician (the legajo is not repeated)', () => {
      expect(new Set(linkedLegajos).size).toBe(linkedLegajos.length);
    });

    it('keeps the profile only in the master: technician users carry no specialty or team type', () => {
      for (const user of technicianUsers) {
        expect(user).not.toHaveProperty('specialty');
        expect(user).not.toHaveProperty('teamType');
      }
    });

    it('gives no legajo to users that are not technicians', () => {
      for (const user of users.filter((candidate) => candidate['role'] !== 'tecnico')) {
        expect(user).not.toHaveProperty('legajo');
      }
    });
  });
});
