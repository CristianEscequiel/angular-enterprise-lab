# Plan 013c: Gestión de técnicos y equipos

## Contexto

013b dejó el técnico como un usuario de login con `specialty` y `teamType` copiados en
el registro de `users` (`db.json`). 013c convierte al técnico en una entidad propia
(el **maestro de técnicos**), agrega la entidad **Equipo** y separa el login del
maestro. Se vinculan solo por `legajo`; no se fusionan.

Hallazgos verificados contra `json-server 1.0.0-beta.15` (en una copia temporal de
`db.json`) que condicionan el diseño:

1. **No rechaza ids duplicados.** Un `POST` con un `id` existente devuelve `201` y
   crea otro registro. La unicidad del legajo la tiene que garantizar el cliente.
2. **Coerciona los valores numéricos del query string a número.** `GET
/tecnicos?legajo=100` devuelve `[]` aunque exista `"legajo": "100"`. Un legajo
   numérico no se puede buscar con `?legajo=`. Por eso el maestro se consulta por
   ruta, `GET /tecnicos/:legajo` (`200` existe / `404` no existe).
3. No hay integridad referencial. Toda validación cruzada es de la app; con el
   backend real (spec 018) pasa a ser FK + índice único y el `404` previo se vuelve
   un `409`/`422` del servidor.

## Decisiones de diseño

### Estructura de `db.json`: tres colecciones separadas

```jsonc
"tecnicos": [
  // id === legajo (string). json-server exige `id`; se fija a mano, nunca se genera.
  { "id": "1001", "legajo": "1001", "firstName": "Ana", "lastName": "Ruiz",
    "specialty": "mecanico", "teamType": "guardia" }
],
"users": [
  { "id": "1", "username": "admin", "password": "admin123", "displayName": "Administrador",
    "email": "admin@enterprise-lab.dev", "role": "administrador" },          // sin cambios
  { "id": "2", "username": "tecnico", "password": "tecnico123", "displayName": "…",
    "email": "…", "role": "tecnico", "legajo": "1001" }                     // sin specialty/teamType
],
"equipos": [
  { "id": "1", "name": "Guardia mecánica", "type": "guardia", "memberLegajos": ["1001"] }
]
```

- **`id === legajo`** en `tecnicos`: es el identificador único del spec y permite
  consultar por ruta (hallazgo 2). `legajo` se guarda igual, porque es lo que lee
  todo el código; el servicio siempre escribe los dos iguales y **el legajo no se
  puede editar** (es el vínculo con `users` y `equipos`). Test lo fija.
- **Una sola fuente de verdad para `specialty`/`teamType`: el maestro.** Los `users`
  técnicos ya no los guardan; solo llevan `legajo`. Si se dejaran duplicados, editar
  la especialidad de un técnico dejaría al login con el dato viejo.
- **Login resuelve el perfil al ingresar:** `GET /users` → si `role === 'tecnico'`,
  `GET /tecnicos/:legajo` → arma el `AuthUser`. La sesión guardada sigue teniendo
  `specialty`/`teamType` (así `canTechnicianHandle` y los guards siguen siendo
  síncronos), más `legajo`. Consecuencia: un cambio de especialidad se ve en la
  sesión del técnico **al volver a loguearse**, no en caliente.
- **Nombres de campo en inglés** (convención de 013b): el spec dice
  `nombre/apellido/especialidad/tipoEquipo`; en código son
  `firstName/lastName/specialty/teamType`. `legajo` queda igual. Los valores siguen
  en español y los tipos `TechnicianSpecialty`/`TechnicianTeamType` se reutilizan de
  `auth.model.ts`, sin duplicarlos.
- **Miembros del equipo = lista de legajos** dentro del propio equipo (no una
  colección de unión): un solo `PUT` guarda el equipo y sus miembros.
- **Capas:** `core/auth` no importa de `features` (regla de 011). Por eso el login y
  `UsersService` (ambos en `core/auth`) consultan `/tecnicos/:legajo` por HTTP con un
  tipo mínimo definido en core (`TechnicianProfile`); el modelo completo `Technician`
  vive en la feature y lo extiende.
- **Una sola feature `features/maintenance/`** (técnicos + equipos) en vez de dos.
  Borrar un técnico exige mirar equipos y borrar/asignar un miembro exige mirar
  técnicos: en dos features habría dependencia circular. Rutas bajo `/maintenance`.

### Validación de la referencia cruzada (usuario `tecnico` → maestro)

¿Hay una pantalla de usuarios? **No** (autenticación completa es fase 2), así que la
regla vive en un servicio y se prueba ahí: `UsersService.create()` en
`core/auth/users.service.ts`. Se aplica en tres capas:

| Capa                    | Regla                                                                                                                                          | Resultado                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `UsersService.create()` | rol `tecnico` sin legajo válido (`^\d{1,8}$`) → error, **sin request**                                                                         | `InvalidLegajoError`                                                                           |
|                         | `GET /tecnicos/:legajo` → `404` → no se crea el usuario; **no sale ningún `POST /users`**                                                      | `TechnicianNotFoundError`                                                                      |
|                         | ya existe un usuario `tecnico` con ese legajo (se filtra en el cliente sobre `GET /users?role=tecnico`, por el hallazgo 2) → no se crea        | `LegajoAlreadyLinkedError`                                                                     |
|                         | error de red/`5xx` en la consulta → se propaga como error de conexión; **nunca** se interpreta como "no existe"                                | error HTTP original                                                                            |
|                         | rol no técnico con `legajo` → se rechaza (mismo criterio estricto que `isAuthUser`)                                                            | `InvalidLegajoError`                                                                           |
| Login                   | usuario `tecnico` cuyo legajo ya no existe en el maestro (borrado a mano, dato corrupto) → sin sesión                                          | `InvalidUserRecordError` (ya existe)                                                           |
| Borrado de técnico      | bloqueado si tiene usuario de login o es miembro de algún equipo; el mensaje dice cuál. Evita dejar referencias colgantes en ambas direcciones | la página decide y muestra el aviso; no sale `DELETE` (regla de negocio en páginas, CLAUDE.md) |

Un técnico **sin** usuario es el caso normal: crear un técnico solo hace
`POST /tecnicos`; nunca toca `/users`.

## Decisiones abiertas (asumidas por defecto; corregir antes de implementar)

1. **¿`username` del técnico pasa a ser su legajo?** El spec dice que el login "usa
   legajo como identificador". Se asume que significa **el campo `legajo` del
   registro** y `username` no cambia (`login-page` intacto). Si se quiere loguear
   con el legajo, es cambiar el seed y el label del formulario.
2. **Formato del legajo:** string de solo dígitos, 1 a 8. El spec no lo fija. Se
   valida también para que nunca llegue a la URL algo como `../users`, y siempre se
   pasa por `encodeURIComponent`.
3. **Equipos: solo `team-leader-mantenimiento`.** El spec dice gestión "exclusiva"
   del TL; se asume que Administrador ni siquiera ve la sección. Si debe verla de
   solo lectura es un cambio en una línea de la política.
4. **Coherencia `teamType` del técnico ↔ `type` del equipo:** el spec no la exige,
   **no se valida** (un técnico `guardia` puede figurar en un equipo
   `preventivo-correctivo`). Tampoco se limita a un solo equipo por técnico.
5. **Nuevos técnicos:** Administrador y TL pueden crear; solo Administrador elimina
   (regla del spec). Nadie más accede a las páginas (`personal-produccion`,
   `tecnico`).

## Fuera de alcance

Pantalla de gestión de usuarios de login, asignación de órdenes (013d), historial de
altas/bajas, RRHH externo, ocultar el menú según rol más allá de los dos links
nuevos, y mover `db.json` fuera de `features/work-orders/data-access/` (el script
`pnpm api` apunta ahí; ya aloja `users`).

## Tareas

Cada tarea deja `pnpm test` en verde antes de pasar a la siguiente (lo exige el hook
de Husky). Rutas relativas a `src/app/`.

| #   | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                      | Archivo(s)                                                                                                                                                                                                                                 | Test que la valida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modelo de auth: `LEGAJO_PATTERN`/`isLegajo`; `TechnicianProfile {specialty, teamType}`; `TechnicianUser` suma `legajo`; `UserRecord` pasa a unión `StaffUserRecord \| TechnicianUserRecord` (el técnico solo lleva `legajo`); `isAuthUser` exige `legajo` en técnico y lo rechaza en los demás; `toAuthUser(record, profile)` toma `specialty`/`teamType` del perfil                                                       | `core/auth/auth.model.ts`                                                                                                                                                                                                                  | `auth.model.spec.ts`: `isLegajo` acepta `"1001"` y `"0042"`, rechaza `""`, `"12a"`, `"../users"`, 9 dígitos; técnico sin `legajo` → rechazado; no-técnico con `legajo` → rechazado; `toAuthUser` ignora `specialty`/`teamType` que traiga el registro y usa los del perfil; sesión vieja sin `legajo` no valida                                                                                                                                                                                                                                                                                 |
| 2   | Login resuelve el maestro: tras `GET /users`, si es técnico `GET /tecnicos/:legajo`; `404` → `InvalidUserRecordError`; otro error HTTP se propaga (no es "credenciales incorrectas")                                                                                                                                                                                                                                       | `core/auth/auth.service.ts`                                                                                                                                                                                                                | `auth.service.spec.ts`: login técnico → 2 requests y sesión con `specialty`/`teamType` **del maestro** y `legajo`; maestro `404` → `InvalidUserRecordError`, sin sesión ni storage; maestro `500` → error de conexión, no `InvalidCredentialsError`; login de admin/TL/producción → `expectNone` sobre `/tecnicos`                                                                                                                                                                                                                                                                              |
| 3   | Actualizar fixtures de sesión existentes: técnicos de prueba con `legajo` (sin cambiar lo que afirma ningún test)                                                                                                                                                                                                                                                                                                          | `app.routes.spec.ts`, `app.config.spec.ts`, `app-shell.spec.ts`, `auth.guard.spec.ts`, `login-page.spec.ts`, `work-order.permissions.spec.ts`, `work-orders-list.spec.ts`, `work-order-create.spec.ts` (los que arman un `TechnicianUser`) | suite completa de vuelta en verde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | `UsersService.create()` con la validación de referencia cruzada (tabla de arriba). Errores tipados: `InvalidLegajoError`, `TechnicianNotFoundError`, `LegajoAlreadyLinkedError`                                                                                                                                                                                                                                            | nuevo `core/auth/users.service.ts`                                                                                                                                                                                                         | nuevo `users.service.spec.ts`: **rol `tecnico` + legajo inexistente (`GET /tecnicos/9999` → `404`) → `TechnicianNotFoundError` y `expectNone` de `POST /users`**; legajo existente → `POST /users` con `legajo` y **sin `password` en la respuesta expuesta**; legajo ya vinculado → `LegajoAlreadyLinkedError`, sin `POST`; sin legajo o con formato inválido → error **sin ningún request** (`expectNone` de `/tecnicos`); `500` en la consulta → error HTTP, no `TechnicianNotFoundError`; staff sin legajo → `POST` directo, `expectNone` sobre `/tecnicos`; staff con `legajo` → rechazado |
| 5   | Modelo `Technician` (`legajo`, `firstName`, `lastName`, `specialty`, `teamType`), `TechnicianDraft`, `isTechnician` del maestro (nombre distinto al `isTechnician(user)` de auth: `isTechnicianRecord`), `fullName()`                                                                                                                                                                                                      | nuevo `features/maintenance/models/technician.model.ts`                                                                                                                                                                                    | `technician.model.spec.ts`: acepta un registro válido con cada especialidad/tipo; rechaza faltante o valor inválido en cada campo (casos separados); rechaza `id !== legajo`; `fullName` arma "Apellido, Nombre"                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Modelo `Team` (`id`, `name`, `type: TechnicianTeamType`, `memberLegajos: string[]`), `TeamDraft`, `isTeamRecord`; `addMember`/`removeMember` puros que **no** duplican                                                                                                                                                                                                                                                     | nuevo `features/maintenance/models/team.model.ts`                                                                                                                                                                                          | `team.model.spec.ts`: `addMember` agrega; **`addMember` con un legajo ya presente devuelve la lista sin cambios y señala el duplicado**; `removeMember` quita solo ese legajo; `isTeamRecord` rechaza `memberLegajos` con duplicados o no-string                                                                                                                                                                                                                                                                                                                                                |
| 7   | Política de permisos: `canViewTechnicians`, `canCreateTechnician`, `canEditTechnician`, `canDeleteTechnician`, `canManageTeams` (fuente única para guards y páginas)                                                                                                                                                                                                                                                       | nuevo `features/maintenance/models/maintenance.permissions.ts`                                                                                                                                                                             | `maintenance.permissions.spec.ts` (`it.each` sobre los 4 roles + `null`): **TL no elimina técnico**, Admin sí; TL y Admin crean/editan; Producción y técnico no acceden a nada; solo TL gestiona equipos; `null` → todo `false`                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | `TechniciansService`: `getAll`, `findByLegajo` (`404` → `null`, otro error se propaga), `create` (**verifica primero que el legajo esté libre**; `id = legajo`), `update` (nunca manda ni cambia `legajo`/`id`), `delete`                                                                                                                                                                                                  | nuevo `features/maintenance/data-access/technicians.service.ts`                                                                                                                                                                            | `technicians.service.spec.ts`: `create` con legajo libre → `GET /tecnicos/:legajo` `404` luego `POST` con `id === legajo`; **legajo duplicado (`GET` → `200`) → `DuplicateLegajoError` y `expectNone` de `POST`**; `create` **no genera ningún request a `/users`**; `findByLegajo` `404` → `null`, `500` → error; legajo inválido → sin request; `update` con `legajo` distinto en el payload lo ignora; `encodeURIComponent` en la URL                                                                                                                                                        |
| 9   | `TeamsService`: `getAll`, `getById`, `create`, `update`, `delete`; el `PUT` normaliza `memberLegajos` sin duplicados                                                                                                                                                                                                                                                                                                       | nuevo `features/maintenance/data-access/teams.service.ts`                                                                                                                                                                                  | `teams.service.spec.ts`: cada verbo/URL; **`update` con miembros duplicados manda la lista deduplicada**; `getById` `404` → error tipado como en `WorkOrderLoadError`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10  | Listado de técnicos: tabla con búsqueda por legajo/nombre local, botones según política; `deleteTechnician()` primero consulta usuarios vinculados (`UsersService`) y equipos (`TeamsService`), bloquea con aviso claro si hay referencias, y solo si no hay llama a `DELETE`; usa el modal de confirmación                                                                                                                | nuevo `features/maintenance/pages/technicians-list/technicians-list.ts/.html/.scss`                                                                                                                                                        | `technicians-list.spec.ts`: **TL no ve "Eliminar" y llamar `deleteTechnician('1001')` no genera `DELETE` (`expectNone`) + aviso**; Admin ve "Eliminar" y al confirmar sale `DELETE /tecnicos/1001`; **técnico con usuario de login → aviso y `expectNone` de `DELETE`**; técnico miembro de un equipo → aviso con el nombre del equipo y sin `DELETE`; error al consultar referencias → no se borra; muestra técnico sin usuario                                                                                                                                                                |
| 11  | Formulario de técnico (crear/editar): `legajo` con validador de formato, **deshabilitado en edición**; error visible por legajo duplicado; al guardar navega al listado                                                                                                                                                                                                                                                    | nuevo `features/maintenance/pages/technician-form/technician-form.ts/.html`                                                                                                                                                                | `technician-form.spec.ts`: **Admin crea un técnico con legajo nuevo → `POST` y navega al listado con el técnico**; **legajo duplicado → mensaje de error, no navega, sin `POST`**; crear **no** genera requests a `/users`; en edición el legajo está deshabilitado y el `PUT` no lo cambia; campos requeridos; protección de formulario sucio como en 004                                                                                                                                                                                                                                      |
| 12  | Listado de equipos: tabla con tipo y cantidad de miembros; crear/editar/eliminar solo TL; eliminar con modal                                                                                                                                                                                                                                                                                                               | nuevo `features/maintenance/pages/teams-list/teams-list.ts/.html/.scss`                                                                                                                                                                    | `teams-list.spec.ts`: TL ve las tres acciones y `DELETE /equipos/:id` al confirmar; una sesión sin permiso no genera `DELETE` (`expectNone`) aunque se invoque el método                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 13  | Formulario de equipo con **"agregar por legajo" en tiempo real**: `searchControl` → `trim` → `debounceTime(300)` → `distinctUntilChanged` → `switchMap` a un estado `idle \| checking \| found \| not-found \| already-member \| error`; el "ya es miembro" se resuelve localmente sin HTTP; "Agregar" habilitado solo en `found`; al agregar se limpia el campo; lista de miembros con "Quitar"; el `PUT` guarda la lista | nuevo `features/maintenance/pages/team-form/team-form.ts/.html`                                                                                                                                                                            | `team-form.spec.ts` (con `vi.useFakeTimers()` como en `work-orders-list.spec.ts`): **legajo válido → tras el debounce aparece "Técnico encontrado: Apellido, Nombre" y "Agregar" sigue deshabilitado hasta ese momento; al confirmar entra a la lista**; **legajo inexistente → "no existe", botón deshabilitado, no agrega**; **legajo ya presente → mensaje "ya es miembro" y `expectNone` de `GET /tecnicos/…`**; error `500` → estado `error`, **no** "no existe"; respuestas fuera de orden (`switchMap`) muestran solo la última; el `PUT` lleva los miembros sin duplicados              |
| 14  | Rutas de la feature con `loadChildren`/`loadComponent` y guards por política: `maintenance/technicians`, `…/new`, `…/:legajo/edit`, `maintenance/teams`, `…/new`, `…/:id/edit`; alta en `app.routes.ts` dentro del grupo protegido                                                                                                                                                                                         | nuevo `features/maintenance/maintenance.routes.ts`, `app.routes.ts`                                                                                                                                                                        | `maintenance.routes.spec.ts` / `app.routes.spec.ts`: TL y Admin entran a `/maintenance/technicians`; técnico y Producción → `/dashboard` + aviso; **TL en `/maintenance/technicians/new` entra, pero Admin en `/maintenance/teams` → `/dashboard`**; anónimo → `/login?returnUrl=…`; segmento de legajo inválido en `:legajo/edit` cae al 404                                                                                                                                                                                                                                                   |
| 15  | Links "Técnicos" y "Equipos" en el sidebar, visibles solo si la política lo permite                                                                                                                                                                                                                                                                                                                                        | `layout/sidebar/sidebar.ts/.html`                                                                                                                                                                                                          | `sidebar.spec.ts`: TL ve ambos; Admin ve solo Técnicos; técnico/Producción/anónimo no ven ninguno; `aria-current` en el activo                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 16  | Seeds: `tecnicos` (`1001` mecánico/guardia, `1002` electricista/preventivo-correctivo, `1003` general **sin usuario**), `equipos` (uno de guardia, uno preventivo-correctivo), y los `users` técnicos con `legajo` `1001`/`1002` sin `specialty`/`teamType`. **No mezclar con los cambios sueltos que ya tiene `db.json`** (ver Riesgos)                                                                                   | `features/work-orders/data-access/db.json`                                                                                                                                                                                                 | verificación manual con `pnpm api` (paso 4) y `node` que confirma: legajos únicos, cada `users.legajo` existe en `tecnicos`, cada `memberLegajos` existe en `tecnicos`, existe al menos un técnico sin usuario                                                                                                                                                                                                                                                                                                                                                                                  |
| 17  | Cierre: `notes.md` (decisiones, hallazgos de json-server, mutaciones, cobertura) y README                                                                                                                                                                                                                                                                                                                                  | `.claude/specs/013c-tecnicos-equipos/notes.md`, `README.md`                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Criterios de aceptación → tests

| Criterio del spec                                       | Tests (tarea)                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Admin crea técnico con legajo único / rechaza duplicado | 8 (servicio: `POST` sí / `expectNone`), 11 (formulario: aparece en el listado / mensaje de error)      |
| TL no puede eliminar técnico                            | 7 (política), 10 (`expectNone` de `DELETE`, sin botón)                                                 |
| Agregar por legajo con feedback en tiempo real          | 13 (feedback "encontrado" antes de confirmar; inexistente bloquea; sin feedback no habilita "Agregar") |
| Legajo ya presente en el equipo se bloquea              | 6 (modelo), 13 (mensaje, sin request)                                                                  |
| Usuario `tecnico` con legajo inexistente se bloquea     | 4 (`expectNone` de `POST /users`), 2 (defensa en el login)                                             |
| Técnico puede existir sin usuario de login              | 8 y 11 (crear no toca `/users`), 10 (se lista y se puede borrar), 16 (seed `1003`)                     |

## Verificación

1. `pnpm test`, `pnpm lint`, `pnpm build`, `prettier --check .`: todo en verde.
2. **Mutaciones** (como en 011/013b, anotadas en `notes.md`). Para cada una la suite tiene que fallar:
   - `TechniciansService.create` omite el chequeo de legajo libre
   - `canDeleteTechnician` deja pasar a TL
   - `UsersService.create` omite la consulta al maestro (o la ejecuta pero ignora el `404`)
   - `UsersService.create` trata un error `500` como "técnico inexistente"
   - `addMember` permite duplicados
   - la página de equipo habilita "Agregar" sin estado `found`
   - `switchMap` reemplazado por `mergeMap` (respuesta vieja pisa a la nueva)
   - `TechniciansService.update` deja cambiar el legajo
   - el login de técnico usa `specialty`/`teamType` del registro de `users` en vez del maestro
   - borrar un técnico con usuario o con equipo no se bloquea
3. `pnpm run test:coverage`: `users.service.ts`, `technicians.service.ts`,
   `maintenance.permissions.ts`, `technician.model.ts`, `team.model.ts` y
   `auth.model.ts` al 100%.
4. Prueba manual con `pnpm api` + `pnpm start`:
   - TL: crea técnico `1004`; el legajo duplicado da error; no ve "Eliminar"; en un
     equipo tipea `1004` (feedback "encontrado"), `9999` ("no existe") y un miembro
     actual ("ya es miembro").
   - Admin: borra `1003` (sin usuario ni equipo) y falla al borrar `1001` con aviso.
   - Login con el técnico `1001`: la sesión trae la especialidad del maestro; editar
     su especialidad y volver a loguearse la refleja.

## Riesgos

- **`db.json` ya tiene cambios sin commitear** (estados de órdenes editados a mano y
  una orden `-F0Rxw22vkQ` de una prueba manual, más pérdida del salto de línea
  final). No son de 013c: separarlos (`git add -p` o descartarlos) antes del commit
  de la tarea 16.
- **Carrera en la unicidad del legajo:** el chequeo previo y el `POST` no son
  atómicos; dos altas simultáneas del mismo legajo pasarían. Aceptable en el mock;
  el backend lo cubre con el índice único.
- **Sesiones activas quedan con el perfil viejo** hasta el próximo login si cambia
  la especialidad del técnico. Se documenta en `notes.md`.
- **Sesiones guardadas de 013b sin `legajo`** dejan de validar y se descartan (mismo
  criterio estricto que 011/013b): hay que volver a loguearse una vez.
