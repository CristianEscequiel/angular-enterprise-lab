# Plan 012: Filtros por estado y prioridad, cambio de estado de órdenes

Spec: `.claude/specs/012-filtros-estado-prioridad/spec.md`

## Contexto

Lo relevado en el código, incluyendo lo que **no** coincide con el enunciado del spec:

- Los campos se llaman `priority` / `status` (no `prioridad`/`estado`) en `db.json`
  y en `WorkOrder`. `priority` ya es `low|medium|high`.
- **Los estados reales son tres**: `WorkOrderStatus = 'pending' | 'in-progress' | 'completed'`
  (`models/work-order.model.ts:2`), y son los únicos que aparecen en las 29 órdenes de
  `db.json`. El spec habla de cuatro (`canceled`); fue un error del enunciado y se
  corrige acá: **este plan trabaja con tres estados** y el select inline ofrece tres
  opciones. `canceled` no se agrega (ver Decisiones). Todas las combinaciones
  estado × prioridad ya existen en `db.json`, así que no hace falta tocar los datos.
- `Badge` (`shared/components/badge/badge.ts`) ya tiene variantes para los tres estados
  (`pending`, `in-progress`, `completed`) y **no tiene variantes de prioridad**. Trae
  además una variante `cancelled` que ningún dato usa; se deja como está (no se
  renombra ni se borra: fuera de alcance).
- `WorkOrdersService.searchByName(title, page, per_page)` recibe tres strings
  posicionales y manda siempre `title:contains` (aunque esté vacío). No hay método
  PATCH. `update()` es un PUT del objeto completo.
- `WorkOrdersList` mantiene `query = signal({searchValue, page})`, un `Subject` +
  `switchMap` (cancela la petición anterior), persiste en `localStorage`
  (`workOrdersSearch`) y valida lo restaurado en `readStoredSearch()`. La búsqueda
  tiene debounce de 300 ms; `goToPage`/`loadWorkOrders` aplican el texto pendiente
  antes de paginar.
- La lista muestra hoy solo Título / Activo / Estado (badge con el valor crudo
  `in-progress`) / Acciones. No muestra prioridad.
- JSON Server es `1.0.0-beta.15`: igualdad con `?status=pending`, `title:contains`,
  paginación `_page`/`_per_page` con `pages` en la respuesta. Un parámetro con valor
  vacío (`status=`) filtra por cadena vacía → **hay que omitirlo**, no mandarlo vacío.
- `core/interceptors/mock-api.interceptor.ts` no está registrado en ningún lado
  (código muerto, apunta a `/api/...`). No se toca.
- Los tests de la lista fijan el contrato con ~40 aserciones posicionales
  (`toHaveBeenLastCalledWith('motor', '1', '10')`), más `app.routes.spec.ts` (mock
  de `searchByName`) y `work-order.service.spec.ts`. Cambiar la firma implica
  reescribirlas (tarea 4/5).

## Decisiones

| Tema                               | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estados                            | Solo los tres que existen en `db.json`: `pending`, `in-progress`, `completed`. **`canceled` no se agrega en 012**: ningún dato ni flujo lo produce, `Badge` ya trae una variante `cancelled` lista para cuando exista, y agregarlo obliga a decidir reglas de producto (¿se puede reabrir?, ¿qué pasa con las órdenes en curso?). Si se quiere después, es un cambio chico y aislado: un valor en `WORK_ORDER_STATUSES`, una entrada en cada `Record` (el compilador marca las que falten) y un dato de ejemplo. |
| Fuente de verdad de valores        | `WORK_ORDER_STATUSES`, `WORK_ORDER_PRIORITIES` + type guards `isWorkOrderStatus/isWorkOrderPriority` en el modelo (mismo patrón que `USER_ROLES`/`isUserRole` de 011). Sirven para las opciones de los selects, para validar lo restaurado de storage y lo leído del DOM.                                                                                                                                                                                                                                        |
| Etiquetas y variantes              | Archivo nuevo `models/work-order.display.ts` con `STATUS_LABELS`, `PRIORITY_LABELS` (Pendiente/En progreso/Completada; Baja/Media/Alta, igual que `form.html`) y `STATUS_BADGE`/`PRIORITY_BADGE` tipados `Record<..., BadgeVariant>`. Al ser `Record` exhaustivo, agregar un valor nuevo sin etiqueta/variante **no compila**. Se exporta `BadgeVariant` desde `badge.ts`.                                                                                                                                       |
| Variantes de prioridad             | Sin crear variantes nuevas: `low → neutral`, `medium → warning`, `high → error`. Estado: identidad (`pending→pending`, etc.). Solapa colores con estado (warning/error) porque `Badge` solo tiene cuatro; se acepta y se anota.                                                                                                                                                                                                                                                                                  |
| Firma del servicio                 | `searchByName(title, page, per_page)` se reemplaza por `search(criteria: WorkOrdersCriteria)` con `{ title, status, priority, page, perPage }`. El nombre viejo ya es engañoso y una 4.ª/5.ª posición string es ilegible. Costo: reescribir aserciones (mecánico, con helper `expected()` en el spec).                                                                                                                                                                                                           |
| Parámetros HTTP                    | Se construyen omitiendo los vacíos: `_page`, `_per_page` siempre; `title:contains`, `status`, `priority` solo si hay valor. Cambio menor de 001: ya no se manda `title:contains=` vacío (equivalente en JSON Server).                                                                                                                                                                                                                                                                                            |
| Estado de la consulta              | `WorkOrdersSearch` pasa a `{ searchValue, status: WorkOrderStatus \| '', priority: WorkOrderPriority \| '', page }`. `''` = sin filtro.                                                                                                                                                                                                                                                                                                                                                                          |
| Controles                          | `statusFilter` y `priorityFilter` son `FormControl` (`nonNullable`, `''`) como `searchControl`. Sin debounce: un select es una decisión discreta.                                                                                                                                                                                                                                                                                                                                                                |
| Fuente de los otros criterios      | Al cambiar un filtro se arma la consulta con el valor **actual de los tres controles** + `page: 1` (misma regla que `goToPage`, que aplica el texto pendiente). Así ningún filtro pisa a otro y no hay dos versiones del criterio. `goToPage`/`loadWorkOrders` también llevan los tres.                                                                                                                                                                                                                          |
| Reset de página                    | Cambiar cualquiera de los tres criterios → página 1. Reintentar/eliminar conservan página si el criterio no cambió (comportamiento actual).                                                                                                                                                                                                                                                                                                                                                                      |
| Storage                            | Se extiende `workOrdersSearch`. Retrocompatible: `{searchValue, page}` viejo sigue siendo válido (filtros `''`). Un `status`/`priority` inválido cae a `''` (campo a campo); `page` inválida sigue descartando todo (test actual).                                                                                                                                                                                                                                                                               |
| Layout                             | Fila de filtros nueva bajo el buscador, fuera del `@if` de resultados: con 0 resultados los selects siguen visibles y se puede corregir el filtro. Labels visibles (`for`/`id`), primera opción `''` "Todos".                                                                                                                                                                                                                                                                                                    |
| Columnas                           | Título · Activo · **Prioridad** (badge) · **Estado** (badge + select inline) · Acciones. El spec pide ambos (criterio 1 exige badge de estado; el cambio rápido exige select por fila).                                                                                                                                                                                                                                                                                                                          |
| Select inline                      | `aria-label="Cambiar estado de {título}"`. Opciones con `[selected]` (no `[value]` sobre `<select>`, que depende del orden de render). El handler valida con `isWorkOrderStatus` y no hace nada si el valor no cambió.                                                                                                                                                                                                                                                                                           |
| Actualización de la fila           | `WorkOrdersService.updateStatus(id, status)` = `PATCH /work-orders/:id` con body `{ status }`. Al éxito se reemplaza la fila **por id** con la respuesta del servidor (no por índice) y se avisa con `MessageService.showSuccess`. Sin recarga si no hay filtro de estado.                                                                                                                                                                                                                                       |
| Fila que deja de cumplir el filtro | Si hay filtro de estado activo y el nuevo estado ≠ filtro, la fila ya no pertenece al listado y las páginas cambian → se re-pide la consulta actual (`loadWorkOrders()`, que ya reajusta si la página quedó vacía). Sin filtro de estado, solo se parchea la fila.                                                                                                                                                                                                                                               |
| Error en el PATCH                  | `showError('No se pudo actualizar el estado.')`, la fila queda como estaba y el `<select>` nativo vuelve a su valor anterior (el DOM no sigue a la señal por sí solo).                                                                                                                                                                                                                                                                                                                                           |
| Fila en vuelo                      | `updatingIds = signal<ReadonlySet<string>>`: el select de esa fila queda `disabled` mientras dura el PATCH; evita dos cambios superpuestos sobre la misma orden.                                                                                                                                                                                                                                                                                                                                                 |
| Mensaje de vacío                   | Con búsqueda o filtros activos, "Sin órdenes" dice "No hay órdenes que coincidan con los filtros." en vez de "No existen órdenes registradas" (sería falso). Sin botón "Limpiar filtros" (no lo pide el spec).                                                                                                                                                                                                                                                                                                   |
| Restricción por rol                | **No se aplica en 012.** 011 dejó el mecanismo (`requireRole`) pero son guards de _ruta_, y esto es una _acción_ dentro de una ruta ya visible; con solo `admin`/`tecnico` y sin catálogo de permisos (013) se estaría inventando una regla. El rol vive en `localStorage` (editable): sería UX, no seguridad. Cuando 013 defina quién cambia estado, basta `[disabled]` con `AuthService.currentUser()?.role` en el select. Se anota en `notes.md`.                                                             |
| Transiciones restringidas          | **Evaluado y descartado.** No es trivial: exige decidir reglas de producto (¿`completed → pending` o `completed → in-progress` se permite?) y opciones distintas por fila. Queda como mejora futura.                                                                                                                                                                                                                                                                                                             |

## Tareas

### 1. Modelo: listas cerradas y guards

- **Archivo:** `features/work-orders/models/work-order.model.ts`: reemplazar los
  `type` por `WORK_ORDER_STATUSES = ['pending','in-progress','completed'] as const`,
  `WORK_ORDER_PRIORITIES = ['low','medium','high'] as const`, los tipos derivados
  (mismos nombres y mismos valores que hoy, no cambia ningún consumidor) y
  `isWorkOrderStatus(value: unknown)` / `isWorkOrderPriority(value: unknown)`.
- **Test nuevo:** `models/work-order.model.spec.ts`:
  - `isWorkOrderStatus` acepta los 3 valores; rechaza `'canceled'`, `'cancelled'`,
    `''`, `'PENDING'`, `null`, `5`. **Debe fallar** si la lista se amplía o si
    acepta mayúsculas/vacío.
  - `isWorkOrderPriority` acepta los 3; rechaza `'urgent'`, `''`, `undefined`.
- **Valida:** `pnpm build` (los `Record` de la tarea 3 dependen de estos tipos).

### 2. `Badge`: exportar el tipo de variante

- **Archivo:** `shared/components/badge/badge.ts`: solo `export type BadgeVariant`
  (para tipar los mapas de la tarea 3). No se renombra nada.
- **Test:** `badge.spec.ts` (hoy solo "should create"): `it.each` sobre las 9
  variantes con `setInput('variant', ...)` y comprobar la clase en `.badge`:
  `pending/warning → badge--warning`, `in-progress/info → badge--info`,
  `completed/success → badge--success`, `cancelled/error → badge--error`,
  `neutral → badge--neutral`. Fija el comportamiento actual, en particular que los
  tres estados de `db.json` no caen en `neutral`.

### 3. Etiquetas y variantes de estado/prioridad

- **Archivo nuevo:** `features/work-orders/models/work-order.display.ts` con
  `STATUS_LABELS`, `PRIORITY_LABELS`, `STATUS_BADGE`, `PRIORITY_BADGE` (tipos
  `Record<WorkOrderStatus, ...>` / `Record<WorkOrderPriority, ...>`).
- **Test nuevo:** `models/work-order.display.spec.ts`:
  - Las claves de cada mapa son exactamente `WORK_ORDER_STATUSES` /
    `WORK_ORDER_PRIORITIES` (sin faltantes ni sobrantes).
  - `it.each`: `pending → 'pending'`, `in-progress → 'in-progress'`,
    `completed → 'completed'`; `low → 'neutral'`, `medium → 'warning'`,
    `high → 'error'`.

### 4. Servicio: `search()` con filtros y `updateStatus()` (PATCH)

- **Archivo:** `features/work-orders/data-access/work-order.service.ts`:
  - `export interface WorkOrdersCriteria { title; status: WorkOrderStatus | ''; priority: WorkOrderPriority | ''; page: number; perPage: number }`
  - `search(criteria)` reemplaza a `searchByName`: `HttpParams` con `_page`,
    `_per_page` y, solo si no están vacíos, `title:contains`, `status`,
    `priority`. Mantiene el `catchError` con el mensaje actual.
  - `updateStatus(id, status): Observable<WorkOrder>` →
    `http.patch<WorkOrder>(`${apiUrl}/${id}`, { status })`.
- **Test:** `work-order.service.spec.ts`:
  - Reemplazar los 2 tests de `searchByName` por `search` (misma cobertura + error
    amigable).
  - Los cinco parámetros llegan juntos: `_page=2`, `_per_page=10`,
    `title:contains=motor`, `status=in-progress`, `priority=high`.
    **Debe fallar** si falta alguno.
  - Con `status: ''`, `priority: ''`, `title: ''` los parámetros **no existen**
    (`params.has(...) === false`, no `''`). **Debe fallar** si manda `status=`.
  - Un solo filtro: `status='pending'` sin los otros → solo ese aparece.
  - `updateStatus('7','completed')`: método `PATCH`, URL `/work-orders/7`, body
    **exactamente** `{ status: 'completed' }`, devuelve lo que responde el server.
    **Debe fallar** si usa `PUT` o manda el objeto completo.

### 5. Página: estado de filtros, petición combinada y persistencia

- **Archivo:** `features/work-orders/pages/work-orders-list/work-orders-list.ts`:
  - `WorkOrdersSearch` con `status` y `priority`; `statusFilter`/`priorityFilter`
    (`FormControl`); `statusOptions`/`priorityOptions` desde las listas del modelo.
  - Helper privado `criteriaFromControls(page)` que lee los tres controles;
    `requests.pipe(switchMap(q => service.search({...})))` pasa los cinco campos.
  - `valueChanges` de cada select → `requestWorkOrders(criteriaFromControls(1))`.
    La suscripción del buscador y `goToPage`/`loadWorkOrders` usan el mismo helper
    (los otros criterios nunca se reconstruyen a mano).
  - `readStoredSearch()` restaura `status`/`priority` validados con los guards;
    controles seteados antes de suscribir `valueChanges` (no dispara petición extra).
  - `hasActiveCriteria` (computed) para el mensaje de vacío.
- **Test:** `work-orders-list.spec.ts`:
  - Actualizar el mock (`search`) y las ~40 aserciones al objeto
    `{ title, status: '', priority: '', page, perPage: 10 }` mediante el helper
    `expected(over)`. Mismo comportamiento, misma cobertura.
  - Criterio 2: `statusFilter.setValue('pending')` → `search` llamado con
    `status: 'pending'`. Se responde con un dataset que incluye una orden
    `completed` y se comprueba que **se renderiza** (la lista no filtra sobre lo
    recibido). **Debe fallar** si el filtrado es en cliente.
  - Criterio 3: buscar `motor` + estado `pending` + prioridad `high` → una única
    petición con los tres; luego cambiar solo la prioridad → siguen los otros dos;
    luego limpiar el estado (`''`) → conserva búsqueda y prioridad.
    **Debe fallar** si un filtro pisa a los otros.
  - Criterio 4: desde página 2 (restaurada) cambiar estado → `page: 1`,
    `currentPage() === 1`; idem para prioridad y para búsqueda (regresión de 001).
    **Debe fallar** si mantiene la página.
  - Paginar con filtros activos (`goToPage(2)`) conserva estado, prioridad y
    búsqueda; `loadWorkOrders()` (Reintentar) también.
  - Storage: se persisten los cinco campos; un `{searchValue, page}` antiguo se
    restaura con filtros vacíos; `status: 'archived'` inválido → `''`;
    `it.each` de inválidos existente sigue en pie; los selects reflejan lo
    restaurado y la restauración hace **una sola** petición.
  - Cambio de filtro durante una petición en vuelo → la anterior se cancela y solo
    gana la última (mismo patrón que el test de dos búsquedas superpuestas).

### 6. Plantilla: filtros, badges de prioridad/estado y select inline

- **Archivos:** `work-orders-list.html`, `work-orders-list.scss` (hoy vacío; ancho
  mínimo de los campos de filtro), y `work-orders-list.ts`:
  - Fila de filtros con dos `<label>` + `<select class="form-control">`.
  - Columna Prioridad: `<app-badge [variant]="priorityBadge[w.priority]">{{ priorityLabels[w.priority] }}</app-badge>`.
  - Columna Estado: badge con `statusBadge`/`statusLabels` + `<select>` inline
    (aria-label por fila, `[selected]`, `[disabled]="updating(w.id)"`).
  - `changeStatus(order, select)`: valida con `isWorkOrderStatus`, ignora si es
    igual, `updatingIds` add/remove, `updateStatus` con `takeUntilDestroyed`,
    parche por id, recarga si el filtro de estado ya no coincide, error → toast +
    `select.value = order.status`.
  - Mensaje de vacío según `hasActiveCriteria()`.
- **Test:** `work-orders-list.spec.ts` (DOM):
  - Criterio 1: con órdenes de los 3 estados y 3 prioridades, cada fila tiene el
    badge de estado y de prioridad con **clase y texto** esperados (`it.each`:
    `pending → badge--warning / Pendiente`, `in-progress → badge--info / En progreso`,
    `completed → badge--success / Completada`, `high → badge--error / Alta`,
    `medium → badge--warning / Media`, `low → badge--neutral / Baja`). **Debe
    fallar** si falta el badge de algún valor o si la variante es incorrecta
    (p. ej. `in-progress` → neutral).
  - Criterio 5 (dos filas, se cambia la **segunda**): `updateStatus` llamado
    exactamente una vez con `('2','completed')`; el badge de la fila 2 pasa a
    `completed` sin nueva llamada a `search` y sin tocar la fila 1.
    **Debe fallar** si actualiza otra fila o exige recarga.
  - Con filtro `pending` activo: cambiar una fila a `completed` → la fila
    desaparece vía nueva petición con los mismos criterios (`page` intacta).
  - Falla el PATCH → toast de error, `select.value` vuelve al estado original y
    el badge no cambia.
  - Mientras el PATCH está en vuelo el select de esa fila está `disabled` y un
    segundo `change` no dispara otra llamada.
  - Un valor fuera de la lista en el `change` se ignora (sin llamada al servicio).
  - Con criterios activos y 0 resultados: aparece "No hay órdenes que coincidan…"
    y los selects de filtro siguen en el DOM; sin criterios, el mensaje original.
  - Los `aria-label` de los selects inline son distintos por fila (extiende el
    test existente de nombres accesibles).
- `app.routes.spec.ts`: renombrar el mock `searchByName` → `search` (líneas
  ~39, 54, 99, 209); el resto no cambia.

### 7. Contrato con JSON Server (sin cambios de datos)

- **Archivos:** ninguno. `db.json` ya tiene los tres estados y las tres
  prioridades en combinaciones suficientes para probar filtros combinados.
- **Test:** ninguno automático (lo consume solo `json-server`); el contrato queda
  cubierto en `work-order.service.spec` (tarea 4).
- **Valida (manual):** `pnpm api` y
  `GET /work-orders?status=pending&_page=1&_per_page=10` → `data` con solo
  `pending` y `pages` correcto; `?status=pending&priority=high&title:contains=...`
  → los tres criterios juntos; sin resultados (p. ej. un título inexistente) →
  `data: []`; `PATCH /work-orders/1 {"status":"completed"}` → 200 con el
  recurso completo (revertir el dato después).

### 8. Verificación por mutación

Con las tareas 1-7 terminadas (código final; se revierte solo el punto mutado),
mismo formato que 001-011:

- `search()` deja de mandar `status` → fallan los tests de servicio y los de
  criterios 2 y 3.
- La lista filtra en cliente (`workOrders().filter(...)`) y no manda `status` →
  falla el test de criterio 2 (param + orden `completed` sigue renderizada).
- `criteriaFromControls` ignora `priority` → falla el test de combinación.
- El filtro conserva `page` en vez de `1` → fallan los tests de reset (estado y
  prioridad).
- `STATUS_BADGE['in-progress'] = 'neutral'` → fallan el display spec y el test
  de badges de la lista (criterio 1).
- `changeStatus` parchea `list[0]` en vez de por id → falla el test de la segunda
  fila. Si no falla, el test no discrimina y se ajusta.
- Quitar la recarga por filtro de estado → falla el test de "la fila desaparece".
- `updateStatus` con `PUT` o body completo → falla el test de servicio.
- Quitar el `select.value = order.status` del error → falla el test de reversión.
- Quitar `updatingIds` → falla el test de fila en vuelo.
- Resultado anotado en `notes.md`.

### 9. `notes.md` (spec 012)

- Decisiones de la tabla, en especial: tres estados (sin `canceled`, y cómo
  agregarlo si se decide), firma `search()`, omisión de parámetros vacíos,
  restricción por rol NO aplicada (y cómo enchufarla en 013), transiciones
  descartadas (por qué no eran triviales).
- Aclaración de que el spec decía cuatro estados (`canceled`) pero el modelo y
  `db.json` tienen tres; se siguió el modelo.
- Límite conocido: si un cambio de estado ocurre mientras hay una lectura en vuelo
  anterior al PATCH, esa lectura puede devolver el estado viejo de esa fila hasta
  la próxima carga (JSON Server mock, sin versionado).
- `mock-api.interceptor.ts` sigue sin registrar; no soporta `PATCH` ni filtros.
- Cobertura antes/después de `work-orders-list.ts`, `work-order.service.ts`,
  `badge.ts` y `work-order.display.ts`, con la misma aclaración de 010/011 sobre
  la variabilidad de Functions entre corridas.

## Mapa criterios de aceptación → tests

| Criterio del spec                                                        | Test                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Badge de estado y prioridad con variante correcta                        | `work-orders-list.spec` (criterio 1, `it.each` clase+texto), `work-order.display.spec`, `badge.spec` |
| Filtro de estado viaja como parámetro                                    | `work-order.service.spec` (`status` en la URL) y `work-orders-list.spec` (criterio 2)                |
| Búsqueda + estado + prioridad en la misma petición                       | `work-order.service.spec` (5 parámetros) y `work-orders-list.spec` (criterio 3)                      |
| Cualquier filtro resetea a página 1                                      | `work-orders-list.spec` (criterio 4: estado y prioridad desde página 2)                              |
| Cambio de estado inline: servicio + reflejo sin recargar + fila correcta | `work-order.service.spec` (`updateStatus` PATCH) y `work-orders-list.spec` (criterio 5, dos filas)   |

## Fuera de alcance (confirmado del spec)

- Restricción por rol para cambiar estado (decidido: no se aplica, ver Decisiones).
- Historial de cambios de estado.
- Transiciones restringidas (evaluado: no es trivial).
- Indicadores del dashboard (spec 014).
- `WorkOrderForm`/edición: la prioridad ya se edita ahí; no se cambia el formulario
  ni el PUT de `update()`.
- Backend real (Spring Boot): los filtros/PATCH se definen contra JSON Server.

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar (32 archivos / 258 tests según
   `notes.md` de 011); anotar el conteo para compararlo al cierre.
2. Tras cada tarea 1-6: `pnpm test` en verde (las tareas 4-5 rompen los specs hasta
   reescribir las aserciones de `search`; se hace en el mismo paso).
3. Tarea 8: confirmar cada fallo esperado, revertir cada mutación, confirmar verde.
4. `pnpm lint` y `pnpm build` sin errores; `prettier --check` sobre lo tocado.
5. `pnpm run test:coverage`: sin funciones nuevas sin cubrir en los archivos
   tocados; sin caída en `work-orders-list.ts` y `work-order.service.ts`.
6. Manual con `pnpm api` + `pnpm start` (borrar `workOrdersSearch` del storage):
   - Filtrar por estado → red muestra `?status=...&_page=1&_per_page=10`; combinar
     con prioridad y con texto → los tres en la misma petición.
   - Estar en página 2 y cambiar un filtro → vuelve a página 1.
   - Recargar la página → selects y resultados restaurados.
   - Cambiar el estado de una fila → badge cambia sin recargar, `db.json`
     persiste el `PATCH`; con filtro `pending` activo la fila desaparece.
   - Detener `pnpm api` y cambiar un estado → toast de error y el select vuelve.
   - Revisar la tabla en ancho móvil (badge + select por fila; spec 008b).
7. Commit solo si el usuario lo pide; el hook de Husky corre `pnpm test`. El
   README de cobertura se actualiza en commit aparte, como en 010/011.
