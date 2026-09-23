# Notas 013b: ejecución

## Resultado

35 archivos / 523 tests en verde (baseline 34 archivos / 334 tests → +189
tests, +1 archivo). `pnpm lint`, `pnpm build`, `tsc --noEmit` (app y specs) y
`prettier --check` sin errores.

| Tarea | Área             | Archivos nuevos / tocados                                                                            | Tests                                            |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1     | Modelo de rol    | `core/auth/auth.model.ts` (4 roles, especialidad, tipo de equipo, `AuthUser` como unión)             | `auth.model.spec.ts` reescrito                   |
| 2–4   | Login y fixtures | `auth.service.ts` (`InvalidUserRecordError`), `auth.model.ts` (`toAuthUser`), `db.json` (5 usuarios) | +34 en total con la tarea 1 (368)                |
| 5     | Guard genérico   | `auth.guard.ts` (`requireUser`; `requireRole` pasa a apoyarse en él)                                 | +15 (`auth.guard.spec.ts`)                       |
| 6     | Tipo de orden    | `work-order.model.ts`, `work-order.display.ts` (`TYPE_LABELS`), `work-order.mock.ts` y fixtures      | +16                                              |
| 7     | Datos            | `db.json` (`type` en las 29 órdenes)                                                                 | — (el test de `create()` va en la tarea 9)       |
| 8     | Política         | `work-order.permissions.ts` (nuevo)                                                                  | +51 (`work-order.permissions.spec.ts`, nuevo)    |
| 9     | Formulario       | `form.ts/.html` (`type`, `allowedTypes`, `lockType`), `WorkOrderCreateRequest.type`                  | +13 (11 del form, 2 del servicio)                |
| 10    | Crear            | `work-order-create.ts/.html` (`allowedTypes` por rol y re-chequeo en el envío)                       | +10                                              |
| 11    | Rutas            | `work-orders.routes.ts` (`requireUser` en `new` y `:id/edit`)                                        | +18 (`app.routes.spec.ts`, con las rutas reales) |
| 12    | Editar           | `work-order-edit.ts/.html` (`lockType`, el PUT conserva el tipo)                                     | +5                                               |
| 13    | Listado          | `work-orders-list.ts/.html` (permisos por rol, columna Tipo)                                         | +13                                              |
| 14    | Detalle          | `work-order-detail.ts/.html`                                                                         | +3                                               |
| 15    | Cierre           | tests de `toAuthUser` (cobertura de `auth.model.ts`), estas notas y el README                        | +11                                              |

## Decisiones tomadas

- **Nombres en inglés, valores en español**, como ya estaba el código:
  `role`, `specialty`, `teamType` con valores `'team-leader-mantenimiento'`,
  `'mecanico'`, `'guardia'`, etc. No se renombró `role` a `rol`.
- **`AuthUser` es una unión discriminada por `role`.** `TechnicianUser`
  tiene `specialty` y `teamType` obligatorios; `StaffUser` (los otros tres
  roles) no los tiene. El compilador exige comprobar `role === 'tecnico'`
  (o `isTechnician`) antes de leerlos.
- **`isAuthUser` es estricto en los dos sentidos.** Rechaza un técnico sin
  alguno de sus atributos (o con un valor inválido) y un no-técnico que los
  traiga. Cada atributo se valida por separado.
- **Sesiones viejas descartadas.** Las guardadas con `role: 'admin'` (y las
  sin rol, de 010) no pasan `isAuthSession`; `restoreSession()` las borra y
  hay que volver a loguearse. Igual criterio que 011: no otorgar un permiso
  por defecto a partir de lo guardado en storage.
- **`toAuthUser(record)` arma el usuario de sesión.** Copia `specialty` y
  `teamType` solo si el rol es técnico, nunca `password`, y devuelve `null`
  si el registro no da un perfil válido. Un registro de un no-técnico con
  esos campos de más se acepta y se descartan (no es un error del usuario).
- **`InvalidUserRecordError`, distinto de `InvalidCredentialsError`.**
  Credenciales correctas pero perfil inválido (p. ej. técnico sin
  especialidad) no debe mostrarse como "usuario o contraseña incorrectos".
  `LoginPage` lo muestra inline: sin eso el login fallaba en silencio, porque
  el `errorInterceptor` solo avisa de errores de conexión.
- **`requireUser(predicate)` es el guard genérico** y `requireRole` se apoya
  en él. Resuelve en un solo lugar los tres desenlaces: sin sesión → login
  con `returnUrl`; con sesión sin permiso → aviso "Acceso denegado" +
  `/dashboard`; con permiso → pasa. `authGuard` y `guestGuard` no se tocaron,
  así que el retorno tras el login y el guard inverso de `/login` siguen
  como en 011.
- **Política de permisos en `features/work-orders/models/`** (no en `core`),
  para que `core/auth` siga sin importar de `features`. Guards, páginas y
  listado consultan la misma tabla:

  | Acción                          | Permitido a                                    |
  | ------------------------------- | ---------------------------------------------- |
  | Crear `pronto-intervencion`     | `personal-produccion`                          |
  | Crear `preventivo`/`correctivo` | `team-leader-mantenimiento`                    |
  | Editar cualquier orden          | `team-leader-mantenimiento`, `administrador`   |
  | Eliminar orden                  | `administrador`                                |
  | Gestionar (técnico)             | `tecnico`, según especialidad y tipo de equipo |

- **Eliminar no es una ruta**, así que un `CanActivate` no puede bloquearlo.
  El criterio "bloqueado por el guard" se cumple con la misma política:
  el listado oculta el botón, `openDeleteModal()` no abre la confirmación y
  `deleteWorkOrder()` sale con aviso sin llamar a `DELETE`.
- **`type` en `WorkOrder`:** `preventivo | correctivo | pronto-intervencion`.
  Se elige al crear y no se puede cambiar: en edición el select va
  deshabilitado y, además, la página fuerza `type: current.type` en el PUT,
  sin depender de lo que emita el formulario. Un cambio solo de tipo no
  cuenta como cambio.
- **Doble control al crear.** El formulario ofrece solo `creatableTypes(user)`
  y `onSubmit` vuelve a validar `canCreateWorkOrder(user, type)`; la ruta
  `/work-orders/new` tiene además su guard. Tres capas, una sola regla.
- **`canTechnicianHandle(user, { type, specialty })`** es la consulta que el
  spec pedía "desde ya". La especialidad requerida por la orden es un
  parámetro (`mecanico | electricista`), no un campo de `WorkOrder`: eso es
  de 013d. `general` es comodín de **especialidad**, no de tipo de equipo.
  `guardia` ↔ `pronto-intervencion`; `preventivo-correctivo` ↔ `preventivo` y
  `correctivo`.
- **Tipos asignados a las 29 órdenes de `db.json`** por lo que dice cada
  descripción: 3 `pronto-intervencion` (12, 20, 27: equipo que ya falla en
  producción), 6 `correctivo` (1, 4, 7, 15, 16, 21: falla detectada que se
  repara) y 20 `preventivo` (inspecciones, limpiezas, lubricación,
  calibraciones y controles).
- **Usuarios de prueba** (`db.json`; los dos primeros conservan id y
  contraseña de antes):

  | Usuario        | Contraseña        | Rol                         | Especialidad / equipo                    |
  | -------------- | ----------------- | --------------------------- | ---------------------------------------- |
  | `admin`        | `admin123`        | `administrador`             | —                                        |
  | `tecnico`      | `tecnico123`      | `tecnico`                   | `mecanico` / `guardia`                   |
  | `teamleader`   | `teamleader123`   | `team-leader-mantenimiento` | —                                        |
  | `produccion`   | `produccion123`   | `personal-produccion`       | —                                        |
  | `electricista` | `electricista123` | `tecnico`                   | `electricista` / `preventivo-correctivo` |

## Desvíos del plan

- **La suite no podía quedar verde tarea por tarea.** Cambiar `USER_ROLES` y
  hacer obligatorios los atributos del técnico rompió la compilación de
  todos los specs con fixtures de usuario; lo mismo pasó con `type` en
  `WorkOrder`. Por eso las tareas 2–4 se hicieron juntas y la 6 arrastró los
  fixtures de la 7. La suite volvió a verde en la tarea 4.
- **`auth.guard.spec.ts` se adaptó en la tarea 4**, no en la 5 (no compilaba
  con los roles nuevos). La lógica de `requireRole` no cambió.
- **`WorkOrderCreateRequest.type` pasó de la tarea 6 a la 9**: agregarlo
  antes rompía `form.ts` y los specs de crear y editar. En el intervalo, el
  interceptor mock (`mock-api.interceptor.ts`, que ninguna parte de la app
  usa) tuvo un tipado temporal que se quitó en la 9.
- **El test de "`create()` manda `type`"** de la tarea 7 se escribió en la 9,
  por lo mismo.
- **Un test existente cambió de sujeto:** en `app.routes.spec.ts`, "resolves
  /work-orders/new to WorkOrderCreate" ahora entra como team leader; con la
  sesión de administrador que traía, el guard nuevo lo manda a `/dashboard`.
- **No se agregó un test que valide `db.json`**: el proyecto no tiene
  `resolveJsonModule` y habilitarlo es un cambio de configuración fuera del
  spec. En su lugar se comprobó contra el servidor real (ver más abajo).
- **La verificación por mutación se hizo tarea por tarea**, no solo al
  cierre como decía el plan.

## Limitaciones y cosas a tener en cuenta

- **Todo esto es control de navegación/UX, no autorización.** El rol y los
  atributos del técnico viven en `localStorage` y son editables. La
  autorización real es del backend (spec 018).
- **Administrador edita pero no crea órdenes.** El spec no dice si edita; se
  asumió que sí. Tampoco le asigna la creación, así que no ve el botón
  "Crear Orden de Trabajo" y `/work-orders/new` lo manda a `/dashboard`.
  Cambiarlo es tocar una entrada de `CREATABLE_TYPES` o de `EDIT_ROLES` en
  `work-order.permissions.ts` y sus tests; el botón, la ruta y la página lo
  siguen solos.
- **Sin fecha estimada** en las órdenes preventivas/correctivas (el spec la
  menciona para el team leader, pero no la pide en esta entrega).
- **El cambio de estado inline (012) no se restringe por rol**, y el menú
  lateral sigue mostrando todo. Ambos quedaron fuera de alcance.
- **`WorkOrderDetail` y `WorkOrderEdit` no restringen la vista por rol:** ver
  el listado y el detalle sigue abierto a cualquier usuario con sesión (hay
  tests que lo fijan).
- **Regla heredada de 011, con test:** `/dashboard` nunca se restringe por
  rol; es el destino del rechazo y entraría en bucle.
- **No se persiste el tipo de equipo de la orden ni la asignación:** 013d.

## Verificación por mutación

Cada tarea se verificó rompiendo el código a propósito y corriendo la suite
completa; todos los archivos se restauraron y se comprobó por contenido.
**34 mutaciones: 33 hicieron fallar tests y 1 es equivalente.**

| Tarea | Mutación                                                   | Tests que fallan                                                     |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| 5     | `requireUser` sin sesión manda a `/dashboard` (no a login) | 3 (uno de `requireRole`, dos de `requireUser`)                       |
| 8     | Team leader puede eliminar                                 | 1                                                                    |
| 8     | Administrador no puede eliminar                            | 1                                                                    |
| 8     | Team leader crea `pronto-intervencion`                     | 2                                                                    |
| 8     | Producción crea `preventivo`                               | 2                                                                    |
| 8     | Producción no crea `pronto-intervencion`                   | 2                                                                    |
| 8     | Técnico ignora la especialidad                             | 4                                                                    |
| 8     | Técnico ignora el tipo de equipo                           | 10                                                                   |
| 8     | `general` deja de ser comodín                              | 6                                                                    |
| 8     | Producción puede editar                                    | 1                                                                    |
| 9     | `lockType` no deshabilita el select                        | 1                                                                    |
| 9     | El select ignora `allowedTypes`                            | 1                                                                    |
| 9     | El tipo inicial no es el primer permitido                  | 1                                                                    |
| 9     | Un formulario bloqueado pierde el tipo al emitir           | 1                                                                    |
| 9     | Se quita `Validators.required` del control `type`          | **0 (equivalente)**: el `required` de la plantilla también lo aplica |
| 10    | El envío no re-chequea el permiso                          | 6                                                                    |
| 10    | El re-chequeo solo bloquea si no hay tipos permitidos      | 3                                                                    |
| 10    | `allowedTypes` ofrece de más                               | 5                                                                    |
| 10    | El formulario no recibe `allowedTypes`                     | 5                                                                    |
| 11    | `/new` deja pasar a cualquiera con sesión                  | 3                                                                    |
| 11    | `/new` sin protección real                                 | 3                                                                    |
| 11    | `/:id/edit` deja pasar a todos menos técnico               | 1                                                                    |
| 11    | `/:id/edit` sin protección real                            | 2                                                                    |
| 11    | Listado restringido por error (sobre-restricción)          | 2                                                                    |
| 12    | El formulario no recibe `lockType`                         | 1                                                                    |
| 12    | El PUT toma el tipo del formulario                         | 1                                                                    |
| 12    | Un cambio solo de tipo cuenta como cambio                  | 1                                                                    |
| 13    | Botón Eliminar siempre visible                             | 4                                                                    |
| 13    | Botón Editar siempre visible                               | 3                                                                    |
| 13    | Botón Crear siempre visible                                | 3                                                                    |
| 13    | `deleteWorkOrder` sin chequeo de permiso                   | 3                                                                    |
| 13    | `openDeleteModal` sin chequeo de permiso                   | 1                                                                    |
| 13    | Team leader puede eliminar (en el listado)                 | 3                                                                    |
| 14    | El detalle muestra el valor crudo del tipo                 | 3                                                                    |

Varios primeros intentos de mutación **no compilaban** (dejaban un import o
una constante sin usar) y por eso no probaban nada; se repitieron con
variantes que compilan. Una mutación que no compila no cuenta como
"detectada".

## Contrato con JSON Server

Contra el servidor real (`pnpm api`, solo lecturas), con el mismo pedido que
hace `AuthService.login`: los 5 usuarios devuelven 1 registro, `toAuthUser`
produce un perfil válido para cada uno (técnicos con sus dos atributos, sin
`password`), `isAuthSession` acepta la sesión resultante y una contraseña
incorrecta devuelve 0 registros. Las 29 órdenes salen con un `type` válido
(20 preventivo, 6 correctivo, 3 pronto-intervención).

## Cobertura

`auth.guard.ts`, `auth.model.ts` y `work-order.permissions.ts` no aparecen en
la tabla de archivos con huecos: 100% en las cuatro métricas. `auth.model.ts`
bajó a 95.65% en una medición intermedia (la rama de `toAuthUser` con un
registro que no es un objeto) y se cerró con tests directos de `toAuthUser`.
Medición global (`pnpm run test:coverage`), dos corridas sobre el mismo
código:

```
                corrida 1           corrida 2 (la del README)
Statements : 96.38% (1199/1244)  96.62% (1202/1244)
Branches   : 96.81% (516/533)    96.81% (516/533)   (012 cerró en 95.43%, 460/482)
Functions  : 92.77% (231/249)    93.57% (233/249)
Lines      : 97.70% (893/914)    98.03% (896/914)
```

Statements/Functions/Lines fluctúan entre corridas sobre el mismo código
(ya documentado en 010 y 011); Branches es el número estable. Los huecos que
quedan en la tabla (`work-order-detail.ts` 28-29 y `work-order-edit.ts` 33-34,
la rama de "sin id en la ruta"; funciones de plantilla del listado) son
anteriores a este spec.

## Pendiente

- **Verificación manual de la interfaz** (login con cada usuario, botones
  visibles, opciones de tipo al crear, redirecciones): no registrada. Pasos:
  `pnpm api` + `pnpm start`, entrar con cada usuario de la tabla de arriba y
  comprobar (1) `teamleader` ve Editar y Crear y no Eliminar; (2) `produccion`
  solo ve Ver y Crear, y en Crear solo puede elegir pronto-intervención;
  (3) `admin` ve Editar y Eliminar y no Crear; (4) `tecnico` y `electricista`
  solo ven Ver; (5) `/work-orders/new` como `admin` vuelve a `/dashboard` con
  el aviso; (6) sin sesión, `/work-orders/new` lleva a login y, tras entrar
  como `produccion`, vuelve a `/work-orders/new`.
- **Nada quedó commiteado.** Los cambios están en el árbol de trabajo.
