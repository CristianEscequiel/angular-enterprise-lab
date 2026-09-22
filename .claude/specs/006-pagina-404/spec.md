# Spec: Página 404 y validación de formato de id en rutas de work-orders

## Problema actual

Revisando `app.routes.ts` y `work-orders.routes.ts`: la ruta wildcard
(`path: '**'`) y el componente `NotFound` **ya existen** y ya cubren las
rutas raíz inexistentes (ej. `/algo-que-no-existe`) y cualquier ruta
dentro de `/work-orders/...` que no matchee ninguna ruta hija (ej.
`/work-orders/1/2/3`), porque el router de Angular hace backtracking a
nivel global cuando ningún hijo matchea.

Lo que **no** está cubierto: la ruta `:id` de `work-orders.routes.ts` no
tiene ninguna restricción de formato — Angular matchea cualquier string
de un solo segmento contra `:id`, sin regex ni validación. Los ids reales
son numéricos simples (`"1"`, `"2"`... confirmado en `db.json`, generados
por json-server), pero hoy `/work-orders/abc`, `/work-orders/%20` o
`/work-orders/!!!` matchean igual la ruta `:id`, cargan `WorkOrderDetail`,
que hace `getById('abc')`, recibe un 404 del backend, y termina mostrando
el estado "Orden no encontrada" de spec `003-estados-error-detalle-edicion`
— **no** la página 404 de routing.

Esto mezcla dos conceptos distintos que deberían distinguirse:
- Id con **formato inválido** (no es un identificador que la app podría
  reconocer) → es un problema de *ruta*, debería ser la 404 de routing.
- Id con **formato válido que no existe** en el backend → es un problema
  de *datos*, ya cubierto por el estado de error de spec 003.

## Requisitos

- Ruta wildcard que capture cualquier path no definido (ya existe —
  confirmar con test de integración, no solo dar por sentado que funciona).
- Componente 404 con mensaje claro y forma de volver (a `/dashboard` o
  `/work-orders`) (ya existe — confirmar con test).
- Debe funcionar tanto para rutas raíz inexistentes como para rutas
  dentro de `/work-orders` con **id inválido en formato** — un id que no
  matchee el formato esperado debe caer en la página 404 de routing, no
  en `WorkOrderDetail`.
- Un id con formato válido pero que no existe en el backend debe seguir
  yendo a `WorkOrderDetail` y mostrando su propio estado de error (spec
  003) — este spec no debe romper ese flujo.

## Nota para plan mode

Angular no soporta una regex directamente en `path: ':id'` — para
restringir el formato hace falta un `UrlMatcher` custom (la función
`matcher` en la definición de la ruta, en vez de `path`), que decide si
matchea leyendo los `UrlSegment[]` a mano y devuelve `posParams` para
mantener `ActivatedRoute.paramMap.get('id')` funcionando igual que hoy.

Definir qué es "formato válido": según los datos reales del mock
(`db.json`) y lo que genera json-server, los ids son strings numéricos
simples. Se puede optar por una validación más laxa (cualquier alfanumérico
sin espacios/símbolos) si se prefiere no acoplarse de más al backend
actual — es una decisión a tomar en el plan, con el código real a la
vista, no una obligación de este spec.

## Fuera de alcance

- Orden con id de formato válido que no existe en el backend (spec 003,
  no se toca `WorkOrderDetail`/`WorkOrderEdit`/`WorkOrderLoader`).
- Diseño o contenido visual del componente `NotFound` más allá de
  confirmar que ya cumple "mensaje claro + forma de volver".
- Logging/analytics de accesos a rutas inexistentes.
- Cualquier cambio en `work-orders-list.ts` o en las rutas de `dashboard`.

## Criterio de aceptación (con estado de fallo explícito)

- Test: navegar a una ruta raíz que no existe (ej. `/algo-inexistente`)
  → debe renderizar `NotFound`.
  **Debe fallar** si la ruta wildcard no está configurada o si la
  navegación termina en otra pantalla.

- Test: navegar a `/work-orders/<id con formato inválido>` (ej. letras,
  símbolos) → debe renderizar `NotFound`, **sin** que `WorkOrderDetail`
  llegue a instanciarse ni a pedir el recurso por HTTP.
  **Debe fallar** si `WorkOrderDetail` se carga para ese id.

- Test (no-regresión): navegar a `/work-orders/<id numérico válido>` y a
  `/work-orders/<id numérico válido>/edit` → deben seguir resolviendo a
  `WorkOrderDetail`/`WorkOrderEdit` respectivamente, no al wildcard.
  **Debe fallar** si la restricción de formato es tan estricta que rompe
  el caso válido.

- Test: desde la página 404, click en el link de volver → navega a
  `/dashboard` (o `/work-orders`, según lo que decida el plan).
  **Debe fallar** si el link no navega o apunta a una ruta rota.
