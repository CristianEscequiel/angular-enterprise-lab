# Plan 013d: Máquina y parte en la orden de trabajo

> **Estado: implementado** (las tareas 1–17; la 18 son las notas y el README). Lo que se hizo, los desvíos
> del plan, las mutaciones, el contrato con JSON Server y la verificación manual pendiente están en
> [`notes.md`](./notes.md).

## Contexto

El campo de texto libre de la orden se reemplaza por una referencia estructurada contra el maestro
de 013a: `WorkOrderMachineRef` (`machineId`, `partId`, `breadcrumb`, `comment`). Es obligatoria al
crear, para los tres tipos de orden, y se puede elegir a cualquier nivel del árbol.

Además, al **cerrar** una orden (completarla o cancelarla) hay que dejar un **comentario de cierre
obligatorio** (sección "Comentario de cierre del técnico", tareas 10–18).

**Nombre exacto del campo actual: `asset`** (etiqueta en pantalla: "Activo"; no existe ningún campo
`activo`). Aparece en:

- Modelo: `WorkOrder.asset` y `WorkOrderCreateRequest.asset` (`work-order.model.ts`).
- Formulario: control `asset`, `<input id="asset">` y su mensaje "El activo es obligatorio."
  (`form.ts`, `form.html`).
- Edición: `hasChanges` compara `current.asset` (`work-order-edit.ts`).
- Vistas: columna "Activo" del listado y línea "Activo:" del detalle.
- Datos: 28 órdenes en `db.json`, 3 en `work-order.mock.ts` (lo usa `mock-api.interceptor.ts`).
- Tests con `asset:` en sus fixtures: `form.spec`, `work-order-create.spec`, `work-order-edit.spec`,
  `work-order-detail.spec`, `work-orders-list.spec`, `work-order.service.spec`,
  `work-order-loader.spec`, `app.routes.spec`.

## Lo que ya existe y se reutiliza (013a)

- `PartTree` (`features/machines/components/part-tree/`): presentacional, recibe `nodes`, tiene
  `selectedId` (`model`), `showActions` (input, por defecto `false`), `emptyMessage` y emite
  `selectPart` con el `PartNode`. **No se modifica.**
- `PartsService.getByMachine(machineId)`: devuelve las `Part[]` planas de UNA máquina (pide todo y
  filtra en el cliente por el hallazgo 1 de 013a). `MachinesService.getAll()` da las máquinas.
  **Ningún servicio necesita métodos nuevos.**
- `buildPartTree(parts)` → `{ roots, orphans }`. Los huérfanos no cuelgan de ninguna raíz: no se
  pueden elegir en el árbol, así que tampoco pueden llegar a una orden.
- Lectura sin permiso de rol (decisión de 013a): `personal-produccion` y `team-leader-mantenimiento`,
  que son quienes crean órdenes, pueden leer máquinas y partes.

## Decisiones de diseño

1. **`buildBreadcrumb` nuevo, no `flattenPartTree`.** `flattenPartTree` devuelve `{ part, depth }` en
   profundidad-primero pero no el vínculo con el padre: sacar los ancestros de ahí obliga a
   recorrer hacia atrás comparando profundidades. Es más simple y más robusto subir por `parentId`
   sobre la lista plana que ya devuelve `getByMachine`.
   ```ts
   buildBreadcrumb(machine: Machine, partId: string | null, parts: readonly Part[]): string | null
   ```
   - `partId === null` → `machine.name`.
   - Si no, sube por `parentId` hasta la raíz y devuelve `máquina > nivel 1 > … > parte`, con
     `BREADCRUMB_SEPARATOR = ' > '`.
   - Devuelve **`null`** (no un breadcrumb parcial) si la parte no existe, es de otra máquina, o la
     cadena tiene un ciclo o un padre inexistente (se protege con un `Set` de visitados: termina
     siempre). La página lo trata como error y **no crea la orden**.
   - Vive en `part.model.ts`: es una función pura sobre el modelo de 013a.
2. **El breadcrumb lo arma la página, al enviar** (CLAUDE.md: la lógica de negocio vive en las
   páginas). `Form` y el selector solo emiten `machineId`, `partId` y `comment`; la página arma el
   `WorkOrderMachineRef` y lo pone en el request. Se calcula una sola vez, no se guarda ninguna
   función de recálculo, y `WorkOrdersService.create` solo lo transporta.
3. **Un componente nuevo `MachinePartPicker`** (`work-orders/components/machine-part-picker/`)
   compone: `<select>` de máquina + `PartTree` (`showActions=false`) + botón "Usar solo la máquina"
   (limpia la parte) + texto de la ruta elegida. Es presentacional: recibe `machines` y `nodes`, y
   emite `machineChange` / `partChange`. **No hace HTTP**: la página carga las partes de la máquina
   elegida y se las pasa.
4. **Comentario en un control propio** (`comment`), nunca concatenado. En el modelo son dos campos
   distintos (`breadcrumb` y `comment`).
5. **Edición: la referencia es inmutable** (spec, "Fuera de alcance": mismo criterio que `type` en
   013b). `Form` recibe `lockMachine` (como `lockType`): muestra el breadcrumb y el comentario de
   solo lectura, sin selector; `hasChanges` deja de mirar la máquina y el `PUT` conserva
   `current.machineRef` sin importar lo que emita el formulario.
6. **Migración de datos:** `machineRef` es obligatorio en el tipo, sin campo `asset` legado. Las 28
   órdenes de `db.json` y las 3 del mock reciben una referencia válida contra las máquinas
   sembradas (ver tarea 8).

## Decisiones abiertas (asumidas por defecto; corregir antes de implementar)

1. **Nombre del campo dentro de `WorkOrder`: `machineRef`.** El spec define la interfaz pero no cómo
   se llama la propiedad. Se asume `machineRef`.
2. **Comentario opcional, máximo 200 caracteres.** El spec dice "un comentario corto" pero no lo
   declara obligatorio (y en una orden preventiva no hay "falla" que describir). Si debe ser
   obligatorio, es agregar `Validators.required` al control y un test más.
3. **Órdenes existentes:** se asume reasignarlas a las 3 máquinas de prueba (los títulos no van a
   coincidir con la máquina: es dato de prueba). La alternativa, dejarlas sin `machineRef`, obliga a
   tipar la referencia como opcional y contradice "obligatoria para todos los tipos".
4. **Edición: el comentario tampoco se edita** (se trata la referencia entera como inmutable). Si se
   quiere corregirlo después de creada, es una spec aparte.
5. **El breadcrumb usa el nombre de la máquina, no su `code`** (el spec dice "el nombre de la
   máquina"). Un nombre de parte que contenga `' > '` no se escapa: es solo texto de presentación
   y el `partId` es la referencia real.
6. **Snapshot con los datos cargados al elegir la máquina**, sin volver a pedir las partes al
   enviar. Si otro usuario renombra la parte en esos minutos, el snapshot queda con el nombre
   anterior. Se acepta; el spec no pide más y el backend real (spec 018) lo arma en el servidor.

## Tomar la orden y comentario de cierre del técnico (ampliación pedida sobre el spec original)

Es una segunda pieza de 013d, independiente de la referencia de máquina: comparten el modelo
`WorkOrder` y el listado, nada más. El flujo:

1. En el listado, el técnico habilitado ve **"Tomar orden"** en las órdenes `pending`. Al pulsarlo la
   orden pasa a `in-progress`, **queda a su nombre** (`takenBy`) y se abre la página
   **`/work-orders/:id/resolve`**.
2. Esa página muestra la orden en **solo lectura** (título, descripción, tipo, prioridad, máquina/parte
   y comentario de falla) y **únicamente dos controles**: el **resultado** (Completada o Cancelada, sin
   valor por defecto) y el **comentario del técnico** (obligatorio, **mínimo 50 caracteres**). Botón
   "Cerrar orden".
3. Si el técnico sale sin cerrar, la orden sigue a su nombre y el listado le ofrece **"Continuar"**.
4. **Una orden tomada no la puede tomar otro técnico.** Si otro técnico intenta tomarla (o abrir su
   página de cierre), ve una **advertencia: "La orden está siendo ejecutada por {nombre}"** y no puede
   seguir; tampoco puede cerrarla.
5. **Administrador y team leader pueden "liberar" una orden en progreso**: vuelve a `pending`, sin
   dueño, y cualquier técnico habilitado puede tomarla. Es la salida para una orden trabada (el
   técnico no vuelve, se equivocó de orden, terminó su turno).

### Hallazgos sobre el código actual

- **No existe el estado "cancelada".** `WORK_ORDER_STATUSES` es `pending | in-progress | completed`.
  `Badge` ya soporta la variante `cancelled`; faltan el estado y su etiqueta.
- **No existe "tomar" como acción ni dueño de la orden.** Hoy el `<select>` de estado del listado
  cambia cualquier estado a cualquiera, **sin control de rol**, y la orden no guarda quién la trabaja.
  Con dueño, ese `<select>` ya no tiene sentido: pasar a `in-progress` sin dueño rompería la regla.
- **`canTechnicianHandle` no se puede usar tal cual:** exige la especialidad de la orden y `WorkOrder`
  no tiene ese campo. Sí se puede evaluar el tipo de equipo del técnico contra el tipo de orden
  (`guardia` → pronto-intervención; `preventivo-correctivo` → preventivo y correctivo).
- **Riesgo de una lista desactualizada:** con el listado abierto, otro técnico puede haber tomado o
  cerrado la orden. Un "Tomar" sobre datos viejos **le quitaría la orden al otro o reabriría una
  cerrada**. Por eso cada transición comprueba el estado fresco.
- Rutas: `work-orders.routes.ts` usa matchers propios (`matchWorkOrderId`, `matchWorkOrderIdEdit`) para
  que un id raro caiga en el 404, y `requireUser(...)` como guard por política. La carga con reintento
  ya está resuelta en `WorkOrderLoader`.
- **Datos de prueba:** `db.json` tiene 9 órdenes `completed` y 10 `in-progress` (7 preventivo, 1
  correctivo, 2 pronto-intervención), sin dueño ni comentario. Hay dos técnicos con sesión: `tecnico`
  (id `2`, guardia) y `electricista` (id `5`, preventivo-correctivo).
- El `Modal` compartido **no se toca**: el comentario vive en una página, no en un diálogo.

### Decisiones de diseño

1. **Modelo:** dos campos opcionales en `WorkOrder` (no en `WorkOrderCreateRequest`).
   ```ts
   interface WorkOrderTaker {
     id: string; // AuthUser.id
     name: string; // snapshot de `displayName`, como el breadcrumb
     at: string; // ISO, cuándo la tomó
   }
   interface WorkOrderClosingNote {
     comment: string; // obligatorio: entre 50 y 500 caracteres, sin contar espacios de los bordes
     authorId: string;
     authorName: string;
     at: string; // ISO, se fija al cerrar
   }
   ```
   Invariantes: **`pending` ⇒ `takenBy` nulo o ausente y sin `closingNote`; `in-progress` ⇒ `takenBy`;
   `completed`/`cancelled` ⇒ `takenBy` y `closingNote` con `authorId === takenBy.id`.** Los estados
   cerrados son **terminales**. `WorkOrder.takenBy` es `WorkOrderTaker | null` y opcional: `null` es una
   orden liberada (queda como una que nunca se tomó). La regla del comentario es una sola función (`isValidClosingComment`:
   `trim()` entre `CLOSING_NOTE_MIN_LENGTH = 50` y `CLOSING_NOTE_MAX_LENGTH = 500`) que comparten el
   modelo, el servicio y el validador del formulario.
2. **Tres transiciones en `WorkOrdersService`, ambas con lectura fresca previa (`GET`)** y sin request
   de escritura si no se cumple (mismo criterio que 013a: integridad antes de escribir):
   - `take(id, taker)`: exige `pending`; si no, `WorkOrderStateError('not-pending')` **que lleva el
     `takenBy` actual** para que la página nombre a quien la tiene. Hace
     `PATCH { status: 'in-progress', takenBy }` y **vuelve a leer**: si `takenBy.id` ya no es el propio
     (otro escribió en medio) → `WorkOrderStateError('taken-by-other')`.
   - `close(id, outcome, note)`: valida el comentario (`InvalidClosingNoteError`, **sin ningún
     request**), exige `in-progress` (`'not-in-progress'`) y que `takenBy.id === note.authorId`
     (`'taken-by-other'`), y hace `PATCH { status: outcome, closingNote }`.
   - `release(id)`: exige `in-progress` (`WorkOrderStateError('not-in-progress')`) y hace
     `PATCH { status: 'pending', takenBy: null }`. No comprueba quién era el dueño: el permiso lo
     decide la política (`canReleaseWorkOrder`), y el servicio no conoce al usuario (como en 013a/013c).
   - `updateStatus` **se elimina** junto con el `<select>` del listado (era su único uso): el estado
     solo cambia por estas dos transiciones.

   El `GET`, el `PATCH` y la relectura no son atómicos: dos técnicos exactamente simultáneos pueden
   pasar el primer chequeo; la relectura cierra casi toda la ventana pero no toda. Es aceptable en el
   mock; el backend real lo resuelve con una actualización condicional (`… WHERE status = 'pending'`).

3. **Permisos (`work-order.permissions.ts`, fuente única):**
   - `canTakeWorkOrder(user, { type })`: técnico cuyo tipo de equipo atiende el tipo de la orden. La
     especialidad **no se evalúa** hasta que las órdenes la lleven; `canTechnicianHandle` no se toca.
   - `canResolveWorkOrder(user, order)`: `canTakeWorkOrder` + orden `in-progress` + `takenBy.id` es el
     usuario. Lo usan el listado ("Continuar"), la página y el servicio.
     - `canReleaseWorkOrder(user, order)`: `administrador` o `team-leader-mantenimiento` (mismo nivel de
       permiso, como en 013a) y orden `in-progress`. Lo usan el listado y `releaseWorkOrder`.

   La ruta solo pide ser técnico (no conoce la orden); la página y cada método **vuelven a comprobar**.

4. **Página `WorkOrderResolve`** (`pages/work-order-resolve/`), ruta `work-orders/:id/resolve` con un
   matcher nuevo `matchWorkOrderIdResolve` (mismo patrón que `edit`) y `requireUser(isTechnician)`.
   Reutiliza `WorkOrderLoader`. Muestra el formulario **solo si `canResolveWorkOrder`**. Si no:
   - orden `in-progress` de **otro** técnico → `Alert` de advertencia "La orden está siendo ejecutada
     por {nombre}";
   - orden `pending` → "Tomá la orden desde el listado";
   - orden cerrada → "La orden ya fue cerrada";
   - técnico cuyo equipo no atiende ese tipo → acceso denegado.
     Formulario reactivo con dos controles: `outcome` (requerido, sin valor por defecto) y `comment`
     (requerido, `isValidClosingComment`, `maxlength` 500, contador "n / 50 mínimo"), con
     `aria-invalid`/`aria-describedby` y bloqueo de doble envío, como en spec 004. Al cerrar: aviso de
     éxito y vuelta al listado. Si un administrador **libera la orden mientras el técnico escribe**,
     su envío se rechaza (`not-in-progress`, o `taken-by-other` si otro ya la tomó), se avisa, no se
     pisa nada y el formulario desaparece; el comentario a medio escribir se pierde.
5. **Listado:** el `<select>` de estado desaparece (el estado se muestra como badge). Para el técnico
   que `canTakeWorkOrder`: en `pending`, **"Tomar orden"**; en `in-progress` propia, **"Continuar"**;
   en `in-progress` de otro, **"Tomar orden"** que al pulsarlo **no llama al servicio** y muestra la
   advertencia "La orden está siendo ejecutada por {nombre}". Las `in-progress` muestran "Tomada por
   {nombre}" junto al badge. "Tomar" llama a `take` y **solo si sale bien** navega a `/resolve`. Si
   `take` responde `not-pending` con otro dueño: la misma advertencia y recarga; si el dueño es el
   propio (lista vieja), navega igual a `/resolve`. Para admin y team leader, las `in-progress`
   muestran **"Liberar"** (con `aria-label` que nombra la orden): abre el `Modal` de confirmación ya
   existente ("La orden vuelve a pendiente y {nombre} deja de ser quien la ejecuta"), y solo al
   confirmar `releaseWorkOrder` vuelve a comprobar el permiso, llama a `release` y recarga. Si la
   orden ya no estaba en progreso, avisa y recarga.
6. **Detalle:** muestra quién y cuándo la tomó, y en las cerradas comentario, autor y fecha en un bloque
   **separado** del comentario de falla. **Edición:** el `PUT` conserva `takenBy` y `closingNote`
   (viajan en `...current`); se agrega un test para que no se pierdan.
7. **Datos:** las órdenes del seed pasan a cumplir los invariantes: las `in-progress` reciben `takenBy`
   y las cerradas `takenBy` + `closingNote` (de 50 caracteres o más), siempre con el técnico cuyo
   equipo atiende ese tipo (`electricista` para preventivo/correctivo, `tecnico` para
   pronto-intervención). Una de las cerradas pasa a `cancelled`.

### Decisiones abiertas (asumidas por defecto; corregir antes de implementar)

7. **Liberar no deja historial.** Al liberar se borra `takenBy` sin registrar quién liberó ni a quién
   se le quitó; el técnico afectado solo se entera porque su envío falla. Un `releasedBy` o un registro
   de eventos es una spec de auditoría aparte. **Solo admin y team leader liberan:** el técnico dueño no
   puede devolver su propia orden.
8. **Cerrada es terminal: no se reabre.** Hoy el `<select>` permite volver una orden `completed` a
   `pending`; desaparece junto con el `<select>`. Si hace falta reabrir, es una spec aparte.
9. **Admin y team leader pierden el cambio manual de estado del listado** y les queda "Liberar" como
   única acción sobre el trabajo en curso. Es consecuencia de que el
   estado ahora solo cambia tomando y cerrando.
10. **La especialidad no se evalúa** al tomar (las órdenes no la tienen). **Comentario de cierre entre
    50 y 500 caracteres**, texto libre, sin lista de motivos de cancelación. El mínimo de 50 aplica
    solo a este comentario, no al de falla de la referencia de máquina.

## Fuera de alcance

Los tres puntos del spec (editar la referencia, filtrar por máquina/parte, parte eliminada tras ser
referenciada) más: navegación por teclado del árbol más allá de los botones enfocables (heredado de
013a); cambiar `PartTree`; validar en el servidor (JSON Server no valida: `machineId`/`partId`
inexistentes se aceptarían si alguien llama a la API a mano, lo cubre el backend real).

Del tomar orden y el cierre: filtrar por especialidad, que admin o team leader cierren órdenes, que el
técnico devuelva su propia orden, registrar quién liberó (auditoría), reabrir una orden cerrada,
historial de varios comentarios por orden, comentarios intermedios mientras está en progreso y
notificaciones.

## Tareas

Rutas relativas a `src/app/`. **Las tareas 1–3 son aditivas** (cada una deja `pnpm test` en verde
sola). **Las tareas 4–8 van juntas en un mismo commit:** quitar `asset` del tipo rompe la compilación
de todo lo que lo use, y el hook de Husky corre `pnpm test` completo; la 9 es un spec nuevo y puede ir
después. **Bloque de tomar orden y comentario de cierre (10–18):** 10, 11 y 12 son aditivas y cada
una deja `pnpm test` en verde (12 conserva `updateStatus` hasta que la 14 retira el `<select>`
que lo usa); 13 es una página y ruta nuevas, también aditiva; 14–16 van juntas (el listado, el
detalle y los datos dependen del estado nuevo y de los métodos del servicio). Ese bloque no depende
de la referencia de máquina y puede ir en otro PR.

| #   | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Archivo(s)                                                                                                                                                                                                                  | Test que la valida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `WorkOrderMachineRef` (`machineId`, `partId: string \| null`, `breadcrumb`, `comment`) y guard `isWorkOrderMachineRef` (mismo estilo que `isWorkOrderType`). Solo se **agrega** el tipo: `asset` sigue hasta la tarea 4                                                                                                                                                                                                                                                               | `features/work-orders/models/work-order.model.ts`                                                                                                                                                                           | `work-order.model.spec.ts`: acepta una referencia válida con `partId` string y con `null`; **rechaza cada campo faltante o de otro tipo por separado** (`machineId` vacío, `partId` `undefined`, `breadcrumb` no string, `comment` no string)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | `buildBreadcrumb(machine, partId, parts)` y `BREADCRUMB_SEPARATOR` (ver decisión 1)                                                                                                                                                                                                                                                                                                                                                                                                   | `features/machines/models/part.model.ts`                                                                                                                                                                                    | `part.model.spec.ts`: `partId: null` → nombre de la máquina; **parte de nivel 3 en un árbol con las partes desordenadas (hijos antes que padre) → `Máquina > N1 > N2 > N3` completo y en orden (falla si omite un nivel o lo invierte)**; parte de nivel 1 → `Máquina > N1`; partes homónimas en ramas distintas → cada una su propia cadena; **`partId` inexistente, parte de otra máquina, padre inexistente y ciclo `A→B→A` → `null` y la función termina**; no muta `parts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Componente `MachinePartPicker`: `<select>` de máquina con label, `PartTree` con `showActions=false`, botón "Usar solo la máquina", ruta elegida en una región `aria-live`. Cambiar de máquina limpia la parte. Sin máquina no muestra el árbol                                                                                                                                                                                                                                        | nuevo `features/work-orders/components/machine-part-picker/machine-part-picker.ts/.html/.scss`                                                                                                                              | `machine-part-picker.spec.ts`: elegir máquina emite `machineChange` con su id y **limpia la parte**; hacer clic en una parte a nivel 3 emite `partChange` con ese id y la marca (`aria-selected`); **"Usar solo la máquina" emite `partChange(null)` (se puede parar en la máquina sin bajar)**; máquina sin partes → muestra el mensaje vacío y "Usar solo la máquina" sigue disponible; **no hay botones Agregar/Editar/Eliminar** (`showActions=false`); el componente no inyecta `HttpClient` ni `AuthService` (se instancia sin proveedores)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Cambio de contrato: `WorkOrder.asset` → `machineRef: WorkOrderMachineRef`; `WorkOrderCreateRequest.asset` → `machineRef`. Fixture compartida `MACHINE_REF_FIXTURE` para no repetirla en 8 specs. Actualizar `mock-api.interceptor.ts` si el tipo no compila                                                                                                                                                                                                                           | `features/work-orders/models/work-order.model.ts`, nuevo `features/work-orders/testing/work-order.fixtures.ts`, `core/interceptors/mock-api.interceptor.ts` (solo si hace falta), y los 8 specs con `asset:` (ver Contexto) | `pnpm test` compila y pasa: los 8 specs usan `machineRef` en vez de `asset`. `work-order.service.spec.ts`: **`create` manda el `machineRef` intacto en el `POST` y `breadcrumb` y `comment` viajan como campos separados**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | `Form`: se quita el control `asset`; entran `machineId` (requerido), `partId` (`null` por defecto) y `comment` (opcional, `maxLength` 200). Inputs `machines`, `partNodes`, `lockMachine`; output `machineChange`. Emite un valor **sin breadcrumb** (`WorkOrderFormValue`). Con `lockMachine` deshabilita los controles y muestra el breadcrumb del `inputData` de solo lectura                                                                                                      | `features/work-orders/components/form/form.ts`, `form.html`                                                                                                                                                                 | `form.spec.ts`: **sin máquina el envío se bloquea, `sendData` no emite y se ve "Seleccioná una máquina." (`aria-invalid` + `aria-describedby`, mismo patrón que spec 004)**; solo máquina → emite `partId: null`; máquina + parte + comentario → emite los tres por separado; cambiar de máquina emite `machineChange` y limpia `partId`; comentario > 200 → inválido; `lockMachine` → sin selector, muestra el breadcrumb y **el valor emitido conserva `machineId`/`partId`/`comment` del dato inicial** (patrón de `lockType`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | Página de creación: carga `machines` con `MachinesService.getAll()` (estado de error con reintento, como el resto de páginas); al elegir máquina pide `getByMachine` (`switchMap`, cancela la anterior) y pasa `buildPartTree(parts).roots`; **`onSubmit` arma el `machineRef` con `buildBreadcrumb`** y llama al servicio; segunda comprobación: sin `machineId` no envía aunque se invoque el método                                                                                | `features/work-orders/pages/work-order-create/work-order-create.ts`, `.html`                                                                                                                                                | `work-order-create.spec.ts` (servicios mockeados): **enviar sin máquina → no llama a `create` y muestra la validación**; **solo la máquina → `create` con `partId: null` y `breadcrumb` = nombre de la máquina**; **parte de nivel 3 → `breadcrumb` con toda la cadena en orden**; **el comentario va en `machineRef.comment` y `breadcrumb` no lo contiene**; `buildBreadcrumb` devuelve `null` → aviso y sin `create`; cambiar de máquina rápido descarta la respuesta de la anterior; error al cargar máquinas → estado de error con reintento; error al cargar partes → aviso y sigue posible elegir solo la máquina; **los tres tipos de orden exigen máquina** (`it.each` sobre `WORK_ORDER_TYPES`); permisos y doble envío existentes siguen en verde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | Página de edición: `Form` con `lockMachine`; `hasChanges` sin la máquina; el `PUT` conserva `current.machineRef` (igual que `type`)                                                                                                                                                                                                                                                                                                                                                   | `features/work-orders/pages/work-order-edit/work-order-edit.ts`, `.html`                                                                                                                                                    | `work-order-edit.spec.ts`: **el `PUT` lleva el `machineRef` original aunque el formulario emita otro** (mutación: usar el emitido → falla); editar título/prioridad no altera la referencia; sin cambios sigue mostrando "No hubo cambios"; la pantalla muestra el breadcrumb y el comentario guardados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | Vistas y datos. Listado: columna "Máquina / parte" con `machineRef.breadcrumb`. Detalle: breadcrumb en una línea y **comentario en otra**. Datos: `db.json` (28 órdenes) y `work-order.mock.ts` (3) con `machineRef` válido contra las máquinas y partes sembradas (decisión abierta 3); bloque nuevo `work-orders` en el spec del seed                                                                                                                                               | `features/work-orders/pages/work-orders-list/work-orders-list.html`, `pages/work-order-detail/work-order-detail.html`, `data-access/db.json`, `data-access/work-order.mock.ts`, `data-access/db.seed.spec.ts`               | `work-orders-list.spec.ts`: muestra el breadcrumb en la fila; `work-order-detail.spec.ts`: **el comentario aparece en su propio elemento y el breadcrumb no lo incluye**; `db.seed.spec.ts` (bloque nuevo): toda orden pasa `isWorkOrderMachineRef`; **`machineId` existe; `partId` existe y es de esa máquina; `breadcrumb` es igual a `buildBreadcrumb` de la parte sembrada; `comment` no está contenido en `breadcrumb`**; hay al menos una orden solo-máquina y una de ≥ 3 niveles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | Integración de punta a punta sobre el backend en memoria (`core/testing/in-memory-api.ts`, genérico), con `MachinesService`, `PartsService` y `WorkOrdersService` **reales** y la página `WorkOrderCreate` montada. Es la especificación ejecutable de los criterios 2–5                                                                                                                                                                                                              | nuevo `features/work-orders/pages/work-order-create/work-order-create.integration.spec.ts`                                                                                                                                  | Con el seed de `db.json` (`maquinas`, `partes`, `work-orders`): **solo máquina → la orden guardada tiene `partId: null` y `breadcrumb: 'Envasadora línea 1'`**; **`Motor de cinta` → `'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta'`**; **crear, luego `PartsService.update` renombra "Cinta 1" y `getById` de la orden → el `breadcrumb` sigue con el nombre original (falla si se recalcula)**; el registro guardado tiene `comment` aparte y su `breadcrumb` no lo contiene; sin máquina → `POST` a `/work-orders` no sale (`expectNone` equivalente en el emulador)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 10  | Estado `cancelled`: se agrega a `WORK_ORDER_STATUSES` con etiqueta "Cancelada" y badge `cancelled`. `WorkOrderTaker`, `WorkOrderClosingNote` y sus guards, `isClosedStatus(status)`, `isValidClosingComment(text)` con `CLOSING_NOTE_MIN_LENGTH = 50` y `CLOSING_NOTE_MAX_LENGTH = 500`; `WorkOrder.takenBy?: WorkOrderTaker                                                                                                                                                          | null` (`null`= liberada) y`closingNote?` (opcionales en el tipo, obligatorios por invariante según el estado)                                                                                                               | `features/work-orders/models/work-order.model.ts`, `work-order.display.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `work-order.model.spec.ts`: `isWorkOrderStatus('cancelled')` verdadero; `isClosedStatus` es `true` solo para `completed` y `cancelled`; **`isValidClosingComment`: 49 caracteres → `false`, 50 → `true`, 500 → `true`, 501 → `false`; 60 espacios + 10 letras → `false` (los bordes no cuentan); vacío → `false`**; los guards rechazan cada campo faltante por separado; `takenBy: null` se acepta (orden liberada); `work-order.display.spec.ts`: hay etiqueta y badge para **todos** los estados; `work-orders-list.spec.ts`: el filtro restaurado de `localStorage` acepta `cancelled` |
| 11  | Permisos `canTakeWorkOrder(user, { type })` (técnico cuyo tipo de equipo atiende el tipo; la especialidad no se evalúa) `canResolveWorkOrder(user, order)` (lo anterior + `in-progress` + `takenBy.id` es el usuario) y `canReleaseWorkOrder(user, order)` (`administrador` o `team-leader-mantenimiento` sobre una orden `in-progress`)                                                                                                                                              | `features/work-orders/models/work-order.permissions.ts`                                                                                                                                                                     | `work-order.permissions.spec.ts`: **técnico de `guardia` → `true` solo para `pronto-intervencion`**; **`preventivo-correctivo` → `true` para `preventivo` y `correctivo`, `false` para pronto**; la especialidad no cambia el resultado; **`administrador`, `team-leader-mantenimiento`, `personal-produccion` y `null` → `false`**; `it.each` sobre `USER_ROLES`; **`canResolveWorkOrder`: la orden propia `in-progress` → `true`; `in-progress` de otro técnico → `false`; `pending` → `false`; cerrada → `false`; orden sin `takenBy` → `false`**; **`canReleaseWorkOrder`: `administrador` y `team-leader-mantenimiento` sobre una `in-progress` → `true`; sobre `pending` o cerrada → `false`; `tecnico` (incluido el dueño), `personal-produccion` y `null` → `false`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 12  | `WorkOrdersService`: `take(id, taker)`, `close(id, outcome, note)` y `release(id)`, todos con `GET` fresco previo; `take` relee tras escribir; `InvalidClosingNoteError` y `WorkOrderStateError` (`not-pending` con el `takenBy` actual, `not-in-progress`, `taken-by-other`). `updateStatus` sigue hasta la tarea 14                                                                                                                                                                 | `features/work-orders/data-access/work-order.service.ts`                                                                                                                                                                    | `work-order.service.spec.ts`: **`close` sin nota, con nota de 49 caracteres o de solo espacios → `InvalidClosingNoteError` y ningún request**; **`close` sobre orden `pending` o cerrada → `not-in-progress` y sin `PATCH`**; **`close` por un técnico distinto del `takenBy` → `taken-by-other` y sin `PATCH`**; `close` válido → `PATCH` con exactamente `{ status, closingNote }` y el comentario recortado; **`take` sobre orden `in-progress` de otro → `not-pending` con el nombre del dueño y sin `PATCH`**; **`take` sobre una cerrada → `not-pending` y sin `PATCH` (no reabre)**; `take` válido → `PATCH { status: 'in-progress', takenBy }` y luego un `GET`; **si la relectura devuelve otro `takenBy` → `taken-by-other`**; **`release` sobre una `in-progress` → `PATCH { status: 'pending', takenBy: null }`; sobre `pending` o cerrada → `not-in-progress` y sin `PATCH` (no reabre una cerrada)**; `500` en el `GET` previo → no se escribe (`take`, `close` y `release`)                                                                                                                                                                                                                                                                                                                                                                           |
| 13  | Página `WorkOrderResolve` + ruta `/work-orders/:id/resolve`: orden en solo lectura, `outcome` y `comment` como únicos controles, formulario solo si `canResolveWorkOrder`, advertencia si la ejecuta otro técnico, doble envío bloqueado, éxito → aviso y vuelta al listado. Matcher `matchWorkOrderIdResolve` y `requireUser(isTechnician)`                                                                                                                                          | nuevo `features/work-orders/pages/work-order-resolve/work-order-resolve.ts/.html/.scss`, `features/work-orders/work-orders.routes.ts`                                                                                       | `work-order-resolve.spec.ts` (servicio mockeado): **solo hay dos controles editables (un `<select>` y un `<textarea>`)**; **sin resultado → bloqueado y sin `close`**; **sin comentario → bloqueado**, `it.each` sobre `completed` y `cancelled`; **comentario de 49 caracteres o de solo espacios → bloqueado, de 50 → se envía**; contador visible; válido → `close(id, outcome, { comment, authorId, authorName, at })` y vuelta a `/work-orders`; doble envío → una llamada; error → se puede reintentar; **`submit()` invocado directo con un comentario corto no llama al servicio**; **orden `in-progress` de otro técnico → `Alert` "La orden está siendo ejecutada por {nombre}" y sin formulario**; orden `pending` o cerrada → `Alert` y sin formulario; técnico de otro tipo de equipo → acceso denegado; `not-in-progress`/`taken-by-other` al cerrar (incluye una orden **liberada mientras el técnico escribía** o retomada por otro) → aviso, recarga y el formulario desaparece; no encontrada / conexión con reintento. `work-orders.routes.spec.ts`: **`tecnico` entra a `/work-orders/5/resolve`; `administrador`, `team-leader-mantenimiento`, `personal-produccion` → `/dashboard` + "Acceso denegado"**; anónimo → `/login?returnUrl=…`; `/work-orders/abc/resolve` y `/work-orders/5/resolve/x` → 404                                        |
| 14  | Listado: se elimina el `<select>` de estado (y `changeStatus`, `updateStatus`); "Tomar orden" / "Continuar" según `canTakeWorkOrder` y `canResolveWorkOrder`; **advertencia sin llamar al servicio si la orden `in-progress` es de otro**; "Tomada por {nombre}" junto al badge; `takeWorkOrder` navega solo si `take` sale bien; **"Liberar"** para admin y team leader en las `in-progress`, con el `Modal` de confirmación, y `releaseWorkOrder` que vuelve a comprobar el permiso | `features/work-orders/pages/work-orders-list/work-orders-list.ts`, `.html`, `data-access/work-order.service.ts` (quita `updateStatus`)                                                                                      | `work-orders-list.spec.ts`: **técnico habilitado: "Tomar orden" en `pending`, "Continuar" en su `in-progress`, ninguno en una cerrada**; **"Tomar orden" sobre una `in-progress` de otro → advertencia "La orden está siendo ejecutada por {nombre}", `take` no se llama y no navega**; **`take` responde `not-pending` con otro dueño (lista vieja) → misma advertencia y recarga**; `take` responde `not-pending` con el dueño propio → navega a `/resolve`; **"Tomar" → `take(id, taker)` y luego navega (si falla, no navega)**; técnico de `guardia` no ve "Tomar orden" en una preventiva; otros roles no ven ningún botón; **`takeWorkOrder` invocado sin permiso → sin llamada**; doble clic → una llamada; **ya no existe el `<select>` de estado**; las `in-progress` muestran "Tomada por {nombre}"; **liberar: admin y team leader ven "Liberar" solo en las `in-progress` (no en `pending` ni cerradas); técnico y `personal-produccion` no lo ven; pulsarlo abre el `Modal` y no llama al servicio hasta confirmar; cancelar el `Modal` → sin llamada; confirmar → `release(id)` y la lista se recarga con la orden `pending` y sin "Tomada por"; `releaseWorkOrder` invocado sin permiso → sin llamada; `not-in-progress` → aviso y recarga; doble confirmación → una llamada**; `work-order.service.spec.ts`: se retiran los tests de `updateStatus` |
| 15  | Detalle: quién y cuándo tomó la orden, y en las cerradas comentario de cierre, autor y fecha (separado del comentario de falla). Edición: conserva `takenBy` y `closingNote` en el `PUT`                                                                                                                                                                                                                                                                                              | `features/work-orders/pages/work-order-detail/work-order-detail.html`, `.ts`, `pages/work-order-edit/work-order-edit.ts` (solo test)                                                                                        | `work-order-detail.spec.ts`: orden `in-progress` muestra "Tomada por"; `completed` y `cancelled` muestran comentario, autor y fecha en su propio elemento, **distinto del comentario de falla y del breadcrumb**; `pending` (incluida una liberada, con `takenBy: null`) no muestra ninguno; `work-order-edit.spec.ts`: **el `PUT` de una orden tomada o cerrada lleva `takenBy` y `closingNote` originales (falla si se pierden)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 16  | Datos: el seed cumple los invariantes (las 10 `in-progress` con `takenBy`; las 9 `completed` con `takenBy` y `closingNote` de ≥ 50 caracteres; una pasa a `cancelled`) y también `work-order.mock.ts`; el spec del seed los verifica                                                                                                                                                                                                                                                  | `features/work-orders/data-access/db.json`, `data-access/work-order.mock.ts`, `data-access/db.seed.spec.ts`                                                                                                                 | `db.seed.spec.ts` (bloque nuevo): **`pending` sin `takenBy` (o `null`) ni `closingNote`; `in-progress` con `takenBy` válido; cerradas con `takenBy` y `closingNote` válido y `authorId === takenBy.id`**; el dueño existe en `users` con rol `tecnico` y su equipo (`tecnicos` + `equipos` por legajo) atiende el tipo de la orden; existe al menos una `cancelled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17  | Integración del flujo sobre el backend en memoria con `WorkOrdersService` real: crear → tomar → cerrar → releer, con dos técnicos                                                                                                                                                                                                                                                                                                                                                     | nuevo `features/work-orders/data-access/work-order-closure.integration.spec.ts`                                                                                                                                             | técnico A toma → `in-progress` con `takenBy` A; **técnico B intenta tomar → `not-pending` con el nombre de A y el emulador no registra un segundo `PATCH`**; **B intenta cerrar → `taken-by-other`, sin `PATCH`**; **A cierra con 49 caracteres → sin `PATCH`; con 50 → releída tiene `status`, `takenBy` y `closingNote` completos y `machineRef.comment` intacto**; cerrar una `pending` → `not-in-progress`; **un administrador libera la orden de A → `pending` con `takenBy: null`; B la toma y el `close` posterior de A se rechaza (`taken-by-other`) sin pisar nada; si nadie la retoma, el `close` de A da `not-in-progress`**; liberar una `pending` o una cerrada → `not-in-progress` y sin `PATCH`; **carrera simulada (un interceptor reescribe `takenBy` entre el `PATCH` y la relectura) → `take` da `taken-by-other`**; tomar una cerrada → rechazado, sin `PATCH`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 18  | Cierre: `notes.md` (decisiones, mutaciones, cobertura, contrato contra `pnpm api`) y README                                                                                                                                                                                                                                                                                                                                                                                           | `.claude/specs/013d-maquina-en-orden/notes.md`, `README.md`                                                                                                                                                                 | — (la verificación de abajo se registra en las notas)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Criterios de aceptación → tests

| Criterio del spec (debe fallar si…)                                                                                                                                                                                              | Tests (tarea)                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin máquina → envío bloqueado con validación visible. **Falla si se puede crear sin referencia**                                                                                                                                 | 5 (`Form` no emite y muestra el error), 6 (la página tampoco llama a `create` aunque se invoque `onSubmit`; los tres tipos), 9 (no sale ningún `POST`)                       |
| Solo máquina → `partId: null`, `breadcrumb` = nombre. **Falla si obliga a bajar a una parte**                                                                                                                                    | 3 ("Usar solo la máquina"), 5 (emite `partId: null`), 6, 2 (`buildBreadcrumb(…, null, …)`), 8 (seed con orden solo-máquina), 9                                               |
| Parte de nivel 3 → cadena completa en orden. **Falla si omite un nivel o el orden es incorrecto**                                                                                                                                | 2 (árbol desordenado), 6, 8 (el seed coincide con `buildBreadcrumb`), 9 (`Motor de cinta`)                                                                                   |
| Renombrar la parte después → la orden conserva el nombre. **Falla si se recalcula**                                                                                                                                              | 9 (renombrar con `PartsService.update` y releer la orden), 7 (la edición no toca la referencia), 8 (el detalle muestra el snapshot guardado, no consulta el maestro)         |
| Comentario propio, no dentro del breadcrumb. **Falla si aparece mezclado**                                                                                                                                                       | 4 (`POST` con dos campos), 5 (dos controles), 6 (`machineRef.comment` y `breadcrumb` sin el texto), 8 (detalle y seed), 9 (registro guardado)                                |
| **Cierre:** sin comentario → bloqueado, para completar y para cancelar. **Falla si se puede cerrar sin comentario**                                                                                                              | 12 (servicio sin `GET` ni `PATCH`), 13 (página: `it.each` sobre `completed` y `cancelled`, y `submit()` directo), 17 (el emulador no registra `PATCH`)                       |
| **Cierre:** comentario de menos de 50 caracteres, de solo espacios, o sin elegir resultado → bloqueado. **Falla si 49 caracteres pasan o `"   "` cuenta**                                                                        | 10 (`isValidClosingComment`, límites 49/50/500/501), 12, 13, 17                                                                                                              |
| **Tomar** pasa la orden a `in-progress` a nombre del técnico y abre la página de cierre. **Falla si navega sin haberla tomado**                                                                                                  | 12 (`take`), 14 (navega solo tras el éxito), 17                                                                                                                              |
| **Una orden tomada no la toma otro técnico:** advertencia "está siendo ejecutada por {nombre}". **Falla si otro técnico la toma, la cierra o abre su formulario**                                                                | 11 (`canResolveWorkOrder`), 12 (`not-pending`, `taken-by-other`), 13 (`Alert` sin formulario), 14 (advertencia sin llamar al servicio), 17 (dos técnicos y carrera simulada) |
| **Liberar orden:** solo admin y team leader, solo sobre una `in-progress`; vuelve a `pending` sin dueño y otro técnico puede tomarla. **Falla si un técnico libera, si se libera una `pending` o cerrada, o si queda con dueño** | 11 (`canReleaseWorkOrder`), 12 (`release`), 14 (botón, `Modal` y método sin llamada), 17 (liberar y volver a tomar)                                                          |
| **Liberada mientras el técnico trabaja:** su cierre se rechaza sin pisar la orden. **Falla si el `close` del técnico anterior se aplica**                                                                                        | 12 (`taken-by-other`, `not-in-progress`), 13 (aviso y sin formulario), 17                                                                                                    |
| La página solo permite el comentario y el resultado. **Falla si deja editar otro campo**                                                                                                                                         | 13 (solo un `<select>` y un `<textarea>`)                                                                                                                                    |
| Solo los técnicos habilitados toman y cierran. **Falla si otro rol o un equipo que no corresponde puede**                                                                                                                        | 11 (política), 13 (ruta × roles y acceso denegado en la página), 14 (botones y método sin llamada)                                                                           |
| Una orden cerrada no se reabre ni se cierra dos veces. **Falla si una lista desactualizada la reabre**                                                                                                                           | 12 (`not-pending`, `not-in-progress`), 14 (ya no hay `<select>`), 17                                                                                                         |
| El comentario de cierre se guarda con autor y fecha y se ve en el detalle, separado del de falla                                                                                                                                 | 12, 15 (detalle y edición), 16 (seed), 17 (releído tras cerrar)                                                                                                              |

## Verificación

1. `pnpm test`, `pnpm lint`, `pnpm build`, `prettier --check .`: todo en verde.
2. **Mutaciones** (como en 011/013b/013c/013a, anotadas en `notes.md`). Para cada una la suite tiene
   que fallar, y solo cuenta si compila:
   - `buildBreadcrumb` omite el nivel intermedio, o los devuelve del nodo hacia la raíz
   - `buildBreadcrumb` no protege el ciclo (se cuelga) o devuelve un breadcrumb parcial en vez de `null`
   - `buildBreadcrumb` acepta una parte de otra máquina
   - `machineId` deja de ser requerido en `Form`, o la página envía sin comprobarlo
   - el selector obliga a elegir una parte (no permite `partId: null`)
   - la página concatena el comentario en el breadcrumb
   - el breadcrumb se recalcula al leer la orden (en el detalle o en el listado)
   - la edición envía el `machineRef` que emite el formulario en vez de `current.machineRef`
   - `MachinePartPicker` no limpia la parte al cambiar de máquina
   - la página usa la respuesta de una carga de partes anterior tras cambiar de máquina
   - `close` acepta una nota vacía, de solo espacios o de menos de 50 caracteres, o no valida antes del `GET`/`PATCH`
   - `isValidClosingComment` cuenta los espacios de los bordes, o el mínimo pasa a 49/51
   - `close` no exige `in-progress` (cierra una `pending` o una ya cerrada)
   - `close` no exige que quien cierra sea el `takenBy`
   - `take` no exige `pending` (le quita la orden a otro técnico o reabre una cerrada)
   - `take` omite la relectura posterior, o el error `not-pending` no lleva el nombre del dueño
   - `release` no exige `in-progress` (reabre una cerrada) o deja `takenBy` en la orden
   - `canReleaseWorkOrder` deja liberar a un técnico o a `personal-produccion`, o excluye a admin o a team leader
   - el listado ofrece "Liberar" en órdenes que no están `in-progress`, o `releaseWorkOrder` no comprueba el permiso o llama al servicio sin confirmar
   - `isClosedStatus` no incluye `cancelled` (se cancela sin comentario)
   - `canTakeWorkOrder` ignora el tipo de equipo, o deja pasar a un rol que no es técnico
   - `canResolveWorkOrder` no compara el `takenBy` (otro técnico ve el formulario)
   - la ruta `/resolve` sin `canActivate`, o la página no vuelve a comprobar el permiso contra la orden
   - `WorkOrderResolve` muestra el formulario con la orden en `pending`, cerrada o de otro técnico
   - `WorkOrderResolve` permite enviar sin resultado, sin comentario o con menos de 50 caracteres, o deja editar otro campo
   - el listado llama a `take` sobre una orden `in-progress` de otro (en vez de solo advertir)
   - "Tomar" navega antes de que `take` termine bien, o aunque falle
   - el `PUT` de edición descarta `takenBy` o `closingNote`
3. `pnpm run test:coverage`: `part.model.ts` (con `buildBreadcrumb`), `work-order.model.ts`,
   `machine-part-picker.ts`, `form.ts`, `work-order.service.ts` (`take`/`close`/`release`), `work-order.permissions.ts` (`canTakeWorkOrder`, `canResolveWorkOrder`, `canReleaseWorkOrder`) y `work-order-resolve.ts` al
   100 % de líneas y ramas. Recordar que el proveedor de
   cobertura excluye `**/testing/**` (`work-order.fixtures.ts` no cuenta).
4. **Contrato contra JSON Server real** (`pnpm api`, sobre una copia de `db.json`): crear una orden
   con `machineRef` de nivel 3 por `POST`, releerla, renombrar la parte con `PATCH { name }` y
   comprobar que la orden conserva el `breadcrumb`; JSON Server guarda el objeto anidado tal cual.
5. Prueba manual con `pnpm api` + `pnpm start`:
   - `produccion` (pronto-intervención) y `teamleader` (preventivo/correctivo): sin máquina no deja
     enviar y muestra el error; solo máquina; máquina → hoja de nivel 4; comentario; el listado y el
     detalle muestran el breadcrumb y el comentario por separado.
   - Como `admin`, renombrar la parte en `/machines/1/parts`: la orden ya creada no cambia.
   - Editar una orden: no hay selector, se ve la referencia guardada.
   - Máquina sin partes: se puede crear la orden sobre la máquina completa.
   - Como `tecnico` (equipo `guardia`) en el listado: "Tomar orden" aparece solo en las
     pronto-intervención pendientes. Al pulsarlo la orden queda "En progreso" y "Tomada por Técnico
     Mecánico de Guardia", y se abre `/work-orders/:id/resolve` con la orden en solo lectura y solo el
     resultado y el comentario. Sin elegir resultado, sin comentario o con menos de 50 caracteres no
     deja cerrar; con todo, cierra y vuelve al listado. Salir sin cerrar deja "Continuar" en esa orden.
     Cerrar como "Cancelada" y filtrar por "Cancelada" muestra la orden; el detalle muestra
     comentario, autor y fecha aparte del comentario de falla.
   - Como `electricista` (equipo `preventivo-correctivo`) con una orden tomada por `tecnico`: el
     botón "Tomar orden" muestra la advertencia "La orden está siendo ejecutada por …" y no navega;
     abrir `/work-orders/:id/resolve` a mano muestra la advertencia y ningún formulario.
   - Como `admin` o `teamleader`: "Liberar" aparece solo en las órdenes en progreso y pide confirmación;
     al confirmar, la orden vuelve a "Pendiente" sin "Tomada por" y otro técnico habilitado puede
     tomarla. Con la página de cierre abierta como el técnico anterior, intentar cerrar → aviso y sin
     cambios. `produccion` y los técnicos no ven "Liberar".
   - Con la lista abierta en dos pestañas (dos técnicos): tomar la misma orden en ambas → la segunda
     avisa y no navega; una orden cerrada en una pestaña no se puede reabrir desde la otra.
   - `admin`, `teamleader` y `produccion`: no ven "Tomar orden" ni "Continuar", no hay `<select>` de
     estado, y `/work-orders/5/resolve` los manda a `/dashboard` con aviso.

## Riesgos

- **Cambio de contrato en un solo commit** (tareas 4–8): toca ~20 archivos entre código, fixtures y
  datos. Se mitiga con la fixture compartida y con que 1–3 ya están en verde antes.
- **Datos existentes migrados a mano** (decisión abierta 3): las órdenes de prueba quedan con una
  máquina que no corresponde a su título. Si hay un `db.json` real en uso, hay que migrarlo antes.
- **`db.json` reescrito por JSON Server:** mientras `pnpm api` corre, reescribe el archivo sin el
  salto de línea final y `prettier --check` lo marca. Usar una copia para la prueba manual o
  `git checkout -- db.json` al terminar (mismo aviso que 013a).
- **`spec.md` sin trackear y sin formatear:** el hook de pre-commit lo reformatea al commitearse.
- **Dependencia entre features:** `work-orders` importa de `machines` (modelo, `PartTree`, servicios)
  y nunca al revés. Si se agregara una dependencia inversa habría un ciclo.
- **Referencias colgantes:** JSON Server no valida `machineId`/`partId`; una parte borrada después
  queda referenciada. El snapshot resuelve la visualización (spec); la integridad queda para el
  backend real.
- **Liberar borra el dueño sin dejar rastro** (decisión abierta 7) y el comentario que el técnico estaba
  escribiendo se pierde si lo liberan en ese momento. Es el costo de no tener historial de eventos ni
  borradores; el backend real (spec 018) es el lugar para auditar quién liberó y cuándo.
