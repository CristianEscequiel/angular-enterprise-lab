import { toAuthUser, USER_ROLES } from '@core/auth/auth.model';
import { isMachineRecord, normalizeMachineCode } from '../../machines/models/machine.model';
import {
  buildPartTree,
  flattenPartTree,
  hasChildren,
  isPartRecord,
  Part,
} from '../../machines/models/part.model';
import { isTeamRecord } from '../../maintenance/models/team.model';
import { isTechnicianRecord, Technician } from '../../maintenance/models/technician.model';
import db from './db.json';

// Integridad de los datos de prueba que sirve `pnpm api`. json-server no tiene integridad
// referencial: si estas referencias se rompen a mano (un legajo borrado, un miembro que no existe),
// la app falla recién en el navegador. Acá se comprueba con los mismos validadores del código.
const { users, tecnicos, equipos, maquinas, partes } = db as unknown as {
  users: Record<string, unknown>[];
  tecnicos: unknown[];
  equipos: unknown[];
  maquinas: unknown[];
  partes: unknown[];
};

const technicians = tecnicos.filter(isTechnicianRecord);
// Las listas de legajos son `unknown[]` para poder buscar en ellas valores aún sin validar.
const legajos: unknown[] = technicians.map((technician) => technician.legajo);
const technicianUsers = users.filter((user) => user['role'] === 'tecnico');
const linkedLegajos = technicianUsers.map((user) => user['legajo']);
const teamMembers: unknown[] = equipos.filter(isTeamRecord).flatMap((team) => team.memberLegajos);

function partRecords(): Part[] {
  return partes.filter(isPartRecord);
}

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

  // Máquinas y árbol de partes (spec 013a). JSON Server no valida nada ni tiene integridad
  // referencial: un padre borrado a mano, una parte con otra máquina o un código repetido rompen la
  // pantalla recién en el navegador. Acá se comprueba con los mismos validadores del código.
  describe('machines (maquinas)', () => {
    const machineRecords = maquinas.filter(isMachineRecord);

    it('is not empty and every record is a valid machine', () => {
      expect(maquinas.length).toBeGreaterThan(0);
      expect(machineRecords).toHaveLength(maquinas.length);
    });

    it('has unique ids (json-server would not reject a repeated one)', () => {
      const ids = machineRecords.map((machine) => machine.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique codes, ignoring case and edge spaces', () => {
      const codes = machineRecords.map((machine) => normalizeMachineCode(machine.code));

      expect(new Set(codes).size).toBe(codes.length);
    });

    it('has a machine without parts: the one that can be deleted', () => {
      const withParts = new Set(partRecords().map((part) => part.machineId));

      expect(machineRecords.some((machine) => !withParts.has(machine.id))).toBe(true);
    });

    it('has a machine with parts: deleting it has to be blocked', () => {
      const withParts = new Set(partRecords().map((part) => part.machineId));

      expect(machineRecords.some((machine) => withParts.has(machine.id))).toBe(true);
    });
  });

  describe('parts (partes)', () => {
    const machineIds = maquinas.filter(isMachineRecord).map((machine) => machine.id);

    it('is not empty and every record is a valid part', () => {
      expect(partes.length).toBeGreaterThan(0);
      expect(partRecords()).toHaveLength(partes.length);
    });

    it('has unique ids', () => {
      const ids = partRecords().map((part) => part.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('only points at machines that exist', () => {
      const unknown = partRecords().filter((part) => !machineIds.includes(part.machineId));

      expect(unknown.map((part) => part.name)).toEqual([]);
    });

    it('only hangs from parents that exist and belong to the same machine', () => {
      const all = partRecords();
      const broken = all.filter((part) => {
        if (part.parentId === null) return false;
        const parent = all.find((candidate) => candidate.id === part.parentId);

        return !parent || parent.machineId !== part.machineId;
      });

      expect(broken.map((part) => part.name)).toEqual([]);
    });

    it('builds a tree with no orphans for every machine, and loses no part', () => {
      for (const machineId of machineIds) {
        const own = partRecords().filter((part) => part.machineId === machineId);
        const { roots, orphans } = buildPartTree(own);

        expect(orphans, `máquina ${machineId}`).toEqual([]);
        expect(flattenPartTree(roots), `máquina ${machineId}`).toHaveLength(own.length);
      }
    });

    it('has a tree of at least 4 levels, to exercise the depth of the spec', () => {
      const depths = machineIds.flatMap((machineId) =>
        flattenPartTree(
          buildPartTree(partRecords().filter((part) => part.machineId === machineId)).roots,
        ).map((item) => item.depth),
      );

      expect(Math.max(...depths)).toBeGreaterThanOrEqual(3);
    });

    it('has a leaf next to a part with children at level 2, to exercise both kinds of sibling', () => {
      const all = partRecords();
      const levelTwo = all.filter((part) => part.parentId !== null);
      const siblingsOfMixedKind = levelTwo.some(
        (part) =>
          !hasChildren(all, part.id) &&
          levelTwo.some(
            (other) =>
              other.parentId === part.parentId &&
              other.id !== part.id &&
              hasChildren(all, other.id),
          ),
      );

      expect(siblingsOfMixedKind).toBe(true);
    });

    it('has a part with children: deleting it has to be blocked', () => {
      const all = partRecords();

      expect(all.some((part) => hasChildren(all, part.id))).toBe(true);
    });

    it('has more than one machine with parts, so the trees can be told apart', () => {
      expect(new Set(partRecords().map((part) => part.machineId)).size).toBeGreaterThan(1);
    });

    // JSON Server anula, al borrar, las claves foráneas llamadas `<singular>Id` de otras colecciones
    // (`maquinaId`, `parteId`). Los campos elegidos (`machineId`, `parentId`) no la disparan: si
    // alguien los renombra a esa convención, un DELETE convertiría hijos en raíces sin avisar.
    it('does not use the foreign key names that json-server nullifies on delete', () => {
      for (const record of partes as Record<string, unknown>[]) {
        expect(record).not.toHaveProperty('maquinaId');
        expect(record).not.toHaveProperty('parteId');
      }
    });
  });
});
