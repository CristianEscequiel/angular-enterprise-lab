# Plan 013a: Maestro de máquinas y árbol de partes

## Contexto

El sistema no tiene noción de máquinas. 013a agrega el **maestro de máquinas** y, por cada
una, un **árbol de partes de profundidad variable (N niveles)**. Es prerequisito de datos de
013d (asociar una orden a "qué máquina, qué parte"); 013a no toca órdenes.

Roles: los de 013b (`auth.model.ts`). **`administrador` y `team-leader-mantenimiento` tienen el
mismo nivel de permiso** para crear, modificar y eliminar máquinas y partes. `personal-produccion`
y `tecnico` no acceden a la gestión.

## Hallazgos de JSON Server (1.0.0-beta.15, comprobados en una copia temporal)

Condicionan el diseño; se probaron con máquinas `"1"`/`"2"` y un árbol de 3 niveles:

1. **Filtrar por clave foránea numérica no anda.** `GET /partes?machineId=1` devuelve `[]`
   aunque existan partes con `"machineId": "1"` (misma coerción a número que vio 013c con
   `?legajo=`). `GET /maquinas?code=0042` tampoco encuentra el código `"0042"`. Lo que sí
   funciona: `?parentId=null`, y filtros sobre valores no numéricos (`?code=MAQ-001`).
   → **La app pide `GET /partes` y filtra por `machineId` en el cliente.**
2. **No hay cascada.** `DELETE /partes/1` responde `200` y sus hijas (`2`, `3`) quedan en la
   colección apuntando a un padre inexistente. `DELETE /maquinas/2` deja sus partes colgando.
3. **Acepta huérfanos y `code` repetido.** `POST /partes` con `machineId: "999"` y `parentId: "777"`
   inexistentes → `201`. `POST /maquinas` con un `code` ya usado → `201`. _(Corrección: en la primera
   versión de este plan decía también "con un `id` ya usado → `201`"; era una conclusión mal
   sacada, ver el hallazgo 5: el `id` del cuerpo se descarta, así que por la API no se pueden crear
   ids duplicados.)_
4. **`_embed` no sirve para el árbol** (devuelve `partes: []` porque espera `maquinaId`, y en
   cualquier caso no es recursivo).
5. **`POST` IGNORA el `id` del cuerpo y genera el suyo**: `{"id":"7"}` → `"PnZGX7oWTqM"`, siempre
   (comprobado también con el `db.json` real). Son strings alfanuméricos de 11 caracteres
   (`"o89hc_hyt6A"`); `PUT` toma el `id` de la URL, no del cuerpo. Un servicio no puede fijar ids
   desde el cliente; `buildPartTree` igual tolera ids repetidos (solo pueden venir de editar
   `db.json` a mano). Los ids de los datos de prueba, en cambio, son strings numéricos (`"1"`),
   escritos a mano en el archivo.

6. **Al borrar, el servidor anula las claves foráneas con nombre `<singular>Id`** de las otras
   colecciones (`nullifyForeignKey` en `lib/service.js`; con `?_dependent=` también borra en
   cascada). Con `maquinas`/`partes` la convención sería `maquinaId`/`parteId`: **los campos
   `machineId`/`parentId` no coinciden, por eso no se tocan** (es lo que se observó en el hallazgo
   2). **No renombrarlos** a `maquinaId`/`parteId` sin revisar esto: un `DELETE` empezaría a poner
   `null` en `parentId` de los hijos y los convertiría en raíces sin avisar. El emulador no replica
   esta anulación justamente porque los nombres elegidos no la disparan.

Consecuencia: **toda la integridad (padre existente, misma máquina, sin huérfanos, código
único) la tiene que garantizar el cliente**. Con el backend real (spec 018) pasa a ser FK +
índice único y los chequeos previos se vuelven `409`/`422` del servidor.

## Estructura de datos del árbol

### Propuesta: lista de adyacencia plana (`parentId`) en una colección `partes`

```jsonc
"maquinas": [
  { "id": "1", "code": "ENV-01", "name": "Envasadora línea 1" }
],
"partes": [
  // parentId === null → parte de primer nivel de la máquina
  { "id": "1", "machineId": "1", "parentId": null, "name": "Mesa de transporte" },
  { "id": "2", "machineId": "1", "parentId": "1",  "name": "Cinta 1" },
  { "id": "3", "machineId": "1", "parentId": "2",  "name": "Motor de cinta" },
  { "id": "4", "machineId": "1", "parentId": "3",  "name": "Rodamiento delantero" }   // nivel 4
]
```

Una parte **sin hijos es una hoja** (no se guarda ese dato: se deduce de que ninguna otra
parte la tiene como `parentId`). El árbol se arma en el cliente con `buildPartTree()`.

### Por qué no anidado (`children` dentro de la máquina)

|                           | Plana (`parentId`) — **elegida**                                                                 | Anidada (`children[]` en la máquina)                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Guardado                  | Una escritura por nodo                                                                           | Un `PUT` reemplaza **todo** el árbol: dos editores simultáneos se pisan el subárbol entero |
| Id de cada nodo           | Lo genera el servidor; estable                                                                   | Hay que inventarlo en el cliente (json-server no toca objetos anidados)                    |
| Referenciar desde 013d    | `partId` directo                                                                                 | Hay que recorrer el árbol para resolver un id                                              |
| Huérfanos                 | Posibles en los datos → hay que detectarlos y prevenirlos (tareas 2, 5)                          | Imposibles por construcción                                                                |
| Orden entre hermanos      | Orden de creación (orden del array que devuelve el servidor)                                     | Orden del array                                                                            |
| Listado de máquinas       | Liviano                                                                                          | Cada `GET /maquinas` trae todos los árboles                                                |
| Backend real (PostgreSQL) | **1 a 1**: `parts(id, machine_id FK, parent_id FK autorreferenciada)`; lectura con CTE recursiva | Habría que migrar el modelo                                                                |

La anidada gana en atomicidad y en "sin huérfanos gratis", pero pierde en concurrencia, en
ids estables para 013d y en fidelidad con el backend planificado. Los huérfanos se resuelven
con las reglas de abajo. **Es la decisión de mayor impacto del plan: corregir antes de
implementar si se prefiere la anidada** (cambia las tareas 2, 5, 6 y 7).

### Reglas de integridad (todas en el cliente, por el hallazgo 3)

- `machineId` y `parentId` **no se pueden cambiar** después de crear la parte (no hay "mover"
  en el spec). Además de simple, esto impide crear ciclos y partes cruzadas entre máquinas.
  `update` usa `PATCH` con **solo `{ name }`**: nunca reenvía `machineId`/`parentId`.
- `create` verifica antes de escribir que la máquina existe y que el padre (si lo hay) existe
  **y pertenece a la misma máquina**. Si no, error tipado y **sin `POST`**. Un error `5xx` o de
  red en esa verificación se propaga; **nunca** se interpreta como "no existe".
- `buildPartTree` arma el árbol **desde las raíces hacia abajo**; todo nodo no alcanzado
  (padre inexistente, padre de otra máquina o ciclo) se devuelve en `orphans` en vez de
  descartarse en silencio, y la página lo avisa. Recorrer desde las raíces garantiza que
  termina aun con datos corruptos (un ciclo nunca se alcanza).

### Eliminación: **bloquear si tiene hijos** (no cascada)

El spec deja elegir; se elige **bloquear** por ser lo más seguro:

- JSON Server no tiene cascada (hallazgo 2): una cascada serían N `DELETE` no atómicos. Si el
  tercero falla, quedan hijos huérfanos de un padre ya borrado — exactamente lo que el spec
  prohíbe. Bloquear es **un** `DELETE` y no puede dejar huérfanos.
- 013d va a referenciar hojas: un borrado en cascada accidental de un subárbol entero es
  irrecuperable y afectaría órdenes.
- Se corresponde con `ON DELETE RESTRICT` del backend real.
- El costo (borrar un subárbol grande obliga a ir de las hojas hacia arriba) se acepta; una
  cascada transaccional puede ser una spec futura contra el backend real.

Reglas: **parte con hijos → no se elimina; máquina con partes → no se elimina** (mismo
criterio). El servicio hace el chequeo con **datos frescos** (vuelve a pedir `GET /partes`), no
con el árbol que la pantalla tiene en memoria, para no borrar un padre al que otro usuario
acaba de agregarle un hijo. Sigue habiendo una ventana entre el chequeo y el `DELETE`
(no atómico); es aceptable en el mock y el backend la cierra con la FK.

## Otras decisiones de diseño

- **Feature propia `features/machines/`** (no dentro de `maintenance`): no depende de técnicos
  ni de equipos, y 013d (work-orders) la consume en una sola dirección. Rutas bajo `/machines`,
  colecciones `maquinas` y `partes` (mismo criterio que `tecnicos`/`equipos`), campos en inglés
  (`machineId`, `parentId`, `code`, `name`).
- **Atributos de la máquina: `code` y `name`, nada más.** El spec pide "otros atributos básicos
  a definir en plan"; `asset` de las órdenes hoy es texto libre que 013d reemplaza, así que
  agregar `location` o `description` sería duplicar. `code` es el identificador de negocio:
  obligatorio, único, se normaliza (trim + mayúsculas) y tiene formato
  `^[A-Z0-9][A-Z0-9-]{0,19}$`. La unicidad se chequea en el cliente sobre `GET /maquinas`
  (hallazgo 1: no se puede confiar en `?code=`), **sin distinguir mayúsculas** y excluyéndose a
  sí misma al editar. El `id` lo genera el servidor y es lo que 013d va a referenciar, por eso el
  `code` sí es editable.
- **Servicios**: `PartsService` **no** inyecta `MachinesService` (verifica la máquina con su
  propio `GET /maquinas/:id`); `MachinesService.delete` sí inyecta `PartsService` para el
  chequeo de partes. Así no hay dependencia circular. Los servicios no conocen al usuario: el
  permiso lo aplican guards y páginas (CLAUDE.md), igual que en 013c.
- **Lectura sin restricción de rol.** `buildPartTree`, los servicios de lectura y el componente
  `PartTree` no consultan permisos: 013d necesita mostrar el árbol a quien crea una orden (que
  puede no ser gestor). Lo que exige `canManageMachines` es la **gestión** (rutas `/machines/**`
  y sus acciones).
- **Un solo predicado de permiso, `canManageMachines`** (`administrador` o
  `team-leader-mantenimiento`): el spec da el mismo nivel a ambos en todas las acciones, así
  que no hay granularidad (`canDelete…`) que separar. Un test compara los roles contra
  `USER_ROLES` para que un rol nuevo obligue a decidir su permiso (patrón de 013c).
- **`PartTree` es un componente presentacional** (`nodes` in; `selectPart`, `addChild`,
  `editPart`, `deletePart` out; `showActions` para ocultar las acciones): sin HTTP ni
  permisos. La página de gestión lo usa con acciones; 013d lo reutiliza solo para seleccionar.
  Recursivo con `ng-template` + `ngTemplateOutlet` (sin límite de niveles), con roles ARIA de
  árbol (`tree`/`group`/`treeitem`, `aria-level`, `aria-expanded`).
- **Alta y edición de partes con un panel en línea** de la página, no con el `Modal` compartido:
  este solo confirma (`message`, `confirmed`/`cancelled`) y no aloja campos. El `Modal` se usa
  para confirmar la eliminación.
- **Sin `position`.** El orden entre hermanos es el de creación (orden del array del servidor);
  el spec no pide reordenar. Si hiciera falta, se agrega `position` en una spec aparte.

## Decisiones abiertas (asumidas por defecto; corregir antes de implementar)

1. **Estructura plana vs. anidada** (ver arriba). Se asume plana.
2. **Bloquear vs. cascada.** Se asume bloquear, también para máquinas con partes.
3. **Atributos de máquina: solo `code` + `name`.** ✅ **Cerrada:** sin `location`/`description`
   por ahora. Si se quiere agregarlos, es un campo opcional más en el modelo y el formulario.
4. **Nombres de partes hermanas repetidos: no se validan.** ✅ **Cerrada:** sin validar en esta
   ronda; queda como mejora futura si hace falta. Los ids las distinguen y no rompe
   integridad; puede confundir a quien selecciona en 013d. Si se quiere, es un chequeo en
   `PartsService.create/update` con la lista fresca de hermanas.
5. **Sin "mover" una parte** a otro padre u otra máquina.
6. **Sin límite de profundidad.** El spec dice N niveles; el render recursivo no lo necesita.
7. **Seguridad**: los guards y ocultamientos son UX; la autorización real es del backend
   (spec 018), como en 011/013c.

## Fuera de alcance

Asociar órdenes a máquinas/partes y el comentario de falla (013d); historial, indicadores o
reportes por máquina; importación masiva; mover/reordenar partes; navegación por teclado del
árbol más allá de los botones enfocables (flechas, `Home`/`End`); mover `db.json` de
`features/work-orders/data-access/`; `mock-api.interceptor.ts` (solo intercepta `/api/work-orders`,
no aplica).

## Tareas

Cada tarea deja `pnpm test` en verde antes de pasar a la siguiente (lo exige el hook de Husky).
Rutas relativas a `src/app/`.

| #   | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Archivo(s)                                                                                                                                                             | Test que la valida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Modelo `Machine` (`id`, `code`, `name`), `MachineDraft`, `MACHINE_CODE_PATTERN`, `normalizeMachineCode()`, `isMachineRecord()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | nuevo `features/machines/models/machine.model.ts`                                                                                                                      | `machine.model.spec.ts`: acepta un registro válido; rechaza cada campo faltante/no-string por separado; `normalizeMachineCode(' env-01 ')` → `'ENV-01'`; el patrón acepta `ENV-01`, `0042`, rechaza `''`, `-X`, `a b`, `../x`, 21 caracteres                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | Modelo `Part` (`id`, `machineId`, `parentId: string \| null`, `name`), `PartDraft`, `isPartRecord()`; `PartNode` (`part` + `children`); `buildPartTree(parts)` → `{ roots, orphans }` desde las raíces; `flattenPartTree(roots)` → `{ part, depth }[]` en profundidad-primero; `hasChildren(parts, id)`                                                                                                                                                                                                                                                                                                                           | nuevo `features/machines/models/part.model.ts`                                                                                                                         | `part.model.spec.ts`: **árbol de 5 niveles con las partes desordenadas (hijos antes que el padre) → `roots` anidado con cada nodo bajo su padre y `flattenPartTree` da profundidades `0..4` en orden jerárquico (falla si se aplana o se pierde un nivel)**; hermanos conservan el orden de entrada; **parte con `parentId` inexistente, con padre de otra máquina o en un ciclo `A→B→A` → aparece en `orphans` y no en `roots`, y la función termina**; sin partes → `roots: []`; `isPartRecord` rechaza `parentId` no string/no null, `machineId` vacío y `parentId === id`; `hasChildren` distingue hoja de padre                                                                                                                                                                                                     |
| 3   | Política de permisos: `canManageMachines(user)` (`administrador` o `team-leader-mantenimiento`), fuente única para guards, páginas y sidebar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | nuevo `features/machines/models/machines.permissions.ts`                                                                                                               | `machines.permissions.spec.ts` (`it.each` sobre `USER_ROLES` + `null`): **`administrador` y `team-leader-mantenimiento` → `true` (mismo nivel); `personal-produccion` y `tecnico` → `false`; `null` → `false`**; un test compara los roles contra `USER_ROLES` (un rol nuevo obliga a decidir)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4   | Backend en memoria para tests: `HttpInterceptorFn` con estado que emula lo comprobado de JSON Server (ids string generados, **acepta huérfanos y duplicados**, **sin cascada**, **`?campo=` numérico devuelve `[]`**, `PATCH`/`PUT`/`DELETE`/`404`). Permite probar ida y vuelta real por los servicios (criterios 1 y 2) sin levantar `pnpm api`                                                                                                                                                                                                                                                                                 | nuevo `core/testing/in-memory-api.ts` (+ `in-memory-api.spec.ts`). **Genérico** (las colecciones salen del seed): lo usa también `maintenance` para el arreglo de 013c | `in-memory-api.spec.ts`: `POST` genera id y lo devuelve **e ignora el `id` del cuerpo (hallazgo 5)**; `POST` con padre inexistente **igual responde `201`** (el emulador no protege: es el hallazgo 3); `DELETE` del padre **deja a los hijos** (hallazgo 2); `GET /partes?machineId=1` con `machineId: "1"` → `[]` (hallazgo 1); `GET` de id inexistente → `404`. Si el emulador fuera "amable", los tests de servicios no probarían nada                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | `PartsService`: `getAll`, `getByMachine(machineId)` (**`GET /partes` + filtro en el cliente**), `create(machineId, parentId, name)` con verificación previa de máquina y padre, `update(id, name)` por `PATCH { name }`, `delete(id)` que **repite `GET /partes` y bloquea si hay hijos**. Errores tipados: `MachineNotFoundError`, `ParentPartNotFoundError` (`missing` o `other-machine`), `PartHasChildrenError`, `InvalidPartError` (nombre vacío o id en blanco: sin ningún request). _(Se descartó `PartLoadError`: no hay `getById` de partes; la página carga por `getByMachine`.)_ `encodeURIComponent` en todas las URL | nuevo `features/machines/data-access/parts.service.ts`                                                                                                                 | `parts.service.spec.ts`: `getByMachine` **no** manda `?machineId=` y devuelve solo las de esa máquina; `create` raíz → verifica `GET /maquinas/:id` y luego `POST` con `parentId: null`; `create` hija → verifica el padre y manda su `parentId`; **máquina inexistente (`404`) o padre inexistente → error tipado y `expectNone` de `POST`**; **padre de otra máquina → `ParentPartNotFoundError`, sin `POST`**; `500` al verificar → error HTTP, **no** `ParentPartNotFoundError`; **`update` manda exactamente `{ name }` (sin `machineId`/`parentId`)**; **`delete` de una parte con hijos → `PartHasChildrenError` y `expectNone` de `DELETE`**; `delete` de hoja → `DELETE`; **`delete` usa datos frescos: un hijo agregado después de armar la pantalla igual lo bloquea**; `500` al chequear hijos → no se borra |
| 6   | `MachinesService`: `getAll`, `getById` (`404` → `MachineLoadError('not-found')`), `create` (**verifica código libre** con `GET /maquinas`, normaliza `code`), `update` (excluye a la propia máquina de la unicidad), `delete(id)` que **bloquea si tiene partes** (`MachineHasPartsError`). Errores: `DuplicateMachineCodeError`, `MachineHasPartsError`, `InvalidMachineError` (código sin formato, nombre vacío o id en blanco: sin ningún request); `update` de una máquina que ya no existe → `MachineLoadError('not-found')` sin escribir                                                                                    | nuevo `features/machines/data-access/machines.service.ts`                                                                                                              | `machines.service.spec.ts`: `create` con código libre → `GET` y luego `POST` con `code` normalizado; **código repetido (`ENV-01` vs `env-01`) → `DuplicateMachineCodeError` y `expectNone` de `POST`**; código inválido → sin ningún request; `update` que conserva su propio código **no** da duplicado; `update` a un código ajeno → error; **`delete` de máquina con partes → `MachineHasPartsError` y `expectNone` de `DELETE`**; sin partes → `DELETE`; `500` al chequear partes → no se borra; `getById` `404` vs `500` distinguidos                                                                                                                                                                                                                                                                               |
| 7   | Especificación ejecutable de los criterios de aceptación 1 y 2 sobre el backend en memoria, atravesando `MachinesService` + `PartsService` reales                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nuevo `features/machines/data-access/machines-tree.integration.spec.ts`                                                                                                | **Criterio 1**: crear máquina + cadena de 4 niveles (con raíz y una hoja hermana en nivel 2) → `getByMachine` + `buildPartTree` devuelve **exactamente** esa estructura, jerarquía y orden; falla si el servicio no manda `parentId` o si `getByMachine` filtra por query. **Criterio 2**: intentar borrar cada nodo con hijos → bloqueado y luego `orphans` sigue vacío; borrar de las hojas hacia arriba hasta vaciar → cada paso deja `orphans: []`; borrar la máquina con partes → bloqueado, y sin partes → se borra. Una secuencia mezclada de altas/bajas permitidas termina con `orphans: []`                                                                                                                                                                                                                    |
| 8   | Componente `PartTree` presentacional y recursivo: `nodes` (input), `selectedId` (`model`), `showActions`; outputs `selectPart`, `addChild`, `editPart`, `deletePart`; expandir/contraer por nodo; roles ARIA de árbol                                                                                                                                                                                                                                                                                                                                                                                                             | nuevo `features/machines/components/part-tree/part-tree.ts/.html/.scss`                                                                                                | `part-tree.spec.ts`: **renderiza un árbol de 5 niveles con `aria-level` 1..5 y cada texto bajo su padre**; hoja sin control de expandir; contraer un nodo oculta a todos sus descendientes; click en una parte emite `selectPart` y marca `aria-selected`; con `showActions=false` no hay botones de agregar/editar/eliminar (uso de 013d); cada acción emite el nodo correcto; árbol vacío muestra el estado vacío; el componente **no** inyecta `AuthService` ni `HttpClient` (test de instanciación sin proveedores)                                                                                                                                                                                                                                                                                                  |
| 9   | Listado de máquinas: tabla con código, nombre y cantidad de partes (un solo `GET /partes`), acciones según política; `deleteMachine()` **sin chequeo previo propio**: delega en el servicio, y ante `MachineHasPartsError` muestra un aviso claro; usa el `Modal` de confirmación                                                                                                                                                                                                                                                                                                                                                 | nuevo `features/machines/pages/machines-list/machines-list.ts/.html/.scss`                                                                                             | `machines-list.spec.ts` (servicios mockeados, como en 013c): TL y Admin ven "Nueva máquina", "Editar", "Eliminar"; **sesión sin permiso: `deleteMachine('1')` no llama al servicio aunque se invoque el método**; al confirmar llama a `delete`; máquina con partes → aviso con el motivo y la máquina sigue listada; error de conexión → estado de error; lista vacía; cuenta de partes correcta por máquina                                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | Formulario de máquina (crear/editar): `code` y `name` requeridos, validador de formato de `code`, error visible por código duplicado, bloqueo de doble envío; al guardar vuelve al listado                                                                                                                                                                                                                                                                                                                                                                                                                                        | nuevo `features/machines/pages/machine-form/machine-form.ts/.html`                                                                                                     | `machine-form.spec.ts`: **crear con código nuevo → `create` y navega al listado**; **código duplicado → mensaje de error, no navega**; formato inválido y campos vacíos bloquean el envío sin llamar al servicio; edición carga la máquina, y `404` muestra "no existe" distinto de error de conexión; doble clic en guardar → un solo envío; **sesión sin permiso → no envía**                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 11  | Página de gestión del árbol de una máquina: carga máquina + `getByMachine`, arma el árbol con `buildPartTree`, muestra `PartTree` con acciones, **panel en línea** para agregar (raíz o hija de un nodo) y renombrar, eliminar con `Modal`; **avisa si hay `orphans`**; tras cada cambio recarga desde el servidor                                                                                                                                                                                                                                                                                                                | nuevo `features/machines/pages/machine-parts/machine-parts.ts/.html/.scss`                                                                                             | `machine-parts.spec.ts` (servicios mockeados): **agregar una hija a una hoja de nivel 3 → `create` con el `parentId` de esa hoja y el árbol recargado la muestra en nivel 4**; agregar raíz → `parentId: null`; renombrar → `update` solo con el nombre; **eliminar una parte con hijos → aviso y el árbol queda igual**; eliminar hoja → se recarga sin ella; datos con huérfanos → se muestra el aviso con la cantidad y las huérfanas **no** se pierden de la vista; **sesión sin permiso: `addPart`/`renamePart`/`deletePart` no llaman al servicio aunque se invoquen**; máquina inexistente → estado "no existe"; nombre vacío bloqueado                                                                                                                                                                           |
| 12  | Rutas de la feature con `loadChildren`/`loadComponent` y guard por política en **cada** ruta: `machines`, `machines/new`, `machines/:id/edit`, `machines/:id/parts`; matcher que acepta solo ids `^[A-Za-z0-9_-]{1,64}$`; alta `machines` en `app.routes.ts` dentro del grupo protegido                                                                                                                                                                                                                                                                                                                                           | nuevo `features/machines/machines.routes.ts`, `app.routes.ts`                                                                                                          | `machines.routes.spec.ts` / `app.routes.spec.ts` (`it.each` rutas × roles): **`administrador` y `team-leader-mantenimiento` entran a las cuatro; `personal-produccion` y `tecnico` → `/dashboard` + aviso "Acceso denegado" en las cuatro (criterio 3)**; anónimo → `/login?returnUrl=…` y vuelve tras loguearse; `/machines/../users/parts` y ids con caracteres raros caen al 404; `/machines` lista y `/machines/1/parts` carga componentes distintos                                                                                                                                                                                                                                                                                                                                                                 |
| 13  | Link "Máquinas" en el sidebar, visible solo si `canManageMachines`; con `ariaCurrentWhenActive="page"` como los demás                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `layout/sidebar/sidebar.ts/.html`                                                                                                                                      | `sidebar.spec.ts`: TL y Admin ven "Máquinas"; **`personal-produccion`, `tecnico` y anónimo no lo ven**; `aria-current` activo también en `/machines/1/parts` (ruta anidada); los links existentes no cambian                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 14  | Datos de prueba: 3 máquinas — una con **árbol de 4 niveles** más una hoja hermana en nivel 2, una con 2 niveles, una **sin partes** (borrable) — y sus `partes`. **No mezclar con los cambios sueltos que ya tiene `db.json`** (ver Riesgos)                                                                                                                                                                                                                                                                                                                                                                                      | `features/work-orders/data-access/db.json`, `features/work-orders/data-access/db.seed.spec.ts`                                                                         | `db.seed.spec.ts` (nuevo bloque, con los validadores del código): todo registro pasa `isMachineRecord`/`isPartRecord`; ids y `code` únicos; **`machineId` de cada parte existe; el padre de cada parte existe y es de la misma máquina; `buildPartTree` da `orphans: []` por máquina**; existe un árbol de ≥ 4 niveles y al menos una máquina sin partes                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | Cierre: `notes.md` (decisiones, hallazgos de json-server, mutaciones, cobertura, contrato contra `pnpm api`) y README                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `.claude/specs/013a-maestro-maquinas-partes/notes.md`, `README.md`                                                                                                     | — (la verificación de abajo se registra en las notas)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Criterios de aceptación → tests

| Criterio del spec                                                                                           | Tests (tarea)                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Máquina + árbol de ≥ 3 niveles persiste y se recupera completo, en orden jerárquico. **Falla si se aplana** | 2 (`buildPartTree`/`flattenPartTree` con 5 niveles desordenados), 5 (`create` manda `parentId`), **7 (ida y vuelta real por los servicios; cadena de 4 niveles)**, 8 (renderiza los 5 niveles), 11 (agregar en nivel 4), 14 (seed de 4 niveles)                                               |
| Eliminar una parte con sub-partes: comportamiento explícito, **nunca huérfanos**. **Falla si quedan**       | 2 (`orphans` detecta lo que ya esté roto), 5 (`PartHasChildrenError` + `expectNone` de `DELETE`, con datos frescos), **7 (toda secuencia permitida termina con `orphans: []`)**, 6 (mismo criterio para máquinas), 9 y 11 (aviso en pantalla, árbol intacto), 14 (el seed no tiene huérfanos) |
| `personal-produccion`/`tecnico` bloqueados en gestión de máquinas/partes. **Falla si pueden**               | 3 (política), 12 (**las cuatro rutas × cuatro roles**), 9/10/11 (**las acciones no llaman al servicio aunque se invoquen**), 13 (sin link)                                                                                                                                                    |
| Árbol navegable para que 013d seleccione máquina → parte → sub-parte hasta una hoja                         | 8 (`showActions=false` + `selectPart`; sin dependencias de auth/HTTP); 013d lo consume sin modificarlo                                                                                                                                                                                        |

## Verificación

1. `pnpm test`, `pnpm lint`, `pnpm build`, `prettier --check .`: todo en verde.
2. **Mutaciones** (como en 011/013b/013c, anotadas en `notes.md`). Para cada una la suite tiene que fallar, y solo cuenta si compila:
   - `buildPartTree` ignora `parentId` (todo queda en `roots`: aplana la jerarquía)
   - `buildPartTree` descarta huérfanos sin devolverlos en `orphans`
   - `buildPartTree` recorre desde "cualquier nodo" en vez de desde las raíces (se cuelga con un ciclo)
   - `PartsService.getByMachine` filtra con `?machineId=` (el emulador lo hace fallar como JSON Server)
   - `PartsService.create` omite la verificación del padre, o acepta un padre de otra máquina
   - `PartsService.create` trata un `500` como "padre inexistente"
   - `PartsService.update` reenvía `machineId`/`parentId`
   - `PartsService.delete` omite el chequeo de hijos, o lo hace sobre datos en memoria en vez de `GET /partes`
   - `MachinesService.delete` omite el chequeo de partes
   - `MachinesService.create` omite la unicidad del código, o la compara sin normalizar mayúsculas
   - `canManageMachines` deja pasar a `tecnico` / `personal-produccion`, o deja afuera al TL o al Administrador
   - una ruta de `machines.routes.ts` sin `canActivate`
   - una acción de página (`deleteMachine`, `deletePart`, `addPart`) sin chequeo de permiso
   - `PartTree` solo renderiza dos niveles de profundidad
3. `pnpm run test:coverage`: `part.model.ts`, `machine.model.ts`, `machines.permissions.ts`,
   `parts.service.ts`, `machines.service.ts` y `machines.routes.ts` al 100%. El helper `core/testing/in-memory-api.ts` contaba como código de producción para el proveedor de cobertura: se excluyó con `coverageExclude: ["src/app/**/testing/**"]` en `angular.json` (decidido con el usuario).
4. **Contrato contra JSON Server real** (`pnpm api`, sobre una copia de `db.json` para no
   ensuciar el archivo de trabajo), con los mismos pedidos que hace la app: crear máquina, cadena
   de 4 partes por `POST`, `GET /partes` + reconstrucción → estructura completa y en orden; un
   `PATCH { name }` no cambia `parentId`; el `DELETE` de un padre lo bloquea la app y **no sale del
   cliente**. Es la única prueba de persistencia real: el emulador de la tarea 4 solo prueba la
   serialización.
5. Prueba manual con `pnpm api` + `pnpm start`:
   - `teamleader` y `admin`: ven "Máquinas"; crean una máquina; un código repetido (`env-01` vs
     `ENV-01`) da error; arman 4 niveles; intentan borrar un padre (aviso) y una máquina con partes
     (aviso); borran de las hojas hacia arriba y luego la máquina vacía.
   - `produccion` y `tecnico`: sin link; `/machines`, `/machines/1/parts` los mandan a `/dashboard`
     con aviso.
   - Sin sesión, `/machines/1/parts` lleva a login y, tras entrar como `admin`, vuelve.

## Riesgos

- **`db.json` quedó limpio** (revertidas las ediciones manuales de 013c; `git status` solo
  muestra esta carpeta sin trackear), así que el commit de la tarea 14 no arrastra cambios
  ajenos. Ojo: mientras un JSON Server local esté corriendo, reescribe `db.json` sin el salto de
  línea final y `prettier --check` lo marca. Para la prueba manual y el contrato (Verificación
  4 y 5), usar una copia o `git checkout -- db.json` al terminar.
- **`spec.md` de esta carpeta está sin trackear y sin formatear**: el hook de pre-commit lo
  reformatea al commitearse (mismo caso que 013c).
- **Chequeos previos no atómicos** (código único, padre existente, sin hijos): dos usuarios
  simultáneos pueden colarse en la ventana entre el chequeo y la escritura. Aceptable en el mock;
  el backend lo cubre con índice único y FK con `RESTRICT`.
- **Datos editados a mano en `db.json`** pueden reintroducir huérfanos. La app los muestra en vez
  de ocultarlos (tarea 11) y `db.seed.spec.ts` los detecta en los datos de prueba.
- **El orden entre hermanos depende del orden que devuelve el servidor.** JSON Server conserva el
  de creación; el backend real necesitará una columna explícita (`position` o `created_at`).
- **Leer todas las partes en cada carga** (hallazgo 1) escala mal con miles de partes; es un
  costo del mock, el backend real filtra por `machine_id` en la base.
