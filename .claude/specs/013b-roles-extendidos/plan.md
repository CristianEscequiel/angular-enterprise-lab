# Plan 013b: Roles extendidos del dominio de mantenimiento

## Contexto

Spec 011 dejó `requireRole(...roles)` funcionando con roles placeholder
(`'admin' | 'tecnico'`) y ninguna ruta real restringida. 013b define los 4 roles
reales, los atributos del técnico (especialidad y tipo de equipo, independientes
entre sí) y las reglas de crear/editar/eliminar órdenes según el rol.

Hoy hay dos huecos que el spec da por resueltos:

1. **`WorkOrder` no tiene tipo.** Sin tipo no se puede aplicar "solo Producción crea
   pronto-intervención". **Decisión: agregar `type` a `WorkOrder`.**
2. **Eliminar no es una ruta** (es el modal de `WorkOrdersList`), así que un
   `CanActivate` no la puede bloquear. **Decisión: una política pura de permisos que
   usan tanto los guards como las páginas.** Criterio 1 = la política + el listado
   no llama a `DELETE`.

## Decisiones de diseño

- **Nombres de campo en inglés, valores en español**, siguiendo el código actual
  (`role: 'tecnico'` ya existe): `role`, `specialty`, `teamType`. Los valores son
  los del pedido (`'team-leader-mantenimiento'`, `'mecanico'`, `'guardia'`…).
  Renombrar `role` → `rol` tocaría todo lo de 010/011 sin ganar nada.
- **`AuthUser` pasa a ser una unión discriminada por `role`:**
  `TechnicianUser` (`role: 'tecnico'` + `specialty` + `teamType`, obligatorios) |
  `StaffUser` (`role` = cualquiera de los otros 3, **sin** esos campos). Así el
  compilador impide leer `specialty` sin haber comprobado `role === 'tecnico'`.
- **`isAuthUser` es estricto:** rechaza un técnico al que le falte un atributo y
  rechaza un no-técnico que traiga `specialty`/`teamType`. Las sesiones guardadas con
  `'admin'` quedan inválidas → `restoreSession()` las borra → hay que loguearse de
  nuevo. Es lo mismo que decidió 011 (nunca dar un permiso por defecto a partir de
  lo guardado en storage).
- **Capas:** `core/auth` no importa de `features` (regla de 011). El guard genérico
  vive en core; la política sobre órdenes vive en
  `features/work-orders/models/work-order.permissions.ts`.
- **`requireRole` se reescribe sobre un `requireUser(predicate)` genérico.** Ahí
  queda en un solo lugar lo que hoy hace `requireRole`: sin sesión va a
  `loginUrlFor(state.url)`, que es el retorno tras el login, y sin permiso muestra
  el aviso y manda a `/dashboard`. `authGuard` y `guestGuard` no se tocan, así que el
  retorno-tras-login y el guard inverso de `/login` quedan intactos.
- **Tipos de orden:** `WORK_ORDER_TYPES = ['preventivo', 'correctivo', 'pronto-intervencion']`.
  El tipo se elige al crear y **no se puede editar** (en edición el select está
  deshabilitado; `getRawValue()` lo conserva igual).
- **Reglas (tabla única, en la política):**

  | Acción                          | Permitido a                                      |
  | ------------------------------- | ------------------------------------------------ |
  | Crear `pronto-intervencion`     | `personal-produccion`                            |
  | Crear `preventivo`/`correctivo` | `team-leader-mantenimiento`                      |
  | Editar cualquier orden          | `team-leader-mantenimiento`, `administrador` (*) |
  | Eliminar orden                  | `administrador`                                  |
  | Gestionar (técnico)             | `tecnico`, según especialidad + tipo de equipo   |

  (*) El spec no dice si Administrador edita. Se asume que sí, porque es el rol que
  puede hacer más cosas. Es una línea en la política si hay que cambiarlo.
  Administrador **no** crea órdenes: el spec no se lo asigna.

- **Consulta del técnico sin asignación (lo real queda para 013d):**
  `canTechnicianHandle(user, { type, specialty })`. El `specialty` requerido por la
  orden es un parámetro de la consulta; **no** se agrega a `WorkOrder` (eso es de
  013d). `general` acepta cualquier especialidad. `guardia` ↔ `pronto-intervencion`.
  `preventivo-correctivo` ↔ `preventivo | correctivo`.

## Fuera de alcance

CRUD de técnicos (013c), asignación real (013d), fecha estimada de las
preventivas/correctivas, filtro por tipo en la búsqueda, permisos sobre el cambio
de estado inline (012) y ocultar el menú lateral según el rol.

## Tareas

Cada tarea deja `pnpm test` en verde antes de pasar a la siguiente (lo exige el
hook de Husky al commitear).

| #   | Tarea                                                                                                                                                                                                                                               | Archivo(s)                                                                                                                                | Test que la valida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modelo de rol: `USER_ROLES` con los 4 roles, `TECHNICIAN_SPECIALTIES`, `TECHNICIAN_TEAM_TYPES`, sus tipos e `is*`; `AuthUser` como unión `TechnicianUser \| StaffUser`; helper `isTechnician(user)`; `isAuthUser` estricto                          | `core/auth/auth.model.ts`                                                                                                                 | `auth.model.spec.ts`: acepta los 4 roles; técnico válido con cada especialidad/tipo; **rechaza técnico sin `specialty`, sin `teamType` o con valor inválido en cualquiera de los dos (casos separados = atributos independientes)**; rechaza no-técnico con `specialty`; rechaza `'admin'` (rol viejo)                                                                                                                                                                                                  |
| 2   | Login: armar el `AuthUser` desde el `UserRecord` copiando `specialty`/`teamType` solo si es técnico (`toAuthUser` en el modelo) y validar con `isAuthUser`; si el registro de la base no es válido, error específico (no `InvalidCredentialsError`) | `core/auth/auth.service.ts`, `auth.model.ts`                                                                                              | `auth.service.spec.ts`: login de técnico guarda los dos atributos en sesión y storage; login de team leader no los tiene; registro de técnico sin `specialty` → error y sin sesión; **sesión guardada con `role: 'admin'` se descarta al restaurar**                                                                                                                                                                                                                                                    |
| 3   | Fixtures: users con los 4 roles (`admin`→`administrador`, `teamleader`, `produccion`, `tecnico` mecánico/guardia, `tecnico2` electricista/preventivo-correctivo)                                                                                    | `data-access/db.json`                                                                                                                     | cubierto por 2 y por el login end-to-end de `app.routes.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | Actualizar fixtures de sesión en los specs existentes (`role: 'admin'` → `'administrador'`)                                                                                                                                                         | `app.routes.spec.ts`, `app.config.spec.ts`, `app-shell.spec.ts`, `login-page.spec.ts`, `auth.interceptor.spec.ts`, `auth.service.spec.ts` | la suite completa vuelve a verde sin cambiar lo que afirma ningún test                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | Guard genérico `requireUser(predicate: (user, route) => boolean)`; `requireRole` reescrito como `requireUser(u => roles.includes(u.role))`. `authGuard`/`guestGuard` sin cambios                                                                    | `core/auth/auth.guard.ts`                                                                                                                 | `auth.guard.spec.ts`: los tests actuales de `requireRole` siguen verdes con los roles nuevos (`sessionFor` arma técnico con atributos); nuevos: `requireUser` con predicado sobre `specialty` deja pasar a `mecanico` y bloquea a `electricista` con aviso + `/dashboard`; **sin sesión → `/login?returnUrl=<url pedida>`**; el `guestGuard` con técnico logueado sigue redirigiendo al `returnUrl`                                                                                                     |
| 6   | Tipo de orden: `WORK_ORDER_TYPES`, `WorkOrderType`, `isWorkOrderType`, `type` en `WorkOrder` y `WorkOrderCreateRequest`; `TYPE_LABELS`                                                                                                              | `models/work-order.model.ts`, `models/work-order.display.ts`                                                                              | `work-order.model.spec.ts`: `isWorkOrderType` acepta los 3 y rechaza otros; `work-order.display.spec.ts`: label para cada tipo                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | Datos: `type` en las 29 órdenes de `db.json` y en `WORK_ORDERS_MOCK`                                                                                                                                                                                | `db.json`, `data-access/work-order.mock.ts`                                                                                               | `work-order.service.spec.ts`: `create()` manda `type` en el payload del POST                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | Política de permisos: `canCreateWorkOrder(user, type)`, `creatableTypes(user)`, `canEditWorkOrder(user)`, `canDeleteWorkOrder(user)`, `canTechnicianHandle(user, { type, specialty })`                                                              | nuevo `models/work-order.permissions.ts`                                                                                                  | nuevo `work-order.permissions.spec.ts` (tabla con `it.each`): **Admin elimina / TL no elimina; TL edita; Producción crea `pronto-intervencion` y no crea `preventivo`/`correctivo`; TL no crea `pronto-intervencion`**; técnico `mecanico`+`guardia`: maneja (pronto-intervención, mecánico); no maneja (pronto-intervención, eléctrico) → **falla la especialidad**; no maneja (preventivo, mecánico) → **falla el tipo de equipo**; `general` maneja ambas especialidades; ningún no-técnico "maneja" |
| 9   | Form: control `type` + input `allowedTypes` (la página decide cuáles, el Form solo los muestra) + `lockType` para edición (select deshabilitado)                                                                                                    | `components/form/form.ts`, `form.html`                                                                                                    | `form.spec.ts`: renderiza solo los tipos de `allowedTypes`; valor inicial = primer permitido; `required`; con `lockType` el select está deshabilitado y el `emit` incluye el tipo original                                                                                                                                                                                                                                                                                                              |
| 10  | Crear: `allowedTypes = creatableTypes(user)`; `onSubmit` vuelve a chequear `canCreateWorkOrder` y, si no puede, avisa y no llama al servicio                                                                                                        | `pages/work-order-create/work-order-create.ts/.html`                                                                                      | `work-order-create.spec.ts`: **Producción ve solo pronto-intervención; si envía `preventivo`, no sale ningún POST (`expectNone`) y aparece el aviso; si envía pronto-intervención, sale el POST**; TL ve preventivo y correctivo                                                                                                                                                                                                                                                                        |
| 11  | Rutas: `new` con `requireUser(u => creatableTypes(u).length > 0)`; `edit` con `requireUser(canEditWorkOrder)`                                                                                                                                       | `features/work-orders/work-orders.routes.ts`                                                                                              | `work-orders.routes.spec.ts` / `app.routes.spec.ts`: técnico y admin en `/work-orders/new` → `/dashboard` + aviso; TL entra a `/work-orders/1/edit`, técnico no; **anónimo en `/work-orders/new` → `/login?returnUrl=/work-orders/new` y, tras loguearse como Producción, termina en `/work-orders/new`**                                                                                                                                                                                               |
| 12  | Edición: pasa `lockType` al Form; el PUT conserva `type`                                                                                                                                                                                            | `pages/work-order-edit/work-order-edit.ts/.html`                                                                                          | `work-order-edit.spec.ts`: el PUT lleva el `type` original                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 13  | Listado: `canDelete`/`canEdit`/`canCreate` como `computed` a partir de `currentUser()`; oculta botones; `deleteWorkOrder()` sale temprano con aviso si no hay permiso; columna Tipo                                                                 | `pages/work-orders-list/work-orders-list.ts/.html`                                                                                        | `work-orders-list.spec.ts`: **Admin: botón Eliminar visible y al confirmar sale `DELETE /work-orders/:id`; TL: sin botón Eliminar y llamar `deleteWorkOrder('1')` no genera request (`expectNone`) + aviso**; TL ve Editar; técnico no ve Crear                                                                                                                                                                                                                                                         |
| 14  | Detalle: mostrar el tipo                                                                                                                                                                                                                            | `pages/work-order-detail/work-order-detail.html`                                                                                          | `work-order-detail.spec.ts`: renderiza `TYPE_LABELS[type]`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 15  | Cierre: `notes.md` con decisiones, verificación por mutación y cobertura; README                                                                                                                                                                    | `.claude/specs/013b-roles-extendidos/notes.md`, `README.md`                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Criterios de aceptación → tests

| Criterio del spec                                  | Tests (tarea)                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Admin elimina / TL bloqueado al eliminar           | 8 (política), 13 (listado: `DELETE` sí / `expectNone`)                                                  |
| Producción: preventiva no, guardia sí              | 8, 10 (POST sí / `expectNone`), 11 (ruta)                                                               |
| TL no crea pronto-intervención                     | 8, 10 (TL no ve la opción)                                                                              |
| Técnico mecánico+guardia, atributos independientes | 1 (validación por separado), 8 (un caso que falla por especialidad y otro que falla por tipo de equipo) |

## Verificación

1. `pnpm test`, `pnpm lint`, `pnpm build`, `prettier --check .`: todo en verde.
2. **Mutaciones** (igual que en 011, anotadas en `notes.md`). Para cada una, la suite
   tiene que fallar:
   - `canDeleteWorkOrder` deja pasar a TL
   - `canCreateWorkOrder('pronto-intervencion')` deja pasar a TL
   - Producción puede crear `preventivo`
   - `canTechnicianHandle` ignora la especialidad o ignora el tipo de equipo (dos
     mutaciones separadas)
   - `isAuthUser` acepta un técnico sin `teamType`
   - `requireUser` sin sesión manda a `/dashboard` en vez de a login (tiene que
     romper el retorno tras el login)
3. `pnpm run test:coverage`: `auth.guard.ts`, `auth.model.ts` y
   `work-order.permissions.ts` al 100%.
4. Prueba manual con `pnpm api` + `pnpm start`, logueándose con cada usuario de
   `db.json`: botones visibles, opciones de tipo al crear y redirecciones.
