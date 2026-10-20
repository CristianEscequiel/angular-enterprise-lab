# 20 — Cancelar orden (solo TeamLeaderMantenimiento y Administrador)

## Contexto y decisiones

- **Origen:** pedido "Mostrar el botón 'Cancelar orden' solo a TeamLeaderMantenimiento y Administrador".
- **Hallazgo:** hoy no existe ese botón. Una orden pasa a `cancelled` únicamente cuando un técnico la
  cierra desde `/work-orders/:id/resolve` (`POST /work-orders/{id}/close` con `outcome: cancelled`).
  `WorkOrdersService` no tiene un método de cancelación. Por eso esta spec **crea la acción** y la
  restringe por rol; no solo oculta un botón.
- **Decisiones del usuario:**
  - El botón aparece en la **lista de órdenes** (por fila) y en el **detalle de la orden**.
  - Se puede cancelar **solo una orden `pending`**. Una orden `in-progress` se libera primero.
  - El endpoint de cancelación **no existe en la API**. Esta spec cubre **solo el cliente**.
- **Contrato supuesto de la API** (a implementar en `../angular-enterprise-lab-api`; mismo patrón que
  `release`):
  - `POST /work-orders/{id}/cancel`, sin cuerpo; responde `200` con la orden actualizada.
  - `409` con `code: WORK_ORDER_NOT_PENDING` y `details.status` si la orden ya no está `pending`
    (el cliente ya traduce ese código a `WorkOrderStateError` con `reason: 'not-pending'`).
  - `404` si la orden no existe.
  - `403` si el rol no puede cancelar; el aviso lo da el interceptor global, la página no lo duplica.
- **Supuestos aún abiertos (se confirman al aprobar esta fase):**
  - La cancelación **no pide motivo**: solo un modal de confirmación.
  - Los roles `tecnico` y `personal-produccion` no ven el botón.
- **Fuera de alcance:** implementar el endpoint en la API; cancelar órdenes `in-progress`; pedir un
  motivo; cambiar el cierre del técnico por `/resolve`.
- **Regla del repo:** la autorización real es de la API. El cliente decide qué mostrar y traduce los
  errores (`code`/`details`) a errores tipados.
- **Aplicación a ambas pantallas:** los criterios REQ-2.3 a REQ-2.5 y REQ-5.x valen tanto para la
  lista como para el detalle. REQ-2 y REQ-3 solo difieren en dónde está el botón y qué se refresca.

## Requisitos

### REQ-1 — Política de permisos (función pura `canCancelWorkOrder(user, order)`)

- **REQ-1.1** SI el usuario es `administrador` y la orden está `pending`
  ENTONCES EL SISTEMA DEBERÁ permitir cancelarla.
- **REQ-1.2** SI el usuario es `team-leader-mantenimiento` y la orden está `pending`
  ENTONCES EL SISTEMA DEBERÁ permitir cancelarla.
- **REQ-1.3** SI el usuario es `tecnico` o `personal-produccion`
  ENTONCES EL SISTEMA NO DEBERÁ permitir cancelar ninguna orden.
- **REQ-1.4** SI no hay usuario autenticado
  ENTONCES EL SISTEMA NO DEBERÁ permitir cancelar ninguna orden.
- **REQ-1.5** SI la orden está `in-progress`, `completed` o `cancelled`
  ENTONCES EL SISTEMA NO DEBERÁ permitir cancelarla a ningún rol.

### REQ-2 — Lista de órdenes

- **REQ-2.1** SI el usuario puede cancelar una orden de la lista (REQ-1.1 o REQ-1.2)
  ENTONCES EL SISTEMA DEBERÁ mostrar el botón "Cancelar orden" en la fila de esa orden.
- **REQ-2.2** SI el usuario no puede cancelar una orden de la lista
  ENTONCES EL SISTEMA NO DEBERÁ renderizar el botón "Cancelar orden" en su fila.
- **REQ-2.3** CUANDO el usuario pulsa "Cancelar orden"
  EL SISTEMA DEBERÁ abrir un modal de confirmación que nombra la orden, sin llamar a la API.
- **REQ-2.4** CUANDO el usuario confirma la cancelación
  EL SISTEMA DEBERÁ llamar a `WorkOrdersService.cancel(id)` con el id de esa orden.
- **REQ-2.5** CUANDO el usuario descarta el modal de confirmación
  EL SISTEMA NO DEBERÁ llamar a la API y deberá dejar la orden sin cambios.
- **REQ-2.6** CUANDO `cancel(id)` responde con éxito
  EL SISTEMA DEBERÁ cerrar el modal y mostrar un toast de éxito.
- **REQ-2.7** CUANDO `cancel(id)` responde con éxito en la lista
  EL SISTEMA DEBERÁ recargar el listado.

### REQ-3 — Detalle de la orden

- **REQ-3.1** SI el usuario puede cancelar la orden que muestra el detalle
  ENTONCES EL SISTEMA DEBERÁ mostrar el botón "Cancelar orden".
- **REQ-3.2** SI el usuario no puede cancelar esa orden
  ENTONCES EL SISTEMA NO DEBERÁ renderizar el botón "Cancelar orden".
- **REQ-3.3** CUANDO `cancel(id)` responde con éxito en el detalle
  EL SISTEMA DEBERÁ actualizar el badge de estado con la orden devuelta por la API (`Cancelada`) y
  ocultar el botón "Cancelar orden".
- **REQ-3.4** MIENTRAS el detalle está cargando, o si falló la carga
  EL SISTEMA NO DEBERÁ renderizar el botón "Cancelar orden".

### REQ-4 — Servicio

- **REQ-4.1** CUANDO se invoca `WorkOrdersService.cancel(id)`
  EL SISTEMA DEBERÁ enviar `POST /work-orders/{id}/cancel` sin cuerpo y emitir la orden actualizada.

### REQ-5 — Errores

- **REQ-5.1** SI la API responde `409` con `code: WORK_ORDER_NOT_PENDING`
  ENTONCES EL SISTEMA DEBERÁ emitir un `WorkOrderStateError` con `reason: 'not-pending'` y `status`
  igual a `details.status`.
- **REQ-5.2** CUANDO `cancel(id)` falla con un `WorkOrderStateError`
  EL SISTEMA DEBERÁ mostrar su mensaje en un toast, cerrar el modal y refrescar los datos de la orden.
- **REQ-5.3** SI la API responde `404`
  ENTONCES EL SISTEMA DEBERÁ mostrar un aviso de orden no encontrada y cerrar el modal.
- **REQ-5.4** SI la API responde `403`
  ENTONCES EL SISTEMA DEBERÁ cerrar el modal sin mostrar un segundo aviso (ya lo da el interceptor).
- **REQ-5.5** SI falla la conexión
  ENTONCES EL SISTEMA DEBERÁ mostrar un aviso de error de conexión y dejar la orden sin cambios.
- **REQ-5.6** SI la cancelación está en curso
  ENTONCES EL SISTEMA DEBERÁ deshabilitar el botón "Cancelar orden" de esa orden (fila o detalle) e
  ignorar un segundo envío.
  _Enmienda (fase de diseño, aprobada por el usuario): antes decía "deshabilitar el botón de
  confirmación". El `Modal` compartido se cierra solo al confirmar, así que ese botón no puede quedar
  deshabilitado durante la llamada._

### REQ-6 — Defensa en profundidad

- **REQ-6.1** SI se intenta abrir el modal de cancelación sin permiso (por ejemplo, con estado
  desactualizado)
  ENTONCES EL SISTEMA NO DEBERÁ abrir el modal ni llamar a la API, y deberá avisar que no tiene permiso.

## Verificación final

Veredicto de `spec-verifier`: **CERRABLE** (2026-10-16). `pnpm exec ng test --no-watch`: 1966 tests
en verde (67 archivos); `pnpm lint` y `pnpm build` sin errores. Los hashes de los 4 specs coinciden con
`tests-baseline.txt`. No se probó el flujo real contra la API: `POST /work-orders/{id}/cancel` no existe
todavía (fuera de alcance).

| Criterio | ¿Cumplido? | Evidencia                                                                                                                                    |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-1.1  | SÍ         | `work-order.permissions.spec.ts:374`; `canCancelWorkOrder` en `work-order.permissions.ts:95`                                                 |
| REQ-1.2  | SÍ         | `work-order.permissions.spec.ts:378`                                                                                                         |
| REQ-1.3  | SÍ         | `work-order.permissions.spec.ts:385` (tecnico y personal-produccion, todos los estados)                                                      |
| REQ-1.4  | SÍ         | `work-order.permissions.spec.ts:391`                                                                                                         |
| REQ-1.5  | SÍ         | `work-order.permissions.spec.ts:402` y `:408`                                                                                                |
| REQ-2.1  | SÍ         | `work-orders-list.spec.ts:1302`; `canCancel(workOrder)` en `work-orders-list.html:136`                                                       |
| REQ-2.2  | SÍ         | `work-orders-list.spec.ts:1312` y `:1322`                                                                                                    |
| REQ-2.3  | SÍ         | Lista `work-orders-list.spec.ts:1330`; detalle `work-order-detail.spec.ts:496`                                                               |
| REQ-2.4  | SÍ         | Lista `work-orders-list.spec.ts:1340`; detalle `work-order-detail.spec.ts:506`                                                               |
| REQ-2.5  | SÍ         | Lista `work-orders-list.spec.ts:1350` y `:1363`; detalle `work-order-detail.spec.ts:516`                                                     |
| REQ-2.6  | SÍ         | Lista `work-orders-list.spec.ts:1376`; detalle `work-order-detail.spec.ts:532`                                                               |
| REQ-2.7  | SÍ         | `work-orders-list.spec.ts:1388`                                                                                                              |
| REQ-3.1  | SÍ         | `work-order-detail.spec.ts:451`                                                                                                              |
| REQ-3.2  | SÍ         | `work-order-detail.spec.ts:461` y `:468`                                                                                                     |
| REQ-3.3  | SÍ         | `work-order-detail.spec.ts:544` (usa la orden devuelta por la API)                                                                           |
| REQ-3.4  | SÍ         | `work-order-detail.spec.ts:476` (cargando) y `:487` (falló la carga)                                                                         |
| REQ-4.1  | SÍ         | `work-order.service.spec.ts:723`; `work-order.service.ts:211`                                                                                |
| REQ-5.1  | SÍ         | `work-order.service.spec.ts:736`                                                                                                             |
| REQ-5.2  | SÍ         | Lista `work-orders-list.spec.ts:1404`; detalle `work-order-detail.spec.ts:559`                                                               |
| REQ-5.3  | SÍ         | Servicio `work-order.service.spec.ts:754`; lista `work-orders-list.spec.ts:1419`; detalle `work-order-detail.spec.ts:580`                    |
| REQ-5.4  | SÍ         | Servicio `work-order.service.spec.ts:766`; lista `work-orders-list.spec.ts:1435`; detalle `work-order-detail.spec.ts:594`                    |
| REQ-5.5  | SÍ         | Servicio `work-order.service.spec.ts:779`; lista `work-orders-list.spec.ts:1447`; detalle `work-order-detail.spec.ts:606`                    |
| REQ-5.6  | SÍ         | Lista `work-orders-list.spec.ts:1466` y `:1480`; detalle `work-order-detail.spec.ts:626` (según la enmienda: botón de la fila o del detalle) |
| REQ-6.1  | SÍ         | Lista `work-orders-list.spec.ts:1496`, `:1508` y `:1518`; detalle `work-order-detail.spec.ts:646` y `:658`                                   |

Calidad de evidencia: sin hallazgos altos. No hay `skip`, `only`, `todo` ni aserciones vacías.
Observación menor: el 403 se prueba en las páginas con un objeto `{status: 403}` mockeado; el tipado real
de los errores HTTP se prueba en el spec del servicio. Sin desajustes con `tasks.md`. Sin criterios
`NO VERIFICABLE`.
