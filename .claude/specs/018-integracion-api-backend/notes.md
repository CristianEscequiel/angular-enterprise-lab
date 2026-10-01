# Spec 018 — Notas de cierre y verificación

**Fecha:** 1 de octubre de 2026 · **Rama:** `feat/018-integracion-api` · **Tareas:** T1 a T11 hechas
(T12 opcional, solo el registro de abajo).

## Resumen

El frontend dejó de usar JSON Server y consume la API real (Spring Boot + JWT + PostgreSQL). Se
retiraron `json-server`, `db.json`, los interceptores mock, el mock de órdenes, `TechnicianDirectory`,
`UsersService` y el emulador de tests `in-memory-api`. Los servicios quedaron como clientes finos: la
API es la autoridad de unicidad, integridad y transiciones de estado, y el cliente traduce sus
errores (`code` y `details`) a errores tipados que las páginas muestran.

**Pruebas:** 67 archivos y **1901 tests** en verde sin la API levantada (`pnpm test`); `pnpm lint` y
`pnpm build` sin errores. Al empezar eran 2063: la baja neta viene de retirar el emulador y los tests
que verificaban lógica que ahora es del servidor (unicidad, integridad, relecturas), más los nuevos
del contrato.

**Verificación contra la API real:** `verify-contract.mjs` (en esta carpeta) ejecuta 66
comprobaciones de contrato con el perfil `dev` — **66/66 OK** (ver REQ-13).

## Desviaciones respecto de la spec

| #   | Desvío                                                                                                                                                                | Motivo                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Se eliminaron `db.seed.spec.ts`, `mock-api.interceptor.ts` y `mock-delay.interceptor.ts` antes de T9 (en T3 y T6)                                                     | Dependían de código retirado en esas tareas; T9 los borraba igual                                                                                                                |
| 2   | Se eliminaron `machines-tree.integration.spec.ts`, `work-order-closure.integration.spec.ts` y el viejo `work-order-create.integration.spec.ts`                        | Probaban el emulador de JSON Server. La alta se reescribió; el resto del contrato queda en los specs de los servicios                                                            |
| 3   | `machine-parts.spec.ts` usa `features/machines/testing/machines-api.fake.ts` (servidor en memoria que cumple el contrato de la API) en vez de `HttpTestingController` | Reescribir ~1000 líneas con mocks perdía los escenarios de "otro usuario cambió algo". El fake implementa solo las rutas de máquinas y partes y falla fuerte ante cualquier otra |
| 4   | El interceptor de errores también omite el toast del `401` de `/auth/login` y `/auth/me`                                                                              | Evita duplicar el mensaje inline del login y el descarte silencioso de la sesión                                                                                                 |
| 5   | `errorMessage()` ignora el `message` genérico de `HttpErrorResponse`                                                                                                  | Sin cuerpo de la API se usa el texto de respaldo del servicio                                                                                                                    |
| 6   | `WorkOrderStateError.takenBy` pasó de `WorkOrderTaker` a `{id, name}`                                                                                                 | El `409` no trae el instante de la toma (previsto en el diseño, D-7)                                                                                                             |

## Verificación de criterios (requirements.md)

Evidencia: `T` = test automatizado (archivo), `API` = comprobación de `verify-contract.mjs` contra la API
real. No se hizo un recorrido manual de la interfaz en un navegador (ver "Pendientes").

### REQ-1 Configuración

| Criterio                                   | Cumple | Evidencia                                                             |
| ------------------------------------------ | ------ | --------------------------------------------------------------------- |
| 1.1 URL base única `http://localhost:8080` | Sí     | `core/config/api.config.ts`; `grep localhost:3000 src` sin resultados |
| 1.2 Servicios derivan de `API_BASE_URL`    | Sí     | `grep` de URLs absolutas en servicios: ninguna                        |
| 1.3 Sin header a URLs ajenas               | Sí     | T `auth.interceptor.spec.ts` (“does not leak the token…”)             |

### REQ-2 Errores

| Criterio                                           | Cumple | Evidencia                                                                                                                               |
| -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Muestra el `message` de la API                 | Sí     | T `error.interceptor.spec.ts`; en `409` y `400` con detalle lo muestra la página (desvío 4 y diseño D-2)                                |
| 2.2 `400` con `details` expuesto                   | Sí     | T `error.interceptor.spec.ts`, `work-order.service.spec.ts` (`WorkOrderValidationError`); API: `VALIDATION_ERROR` con details por campo |
| 2.3 Sin cuerpo → mensaje genérico                  | Sí     | T `error.interceptor.spec.ts` (`it.each` por status, incluido 0 y 502)                                                                  |
| 2.4 `403` mensaje fijo y sesión conservada         | Sí     | T `error.interceptor.spec.ts` (“keeps the session on a 403”)                                                                            |
| 2.5 `401` cierra sesión y redirige con `returnUrl` | Sí     | T `error.interceptor.spec.ts` (“closes the session and redirects…”)                                                                     |
| 2.6 `409` entrega `code` y `details`               | Sí     | T `error.interceptor.spec.ts`, specs de los servicios                                                                                   |
| 2.7 Sin `console.log` de depuración                | Sí     | `grep console.log core/interceptors` sin resultados                                                                                     |

### REQ-3 Sesión

| Criterio                                             | Cumple | Evidencia                                                                  |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 3.1 `POST /auth/login` y guarda `{token,user}`       | Sí     | T `auth.service.spec.ts`; API: 5 logins                                    |
| 3.2 `401` → “Usuario o contraseña incorrectos.”      | Sí     | T `auth.service.spec.ts`, `login-page.spec.ts`; API: `INVALID_CREDENTIALS` |
| 3.3 Conexión / `5xx` distinto de credenciales        | Sí     | T `auth.service.spec.ts` (status 0 y 500)                                  |
| 3.4 Usa el `user` tal cual, sin consultar el maestro | Sí     | T `auth.service.spec.ts` (“…without querying anything else”)               |
| 3.5 Perfil inválido rechazado                        | Sí     | T `auth.service.spec.ts` (6 variantes + no técnico con atributos)          |
| 3.6 Revalida con `/auth/me` al arrancar              | Sí     | T `auth.service.spec.ts`, `app.config.spec.ts`                             |
| 3.7 `401` de `/auth/me` descarta la sesión           | Sí     | T `app.config.spec.ts`; API: token alterado → 401                          |
| 3.8 Falla de conexión conserva la sesión             | Sí     | T `auth.service.spec.ts`, `app.config.spec.ts`                             |
| 3.9 Logout borra la sesión guardada                  | Sí     | T `auth.service.spec.ts` (grupo `logout`)                                  |
| 3.10 Contrato público de `AuthService` intacto       | Sí     | guards, interceptor y páginas no se modificaron; sus specs pasan           |

### REQ-4 Técnicos

| Criterio                                        | Cumple | Evidencia                                                            |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------- |
| 4.1 Listado `GET /technicians`                  | Sí     | T `technicians.service.spec.ts`; API                                 |
| 4.2 Detalle `GET /technicians/{legajo}`         | Sí     | T idem; API (el `id` del servidor ≠ legajo)                          |
| 4.3 Alta `POST /technicians`                    | Sí     | T idem; API                                                          |
| 4.4 Edición `PUT /technicians/{legajo}`         | Sí     | T idem; API                                                          |
| 4.5 Baja `DELETE /technicians/{legajo}`         | Sí     | T idem; API                                                          |
| 4.6 `409` muestra el motivo y conserva la fila  | Sí     | T `technicians-list.spec.ts`; API: `TECHNICIAN_IN_USE` con el motivo |
| 4.7 Legajo repetido en el campo                 | Sí     | T `technician-form.spec.ts`; API: `DUPLICATE_LEGAJO`                 |
| 4.8 Sin `TechnicianDirectory` ni `UsersService` | Sí     | `grep` sin resultados                                                |

### REQ-5 Equipos

| Criterio                                                         | Cumple | Evidencia                                                    |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| 5.1–5.5 Listar, abrir, crear, guardar (lista completa), eliminar | Sí     | T `teams.service.spec.ts`; API (`PUT` sin `id` en el cuerpo) |
| 5.6 `UNKNOWN_TECHNICIAN` conserva la selección                   | Sí     | T `teams.service.spec.ts`, `team-form`; API                  |
| 5.7 `404` → “no existe”                                          | Sí     | T `teams.service.spec.ts` (`TeamLoadError`)                  |

### REQ-6 y REQ-7 Máquinas y partes

| Criterio                                          | Cumple | Evidencia                                                            |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| 6.1 `GET /machines` con `partCount`               | Sí     | T `machines.service.spec.ts`, `machines-list.spec.ts`; API           |
| 6.2 `GET /machines/{id}`                          | Sí     | T idem; API                                                          |
| 6.3 Alta y edición directas, sin lecturas previas | Sí     | T `machines.service.spec.ts` (un solo request)                       |
| 6.4 `DUPLICATE_MACHINE_CODE` en el campo          | Sí     | T `machine-form.spec.ts`; API                                        |
| 6.5 Baja directa                                  | Sí     | T `machines.service.spec.ts`                                         |
| 6.6 `MACHINE_HAS_PARTS` conserva la máquina       | Sí     | T `machines-list.spec.ts`; API                                       |
| 6.7 `404` → “no existe”                           | Sí     | T `machine-form.spec.ts`                                             |
| 7.1 Partes por `GET /machines/{id}/parts`         | Sí     | T `parts.service.spec.ts`; API                                       |
| 7.2 Alta por `POST /machines/{id}/parts`          | Sí     | T idem; API                                                          |
| 7.3 `PATCH /parts/{id}` solo `{name}`             | Sí     | T idem; API                                                          |
| 7.4 `DELETE /parts/{id}`                          | Sí     | T idem                                                               |
| 7.5 `PART_HAS_CHILDREN` conserva la parte         | Sí     | T `machine-parts.spec.ts`; API                                       |
| 7.6 `PARENT_PART_*` muestra y recarga             | Sí     | T `machine-parts.spec.ts`; API                                       |
| 7.7 Sin listado global de partes                  | Sí     | T `parts.service.spec.ts` (“does not expose a global parts listing”) |

### REQ-8 a REQ-10 Órdenes

| Criterio                                                | Cumple | Evidencia                                                                       |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 8.1 `page` desde 1 y `size`                             | Sí     | T `work-order.service.spec.ts`; API                                             |
| 8.2–8.3 `title`, `status`, `priority` (vacíos omitidos) | Sí     | T idem; API                                                                     |
| 8.4 Paginación con `totalItems` / `totalPages`          | Sí     | T `work-orders-list.spec.ts`                                                    |
| 8.5 Estado vacío                                        | Sí     | T `work-orders-list.spec.ts` (ya existía y pasa)                                |
| 8.6 Error con “Reintentar”                              | Sí     | T `work-orders-list.spec.ts`                                                    |
| 8.7 Detalle: `404` vs conexión                          | Sí     | T `work-order.service.spec.ts`, `work-order-loader.spec.ts`                     |
| 8.8 Fechas como instantes UTC ISO                       | Sí     | `work-order.dates.ts` sin cambios; API devuelve `Instant`                       |
| 9.1 Alta sin `status`/`createdAt`/`breadcrumb`          | Sí     | T `work-order.service.spec.ts`, `work-order-create.integration.spec.ts`         |
| 9.2 Muestra `breadcrumb` y estado del servidor          | Sí     | API: `breadcrumb` “Máquina > Cinta 2 > Motor”, `status` `pending`               |
| 9.3 `MACHINE_NOT_FOUND` / `PART_*` en el selector       | Sí     | T `work-order-create.spec.ts`, integración; API: `PART_OTHER_MACHINE`           |
| 9.4 Errores por campo                                   | Sí     | T idem; API: `VALIDATION_ERROR` con details                                     |
| 9.5 `PUT` solo título, descripción y prioridad          | Sí     | T `work-order-edit.spec.ts`, servicio; API                                      |
| 9.6 Baja `DELETE`                                       | Sí     | T `work-orders-list.spec.ts`; API                                               |
| 9.7 `403` conserva la pantalla sin mensaje extra        | Sí     | T create, edit, list; API: `PUT` producción → 403                               |
| 9.8 `404` → “no existe”                                 | Sí     | T `work-order-edit.spec.ts`, `work-orders-list.spec.ts`                         |
| 10.1 `take` sin cuerpo                                  | Sí     | T `work-order.service.spec.ts`; API                                             |
| 10.2 `close` con `{outcome, comment}` recortado         | Sí     | T idem; API                                                                     |
| 10.3 `release`                                          | Sí     | T idem; API                                                                     |
| 10.4 Validación 50–500 en el cliente                    | Sí     | T idem (límites 49/50/500/501)                                                  |
| 10.5 Los tres `409` con `details`                       | Sí     | T idem; API: `WORK_ORDER_NOT_PENDING` con `status`, `takenById`, `takenByName`  |
| 10.6 Recarga tras `409`                                 | Sí     | T `work-orders-list.spec.ts`, `work-order-resolve.spec.ts`                      |
| 10.7 `403` en `take`                                    | Sí     | T `work-orders-list.spec.ts`; API: técnico de guardia sobre un correctivo → 403 |
| 10.8 Sin dueño/autor en el cuerpo ni relecturas         | Sí     | T `work-order.service.spec.ts` (cuerpo `null` y `['comment','outcome']`)        |

### REQ-11 Dashboard

| Criterio                                          | Cumple | Evidencia                                                                |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| 11.1 Pide `summary` sin período                   | Sí     | T `dashboard-page.spec.ts`, `dashboard.service.spec.ts`; API             |
| 11.2 Listas por estado con `size` máximo          | Sí     | T idem; API: `size=100` y `size=101` → 400                               |
| 11.3 Aviso “primeras N de M”                      | Sí     | T `dashboard-page.spec.ts` (pendientes y cerradas sumadas)               |
| 11.4 Administrador y team leader piden `workload` | Sí     | T idem; API                                                              |
| 11.5 El resto no lo pide ni lo ve                 | Sí     | T idem; API: técnico → 403                                               |
| 11.6 Promedio `null` → “Sin datos”                | Sí     | T idem, `dashboard.model.spec.ts`                                        |
| 11.7 Cualquier falla → error con “Reintentar”     | Sí     | T `dashboard-page.spec.ts` (resumen, lista, carga de trabajo, reintento) |

### REQ-12 Retiro del mock

| Criterio                                                      | Cumple | Evidencia                                        |
| ------------------------------------------------------------- | ------ | ------------------------------------------------ |
| 12.1 Interceptores, mock y emulador eliminados                | Sí     | `git show 00f5cef --stat`                        |
| 12.2 `db.json`, seed spec, script `api` y `json-server` fuera | Sí     | `package.json` y lockfile; `grep` sin resultados |
| 12.3 Integraciones reescritas con el contrato real            | Sí     | ver desvíos 2 y 3                                |
| 12.4 `pnpm test` pasa sin la API                              | Sí     | corrido con la API apagada en cada tarea         |
| 12.5 `pnpm build` y `pnpm lint` sin errores                   | Sí     | corridos al cierre de cada tarea                 |
| 12.6 README y CLAUDE.md actualizados                          | Sí     | commit `e502045`                                 |

### REQ-13 Verificación contra la API real

| Criterio                                               | Cumple      | Evidencia                                                                                                                                                            |
| ------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.1 Los cinco usuarios del seed                       | Sí          | API: logins y `/auth/me` de `admin`, `teamleader`, `produccion`, `tecnico`, `electricista` con rol, nombre y perfil correctos                                        |
| 13.2 Flujo completo sin errores de CORS ni de contrato | **Parcial** | API: máquina → partes → orden → tomar → `409` → cerrar → liberar → dashboard, y el preflight de CORS desde `:4200` responde bien. **No se recorrió en un navegador** |
| 13.3 Resultado registrado                              | Sí          | este archivo + `verify-contract.mjs`                                                                                                                                 |

## Hallazgos de la verificación contra la API

- **Ninguna discrepancia de contrato.** Los 66 casos coinciden con lo que el diseño asumía, incluidos
  los `code`, los `details` de los `409` y la forma del listado.
- La API que respondió ya estaba levantada (`/actuator/health` UP) antes de la verificación.
- La verificación creó y borró datos propios (máquina, dos partes, una orden, un técnico y un equipo).
  Los **contadores de ids** de la base avanzaron (la próxima máquina ya no es la `4`, ni la próxima
  orden la `33`); los datos del seed quedaron intactos.
- El `409` de baja de técnico trae un mensaje que ya enumera los motivos (“tiene un usuario de acceso;
  es miembro de: Guardia mecánica”), que el listado muestra tal cual.
- El resumen de la base de desarrollo: 33 órdenes, 21 abiertas; la carga de trabajo del team leader
  lista a dos técnicos con 8 y 1 órdenes en curso.

## Riesgos y límites conocidos

- **“Cerradas hoy” se calcula en el cliente** sobre la primera página (hasta 100) de `completed` y
  `cancelled`: la API no filtra por fecha de cierre y su orden por defecto no está documentado. Con el
  seed (9 y 2 cerradas) no hay problema; con más de 100 podría omitirse alguna de hoy.
- El tablero hace ocho pedidos al abrir (resumen, cuatro listas y, según el rol, la carga de trabajo).
  No hay caché; la API calcula en el momento.
- El token dura 60 minutos y no hay refresh: al vencer, el primer `401` cierra la sesión y lleva a
  `/login`. Es lo que la spec dejó fuera de alcance.
- `machines-api.fake.ts` replica el contrato de la API solo para máquinas y partes. Si la API cambia, hay
  que actualizarlo a mano; `verify-contract.mjs` es la red de seguridad contra ese desvío.

## Pendientes fuera de alcance

- **T12 (opcional):** pedir a la API un filtro de fecha de cierre (`closedFrom`/`closedTo`) en
  `GET /work-orders` y, si se hace, simplificar el cálculo de “cerradas hoy”. Hoy solo queda registrado
  acá; no se abrió ningún pedido en el repositorio de la API.
- **Recorrido manual de la interfaz en un navegador** contra la API (login por rol, alta de máquina y
  parte, alta, toma, cierre y liberación de una orden, tablero por rol, `401` al vencer el token y `403`
  de un técnico sobre un tipo que su equipo no atiende). Lo cubren los tests y el script de contrato,
  pero nadie lo hizo a mano todavía.
- Ejecutar `./gradlew test` del repositorio de la API y ver el CI en verde sigue siendo pendiente de
  ese proyecto, no de este.

## Cómo repetir la verificación

```bash
# API con el perfil dev ya levantada en localhost:8080
node .claude/specs/018-integracion-api-backend/verify-contract.mjs
```

El script crea y borra sus propios datos; no toca el seed.
