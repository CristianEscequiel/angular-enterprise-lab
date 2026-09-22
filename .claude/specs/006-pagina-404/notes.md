# Notas 006: ejecución

## Resultado

- Baseline: 21 archivos / 92 tests en verde (heredado de spec 005).
- Final: 23 archivos / 104 tests en verde (+12: 8 en
  `work-orders.routes.spec.ts` (archivo nuevo), 4 en `app.routes.spec.ts`
  (archivo nuevo)).

## Diagnóstico confirmado

- La ruta wildcard (`app.routes.ts:22-26`) y el componente `NotFound` ya
  existían y ya cubrían rutas raíz inexistentes y rutas dentro de
  `/work-orders/...` con segmentos extra — solo faltaban tests.
- El hueco real era que `path: ':id'`/`':id/edit'` no restringían
  formato: cualquier string de un segmento matcheaba y cargaba
  `WorkOrderDetail`, aunque no pareciera un id real.

## Cambios de producción

1. `work-orders.routes.ts`: `matchWorkOrderId`/`matchWorkOrderIdEdit`
   (`UrlMatcher` custom, formato `^\d+$`, exportados para test unitario)
   reemplazan `path: ':id'`/`':id/edit'`. `posParams: { id: segments[0] }`
   mantiene `paramMap.get('id')` funcionando igual — no se tocó
   `WorkOrderDetail` ni `WorkOrderEdit`.
2. Sin cambios en `app.routes.ts` ni en `NotFound` — ya cumplían el spec.

## Nota sobre las pruebas

Primera vez en el repo que se usa `RouterTestingHarness`
(`@angular/router/testing`) para probar resolución de rutas de punta a
punta con las rutas reales de la app (`app.routes.spec.ts`). Los specs
de página existentes mockean `ActivatedRoute` directamente, lo cual no
alcanza para probar "esta URL cae en la wildcard" — hacía falta esta
herramienta. Se mockeó `WorkOrdersService` a nivel de `TestBed` para
evitar HTTP real en los casos donde sí se llega a cargar
`WorkOrderDetail`/`WorkOrderEdit`.

## Verificación por mutación (tarea 3)

Mutaciones temporales, confirmadas y revertidas (`git diff` limpio tras
revertir).

| Mutación                                                  | Archivo                 | Tests que fallaron                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID_PATTERN` relajado a `/./` (matchea cualquier cosa)    | `work-orders.routes.ts` | `renders NotFound for a work order id with an invalid format...` (`app.routes.spec.ts`), `rejects a non-numeric segment` y `rejects a non-numeric id` (`work-orders.routes.spec.ts`)                     |
| `ID_PATTERN` endurecido a `/^\d{2,}$/` (exige 2+ dígitos) | `work-orders.routes.ts` | `still resolves numeric ids to WorkOrderDetail and WorkOrderEdit` (el id real `'1'`, de un dígito, deja de matchear)                                                                                     |
| Quitar la ruta wildcard `**` (código preexistente)        | `app.routes.ts`         | `renders NotFound for an undefined root route`, `renders NotFound for a work order id with an invalid format...`, `navigates back to /dashboard from the 404 page's link` (los 3 dependían del wildcard) |

## Verificación adicional

- `pnpm lint`: sin errores.
- `pnpm build`: build de producción correcto.

## Pendiente

- README: no incluido como tarea obligatoria del plan; se ofrece al
  usuario igual que en specs 002-005.
- Verificación E2E manual (`pnpm api` + `pnpm start`) no se ejecutó.
