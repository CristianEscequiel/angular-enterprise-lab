# Notas 013a: ejecución

## Resultado

62 archivos / 1643 tests en verde (baseline 48 archivos / 972 tests, el cierre de 013c → +671
tests, +14 archivos). `pnpm lint`, `pnpm build`, `tsc --noEmit` (app y specs) y
`prettier --check` sobre `src`, `README.md`, `angular.json`, `db.json` y las carpetas de spec
de 013a y 013c: sin errores. Cada página nueva queda como chunk lazy en el build.

De esos +671 tests:

| Origen                                                                     | Tests |
| -------------------------------------------------------------------------- | ----- |
| Archivos nuevos de `features/machines` (13a)                               | +515  |
| Emulador de JSON Server para tests (`core/testing`, ver "Desvíos")         | +44   |
| Archivos nuevos del arreglo de 013c (`technician-directory`, integración)  | +27   |
| Specs existentes ampliados o reescritos (sidebar, rutas, seed, servicios…) | +85   |

| Tarea | Área                               | Archivos nuevos / tocados                                                           | Tests netos |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| 1     | Modelo `Machine`                   | `machines/models/machine.model.ts`                                                  | 44          |
| 2     | Modelo `Part` y árbol              | `machines/models/part.model.ts` (`buildPartTree`, `flattenPartTree`, `hasChildren`) | 49          |
| 3     | Política de permisos               | `machines/models/machines.permissions.ts`                                           | 16          |
| 4     | Emulador de JSON Server para tests | `core/testing/in-memory-api.ts`                                                     | 44          |
| 5     | `PartsService`                     | `machines/data-access/parts.service.ts`                                             | 48          |
| 6     | `MachinesService`                  | `machines/data-access/machines.service.ts`                                          | 61          |
| 7     | Criterios 1 y 2, de punta a punta  | `machines/data-access/machines-tree.integration.spec.ts`                            | 24          |
| 8     | Componente `PartTree`              | `machines/components/part-tree/`                                                    | 46          |
| 9     | Listado de máquinas                | `machines/pages/machines-list/`                                                     | 36          |
| 10    | Formulario de máquina              | `machines/pages/machine-form/`                                                      | 56          |
| 11    | Gestión del árbol de una máquina   | `machines/pages/machine-parts/`                                                     | 85          |
| 12    | Rutas con guards                   | `machines/machines.routes.ts`, `app.routes.ts`                                      | 50 + 37     |
| 13    | Link en el sidebar                 | `layout/sidebar/`                                                                   | +14         |
| 14    | Datos de prueba                    | `db.json` (`maquinas`, `partes`), `db.seed.spec.ts`                                 | +15         |
| 15    | Cierre                             | estas notas y el README                                                             | —           |

(Los tests de rutas: 50 en `machines.routes.spec.ts` y +37 en `app.routes.spec.ts`. El arreglo de
013c está en su propia sección más abajo.)

## Decisiones tomadas

### Estructura de datos: lista de adyacencia plana

```jsonc
"maquinas": [{ "id": "1", "code": "ENV-01", "name": "Envasadora línea 1" }],
"partes": [
  { "id": "1", "machineId": "1", "parentId": null, "name": "Mesa de transporte" },
  { "id": "2", "machineId": "1", "parentId": "1",  "name": "Cinta 1" }
]
```

Aceptada por el usuario frente a la anidada (`children` dentro de la máquina). Motivos: un
guardado por nodo (la anidada reemplaza el árbol entero y dos editores simultáneos se pisan), ids
de nodo estables que genera el servidor (013d los va a referenciar), lista corta en el listado de
máquinas y correspondencia 1 a 1 con el backend planificado
(`parts(id, machine_id FK, parent_id FK autorreferenciada)`). Lo que se pierde: los huérfanos son
posibles en los datos, y se resuelven con las reglas de abajo.

- Una **hoja** no se guarda como tal: es una parte que nadie tiene como `parentId`.
- `machineId` y `parentId` **no se pueden cambiar** después de crear (no hay "mover"): así no se
  pueden crear ciclos ni partes cruzadas entre máquinas. `PartsService.update` usa `PATCH` con
  solo `{ name }`.
- `buildPartTree` recorre **desde las raíces** y devuelve aparte lo que no alcanza (`orphans`):
  padre inexistente, padre de otra máquina, ciclo, id repetido. Termina siempre, aun con datos
  corruptos, y es iterativo (soporta miles de niveles).
- Sin `position`: el orden entre hermanos es el de creación (el del array que devuelve el
  servidor).

### Eliminar: bloquear, no cascada

Aceptado por el usuario. JSON Server no tiene cascada, así que una cascada serían N `DELETE` no
atómicos y un fallo a mitad dejaría hijos huérfanos: lo que el spec prohíbe. Bloquear es un
`DELETE` y no puede dejar huérfanos. Vale para partes con sub-partes (`PartHasChildrenError`) y
para máquinas con partes (`MachineHasPartsError`). Se corresponde con `ON DELETE RESTRICT`.

El servicio repite `GET /partes` **antes de cada borrado**: no confía en el árbol que la pantalla
tiene cargado (otro usuario puede haberle agregado un hijo hace un momento). Si esa consulta falla
no se borra. Ante un bloqueo, la página recarga porque lo que se veía estaba desactualizado.

### Permisos

Un solo predicado, `canManageMachines` (`administrador` o `team-leader-mantenimiento`): el spec da el
mismo nivel a los dos roles para todas las acciones, así que no hay granularidad que separar.

| Acción                                                        | Permitido a                                  |
| ------------------------------------------------------------- | -------------------------------------------- |
| Ver la gestión, crear, modificar y eliminar máquinas y partes | `administrador`, `team-leader-mantenimiento` |
| Cualquier acción de gestión                                   | `personal-produccion` y `tecnico`: no        |

Se aplica en cuatro capas y las páginas **no dependen de lo que muestre la UI**: guard de cada
ruta, ocultamiento en plantilla, comprobación dentro de cada método de las páginas (invocarlos
directamente no llega al servicio) y link del sidebar. Un test compara los roles con `USER_ROLES`
y la tabla es un `Record<UserRole, boolean>`: un rol nuevo obliga a decidir su permiso (deja de
compilar).

La **lectura** no está restringida por rol (`buildPartTree`, los servicios de lectura y `PartTree`):
013d necesita mostrar el árbol a quien crea una orden, que puede no ser gestor.

### Otras decisiones

- **Feature propia** `features/machines/` (no dentro de `maintenance`): no depende de técnicos ni
  equipos y 013d la consume en una sola dirección. Rutas bajo `/machines`, colecciones
  `maquinas` y `partes`, campos en inglés (`machineId`, `parentId`, `code`, `name`).
- **Atributos de la máquina: `code` y `name`, nada más** (cerrado por el usuario). `code` es el
  identificador de negocio: obligatorio, único, se normaliza (recorte + mayúsculas) y tiene formato
  `^[A-Z0-9][A-Z0-9-]{0,19}$`. Es editable (013d referencia el `id`). El formulario valida el
  formato sobre el código ya normalizado: escribir `env-01` no es un error.
- **Unicidad del código** comprobada en el cliente sobre `GET /maquinas` (`?code=` no sirve, ver
  hallazgos), sin distinguir mayúsculas y excluyendo a la propia máquina al editar.
- **`PartsService` no inyecta `MachinesService`** (verifica la máquina con su propio
  `GET /maquinas/:id`); `MachinesService.delete` sí inyecta `PartsService`. Sin dependencia circular.
- **`PartTree` es presentacional** (sin HTTP, sin auth, sin router, sin avisos) y emite el
  `PartNode`, no solo la `Part`: quien lo recibe sabe si es una hoja. Lo reutilizan la gestión
  (`showActions` en `true`) y, más adelante, 013d (solo selección). Recursivo con `ng-template`,
  sin tope de niveles.
- **Panel en línea** en la página del árbol (no el `Modal`, que solo confirma).
- **Tras cada cambio, el árbol se recarga desde el servidor.** Si la recarga falla se conserva lo
  que había y se avisa: no se inventa un árbol.

### Decisiones abiertas del plan

| #   | Decisión                                               | Resultado                              |
| --- | ------------------------------------------------------ | -------------------------------------- |
| 1   | Estructura plana vs. anidada                           | Plana (confirmado por el usuario)      |
| 2   | Bloquear vs. cascada                                   | Bloquear (confirmado por el usuario)   |
| 3   | Atributos de la máquina                                | Solo `code` + `name` (cerrada)         |
| 4   | Nombres de partes hermanas repetidos                   | No se validan (cerrada; mejora futura) |
| 5   | Sin "mover" una parte                                  | Sin mover                              |
| 6   | Sin límite de profundidad                              | Sin límite                             |
| 7   | Los guards son UX; la autorización real es del backend | Sin cambios (spec 018)                 |

## Hallazgos de JSON Server (1.0.0-beta.15, comprobados)

Leídos en `node_modules/json-server/lib/*.js` y comprobados contra el servidor real sobre copias
del `db.json`:

1. **El filtro por valores numéricos no anda.** `parse-where.js` convierte a número todo valor que
   `Number()` acepte (`1`, `0042`, `1e3`), a `true`/`false` a booleano y a `null`. `?machineId=1`
   no encuentra `"machineId": "1"` (con 7 partes sembradas devuelve `[]`); `?code=0042` tampoco. No
   hay sintaxis para forzar la comparación como string. → la app pide `GET /partes` y filtra en el
   cliente.
2. **No hay cascada:** borrar un padre deja a los hijos apuntando a un padre que no existe.
3. **Acepta huérfanos y `code` repetido:** `POST` con `machineId`/`parentId` inexistentes o con un
   `code` ya usado responde `201`. No valida nada.
4. **`_embed` no sirve para el árbol** (espera `maquinaId` y no es recursivo).
5. **`POST` descarta el `id` del cuerpo** y genera uno propio (`{ ...data, id: randomId() }`). Ids
   de 11 caracteres alfanuméricos (`"o89hc_hyt6A"`). `PUT` toma el `id` de la URL; `PUT` y
   `PATCH` sobre un id inexistente dan `404` (no hay _upsert_); `DELETE` devuelve el documento.
6. **Al borrar, anula las claves foráneas con nombre `<singular>Id`** de las otras colecciones
   (`nullifyForeignKey`; con `?_dependent=` también borra en cascada). Con estas colecciones la
   convención sería `maquinaId`/`parteId`: `machineId`/`parentId` **no coinciden**, por eso no se
   tocan. **No renombrarlos** sin revisar esto (un `DELETE` pondría `null` en `parentId` de los
   hijos y los volvería raíces sin avisar). Lo protege un test en `db.seed.spec.ts`.

**Corrección a un hallazgo previo:** la primera versión del plan decía que un `POST` con un `id`
ya usado daba `201` y creaba otro registro. Era una conclusión mal sacada de una prueba que no
probaba eso (el servidor ignora el `id`); ver el hallazgo 5.

## Defecto de 013c encontrado y corregido

Detalle completo en `.claude/specs/013c-tecnicos-equipos/notes.md` ("Corrección posterior"). Resumen:

- 013c creaba técnicos con `id === legajo` y los consultaba por `GET /tecnicos/:legajo`. Como
  `POST` descarta el `id`, un técnico dado de alta desde la app quedaba inalcanzable por legajo
  (no se podía editar, buscar, asignar a un equipo ni crearle usuario). Solo funcionaban los
  sembrados a mano. Sus tests usaban `HttpTestingController`, que devuelve lo que el test dice, y
  el "contrato" contra el servidor real solo había hecho lecturas.
- Se detectó al escribir el emulador de la tarea 4 y se comprobó con el `db.json` real.
- **Arreglo:** el `id` pasa a ser opaco del servidor; el identificador es el `legajo`. Nuevo
  `TechnicianDirectory` (`core/auth`): único lugar que busca un técnico por legajo
  (`GET /tecnicos` + filtro), usado por el login, `UsersService` y `TechniciansService`.
  `create` hace `POST` sin `id`; `update` y `delete` operan sobre el `id` de servidor.
- **Verificación:** `technicians.service.integration.spec.ts` (contra el servicio original falla en
  7 casos; con el arreglo pasa), 8 mutaciones detectadas y la secuencia crear → buscar → editar →
  borrar contra el servidor real (12/12).

## Desvíos del plan

- **El arreglo de 013c se intercaló después de la tarea 4.** No estaba en el plan.
- **El emulador vive en `core/testing/in-memory-api.ts`** (el plan decía
  `features/machines/testing/`). Se movió cuando lo necesitó también `maintenance`: es genérico
  (las colecciones salen del seed). Se excluye de la cobertura con
  `coverageExclude: ["src/app/**/testing/**"]` en `angular.json` (decidido con el usuario). Es fiel
  a lo comprobado y **falla fuerte** donde no emula (`_sort`, `_page`, URLs fuera de la API, cuerpos
  que no son objetos), para no dar falsos verdes. No emula `nullifyForeignKey` ni `?_dependent=`.
- **Errores tipados distintos de los previstos:** se descartó `PartLoadError` (no hay `getById` de
  partes); se agregaron `InvalidPartError` e `InvalidMachineError` (datos que ni se envían), y
  `MachinesService.update` de una máquina que ya no existe da `MachineLoadError('not-found')`
  sin escribir.
- **`PartTree` emite `PartNode`** y tiene `label` y `emptyMessage` (el plan no los mencionaba).
- **La página del árbol se probó con los servicios reales sobre el emulador**, no con servicios
  mockeados como decía el plan: permite afirmar sobre los pedidos escritos y el estado final, y
  simular cambios de "otro usuario". El listado y el formulario sí usan servicios mockeados (el
  formulario, además, un bloque contra los servicios reales).
- **Extras en las páginas:** "Ver partes" por fila en el listado, "Editar máquina" en la página del
  árbol, y una lista con "Eliminar" para las partes huérfanas (que se muestran aparte con una
  advertencia, no se pierden de la vista).
- **El test "el componente no inyecta servicios" se reescribió**: la primera versión ("sin
  proveedores") no detectó la mutación que inyectaba `HttpClient`, porque `HttpClient`,
  `AuthService` y `Router` se proveen en `root`. Ahora esos servicios se registran como
  proveedores que lanzan si alguien los instancia.
- **Las mutaciones se hicieron tarea por tarea**, no al cierre.
- **`afterEach` con `TestBed.resetTestingModule()` en un `finally`** en los specs con
  `HttpTestingController` nuevos: cuando un test falla dejando un pedido sin responder,
  `verify()` lanza y el fallo contagiaba a los tests siguientes (una mutación pasó de 8 tests
  fallidos a 1, el real).

## Limitaciones y cosas a tener en cuenta

- **Todo esto es control de navegación/UX, no autorización** (spec 018).
- **Los chequeos previos no son atómicos** (código único, padre existente, sin hijos): hay una
  ventana entre el chequeo y la escritura. Aceptable en el mock; el backend la cierra con índice
  único y FK con `RESTRICT`.
- **Cada carga pide todas las partes** (hallazgo 1) y tras cada cambio se recarga: en el mock no
  importa, el backend real filtra por `machine_id`.
- **El orden entre hermanos es el de creación** y no se puede reordenar ni mover una parte. El
  backend real necesitará una columna explícita (`position` o `created_at`).
- **Eliminar un subárbol grande obliga a ir de las hojas hacia arriba.** Una cascada
  transaccional podría ser una spec futura contra el backend real.
- **Las huérfanas con hijos** se bloquean con la misma regla: hay que borrar primero sus hojas.
- **`PartTree` no navega con las flechas** (`Home`/`End`): cada control es un botón enfocable.
- **`/machines/new/edit` cae en el formulario de edición con id `new`** y muestra "Máquina no
  encontrada": no es un riesgo, es una rareza del matcher.
- **Los nombres de partes hermanas repetidos no se validan** (decisión cerrada).
- **Pendientes de 013c que no se tocaron** (no eran de esta spec): el login manda `?password=…` y
  una contraseña numérica (`123456`) nunca iniciaría sesión por la coerción del servidor (se sigue
  del mismo código, no se probó contra el servidor); con un `db.json` editado a mano que repita un
  legajo, `TechnicianDirectory.find` devuelve el primero.
- **Mientras un JSON Server local esté corriendo, reescribe `db.json`** sin el salto de línea final
  y `prettier --check` lo marca. Para la prueba manual usar una copia o `git checkout -- db.json`.

## Verificación por mutación

Cada mutación se aplicó de verdad, se corrió la suite del área y se restauró el archivo (se
comprobó por contenido). Las que no compilaban (import o variable sin uso) o no llegaron a
aplicarse (la expresión no coincidía con el formato de prettier) **no cuentan como detectadas** y
se repitieron con variantes que compilan. **158 mutaciones aplicadas; 156 detectadas y 2
equivalentes** (más las 8 del arreglo de 013c, todas detectadas).

| Tarea | Mutaciones | Detectadas | Ejemplos                                                                                                                                                                                                                                                                                                                            |
| ----- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 8          | 8          | el patrón acepta minúsculas / 21 caracteres / empieza con guion; `normalize` no pasa a mayúsculas ni recorta; `isMachineRecord` ignora nombre, id o patrón                                                                                                                                                                          |
| 2     | 3          | 3          | `buildPartTree` aplana (ignora `parentId`); acepta hijos de otra máquina; sin control de id repetido                                                                                                                                                                                                                                |
| 3     | 5          | 5          | deja pasar a `tecnico` / `personal-produccion`; deja afuera al TL o al Administrador; deja pasar al anónimo                                                                                                                                                                                                                         |
| 4     | 8          | 8          | el `POST` respeta el `id` del cuerpo; sin coerción numérica; `DELETE` en cascada; el emulador valida la máquina; `PUT` con _upsert_; respuestas sin copia                                                                                                                                                                           |
| 5     | 11         | 11         | `getByMachine` con `?machineId=`; omitir la verificación del padre o aceptar uno de otra máquina; un `500` como "no existe"; `update` reenvía `parentId`; `delete` sin chequeo de hijos                                                                                                                                             |
| 6     | 12         | 12         | `delete` sin chequeo de partes o contando las de todas las máquinas; sin unicidad del código; unicidad sensible a mayúsculas; `update` no excluye a la propia máquina                                                                                                                                                               |
| 7     | 10         | 9          | `create` sin `parentId`; `getByMachine` por query; `delete` sin chequeo; **la décima (aceptar hijos de otra máquina) no se detecta a este nivel** y es correcta: `getByMachine` ya filtra por máquina; la cubre `part.model.spec.ts`                                                                                                |
| 8     | 13         | 13         | recursión limitada a 2 niveles (24 tests); `aria-level` constante; toggle en una hoja; acciones con `showActions` en `false`; el componente inyecta `HttpClient` o `AuthService` (46 tests)                                                                                                                                         |
| 9     | 12         | 12         | sin chequeo de permiso en `deleteMachine` / `openDeleteModal`; `canManage` siempre `true`; sin recarga tras eliminar o tras un bloqueo; conteo de partes mal                                                                                                                                                                        |
| 10    | 14         | 14         | envío sin permiso; formulario inválido que envía; sin guarda de doble envío; código sin normalizar; duplicado tratado como error genérico; "no existe" y "conexión" invertidos                                                                                                                                                      |
| 11    | 25         | 23         | sin permiso en cada método; aplanar (`parentId` siempre `null`); sin recarga tras agregar / eliminar / bloqueo; huérfanas ocultas; sin guarda de doble envío en `addPart` y `renamePart`. **2 equivalentes:** que la página no recorte el nombre (`PartsService` ya lo recorta antes de escribir; lo cubre `parts.service.spec.ts`) |
| 12    | 15         | 15         | una ruta sin `canActivate` (cada una de las 4); el guard deja pasar a cualquiera / a `tecnico` / a `personal-produccion` o deja afuera a TL / Administrador; el matcher acepta cualquier id o ignora el sufijo                                                                                                                      |
| 13    | 7          | 7          | el link visible para cualquiera (`computed` y plantilla); usa la política de equipos; destino, `aria-current`, clase activa y texto                                                                                                                                                                                                 |
| 14    | 15         | 15         | (sobre los **datos**) máquina o padre inexistente; padre de otra máquina; ids o códigos repetidos; árbol de solo 3 niveles; `parentId` renombrado a `parteId`; ciclo; sin nombre                                                                                                                                                    |

## Contrato con JSON Server

Contra el servidor real (`pnpm api` sobre **copias** del `db.json`, para no ensuciar el archivo de
trabajo), con los mismos pedidos que hace la app. Son scripts de un solo uso, **no tests
permanentes**; lo permanente es el emulador y `db.seed.spec.ts`:

- **Tarea 7:** máquina, cadena de 5 niveles, lectura con reconstrucción del árbol (en orden y sin
  huérfanas), `PATCH { name }` sin mover la parte, borrado de las hojas hacia arriba sin
  huérfanas en ningún paso, y un `DELETE` crudo de un padre que **sí** deja huérfanas (lo que los
  servicios previenen). Dos de sus nueve comprobaciones no eran sustantivas (una tenía un
  `|| true`; la otra usaba un id sin partes): no se cuentan.
- **Arreglo de 013c:** crear → buscar por legajo → editar → borrar un técnico, y un usuario técnico
  que resuelve su perfil (12/12).
- **Tarea 14, con los datos sembrados:** las 3 máquinas y las 10 partes, `?machineId=1` devuelve
  `[]` aunque hay 7 partes de esa máquina, el árbol reconstruido (4 niveles y una hoja hermana en
  el nivel 2), `PATCH`, `POST` de un nivel 5 bajo una hoja sembrada, `DELETE` de la hoja y de la
  máquina sin partes (12/12).

## Cobertura

Los archivos de código nuevos de `features/machines` (modelos, política, servicios, rutas y
`PartTree`), `TechnicianDirectory`, las rutas y el sidebar están al 100% en las cuatro métricas.
Las únicas ramas sin cubrir son los enlaces bidireccionales que genera el compilador
(`[(isOpen)]` en `machines-list.html` y `machine-parts.html`, y `[(selectedId)]` en
`machine-parts.html`): la misma que ya tenían `teams-list` y `technicians-list`.

Medición global (`pnpm run test:coverage`), con el emulador excluido:

```
Statements : 98.14% (2908/2963)
Branches   : 97.94% (1192/1217)
Functions  : 96.71% (647/669)
Lines      : 98.96% (2189/2212)
```

Una corrida anterior sobre el mismo código dio 98.24% / 97.94% / 97.01% / 99.09%: la tabla del
README usa esa, que es la de Functions más alta (convención de las specs anteriores). Branches es el
número estable entre corridas; Statements, Functions y Lines oscilan (ya documentado en 010, 011,
013b y 013c). Respecto de 013c (97.56% / 97.43% / 95.73% / 98.73%) las cuatro métricas subieron.

Ni el porcentaje ni la cantidad de tests garantizan que haya protección: se verificó con las
mutaciones de arriba, dos de las cuales (el test "sin dependencias" de `PartTree` y `afterEach`
contagiando fallos) mostraron que un test podía pasar sin probar lo que decía.

## Pendiente

- **Verificación manual de la interfaz completa: no registrada.** Ninguna de las cinco pantallas
  nuevas se vio renderizada en un navegador; sí están cubiertas por tests de componente y de
  rutas reales, y los datos y el contrato se comprobaron contra `pnpm api`. Pasos, con `pnpm api`
  (sobre una copia o revirtiendo `db.json` después) + `pnpm start`:
  1. `teamleader` y `admin`: ven "Máquinas" en el menú; crean una máquina; un código repetido
     (`env-01` contra `ENV-01`) da error en el campo; entran a "Ver partes" de la Envasadora y ven
     4 niveles; agregan una sub-parte bajo "Rodamiento delantero" (nivel 5), renombran una parte,
     intentan eliminar un padre (aviso, sin cambios) y una máquina con partes (aviso), y eliminan de
     las hojas hacia arriba y luego la máquina vacía (`ROT-03` se puede eliminar sin vaciar nada).
  2. Contraer y expandir nodos; que el foco pase al campo del nombre al abrir el panel; que un
     nodo contraído siga contraído tras agregar una parte.
  3. `produccion` y `tecnico`: sin link; `/machines` y `/machines/1/parts` los mandan a
     `/dashboard` con aviso.
  4. Sin sesión, `/machines/1/parts` lleva a login y, tras entrar como `admin`, vuelve.
  5. `/machines/../x/parts`, `/machines/a.b/edit` y un id de 65 caracteres dan la página 404.
- **Nada está commiteado.** Orden sugerido, uno por punto: (1) el arreglo de 013c (`core/auth`,
  `maintenance`, notas y README de 013c); (2) el emulador (`core/testing`) y `coverageExclude`;
  (3) `features/machines` (modelos, servicios, componente, páginas); (4) rutas y sidebar;
  (5) datos de prueba y `db.seed.spec.ts`; (6) esta documentación. `spec.md` y `plan.md` de esta
  carpeta están sin trackear y sin formatear: el hook de pre-commit los reformatea.
