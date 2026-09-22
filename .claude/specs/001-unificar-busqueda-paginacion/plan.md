# Plan 001: Unificar búsqueda, paginación y recarga del listado

Spec: `.claude/specs/001-unificar-busqueda-paginacion/spec.md`

## Contexto

El spec pide tres cosas: resetear a página 1 al buscar, retroceder de página al eliminar el único ítem de la última página, y no duplicar suscripciones de búsqueda. Además define dos criterios de aceptación que deben poder **fallar** si el comportamiento se rompe.

Leídos `work-order.service.ts`, `work-orders-list.ts/.html` y sus specs, el estado real es:

| Requisito del spec                       | Estado en el código                                                                                                                                 | Estado en los tests                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buscar resetea a página 1                | Implementado (`work-orders-list.ts:81-91`, `goToPage` :102-112)                                                                                     | Cubierto (`debounces typing and resets the page…`)                                                                                                                      |
| Eliminar último ítem retrocede           | Implementado: el `subscribe` de :71-79 re-pide `totalPages` si `query.page > totalPages`; `deleteWorkOrder` :157-170 recarga vía `loadWorkOrders()` | Parcial: el test usa estado restaurado (página 4→3), no el flujo del spec (buscar → pág. 2 → eliminar → pág. 1) y no verifica el DOM                                    |
| Sin suscripciones duplicadas             | Implementado: un solo `Subject` + `switchMap` (:56-70)                                                                                              | Parcial: se cuentan llamadas, no suscripciones activas                                                                                                                  |
| Criterio 2 (carrera entre dos búsquedas) | `switchMap` cancela la anterior                                                                                                                     | Parcial: `cancels a page request when a new search is applied` mezcla página+búsqueda; no hay test de dos búsquedas superpuestas ni prueba de que falla sin `switchMap` |
| Tests HTTP del servicio (CLAUDE.md)      | —                                                                                                                                                   | `work-order.service.spec.ts` solo tiene un smoke test con `console.log`; `searchByName` sin cubrir                                                                      |

**No se prevén cambios en código de producción**: si al escribir los tests alguno falla contra el código actual, eso es un bug real y se corrige en ese momento (se anota en `notes.md`).

Supuesto no verificado: no pude inspeccionar json-server (no aparece en `node_modules`), así que no sé si ante una página inexistente devuelve `data: []` o clampea a la última. El componente maneja ambos casos; se valida a mano en la verificación E2E.

## Tareas

### 1. Test del criterio de aceptación 1 (flujo literal del spec)

- **Archivo:** `src/app/features/work-orders/pages/work-orders-list/work-orders-list.spec.ts`
- **Cambio:** agregar test que hace `start()` → `search('X')` → `goToPage(2)` → `deleteWorkOrder(id)`. La respuesta de la página 2 tras eliminar es `response(1, [])` (queda 1 sola página); el re-pedido a página 1 se deja **pendiente** (`Subject`) para inspeccionar el estado intermedio.
- **Test que la valida:** `after searching and deleting the only item on page 2, goes to page 1 and never renders the empty state`. Asserts: `searchByName` llamado con `('X','2','10')` y luego `('X','1','10')`; con el re-pedido pendiente, `fixture.detectChanges()` **no** contiene "Sin órdenes" y `currentPage() === 1`; al resolver, se renderiza la fila y `storage.set` queda con `{ searchValue: 'X', page: 1 }`. Usar `expect.assertions(n)` para que no pueda saltearse.

### 2. Test del criterio de aceptación 2 (carrera entre búsquedas)

- **Archivo:** mismo `work-orders-list.spec.ts`
- **Cambio:** dos `Subject` (A y B) como respuestas de dos búsquedas consecutivas (`search('a')`, luego `search('ab')`), ambas ya pasado el debounce, con A todavía en vuelo.
- **Test que la valida:** `two overlapping searches: only the latest request resolves even if the older one answers last`. Asserts: `A.observed === false` y `B.observed === true`; se emite B y **después** A; `workOrders()` queda con los datos de B, `totalPages`/`currentPage` los de B y `storage.set` no persiste la query de A. `expect.assertions(n)`.

### 3. Test de suscripciones activas (no duplicadas)

- **Archivo:** mismo `work-orders-list.spec.ts`
- **Cambio:** mock de `searchByName` que devuelve un `Observable` que nunca completa y lleva un contador `active` (`active++` al suscribirse, `active--` en el teardown).
- **Test que la valida:** `never keeps more than one active request subscription across search, paging, retry and delete`. Ejecuta buscar, cambiar de página, error+reintento y eliminar; tras cada acción `active === 1`, y `0` tras `fixture.destroy()`.

### 4. Verificación por mutación (los tests 1–3 deben poder fallar)

- **Archivo:** `work-orders-list.ts` — **cambio temporal, no se commitea**; se revierte con `git checkout -- <archivo>` (está trackeado y sin modificar).
- **Cambio:** (a) `switchMap` → `mergeMap` en :58; (b) quitar el bloque `if (query.page > totalPages)` de :74-77.
- **Test que la valida:** con (a) deben fallar los tests 2 y 3 (y el existente `cancels a page request…`); con (b) debe fallar el test 1. Si alguno sigue verde bajo su mutación, el test es débil y se reescribe. Resultado anotado en `notes.md`.

### 5. Tests HTTP del servicio

- **Archivo:** `src/app/features/work-orders/data-access/work-order.service.spec.ts`
- **Cambio:** reemplazar el smoke test (y su `console.log`) por tests con `provideHttpClient()` + `provideHttpClientTesting()` y `HttpTestingController` (`afterEach(() => httpMock.verify())`).
- **Tests que la validan:**
  - `searchByName sends _page, _per_page and title:contains to /work-orders`
  - `searchByName maps HTTP failures to a friendly error` (silenciando `console.error` con `vi.spyOn`)
  - `delete issues DELETE /work-orders/:id`

### 5b (opcional, requiere confirmación). Actualizar el roadmap

- **Archivo:** `README.md` líneas 258-260 (checkboxes de "Unificar búsqueda…", "Recuperar la búsqueda… suscripciones duplicadas", "Mantener una página válida… después de eliminar") y el párrafo de la línea 94.
- **Test que la valida:** suite completa en verde tras las tareas 1-5. Solo se marca lo que quedó respaldado por tests.

## Fuera de alcance (según el spec)

Filtros por estado/prioridad, autenticación. Tampoco se toca código muerto (`getAll`, `getPaginated` no tienen usos fuera del servicio) ni la cobertura (sin proveedor configurado).

## Verificación

1. Baseline: `pnpm test` en verde **antes** de empezar (para distinguir fallos previos de los nuevos).
2. Tras cada tarea 1-3 y 5: `pnpm test` en verde.
3. Tarea 4: correr `pnpm test` con cada mutación y confirmar los fallos indicados; revertir y confirmar verde.
4. E2E manual: `pnpm api` + `pnpm start`; crear ≥11 órdenes con el mismo título, buscarlo, ir a la página 2, eliminar el único ítem → debe quedar en página 1 con datos, sin pantalla "Sin órdenes". Tipear dos búsquedas rápidas y mirar Network: la primera request queda cancelada.
5. Commit solo si se pide; el hook de Husky corre `pnpm test`. Mensaje sugerido: `test(work-orders): cover search/pagination acceptance criteria`.
