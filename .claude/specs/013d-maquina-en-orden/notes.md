# Notas 013d: ejecución

## Resultado

66 archivos / 1961 tests en verde (baseline medida al empezar: 62 archivos / 1645 tests → +316 tests,
+4 archivos). `pnpm lint`, `pnpm build`, `tsc --noEmit` (app y specs) y `prettier --check .`: sin
errores. La página de cierre queda como chunk lazy en el build.

Archivos de spec nuevos: `machine-part-picker.spec.ts`, `work-order-resolve.spec.ts`,
`work-order-create.integration.spec.ts` (criterios 2–5 de la máquina en la orden, contra un
emulador de JSON Server) y `work-order-closure.integration.spec.ts` (tomar, cerrar y liberar con dos
técnicos y una carrera simulada).

## Qué se implementó

**Máquina y parte en la orden** (tareas 1–9 del plan)

- `WorkOrder.asset` (texto libre, "Activo") → `machineRef: WorkOrderMachineRef` (`machineId`, `partId`,
  `breadcrumb`, `comment`). `WorkOrderCreateRequest` igual.
- `buildBreadcrumb(machine, partId, parts)` en `machines/models/part.model.ts`: sube por `parentId`;
  devuelve `null` (nunca una ruta parcial) si la parte no existe, es de otra máquina, falta un
  ancestro o hay un ciclo. No se reutilizó `flattenPartTree` (da la profundidad, no el vínculo con el
  padre). Los servicios de 013a no necesitaron métodos nuevos.
- `MachinePartPicker` (nuevo, presentacional): selector de máquina + `PartTree` con
  `showActions=false` + "Usar solo la máquina". `PartTree` no se modificó.
- `Form` emite un `WorkOrderFormValue` **sin breadcrumb**; la página de creación lo arma una sola vez,
  al enviar, con las partes que cargó (`switchMap` descarta la respuesta de una máquina anterior).
  En edición el formulario recibe `lockMachine` y muestra la referencia guardada de solo lectura: el
  `PUT` conserva `current.machineRef` (y copia los campos editables uno por uno: el valor del
  formulario trae `machineId`/`partId`/`comment` sueltos, que no son campos de la orden).
- Listado ("Máquina / parte") y detalle (ruta y comentario de la falla en elementos distintos).
- `db.json`: las 29 órdenes de prueba reparten sus referencias entre las tres máquinas (solo
  máquina, nivel 1, nivel 3, nivel 4, otras ramas, una máquina sin partes); los breadcrumbs salen del
  maestro sembrado y `db.seed.spec.ts` comprueba que coinciden.

**Tomar, cerrar y liberar** (tareas 10–17 del plan, ampliación pedida sobre el spec)

- Estado nuevo `cancelled`. `WorkOrder` gana `takenBy?: WorkOrderTaker | null` y
  `closingNote?: WorkOrderClosingNote`. Invariante: `pending` → sin dueño (`null` = liberada);
  `in-progress` → con dueño; cerrada → con dueño y comentario escrito por ese dueño.
- Comentario de cierre: entre 50 y 500 caracteres sin contar los espacios de los bordes. Una sola
  función (`isValidClosingComment`) la usan el modelo, el servicio y el validador del formulario.
- `WorkOrdersService.take`, `close` y `release`: cada una lee la orden fresca antes de escribir, no
  escribe si no se cumple la condición y propaga un error de red o 5xx sin interpretarlo como "no
  cumple". `take` vuelve a leer después de escribir para detectar que otro pisó al dueño.
  `updateStatus` se eliminó junto con el `<select>` de estado del listado.
- Permisos (`work-order.permissions.ts`): `canTakeWorkOrder` (técnico cuyo tipo de equipo atiende el
  tipo; la especialidad no se evalúa), `canResolveWorkOrder` (lo anterior + en progreso + es suya) y
  `canReleaseWorkOrder` (administrador y team leader, sobre una orden en progreso).
- Página `WorkOrderResolve` (`/work-orders/:id/resolve`, guard `isTechnician`): la orden en solo
  lectura y dos controles, resultado (sin valor por defecto) y comentario. Sin formulario si la orden
  está pendiente, cerrada, la ejecuta otro técnico o el técnico no la atiende.
- Listado: "Tomar orden", "Continuar" y "Liberar" (con el `Modal` de confirmación existente, sin
  modificarlo); "Tomada por {nombre}" junto al estado; el `<select>` de estado desapareció.
- Seed: 10 órdenes en progreso con dueño, 8 completadas y 1 cancelada con dueño y comentario, siempre
  con el técnico cuyo equipo atiende el tipo (`electricista` para preventivo/correctivo, `tecnico`
  para pronto-intervención). `db.seed.spec.ts` comprueba los invariantes para `db.json` y para el
  mock.

## Desvíos del plan

- **Las tareas 10–17 se implementaron juntas**, sin dejar `updateStatus` un paso intermedio: era
  código de un solo uso y quitarlo de una vez evitó un commit intermedio con tests de lo que iba a
  desaparecer.
- **`WorkOrderStateError` lleva también el estado real de la orden** (`status`), no solo el dueño: sin
  él, "otro técnico la está ejecutando" y "ya la cerraron" (una cerrada también tiene dueño) daban el
  mismo mensaje. Es lo que permite decir "La orden ya fue cerrada." y que el listado siga a la
  página de cierre solo cuando la orden en progreso ya era del propio técnico.
- **Un aviso propio para una orden en progreso sin dueño registrado** ("La orden ya está en
  ejecución.", sin nombre): dato anterior a la spec que la política no puede resolver. Salió al medir
  cobertura de `work-order-resolve.ts`, donde `takenBy?.name ?? ''` armaba "ejecutada por ." .
- **Fixture compartida** (`work-orders/testing/work-order.fixtures.ts`) para no repetir la referencia de
  máquina en ocho specs. Queda fuera de la medición por el `coverageExclude` de `**/testing/**`.
- **29 órdenes de prueba, no 28**: el plan contó a ojo con `grep`.
- El plan pedía tests de `getPaginated` y `update` solo indirectamente; no existían (huecos anteriores
  a la spec) y se agregaron al medir la cobertura del servicio.

## Limitaciones y cosas a tener en cuenta

- **Los chequeos previos no son atómicos.** `take`/`close`/`release` leen y después escriben; dos
  técnicos exactamente simultáneos pueden pasar el primer chequeo. La relectura de `take` cierra casi
  toda la ventana pero no toda; el backend real lo resuelve con una actualización condicional
  (`UPDATE … WHERE status = 'pending'`).
- **Liberar no deja historial**: se borra el dueño sin registrar quién liberó ni a quién se le quitó, y
  el comentario que el técnico estaba escribiendo se pierde (su envío se rechaza y el formulario
  desaparece). Es una spec de auditoría aparte.
- **Solo los técnicos cierran.** Una orden en progreso cuyo técnico no vuelve la libera un
  administrador o un team leader; ellos no la cierran.
- **Cerrada es terminal**: no se reabre, ni con `take` ni con `release`. Antes el `<select>` permitía
  volver una completada a pendiente.
- **La especialidad no se evalúa al tomar** (las órdenes no la tienen).
- **El breadcrumb usa las partes cargadas al elegir la máquina**: si otro usuario renombra la parte en
  esos minutos, la orden guarda el nombre anterior. Es aceptable; el backend real lo armará en el
  servidor.
- **JSON Server no valida** `machineId`/`partId`: una llamada a mano con ids inexistentes se acepta. Lo
  cubre el backend real (spec 018).
- **Un cambio ajeno al plan que afecta el trabajo diario**: el árbol de trabajo tiene archivos con CRLF
  (`core.autocrlf`). Los scripts de edición por reemplazo de texto tienen que normalizar los saltos de
  línea o no encuentran nada.

## Incidente durante la verificación

La primera corrida de mutaciones se lanzó con `node script &` dentro de un comando en segundo plano:
la tarea "terminó" enseguida pero el proceso quedó huérfano y siguió modificando archivos mientras
yo corría otras cosas. Se notó porque la suite falló por una mutación ya aplicada
(`machineId` sin `required` en el formulario). Se esperó a que terminara el proceso (el script
restaura cada archivo en un `finally`), se comprobó con `tsc` y con la suite completa que el árbol
quedó igual, y se volvieron a correr las mutaciones que se habían confundido. Regla para la próxima:
las mutaciones se lanzan en primer plano (o como tarea en segundo plano real) y no se toca el código
mientras corren.

## Verificación por mutación

29 mutaciones deliberadas; 28 hicieron fallar la suite y 1 es equivalente. Las que no compilaron
(`noUnusedLocals`/`noUnusedParameters`) se repitieron con variantes que sí compilan.

| #   | Mutación                                                                | Resultado                   |
| --- | ----------------------------------------------------------------------- | --------------------------- |
| 1   | `buildBreadcrumb`: devuelve la cadena en orden inverso                  | Falla (9)                   |
| 2   | `buildBreadcrumb`: devuelve una ruta parcial en vez de `null`           | Falla (8)                   |
| 3   | `buildBreadcrumb`: acepta una parte de otra máquina                     | Falla (2)                   |
| 4   | `Form`: `machineId` deja de ser requerido                               | Falla (2)                   |
| 5   | Página de creación: una máquina inexistente se reemplaza por la primera | Falla (1)                   |
| 6   | Página de creación: el comentario se mezcla en el breadcrumb            | Falla (11)                  |
| 7   | `Form`: el comentario de falla deja de tener tope de 200                | Falla (1)                   |
| 8   | Edición: el `PUT` usa la máquina que emite el formulario                | Falla (1)                   |
| 9   | `MachinePartPicker`: no limpia la parte al cambiar de máquina           | Falla (1)                   |
| 10  | Comentario de cierre: el mínimo baja de 50 a 40                         | Falla (45)                  |
| 11  | Comentario de cierre: cuenta los espacios de los bordes                 | Falla (40)                  |
| 12  | `isClosedStatus` no reconoce `cancelled`                                | Falla (8)                   |
| 13  | `close` no exige `in-progress`                                          | Falla (30)                  |
| 14  | `close` no exige que cierre el dueño                                    | Falla (25)                  |
| 15  | `close` no recorta el comentario                                        | Falla (1)                   |
| 16  | `take` no exige `pending`                                               | Falla (21)                  |
| 17  | `take` omite la relectura posterior                                     | Falla (3)                   |
| 18  | `release` no exige `in-progress`                                        | Falla (15)                  |
| 19  | `release` deja el dueño en la orden                                     | Falla (3)                   |
| 20  | `canTakeWorkOrder` ignora el tipo de equipo                             | Falla (9)                   |
| 21  | `canResolveWorkOrder` no compara el dueño                               | Falla (7)                   |
| 22  | `canReleaseWorkOrder` deja liberar al técnico                           | Falla (3)                   |
| 23  | Ruta `/resolve` abierta a cualquier rol                                 | Falla (3)                   |
| 24  | Página de cierre muestra el formulario a otro técnico                   | Falla (2)                   |
| 25  | Página de cierre: el validador acepta comentarios cortos                | Falla (4)                   |
| 26  | Listado: llama a `take` sobre la orden de otro técnico                  | Falla (1)                   |
| 27  | Listado: ofrece "Tomar orden" en órdenes cerradas                       | Falla (1)                   |
| 28  | Listado: navega a `/resolve` aunque `take` falle                        | Falla (4)                   |
| 29  | Página de cierre: `outcome` sin `Validators.required`                   | **Equivalente** (ver abajo) |

La 29 es equivalente: el atributo `required` de la plantilla (`<select required formControlName>`)
hace que Angular agregue el mismo validador (mismo caso que en 013b). El resultado igual queda
protegido por `!isClosedStatus(outcome)` en el envío.

## Contrato con JSON Server (`pnpm api`, sobre una copia de `db.json`)

Comprobado con `curl` contra un JSON Server real (puerto 3100, copia del archivo):

- Un `PATCH { status: 'in-progress', takenBy: {…} }` guarda el objeto anidado y no toca `machineRef`.
- Un `PATCH { status: 'pending', takenBy: null }` deja `takenBy: null` (la clave existe): por eso el
  tipo es `WorkOrderTaker | null`.
- Un `PATCH { status: 'cancelled', closingNote: {…} }` guarda el comentario de cierre sin mezclarlo con
  el comentario de falla de `machineRef`.
- Renombrar una parte con `PATCH /partes/3 { name }` no cambia el `breadcrumb` de las órdenes
  existentes (criterio 4).
- `GET /work-orders?status=cancelled&_page=1&_per_page=10` filtra por el estado nuevo, como lo pide
  el listado.

La prueba con `curl` desde Git Bash mandó el nombre "Técnico…" en la codificación del terminal
(aparece con caracteres rotos en la copia): es un artefacto de la prueba, no de la app, que envía
UTF-8.

## Cobertura

Última medición (`pnpm run test:coverage`, 1961 tests): Statements 98.33%, Branches 98.07%,
Functions 96.97%, Lines 99.23% (al cierre de 013a: 98.24% / 97.94% / 97.01% / 99.09%; Functions
bajó 0.04 puntos: las plantillas nuevas suman controladores de eventos que ningún test dispara). Al 100% en las cuatro métricas: `part.model.ts` (con `buildBreadcrumb`),
`work-order.model.ts`, `work-order.permissions.ts`, `work-order.service.ts`,
`machine-part-picker.ts`, `form.ts`, `work-order-resolve.ts`, `work-orders.routes.ts` y
`work-order.display.ts`. Sin cubrir quedan solo plantillas: en `work-order-resolve.html` los
`(clicked)` de los botones "Reintentar" (mismo patrón que detalle y edición), y en
`work-orders-list.html` los `[(isOpen)]` de los modales y los controladores de paginación, que ya
eran así antes de esta spec. Lo que no cubría del código nuevo del listado ("Tomar orden" sobre una
orden en progreso sin dueño, confirmar sin orden elegida, el botón del diálogo) se agregó al medir.

## Verificación manual pendiente

No se probó la interfaz en un navegador en esta ejecución. Pasos, con `pnpm api` sobre una copia de
`db.json` (o `git checkout -- db.json` al terminar) y `pnpm start`:

1. `teamleader` / `produccion`: crear una orden sin máquina → no deja enviar y muestra el error;
   solo máquina; máquina → hoja de nivel 4; comentario; el listado y el detalle muestran la ruta y
   el comentario por separado. Máquina sin partes: se crea sobre la máquina completa.
2. `admin`: renombrar una parte en `/machines/1/parts`; la orden ya creada no cambia. Editar una
   orden: no hay selector, se ve la referencia guardada.
3. `tecnico` (guardia): "Tomar orden" solo en las pronto-intervención pendientes → queda "En
   progreso" y "Tomada por…", y abre `/work-orders/:id/resolve` con la orden en solo lectura. Sin
   resultado, sin comentario o con menos de 50 caracteres no deja cerrar. Salir sin cerrar deja
   "Continuar". Cerrar como "Cancelada" y filtrar por "Cancelada" muestra la orden; el detalle
   muestra comentario, autor y fecha aparte del comentario de falla.
4. `electricista` con una orden tomada por `tecnico`: "Tomar orden" muestra la advertencia y no
   navega; abrir la página de cierre a mano muestra la advertencia y ningún formulario.
5. `admin` / `teamleader`: "Liberar" aparece solo en las órdenes en progreso y pide confirmación; al
   confirmar, la orden vuelve a "Pendiente" sin dueño. Con la página de cierre abierta como el técnico
   anterior, intentar cerrar → aviso y sin cambios. `produccion` y los técnicos no ven "Liberar".
6. Con la lista abierta en dos pestañas (dos técnicos): tomar la misma orden en ambas → la segunda
   avisa y no navega.
