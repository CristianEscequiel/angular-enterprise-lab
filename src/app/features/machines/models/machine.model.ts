// Maestro de máquinas (`/machines`). El `id` lo genera el servidor y es lo que 013d va a referenciar;
// el `code` es el identificador de negocio (único), por eso se puede editar sin romper referencias.
export interface Machine {
  id: string;
  code: string;
  name: string;
  // Cuántas partes tiene (todos los niveles); lo calcula el servidor.
  partCount: number;
}

// Lo que se ingresa al dar de alta una máquina (el `id` lo genera el servidor).
export type MachineDraft = Omit<Machine, 'id' | 'partCount'>;

// Formato del código YA normalizado (mayúsculas): 1 a 20 caracteres, letras/dígitos/guiones y sin
// empezar con guion. Además de ser el formato del dominio, deja fuera espacios y `../` en el código.
export const MACHINE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

// El código se compara y se guarda sin espacios en los bordes y en mayúsculas: `env-01` y `ENV-01`
// son la misma máquina. Es un paso previo a validar el formato con `MACHINE_CODE_PATTERN`.
export function normalizeMachineCode(code: string): string {
  return code.trim().toUpperCase();
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Valida un registro leído de la base. El `code` guardado ya tiene que estar normalizado: un
// registro con el código en minúsculas es un dato inconsistente (el servicio siempre normaliza).
export function isMachineRecord(value: unknown): value is Machine {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isNonBlankString(record['id']) &&
    typeof record['code'] === 'string' &&
    MACHINE_CODE_PATTERN.test(record['code']) &&
    isNonBlankString(record['name']) &&
    typeof record['partCount'] === 'number' &&
    Number.isInteger(record['partCount']) &&
    record['partCount'] >= 0
  );
}
