# Plan 006: Página 404 y validación de formato de id en rutas de work-orders

Spec: `.claude/specs/006-pagina-404/spec.md`

## Contexto

Leídos `app.routes.ts`, `work-orders.routes.ts`, `pages/not-found/` y
`db.json`, el diagnóstico frente a los 4 requisitos del spec es:

| Requisito del spec | Estado en el código |
|---|---|
| Ruta wildcard captura cualquier path no definido | **Ya implementado** — `app.routes.ts:22-26`, `{ path: '**', loadComponent: () => NotFound }`, última entrada del array raíz. Ya cubre rutas raíz inexistentes y cualquier ruta dentro de `/work-orders/...` que no matchee ningún hijo (el router de Angular hace backtracking global), pero **sin test** que lo confirme |
| Componente 404 con mensaje claro y link de vuelta | **Ya implementado** — `not-found.html`: "404" + "Página no encontrada" + `<a routerLink="/">` (que redirige a `/dashboard` vía `app.routes.ts:5-8`). Solo tiene un smoke test (`should create`) |
| Funciona para rutas raíz inexistentes | Cubierto por el wildcard, sin test dedicado |
| Funciona para ids con formato inválido dentro de `/work-orders` | **No cubierto** — `work-orders.routes.ts:26` usa `path: ':id'`, que matchea *cualquier* string de un solo segmento sin restricción de formato. Un id no numérico (`/work-orders/abc`) carga igual `WorkOrderDetail`, que pide el recurso por HTTP, recibe 404 del backend y muestra el estado "Orden no encontrada" de **spec 003** — nunca llega al wildcard `**` |

**Formato de id asumido:** según `db.json` (ids `"1"`, `"2"`, `"3"`...,
generados por json-server), se valida como string numérico (`^\d+$`).
Es un supuesto explícito, no verificado contra un backend real (todavía
no existe — ver CLAUDE.md).

**Decisión de diseño (pedida por la nota del spec):** Angular no soporta
regex directamente en `path: ':id'`. Se reemplazan las rutas `:id` y
`:id/edit` por un `UrlMatcher` custom (función `matcher` en vez de
`path`) que valida el formato a mano sobre los `UrlSegment[]` y devuelve
`posParams: { id: segments[0] }` — esto mantiene
`ActivatedRoute.paramMap.get('id')` funcionando exactamente igual que
hoy en `WorkOrderDetail`/`WorkOrderEdit`, sin tocar esos componentes.
Si el id no matchea el formato, el `UrlMatcher` devuelve `null` y
Angular hace backtracking hasta encontrar el wildcard `**`.

**Sobre el link de "volver":** el spec pide `/dashboard` **o**
`/work-orders` — `routerLink="/"` ya resuelve a `/dashboard` (vía el
`redirectTo` existente), así que ya cumple el requisito tal como está.
No se cambia el destino, solo se agrega el test que lo confirma.

## Tareas

### 1. `work-orders.routes.ts`: `UrlMatcher` de formato para `:id` y `:id/edit`
- **Archivo:** `src/app/features/work-orders/work-orders.routes.ts`
- **Cambio:** agregar y exportar (para poder testearlas aisladas):
  ```ts
  import { Routes, UrlMatcher } from '@angular/router';

  const ID_PATTERN = /^\d+$/;

  export const matchWorkOrderId: UrlMatcher = (segments) => {
    if (segments.length !== 1 || !ID_PATTERN.test(segments[0].path)) {
      return null;
    }
    return { consumed: segments, posParams: { id: segments[0] } };
  };

  export const matchWorkOrderIdEdit: UrlMatcher = (segments) => {
    if (
      segments.length !== 2 ||
      segments[1].path !== 'edit' ||
      !ID_PATTERN.test(segments[0].path)
    ) {
      return null;
    }
    return { consumed: segments, posParams: { id: segments[0] } };
  };
  ```
  Reemplazar `{ path: ':id/edit', loadComponent: ... }` por
  `{ matcher: matchWorkOrderIdEdit, loadComponent: ... }` y
  `{ path: ':id', loadComponent: ... }` por
  `{ matcher: matchWorkOrderId, loadComponent: ... }` (mismo orden
  relativo: `''`, `new`, `:id/edit`, `:id`, sin tocar esas dos primeras).
- **Test nuevo:** `src/app/features/work-orders/work-orders.routes.spec.ts`
  — testea las funciones exportadas directamente con `UrlSegment[]`
  fabricados a mano (sin `TestBed`, son funciones puras):
  - `matchWorkOrderId matches a single numeric segment` / `rejects a non-numeric segment` / `rejects more than one segment`.
  - `matchWorkOrderIdEdit matches <numeric>/edit` / `rejects a non-numeric id` / `rejects a suffix other than "edit"` / `rejects a single segment`.

### 2. Test de integración de routing (archivo nuevo)
- **Archivo nuevo:** `src/app/app.routes.spec.ts`
- **Por qué:** las tareas de arriba prueban el matcher aislado, pero el
  criterio de aceptación pide algo más fuerte: que navegar de verdad a
  esas URLs resuelva al componente correcto. Se usa
  `RouterTestingHarness` (`@angular/router/testing`, ya disponible en
  `node_modules`) con las rutas reales de `app.routes.ts` — es la
  primera vez que se usa en este repo (hasta ahora los specs de páginas
  mockean `ActivatedRoute` directamente), pero es la herramienta
  correcta para probar resolución de rutas de punta a punta.
  `WorkOrdersService` se mockea a nivel de `TestBed` (igual que en los
  specs de página) para los casos donde sí se llega a cargar
  `WorkOrderDetail`/`WorkOrderEdit`, evitando HTTP real.
- **Tests:**
  - `renders NotFound for an undefined root route` — `harness.navigateByUrl('/no-existe')`, assert el `NotFound` se renderiza (`routeNativeElement` contiene "Página no encontrada").
  - `renders NotFound for a work order id with an invalid format, without loading WorkOrderDetail` — `harness.navigateByUrl('/work-orders/abc')`, assert `NotFound` se renderiza y `workOrdersServiceMock.getById` **no** fue llamado. **Debe fallar** si el matcher no está o es demasiado laxo.
  - `still resolves numeric ids to WorkOrderDetail and WorkOrderEdit` (no-regresión) — `harness.navigateByUrl('/work-orders/1')` y `harness.navigateByUrl('/work-orders/1/edit')`, assert que en ningún caso se renderiza `NotFound` y que `getById` fue llamado con `'1'`. **Debe fallar** si el matcher quedó demasiado estricto.
  - `navigates back to /dashboard from the 404 page's link` — navegar a `/no-existe`, click en el `<a>` dentro de `routeNativeElement`, assert `harness.routeNativeElement` ya no muestra "Página no encontrada" y `router.url === '/dashboard'`.

### 3. Verificación por mutación
Con las tareas 1-2 ya implementadas (código final; se revierte solo el punto mutado):
- Relajar `ID_PATTERN` a `/./` (matchea cualquier cosa) en ambos matchers
  → debe fallar `renders NotFound for a work order id with an invalid format…` y los tests unitarios de rechazo de la tarea 1.
- Endurecer de más (ej. `/^\d{2,}$/`, exige 2+ dígitos) → debe fallar
  `still resolves numeric ids to WorkOrderDetail…` (id `'1'` de un dígito
  deja de matchear) y el test unitario `matches a single numeric segment`.
- Comentar temporalmente la ruta wildcard `**` en `app.routes.ts` → debe
  fallar `renders NotFound for an undefined root route` y
  `renders NotFound for a work order id with an invalid format…`
  (código preexistente, mismo criterio de verificación que en spec 001).
- Resultado anotado en `notes.md`, mismo formato que specs 001-005.

## Fuera de alcance (según el spec)
Orden con id de formato válido que no existe en el backend (spec 003, no
se toca `WorkOrderDetail`/`WorkOrderEdit`/`WorkOrderLoader`); diseño o
contenido visual de `NotFound`; logging/analytics de 404s; rutas de
`dashboard` o `work-orders-list.ts`.

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar.
2. Tras cada tarea 1-2: `pnpm test` en verde.
3. Tarea 3: confirmar los 3 fallos esperados bajo mutación, revertir cada
   uno, confirmar verde.
4. `pnpm lint` y `pnpm build` sin errores.
5. E2E manual: `pnpm api` + `pnpm start`; navegar a una URL inventada →
   ver 404; navegar a `/work-orders/abc` → ver 404 (no el estado de
   "orden no encontrada"); navegar a `/work-orders/1` con una orden real
   → se ve el detalle normal; click en "Volver al inicio" desde el 404 →
   llega al dashboard.
6. Commit solo si se pide; el hook de Husky corre `pnpm test`.
