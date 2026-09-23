# Notas 012: ejecución

## Resultado

34 archivos / 334 tests en verde (baseline 32 archivos / 258 tests → +76
tests, +2 archivos). `pnpm lint`, `pnpm build` y `prettier --check` sin
errores.

| Área         | Archivos nuevos / tocados                                                                     | Tests                                                        |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Modelo       | `work-order.model.ts` (`WORK_ORDER_STATUSES/PRIORITIES`, `isWorkOrderStatus/Priority`)        | +23 (`work-order.model.spec.ts`, nuevo)                      |
| Presentación | `work-order.display.ts` (etiquetas y variantes de `Badge`, `Record` exhaustivos)              | +10 (`work-order.display.spec.ts`, nuevo)                    |
| `Badge`      | `badge.ts` (solo `export type BadgeVariant`)                                                  | +9 (una por variante, antes solo "should create")            |
| Servicio     | `work-order.service.ts` (`search(criteria)` reemplaza a `searchByName`, `updateStatus` PATCH) | +4 nuevos (3 de `search`, 1 de `updateStatus`), 2 reescritos |
| Lista        | `work-orders-list.ts/.html/.scss` (filtros, columna Prioridad, badges, select inline)         | ~40 aserciones reescritas al objeto de criterios, +30 nuevos |
| Rutas        | `app.routes.spec.ts` (solo el nombre del mock: `searchByName` → `search`)                     | sin cambios de conducta                                      |

`db.json` **no** se modificó (ver "Estados").

## Decisiones tomadas

- **Tres estados, no cuatro.** El spec hablaba de `canceled`, pero el
  modelo y los 29 registros de `db.json` solo tienen `pending`,
  `in-progress` y `completed`; el enunciado se equivocó y se siguió el
  modelo. Para agregar `canceled` más adelante: un valor en
  `WORK_ORDER_STATUSES`, una entrada en cada `Record` de
  `work-order.display.ts` (si falta alguna, no compila) y un dato de
  ejemplo. `Badge` ya trae una variante `cancelled` lista (se dejó tal
  cual, con esa grafía).
- **`search(criteria)` en vez de `searchByName`.** Recibe
  `{ title, status, priority, page, perPage }`. Los parámetros vacíos **no
  se mandan**: se comprobó contra JSON Server real que `?status=` devuelve
  0 resultados (filtra por cadena vacía), no "todos". Cambio menor de 001:
  ya no viaja `title:contains=` vacío (equivalente).
- **Un solo lugar arma el criterio.** `criteriaFromControls(page)` lee los
  tres controles (búsqueda, estado, prioridad); lo usan el buscador, los
  dos selects, `goToPage` y `loadWorkOrders`. Por eso ningún filtro pisa a
  otro y todos aplican el texto pendiente de debounce (mismo criterio que
  ya tenía la paginación). Cualquier cambio de criterio → página 1.
- **Storage retrocompatible.** `workOrdersSearch` guarda ahora
  `{ searchValue, status, priority, page }`. Un valor viejo
  `{ searchValue, page }` se restaura con filtros vacíos; un
  `status`/`priority` inválido cae a `''` campo a campo; una `page` inválida
  sigue descartando todo.
- **Prioridad con variantes existentes:** `low → neutral`,
  `medium → warning`, `high → error`. Comparte color con `pending`
  (warning) y con la variante de error porque `Badge` solo tiene cuatro
  colores; se aceptó en vez de crear variantes nuevas.
- **Cambio de estado inline** (`PATCH /work-orders/:id` con
  `{ status }`): la fila se reemplaza **por id** con la respuesta del
  servidor; el select de esa fila queda `disabled` mientras dura la
  petición; si falla, toast de error y el `<select>` nativo vuelve a su
  valor (el DOM no sigue a la señal por sí solo). Si hay filtro de estado
  activo y la fila deja de cumplirlo, se re-pide la consulta actual (las
  páginas cambian); sin filtro de estado no hay recarga.
- **Restricción por rol: no aplicada.** Los guards de 011 son de _ruta_ y
  esto es una _acción_ dentro de una ruta visible; sin catálogo de
  permisos (013) se estaría inventando la regla, y el rol vive en
  `localStorage` (editable), así que sería UX, no seguridad. Cuando 013
  defina quién puede cambiar estado, alcanza con `[disabled]` en el
  select leyendo `AuthService.currentUser()?.role`.
- **Transiciones restringidas: descartadas.** No eran triviales: exigen
  decidir reglas de producto (por ejemplo si `completed` puede volver a
  `pending`) y opciones distintas por fila.
- **Mensaje de vacío** distinto con criterios activos ("No hay órdenes que
  coincidan con los filtros."), para no afirmar que no hay órdenes
  registradas. Los selects de filtro quedan fuera del `@if`, así que
  siguen visibles con 0 resultados.

## Verificación por mutación

Con el código final, se mutó un punto por vez, se corrió `pnpm test` y se
restauró el archivo. Las 16 mutaciones fueron detectadas:

| Mutación                                                 | Tests que fallan                                              |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `search()` deja de mandar `status`                       | 2 del servicio (parámetros juntos, un solo filtro)            |
| `search()` manda parámetros vacíos                       | 1 del servicio (omite vacíos)                                 |
| `updateStatus` con `PUT`                                 | 1 del servicio                                                |
| `updateStatus` con objeto completo                       | 1 del servicio                                                |
| Lista filtra en cliente y no manda `status`              | 7 de la lista (criterios 2 y 3, reset, restauración, recarga) |
| `criteriaFromControls` ignora `priority`                 | 4 de la lista                                                 |
| `criteriaFromControls` ignora el estado                  | 7 de la lista                                                 |
| El filtro conserva la página en vez de resetear a 1      | 2 de la lista (estado y prioridad desde página 2)             |
| `changeStatus` parchea `list[0]` en vez de por id        | 2 de la lista (la que cambia la segunda fila)                 |
| Se quita la recarga si la fila deja de cumplir el filtro | 1 de la lista                                                 |
| El error del PATCH no restaura el select                 | 1 de la lista                                                 |
| Se quita el bloqueo de fila en vuelo                     | 1 de la lista                                                 |
| `readStoredSearch` acepta cualquier `status`             | 1 de la lista                                                 |
| `in-progress` con variante `neutral`                     | 1 de `display.spec` + 1 de badges de la lista                 |
| `high` con variante `warning`                            | 1 de `display.spec` + 1 de badges de la lista                 |
| Mensaje de vacío ignora los filtros                      | 1 de la lista                                                 |

Dos mutaciones se reescribieron porque la primera versión no compilaba
(`noUnusedLocals`): quitar la recarga y quitar el bloqueo de fila.

Corrección al plan: el plan decía que mutar `search()` también rompería los
tests de la lista (criterios 2 y 3). No es así: la lista prueba contra un
mock del servicio, y el contrato HTTP lo cubre `work-order.service.spec`.
Por eso los criterios 2 y 3 están cubiertos en **dos capas**: el servicio
(parámetros en la URL) y la lista (qué criterio le pasa al servicio).

## Contrato con JSON Server (`pnpm api`)

Comprobado con `curl` contra `json-server@1.0.0-beta.15`:

- `?status=pending&_page=1&_per_page=5` → solo `pending`, `pages: 2`,
  `items: 10`.
- `?status=pending&priority=high` → solo `pending/high` (5 ítems).
- `?status=completed&priority=low&title:contains=a` → los tres criterios
  juntos.
- Sin coincidencias → `data: []`, `pages: 1`, `items: 0`.
- `?status=` (vacío) → 0 ítems (motivo de omitir parámetros vacíos).
- `PATCH /work-orders/1 {"status":"completed"}` → 200 con el recurso
  completo. Se revirtió el dato; JSON Server reescribió `db.json` sin el
  salto de línea final y se restauró con `git checkout`, así que `db.json`
  queda sin diferencias.

## Límites conocidos

- **Lectura en vuelo vs. PATCH.** Si un cambio de estado ocurre mientras
  hay una lectura de la lista iniciada _antes_ del PATCH, esa lectura puede
  devolver el estado viejo de esa fila y pisar el parche local hasta la
  próxima carga. JSON Server no versiona; con un backend real se resolvería
  ahí.
- `mock-api.interceptor.ts` sigue sin registrarse en ningún lado; no
  soporta `PATCH` ni filtros. No se tocó.
- No se probó la interfaz en un navegador. Quedan pendientes los pasos
  manuales del plan con `pnpm api` + `pnpm start` (petición de red por
  filtro, volver a página 1, restauración tras recargar, cambio inline con
  y sin filtro de estado, API detenida, ancho móvil de la fila
  badge + select).

## Cobertura

Los archivos tocados o nuevos no aparecen en la tabla de archivos con
huecos (100% en las cuatro métricas). Medición global
(`pnpm run test:coverage`):

```
                corrida 1            011 (README)
Statements : 95.77% (1088/1136)   94.55%
Branches   : 95.43% (460/482)     93.72% (418/446)
Functions  : 91.15% (206/226)     88.88% (184/207)
Lines      : 97.34% (806/828)     95.96% (714/744)
```

Otra corrida sobre el mismo código dio Functions 89.82% (203/226) y
Statements 95.33%: como en 010/011, Statements/Functions/Lines fluctúan
entre corridas y Branches es el número estable.

## Pendiente

- Pasos manuales de UI arriba, a cargo del autor del proyecto.
- El `README` (cobertura y revisión del spec) no se actualizó: va en commit
  aparte, como en 010/011.
