import { Machine } from './machine.model';

// Partes de una máquina (`/machines/{id}/parts` y `/parts/{id}`): lista de adyacencia plana. Cada parte apunta a su máquina
// (`machineId`) y a su padre (`parentId`, `null` en las de primer nivel). Una parte sin hijos es
// una hoja; ese dato no se guarda, se deduce de que nadie la tiene como `parentId`.
//
// `machineId` y `parentId` no cambian después de crear la parte (no hay "mover"): así no se pueden
// crear ciclos ni partes cruzadas entre máquinas.
export interface Part {
  id: string;
  machineId: string;
  parentId: string | null;
  name: string;
}

// Lo que se ingresa al dar de alta una parte (el `id` lo genera el servidor).
export type PartDraft = Omit<Part, 'id'>;

export interface PartNode {
  part: Part;
  children: PartNode[];
}

export interface BuiltPartTree {
  roots: PartNode[];
  // Partes que no cuelgan de ninguna raíz de su máquina: padre inexistente, padre de otra máquina,
  // ciclo, id repetido. Se devuelven en vez de descartarse para que la pantalla las avise.
  orphans: Part[];
}

export interface FlatPart {
  part: Part;
  depth: number;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPartRecord(value: unknown): value is Part {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const parentId = record['parentId'];

  return (
    isNonBlankString(record['id']) &&
    isNonBlankString(record['machineId']) &&
    (parentId === null || (isNonBlankString(parentId) && parentId !== record['id'])) &&
    isNonBlankString(record['name'])
  );
}

// Arma el árbol de UNA máquina (quien llama pasa las partes ya filtradas por `machineId`).
//
// Se recorre desde las raíces hacia abajo y solo se cuelga lo que se alcanza: por eso termina
// siempre, aun con datos corruptos (un ciclo `A → B → A` nunca se alcanza desde una raíz). Lo que
// no se alcanza va a `orphans`, sin perderse. Los hermanos conservan el orden de entrada (el de
// creación, que es el que devuelve el servidor). Es iterativo: la profundidad no está acotada.
export function buildPartTree(parts: readonly Part[]): BuiltPartTree {
  const childrenByParent = new Map<string, Part[]>();

  for (const part of parts) {
    if (part.parentId !== null) {
      const siblings = childrenByParent.get(part.parentId);

      if (siblings) {
        siblings.push(part);
      } else {
        childrenByParent.set(part.parentId, [part]);
      }
    }
  }

  const placedIds = new Set<string>();
  const placed = new Set<Part>();
  const roots: PartNode[] = [];
  const pending: PartNode[] = [];

  // JSON Server acepta ids repetidos: solo la primera aparición de un id se coloca en el árbol
  // (si no, sus hijos quedarían colgados dos veces); la repetida queda como huérfana.
  const place = (part: Part): PartNode | null => {
    if (placedIds.has(part.id)) {
      return null;
    }

    placedIds.add(part.id);
    placed.add(part);

    const node: PartNode = { part, children: [] };
    pending.push(node);
    return node;
  };

  for (const part of parts) {
    if (part.parentId === null) {
      const node = place(part);

      if (node) {
        roots.push(node);
      }
    }
  }

  for (let node = pending.pop(); node; node = pending.pop()) {
    for (const child of childrenByParent.get(node.part.id) ?? []) {
      // Un hijo de otra máquina no cuelga de este padre: es una referencia cruzada.
      if (child.machineId === node.part.machineId) {
        const childNode = place(child);

        if (childNode) {
          node.children.push(childNode);
        }
      }
    }
  }

  return { roots, orphans: parts.filter((part) => !placed.has(part)) };
}

// Recorrido en profundidad-primero (cada padre antes que sus hijos) con la profundidad de cada
// nodo: 0 para las raíces. Es el orden jerárquico en el que se muestra el árbol.
export function flattenPartTree(roots: readonly PartNode[]): FlatPart[] {
  const flat: FlatPart[] = [];
  const stack = roots.map((node) => ({ node, depth: 0 })).reverse();

  for (let item = stack.pop(); item; item = stack.pop()) {
    flat.push({ part: item.node.part, depth: item.depth });

    // Al revés, para que al sacar de la pila salgan en el orden original de los hijos.
    for (const child of [...item.node.children].reverse()) {
      stack.push({ node: child, depth: item.depth + 1 });
    }
  }

  return flat;
}

// ¿Alguna parte tiene a `id` como padre? Solo mira `parentId`, sin filtrar por máquina: ante la
// duda (una referencia cruzada) se prefiere bloquear la eliminación a dejar un huérfano.
export function hasChildren(parts: readonly Part[], id: string): boolean {
  return parts.some((part) => part.parentId === id);
}

// Separador de la ruta que se guarda en la orden (spec 013d). Es solo presentación: la referencia
// real es el `partId`, así que un nombre que contenga el separador no rompe nada.
export const BREADCRUMB_SEPARATOR = ' > ';

// Ruta legible de una parte, del nombre de la máquina hacia la parte: `Máquina > nivel 1 > … > parte`.
// Sin parte (`partId` en `null`) es solo el nombre de la máquina.
//
// Sube por `parentId` sobre la lista plana (la que devuelve `PartsService.getByMachine`) en vez de
// bajar por el árbol: `flattenPartTree` da la profundidad pero no el vínculo con el padre. Devuelve
// `null` —nunca una ruta parcial— si la cadena no se puede resolver: la parte no existe, es de otra
// máquina, un ancestro falta o hay un ciclo (un `Set` de visitados hace que termine siempre). Quien
// llama decide qué hacer (la página de creación no crea la orden).
export function buildBreadcrumb(
  machine: Machine,
  partId: string | null,
  parts: readonly Part[],
): string | null {
  if (partId === null) {
    return machine.name;
  }

  // JSON Server acepta ids repetidos: como en `buildPartTree`, gana la primera aparición.
  const byId = new Map<string, Part>();

  for (const part of parts) {
    if (!byId.has(part.id)) {
      byId.set(part.id, part);
    }
  }

  const names: string[] = [];
  const visited = new Set<string>();

  for (let currentId: string | null = partId; currentId !== null;) {
    const part = byId.get(currentId);

    if (!part || part.machineId !== machine.id || visited.has(part.id)) {
      return null;
    }

    visited.add(part.id);
    names.push(part.name);
    currentId = part.parentId;
  }

  return [machine.name, ...names.reverse()].join(BREADCRUMB_SEPARATOR);
}
