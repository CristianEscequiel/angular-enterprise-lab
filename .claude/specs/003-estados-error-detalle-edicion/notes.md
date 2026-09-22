# Notas 003: ejecución

## Resultado

- Baseline: 20 archivos / 55 tests en verde.
- Final: 21 archivos / 73 tests en verde (+13: 5 en `work-order.service.spec.ts`,
  5 en `work-order-loader.spec.ts` (archivo nuevo), 4 en `work-order-detail.spec.ts`,
  4 en `work-order-edit.spec.ts`).
- **A diferencia de 001 y 002, este spec sí requirió código de producción
  nuevo** (ver spec, requisito de distinguir 404 vs conexión — no existía
  ninguna versión previa de ese comportamiento para blindar).

## Hallazgo antes de implementar

El diagnóstico del plan se confirmó al leer el código: tanto
`work-order-detail.ts` como `work-order-edit.ts` redirigían en silencio a
`/work-orders` ante _cualquier_ error (`error: () => this.router.navigate([...])`).
No había toast persistente ni pantalla en blanco que "arreglar" — directamente
no había chance de ver ningún estado de error. Se reemplazó por el patrón
persistente que pide el spec.

## Cambios de producción

1. `work-order.service.ts`: nuevo `WorkOrderLoadError` (con `kind: 'not-found' | 'connection'`)
   y `getById` ahora lee `status` del error (funciona tanto si viene
   envuelto por `errorInterceptor` como si es un `HttpErrorResponse` crudo,
   porque ambos exponen `.status`).
2. `work-order-loader.ts` (nuevo): `WorkOrderLoader`, inyectable sin
   `providedIn: 'root'`, provisto por componente. Extrae la lógica de
   carga+error+reintento que antes estaba duplicada carácter por carácter
   en detalle y edición.
3. `work-order-detail.ts/.html` y `work-order-edit.ts/.html`: usan el
   loader, muestran `app-alert` + botón "Reintentar" (mismo patrón que
   `work-orders-list.html`) distinguiendo "no encontrada" de "conexión".
4. Se eliminó el método muerto `getWorkOrderDetail` en `work-order-detail.ts`
   (no tenía ningún call site).

## Verificación por mutación (tarea 5)

Mutaciones temporales sobre el código final (no se revierte el spec
completo, solo el punto mutado), confirmadas y revertidas con `git diff`.

| Mutación                                     | Archivo                 | Tests que fallaron                                                                                                                |
| -------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Invertir `status === 404` → `status !== 404` | `work-order.service.ts` | Los 4 tests de `getById` en `work-order.service.spec.ts` (404 y los 3 casos de `it.each` para conexión)                           |
| Vaciar el cuerpo de `retry()`                | `work-order-loader.ts`  | `retry re-issues the request…` (loader), `retrying after an error…` en `work-order-detail.spec.ts` y en `work-order-edit.spec.ts` |

Ambas mutaciones se revirtieron; `git diff --stat` sobre `work-order.service.ts`
tras revertir coincide exactamente con los cambios de la tarea 1 (sin
residuo de la mutación).

## Verificación adicional

- `pnpm lint`: sin errores.
- `pnpm build`: build de producción correcto (incluye los chunks
  `work-order-detail` y `work-order-edit` actualizados).

## Pendiente

- Tarea 6 (README): opcional, no se tocó — pendiente confirmación del usuario.
- Verificación E2E manual (`pnpm api` + `pnpm start`, incluyendo apagar
  json-server para forzar el caso de conexión) no se ejecutó.
