# Notas 013c: ejecución

## Resultado

48 archivos / 972 tests en verde (baseline 35 archivos / 523 tests → +449
tests, +13 archivos). `pnpm lint`, `pnpm build`, `tsc --noEmit` (app y specs)
sin errores. `prettier --check src` limpio; el repo entero marca solo `spec.md`
(el spec original, sin formatear) y `db.json` (ver "Pendiente").

| Tarea | Área                     | Archivos nuevos / tocados                                                                                                                                  | Tests netos                                                 |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1–3   | Modelo, login y fixtures | `auth.model.ts` (`legajo`, `TechnicianProfile`, `UserRecord` unión, `toAuthUser(record, profile)`), `auth.service.ts` (login resuelve el maestro), 8 specs | +33 (523→556)                                               |
| 4     | Alta de usuario de login | `core/auth/users.service.ts` (nuevo)                                                                                                                       | +22                                                         |
| 5     | Modelo `Technician`      | `maintenance/models/technician.model.ts`                                                                                                                   | +38                                                         |
| 6     | Modelo `Team`            | `maintenance/models/team.model.ts`                                                                                                                         | +36                                                         |
| 7     | Política de permisos     | `maintenance/models/maintenance.permissions.ts`                                                                                                            | +29                                                         |
| 8     | Servicio de técnicos     | `maintenance/data-access/technicians.service.ts`                                                                                                           | +31                                                         |
| 9     | Servicio de equipos      | `maintenance/data-access/teams.service.ts`, `uniqueMembers` en `team.model.ts`                                                                             | +21                                                         |
| 10    | Listado de técnicos      | `pages/technicians-list/`, `technician.display.ts`, `UsersService.hasTechnicianAccount`                                                                    | +42                                                         |
| 11    | Formulario de técnico    | `pages/technician-form/`                                                                                                                                   | +48                                                         |
| 12    | Listado de equipos       | `pages/teams-list/`                                                                                                                                        | +18                                                         |
| 13    | Formulario de equipo     | `pages/team-form/` (agregar por legajo en tiempo real)                                                                                                     | +47                                                         |
| 14    | Rutas                    | `maintenance.routes.ts`, `app.routes.ts`                                                                                                                   | +57 (`maintenance.routes.spec.ts` nuevo, `app.routes.spec`) |
| 15    | Sidebar                  | `sidebar.ts/.html` (links por política; corrección de `aria-current`)                                                                                      | +12 (1→13)                                                  |
| 16    | Datos de prueba          | `db.json` (`tecnicos`, `equipos`, `users` con `legajo`), `db.seed.spec.ts` (nuevo)                                                                         | +15                                                         |
| 17    | Cierre                   | estas notas y el README                                                                                                                                    | —                                                           |

## Decisiones tomadas

### Estructura de datos: tres colecciones separadas

```jsonc
"tecnicos": [{ "id": "1001", "legajo": "1001", "firstName": "Ana", "lastName": "Ruiz",
               "specialty": "mecanico", "teamType": "guardia" }],
"users":    [{ "id": "2", "username": "tecnico", …, "role": "tecnico", "legajo": "1001" }],
"equipos":  [{ "id": "1", "name": "Guardia mecánica", "type": "guardia", "memberLegajos": ["1001"] }]
```

- **El maestro de técnicos es independiente del usuario de login** y se vincula
  solo por `legajo`. Un técnico existe sin usuario (`1003` en los datos de
  prueba); crearlo no toca `/users` (hay un test que lo fija, a nivel servicio
  y a nivel página).
- **`id === legajo`** en `tecnicos` (json-server exige `id`). El servicio
  escribe los dos iguales, `isTechnicianRecord` exige que lo sean y **el legajo
  no se puede editar**: es el vínculo con `users` y `equipos`.
- **Una sola fuente de verdad para `specialty`/`teamType`: el maestro.** Los
  `users` técnicos ya no los guardan. El login pide `GET /users` y, si el rol es
  técnico, `GET /tecnicos/:legajo`; la sesión sigue guardando ambos atributos
  (así `canTechnicianHandle` y los guards siguen siendo síncronos).
- **Nombres de campo en inglés** (convención de 013b): el spec dice
  `nombre/apellido/especialidad/tipoEquipo`; en código son
  `firstName/lastName/specialty/teamType`. `TechnicianSpecialty` y
  `TechnicianTeamType` se reutilizan de `auth.model.ts`.
- **Miembros del equipo = lista de legajos dentro del propio equipo**: un solo
  `PUT` guarda el equipo y sus miembros. El servicio los persiste sin repetidos
  (`uniqueMembers`) y rechaza un miembro con legajo inválido.
- **Una sola feature `features/maintenance/`** (técnicos + equipos). Borrar un
  técnico exige mirar equipos y armar un equipo exige mirar técnicos; en dos
  features habría dependencia circular.
- **Capas:** `core/auth` no importa de `features`. Por eso el login y
  `UsersService` consultan `/tecnicos/:legajo` por HTTP con un tipo mínimo
  definido en core (`TechnicianProfile`); `Technician` lo extiende en la feature.
  La política (`maintenance.permissions.ts`) vive en la feature.

### Validación de la referencia cruzada (usuario `tecnico` → maestro)

No hay pantalla de usuarios (autenticación completa es fase 2), así que la regla
vive en `UsersService.create()` y se prueba ahí. Se aplica en tres capas:

| Capa               | Regla                                                                                                                            | Resultado                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `UsersService`     | rol `tecnico` sin legajo válido → error, sin ningún request                                                                      | `InvalidLegajoError`                  |
|                    | `GET /tecnicos/:legajo` → `404` → no sale ningún `POST /users`                                                                   | `TechnicianNotFoundError`             |
|                    | ya hay un usuario técnico con ese legajo                                                                                         | `LegajoAlreadyLinkedError`            |
|                    | error de red o `5xx` en la consulta → se propaga; **nunca** se interpreta como "no existe"                                       | error HTTP original                   |
|                    | perfil del maestro corrupto → no se escribe (no queda un login a medias)                                                         | `InvalidUserRecordError`              |
|                    | rol no técnico con `legajo` → se rechaza                                                                                         | `InvalidLegajoError`                  |
| Login              | usuario técnico cuyo legajo ya no existe en el maestro → sin sesión                                                              | `InvalidUserRecordError` (ya existía) |
| Borrado de técnico | bloqueado si tiene usuario de login o es miembro de un equipo; el aviso dice cuál. Si la consulta de referencias falla, no borra | aviso; sin `DELETE`                   |

### Permisos

| Acción                                   | Permitido a                                  |
| ---------------------------------------- | -------------------------------------------- |
| Ver, crear y modificar técnicos          | `administrador`, `team-leader-mantenimiento` |
| Eliminar técnicos                        | `administrador`                              |
| Ver, crear, modificar y eliminar equipos | `team-leader-mantenimiento`                  |

`personal-produccion` y `tecnico` no acceden a nada de esto. Un test compara los
roles de la tabla con `USER_ROLES`: si se agrega un rol nuevo, falla hasta que
alguien decida sus permisos.

### Decisiones abiertas del plan, confirmadas

1. `username` no cambia: "el login usa legajo" se implementó como el campo
   `legajo` del registro, no como nombre de usuario.
2. Legajo: string de 1 a 8 dígitos (`LEGAJO_PATTERN`). Además de ser el formato,
   garantiza que nunca llegue a una URL algo como `../users`.
3. Equipos: solo el TeamLeader; el Administrador ni siquiera ve la sección.
4. No se valida la coherencia `teamType` del técnico ↔ `type` del equipo, ni se
   limita a un equipo por técnico.
5. Solo el Administrador elimina técnicos.

### Hallazgos de JSON Server (1.0.0-beta.15, comprobados)

- **No rechaza ids duplicados**: un `POST` con un `id` existente responde `201` y
  crea otro registro. La unicidad del legajo la garantiza el cliente
  (`TechniciansService.create` consulta antes de escribir).
- **Convierte a número los valores numéricos del query string**: `?legajo=100`
  devuelve `[]` aunque exista `"legajo": "100"`. Por eso el maestro se consulta
  por ruta (`GET /tecnicos/:legajo`, `200`/`404`) y los usuarios técnicos se
  filtran en el cliente sobre `GET /users?role=tecnico`.
- Sin integridad referencial. Con el backend real (spec 018) todo esto pasa a ser
  FK + índice único y los chequeos previos se vuelven `409`/`422` del servidor.

### Diseño del "agregar por legajo" (tarea 13)

- Estados: `idle | checking | invalid-format | found | not-found |
already-member | error`. "Agregar" se habilita solo en `found`; el feedback de
  "encontrado" aparece **antes** de confirmar. "Ya es miembro" y "formato
  inválido" se resuelven sin HTTP.
- **No se usó `debounceTime` + `switchMap` en cadena.** Así, la consulta vieja
  solo se cancela cuando vence la espera de la nueva: una respuesta tardía podía
  dejar "Técnico encontrado" del legajo anterior con el campo ya cambiado y el
  botón habilitado. Se usó `switchMap` a "estado buscando + `timer(300)` +
  consulta", que cancela la consulta en vuelo apenas cambia el campo. Hay un test
  para ese caso exacto.
- `distinctUntilChanged` va sobre lo **tipeado** (no sobre lo ya esperado): un
  espacio de más no reinicia la búsqueda, pero tipear `1001`, `1001x` y volver a
  `1001` sí consulta de nuevo. Después del debounce, ese caso dejaría el estado en
  "buscando" para siempre.
- Al quitar un miembro se revalida el campo (si estaba tipeado como "ya es
  miembro", pasa a "encontrado" sin retipear).
- Enter dentro del campo se intercepta: agrega al técnico encontrado, o no hace
  nada; nunca envía el formulario del equipo entero.
- Un fallo de red se muestra como "No se pudo verificar", nunca como "no existe".

## Desvíos del plan

- **Las tareas 1 a 3 se hicieron juntas.** Hacer obligatorio `legajo` y sacar
  `specialty`/`teamType` del registro de `users` rompió la compilación de los
  specs con fixtures de técnico y el login no podía armar la sesión de un
  técnico. Igual que en 013b, la suite no podía quedar verde tarea por tarea.
- **Se agregó `UsersService.hasTechnicianAccount()`** (tarea 10): el borrado de
  técnicos la necesita y `ensureNotLinked` la reutiliza. `uniqueMembers` (tarea 9)
  y `technician.display.ts` (tarea 10) tampoco estaban en el plan.
- **Las páginas se testean con servicios mockeados**, no con `expectNone` sobre
  `HttpTestingController`; el equivalente es `not.toHaveBeenCalled()`. La
  semántica HTTP está en los specs de los servicios, y el formulario de técnico
  tiene además un test contra el servicio real que comprueba que crear no toca
  `/users`.
- **"Protección de formulario sucio como en 004"** se implementó como lo que dice
  el spec 004 (bloquear el envío inválido y el doble envío, y liberar el
  formulario tras un error). No se agregó un aviso al abandonar el formulario con
  cambios.
- **Tarea 15 corrigió un bug previo** (ver abajo): fuera del alcance escrito, pero
  el defecto era el mismo que tenían los links nuevos.
- **Tarea 16 agregó un test permanente** (`db.seed.spec.ts`) en vez de solo
  verificar los datos con un script. 013b anotó que el proyecto "no tiene
  `resolveJsonModule`"; importar `db.json` desde un spec funciona sin tocar la
  configuración (`module: preserve`).
- **Las mutaciones se hicieron tarea por tarea** para las páginas y al cierre
  para los servicios, modelos y el login (lista del plan). No se hicieron durante
  las tareas 1 a 9.

## Bug corregido en el sidebar (`aria-current`)

`routerLinkActive` sin `ariaCurrentWhenActive` **borra** el atributo
`aria-current` en cada actualización, y un `[attr.aria-current]` manual no lo
vuelve a escribir mientras su valor no cambia. Al moverse dentro de la misma
sección (por ejemplo `/work-orders` → `/work-orders/1`) el atributo desaparecía.
Los links "Inicio" y "Órdenes" (spec 008b) tenían el defecto. Los cuatro links
usan ahora `ariaCurrentWhenActive="page"`. Lo detectó un test de "link activo en
páginas anidadas" de la tarea 15; hay un test de regresión que falla con el patrón
viejo.

## Limitaciones y cosas a tener en cuenta

- **Todo esto es control de navegación/UX, no autorización.** El rol y los
  atributos del técnico viven en `localStorage`; la autorización real es del
  backend (spec 018).
- **Un cambio de especialidad o de tipo de equipo se ve en la sesión del técnico
  al volver a loguearse**, no en caliente: la sesión guarda una copia del perfil.
- **Las sesiones guardadas antes de 013c se descartan** (un técnico sin `legajo`
  no valida): hay que volver a loguearse una vez.
- **`UsersService.create()` no exige `username` único.** json-server no lo impide
  y el login toma el primer resultado: un duplicado dejaría a alguien sin poder
  entrar. El spec no lo pide; `db.seed.spec.ts` lo comprueba solo en los datos de
  prueba.
- **`UsersService.create()` solo se ejerce desde los tests**: no hay pantalla de
  usuarios.
- **Un legajo tipeado y no agregado se ignora al guardar el equipo**; no se avisa.
- **Carrera en la unicidad del legajo:** el chequeo previo y el `POST` no son
  atómicos. Aceptable en el mock; el backend lo cubre con el índice único.
- **Para eliminar un técnico que está en un equipo hay que quitarlo antes del
  equipo** (la interfaz solo bloquea y explica). Y como el legajo no se edita,
  corregir uno mal cargado implica borrar y crear de nuevo.
- **Los nombres de los miembros de un equipo se piden con `getAll()`** al editar;
  si falla, la lista muestra solo el legajo.
- **`layout/sidebar` importa la política desde `@features/maintenance`.** Es una
  dependencia del layout hacia una feature (el layout compone las secciones de
  la app); si se prefiere, la política puede subir a `core`.
- **Las rutas nuevas usan `API_BASE_URL`**; `WorkOrdersService` sigue con su URL
  escrita a mano (pendiente ya documentada en el README).

## Verificación por mutación

Cada mutación se aplicó de verdad, se corrió la suite completa y se restauró el
archivo (se comprobó por contenido). **47 mutaciones, todas detectadas.**

| Tarea  | Mutación                                                                    | Tests que fallan |
| ------ | --------------------------------------------------------------------------- | ---------------- |
| 10     | `deleteTechnician` sin chequeo de permiso                                   | 3                |
| 10     | El chequeo de usuario de login se ignora                                    | 2                |
| 10     | Un error al verificar referencias igual borra                               | 2                |
| 11     | Sin guarda de doble envío                                                   | 2                |
| 11     | El legajo duplicado se trata como error genérico                            | 3                |
| 11     | Sin chequeo de permiso                                                      | 4                |
| 11     | El legajo no se deshabilita en edición                                      | 1                |
| 11     | Un formulario inválido igual envía                                          | 6+               |
| 11     | Sin chequeo de "sin cambios"                                                | 2                |
| 12     | `deleteTeam` sin chequeo de permiso                                         | 3                |
| 12     | El Administrador puede gestionar equipos                                    | 2                |
| 12     | No se recarga la lista tras eliminar                                        | 1                |
| 13     | "Agregar" habilitado siempre                                                | 5+               |
| 13     | "Agregar" habilitado salvo "no existe" (sin exigir `found`)                 | 5+               |
| 13     | `switchMap` reemplazado por `mergeMap`                                      | 3                |
| 13     | Sin chequeo local de "ya es miembro" (consulta al servidor)                 | 3                |
| 13     | Un fallo de red se reporta como "no existe"                                 | 1                |
| 13     | Sin revalidar al quitar un miembro                                          | 1                |
| 13     | Sin guarda de duplicados en `addTechnician`                                 | 1                |
| 13     | Enter sin `preventDefault`                                                  | 2                |
| 13     | Sin guarda de doble envío                                                   | 1                |
| 13     | Sin chequeo de permiso                                                      | 4                |
| 14     | Lista de equipos abierta al Administrador                                   | 2                |
| 14     | Edición de equipo abierta a cualquier rol con sesión                        | 3                |
| 14     | Alta de técnico abierta a cualquier rol con sesión                          | 2                |
| 14     | El matcher acepta cualquier legajo                                          | 5+               |
| 14     | El matcher ignora el sufijo `edit`                                          | 1                |
| 15     | `aria-current` vuelve al binding manual (regresión)                         | 1                |
| 15     | "Equipos" visible para el Administrador                                     | 2                |
| 15     | "Técnicos" visible para cualquier usuario con sesión                        | 2                |
| 16     | Un equipo referencia un legajo inexistente                                  | 1                |
| 16     | Un usuario técnico apunta a un legajo inexistente                           | 2                |
| 16     | Legajo repetido en el maestro                                               | 4+               |
| 16     | Un usuario técnico vuelve a llevar `specialty`                              | 1                |
| 16     | `username` repetido                                                         | 1                |
| 16     | Todos los técnicos tienen usuario                                           | 2                |
| cierre | `TechniciansService.create` omite el chequeo de legajo libre                | 24               |
| cierre | `canDeleteTechnician` deja borrar al TeamLeader                             | 4                |
| cierre | `UsersService.create` ignora el `404` (acepta un legajo inexistente)        | 58               |
| cierre | `UsersService.create` trata cualquier error (`500`) como "no existe"        | 1                |
| cierre | `UsersService.create` omite la consulta al maestro                          | 28               |
| cierre | `addMember` permite duplicados                                              | 2                |
| cierre | `TechniciansService.update` deja cambiar el legajo                          | 1                |
| cierre | `findByLegajo` trata cualquier error (`500`) como "no existe"               | 21               |
| cierre | El login del técnico toma el perfil del registro de `users`, no del maestro | 18               |
| cierre | `isAuthUser` acepta un técnico sin `legajo`                                 | 5                |
| cierre | `TeamsService` persiste los miembros con repetidos                          | 2                |

Varios primeros intentos **no compilaban** (dejaban un import o una constante sin
usar) o no llegaban a aplicarse (la expresión no coincidía con el formato de
prettier), y por eso no probaban nada. Se repitieron con variantes que compilan y
se detectó cada caso; uno de esos primeros intentos, que dio "todo verde" sin
haberse aplicado, se descartó como falso resultado. Una mutación que no compila
no cuenta como "detectada".

La cifra "5+" indica que la salida se cortó en los primeros casos listados.

## Contrato con JSON Server

Contra el servidor real (`pnpm api` sobre el `db.json` real, solo lecturas; el
archivo quedó idéntico), con los mismos pedidos que hace la app:

- Login de técnico: `GET /users?username=…&password=…` devuelve el registro con su
  `legajo` y `GET /tecnicos/1001` / `/tecnicos/1002` devuelven el perfil.
- `GET /tecnicos/9999`, `/tecnicos/abc` y `/equipos/99` responden `404`.
- `GET /tecnicos`, `/tecnicos/1003`, `/equipos`, `/equipos/1`,
  `/users?role=tecnico` y `work-orders` (paginado) responden bien.

## Cobertura

Los archivos de código nuevos o modificados están al 100% en las cuatro métricas,
salvo dos páginas con una rama o sentencia sin cubrir:

| Archivo                          | Statements | Branches | Functions | Lines |
| -------------------------------- | ---------- | -------- | --------- | ----- |
| `pages/technician-form/…form.ts` | 98.66%     | 97.77%   | 100%      | 100%  |
| `pages/team-form/team-form.ts`   | 99.23%     | 98.41%   | 100%      | 100%  |

Las plantillas `.html` de las cuatro páginas quedan entre 97% y 98% en
sentencias (Branches 87.5–100%, Functions 75–86%: los handlers que el template
declara en línea). El resto —`auth.model.ts`, `auth.service.ts`,
`users.service.ts`, ambos servicios de `maintenance`, ambos modelos, la política,
los labels, las rutas, los dos listados, el sidebar y `app.routes.ts`— está al 100%.

Medición global (`pnpm run test:coverage`), dos corridas sobre el mismo código:

```
                corrida 1           corrida 2 (la del README)
Statements : 97.42% (2079/2134)  97.56% (2082/2134)
Branches   : 97.43% (836/858)    97.43% (836/858)
Functions  : 95.30% (447/469)    95.73% (449/469)
Lines      : 98.54% (1556/1579)  98.73% (1559/1579)
```

Branches es el número estable; Statements, Functions y Lines fluctúan entre
corridas sobre el mismo código (ya documentado en 010, 011 y 013b). Subieron
respecto de 013b (Branches 96.81%, Functions 93.57%).

La tabla de la consola de `test:coverage` no lista los archivos al 100%, por lo
que los porcentajes por archivo se leyeron del reporte HTML.

## Pendiente

- **Verificación manual de la interfaz completa**: no registrada. Sí hay indicios
  de uso manual (el `db.json` local cambió mientras se trabajaba: se editó un
  equipo desde la interfaz), pero no se registró un recorrido. Pasos, con
  `pnpm api` + `pnpm start`:
  1. `teamleader`: ve Técnicos y Equipos en el menú; crea el técnico `1004`; un
     legajo duplicado da error; no ve "Eliminar" en técnicos; en un equipo
     tipea `1004` (feedback "encontrado"), `9999` ("no existe") y un miembro
     actual ("ya es miembro").
  2. `admin`: ve Técnicos y no Equipos; `/maintenance/teams` lo manda a
     `/dashboard` con aviso; borra `1003` (sin usuario ni equipo) y falla al
     borrar `1001` con el aviso de motivos.
  3. `tecnico` y `produccion`: sin links; las rutas `/maintenance/*` los mandan a
     `/dashboard`.
  4. Login con `tecnico` (legajo `1001`): la sesión trae la especialidad del
     maestro; editar su especialidad y volver a loguearse la refleja.
  5. Sin sesión, `/maintenance/teams` lleva a login y, tras entrar como
     `teamleader`, vuelve a `/maintenance/teams`.
- **`db.json` de trabajo tiene ediciones manuales sin commitear**, que se dejaron
  fuera del commit de datos: los estados de las órdenes 1 y 6, la orden de prueba
  `-F0Rxw22vkQ` y la edición del equipo 1 ("Guardia Grupo A", con los técnicos
  `1001` y `1002`). El commit contiene solo los datos de `tecnicos`, `equipos` y
  `users`; `git checkout -- src/app/features/work-orders/data-access/db.json`
  descarta las ediciones cuando ya no hagan falta. Mientras un JSON Server local
  esté corriendo, reescribe `db.json` sin el salto de línea final y
  `prettier --check` lo marca.

## Commits

Siete commits en orden de dependencia (más el que actualiza estas notas). Cada uno se verificó por separado en un
árbol limpio (tests y lint; el de rutas y menú también `ng build`), así que cada
punto de la historia compila y pasa la suite:

| Commit                                                         | Tests |
| -------------------------------------------------------------- | ----- |
| `feat(auth)`: legajo, login contra el maestro y `UsersService` | 583   |
| `feat(maintenance)`: modelos, política y servicios             | 742   |
| `feat(maintenance)`: las cuatro páginas                        | 888   |
| `feat(maintenance)`: rutas con guards y links del menú         | 957   |
| `test(maintenance)`: integridad de los datos de prueba         | 972   |
| `docs(spec)` y `docs(readme)`                                  | 972   |

El primero incluye los datos de prueba de `db.json` (`tecnicos`, `equipos` y los
usuarios técnicos con `legajo`), porque sin ellos el login de un técnico deja de
andar en desarrollo apenas cambia el modelo. `spec.md` quedó reformateado por el
hook de pre-commit al commitearse.
