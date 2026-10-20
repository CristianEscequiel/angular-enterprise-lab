# 20 — Tareas: Cancelar orden

Los tests de cada tarea los escribe `test-writer` antes de implementar (fase de tests en rojo); cada
tarea se da por hecha cuando sus tests pasan y no quedan tests previos en rojo. Comando de test:
`pnpm test` (Vitest vía `ng test`). Todas las tareas son obligatorias. Los nombres de test llevan el id
del criterio que prueban (`REQ-n.m`), también los del detalle y los de la lista que repiten criterios.

## Tareas

- [x] **T1 — Política `canCancelWorkOrder`**
  - Archivo: `src/app/features/work-orders/models/work-order.permissions.ts` (`CANCEL_ROLES` y la función).
  - _Requisitos: REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5_
  - Depende de: nada.
  - Se verifica con: `work-order.permissions.spec.ts`, tests `REQ-1.1` a `REQ-1.5`: matriz de 4 roles
    - `null` por 4 estados.

- [x] **T2 — `WorkOrdersService.cancel(id)`**
  - Archivo: `src/app/features/work-orders/data-access/work-order.service.ts`.
  - _Requisitos: REQ-4.1, REQ-5.1, REQ-5.3, REQ-5.4, REQ-5.5_
  - Depende de: nada.
  - Se verifica con: `work-order.service.spec.ts` con `HttpTestingController`:
    - `REQ-4.1`: `POST .../cancel` sin cuerpo, emite la orden actualizada.
    - `REQ-5.1`: 409 `WORK_ORDER_NOT_PENDING` con `details.status` da `WorkOrderStateError`
      (`reason: 'not-pending'`, `status` igual a `details.status`).
    - `REQ-5.3`: 404 da `WorkOrderLoadError` con `kind: 'not-found'`.
    - `REQ-5.4` y `REQ-5.5`: un 403 y una falla de red se propagan sin tipar (el error original).

- [x] **T3 — Lista: botón y modal por permiso**
  - Archivos: `pages/work-orders-list/work-orders-list.ts` y `.html` (`canCancel`, `cancelModalOpen`,
    `workOrderToCancel`, `cancelMessage`, `openCancelModal`, botón y `<app-modal>`).
  - _Requisitos: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.5, REQ-6.1_
  - Depende de: T1.
  - Se verifica con: `work-orders-list.spec.ts`:
    - `REQ-2.1` y `REQ-2.2`: botón visible solo para administrador y team leader sobre órdenes `pending`;
      ausente para técnico, producción y órdenes en otro estado.
    - `REQ-2.3`: al pulsar abre el modal nombrando la orden, sin llamar a la API.
    - `REQ-2.5`: descartar el modal no llama a la API.
    - `REQ-6.1`: `openCancelModal` sin permiso no abre el modal y avisa.

- [x] **T4 — Lista: confirmación, éxito y errores**
  - Archivos: `pages/work-orders-list/work-orders-list.ts` (`confirmCancel`).
  - _Requisitos: REQ-2.4, REQ-2.6, REQ-2.7, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.6, REQ-6.1_
  - Depende de: T2, T3.
  - Se verifica con: `work-orders-list.spec.ts`:
    - `REQ-2.4`: confirmar llama a `cancel` con el id de la orden.
    - `REQ-2.6` y `REQ-2.7`: éxito muestra el toast, cierra el modal y recarga el listado.
    - `REQ-5.2`: 409 muestra el mensaje del `WorkOrderStateError` y recarga.
    - `REQ-5.3`: 404 avisa que la orden ya no existe y recarga.
    - `REQ-5.4`: 403 no muestra un segundo aviso.
    - `REQ-5.5`: otro error o falla de red muestra el toast genérico y deja la orden sin cambios.
    - `REQ-5.6`: con la llamada en curso el botón de esa fila está deshabilitado y una segunda
      confirmación no dispara otra llamada.
    - `REQ-6.1`: `confirmCancel` sin permiso no llama a la API y avisa.

- [x] **T5 — Detalle: botón y modal por permiso**
  - Archivos: `pages/work-order-detail/work-order-detail.ts` y `.html` (inyección de `AuthService`,
    `MessageService`, `WorkOrdersService`; `canCancel`, `cancelModalOpen`, `cancelMessage`,
    `openCancelModal`, botón y `<app-modal>`).
  - _Requisitos: REQ-2.3, REQ-2.5, REQ-3.1, REQ-3.2, REQ-3.4, REQ-6.1_
  - Depende de: T1.
  - Se verifica con: `work-order-detail.spec.ts`:
    - `REQ-3.1` y `REQ-3.2`: botón visible solo para administrador y team leader con la orden
      `pending`; ausente en el resto.
    - `REQ-3.4`: sin botón mientras carga y cuando falló la carga.
    - `REQ-2.3`: al pulsar abre el modal sin llamar a la API.
    - `REQ-2.5`: descartar el modal no llama a la API.
    - `REQ-6.1`: `openCancelModal` sin permiso no abre el modal y avisa.

- [x] **T6 — Detalle: confirmación, éxito y errores**
  - Archivos: `pages/work-order-detail/work-order-detail.ts` (`confirmCancel`).
  - _Requisitos: REQ-2.4, REQ-2.6, REQ-3.3, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.6, REQ-6.1_
  - Depende de: T2, T5. Independiente de T3 y T4 (archivos distintos).
  - Se verifica con: `work-order-detail.spec.ts`:
    - `REQ-2.4`: confirmar llama a `cancel` con el id de la orden.
    - `REQ-2.6`: éxito muestra el toast y cierra el modal.
    - `REQ-3.3`: éxito muestra el badge `Cancelada` y oculta el botón.
    - `REQ-5.2`: 409 muestra el mensaje y vuelve a cargar la orden.
    - `REQ-5.3`: 404 muestra la alerta "Orden no encontrada" y no queda el botón.
    - `REQ-5.4`: 403 no muestra un segundo aviso.
    - `REQ-5.5`: otro error muestra el toast genérico y deja la orden sin cambios.
    - `REQ-5.6`: con la llamada en curso el botón está deshabilitado y una segunda confirmación no
      dispara otra llamada.
    - `REQ-6.1`: `confirmCancel` sin permiso no llama a la API y avisa.

## Cierre (sin requisito propio)

- [x] **C1 — Verificación global de regresión**
  - Depende de: T1 a T6.
  - Se verifica con: `pnpm test` (suite completa en verde), `pnpm lint` y `pnpm build` sin errores.

## Verificación manual (no automatizable aquí)

El endpoint `POST /work-orders/{id}/cancel` no existe en la API (fuera de alcance). Hasta que se
implemente, probar el flujo real en `dev` da un error al confirmar. Los tests no la necesitan.

## Cobertura de requisitos

| Requisito         | Tarea                    |
| ----------------- | ------------------------ |
| REQ-1.1 a 1.5     | T1                       |
| REQ-2.1, 2.2      | T3                       |
| REQ-2.3, 2.5      | T3 (lista), T5 (detalle) |
| REQ-2.4, 2.6      | T4 (lista), T6 (detalle) |
| REQ-2.7           | T4                       |
| REQ-3.1, 3.2, 3.4 | T5                       |
| REQ-3.3           | T6                       |
| REQ-4.1           | T2                       |
| REQ-5.1           | T2                       |
| REQ-5.2           | T4, T6                   |
| REQ-5.3           | T2, T4, T6               |
| REQ-5.4, 5.5      | T2, T4, T6               |
| REQ-5.6           | T4, T6                   |
| REQ-6.1           | T3, T4, T5, T6           |
