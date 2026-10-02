# Angular Enterprise Lab

Laboratorio de arquitectura Angular aplicado a un sistema de gestión de órdenes de mantenimiento.

El proyecto busca construir una aplicación pequeña y mantenible que sirva como referencia técnica, base de aprendizaje y material para explicar decisiones de desarrollo. El foco está en la separación de responsabilidades, la reutilización, el manejo de estado, las pruebas y la documentación.

**Estado:** en desarrollo. El frontend ya consume la API real (Spring Boot + JWT + PostgreSQL, spec 018): JSON Server y los mocks se retiraron. El flujo CRUD está implementado y la búsqueda con paginación está en proceso de estabilización. La autenticación, los roles y la gestión de técnicos y equipos ya están implementados (specs 010, 011, 013b y 013c), igual que el maestro de máquinas con su árbol de partes (spec 013a) y, sobre él, la máquina y parte de cada orden con el flujo de tomar, cerrar y liberar una orden (spec 013d); el resumen del dashboard (spec 014) ya está, pero los indicadores más allá de él y la asignación de una orden a un técnico concreto (más allá de quien la toma) forman parte del roadmap.

## Metodología de desarrollo

Este proyecto se desarrolla utilizando [Claude Code](https://claude.com/product/claude-code),
la CLI agéntica de Anthropic, siguiendo un flujo de spec-driven development: cada
funcionalidad no trivial se documenta en una spec antes de implementarse, se traduce
en un plan de tareas verificable, y se ejecuta en una sesión separada de la planificación.

Esta decisión responde al objetivo del laboratorio: no solo construir la aplicación,
sino dejar registro explícito de las decisiones técnicas y del proceso que las originó,
como material de referencia y aprendizaje.

Los artefactos de este proceso (specs, planes y notas de verificación) se conservan
en `.claude/specs/` y quedan versionados junto al código. La sección
[Flujo de desarrollo](#flujo-de-desarrollo) detalla las fases del proceso.

## Stack

| Tecnología                | Uso                                                     |
| ------------------------- | ------------------------------------------------------- |
| Angular 22 y TypeScript 6 | Aplicación con componentes standalone                   |
| Angular Router            | Navegación y carga diferida                             |
| Signals                   | Estado local y valores derivados                        |
| RxJS 7 y HttpClient       | Peticiones HTTP y búsqueda reactiva                     |
| Reactive Forms            | Formulario compartido para creación y edición           |
| SCSS                      | Tokens, estilos globales y componentes visuales         |
| API Spring Boot + JWT     | Backend real (repositorio `angular-enterprise-lab-api`) |
| Vitest                    | Pruebas mediante la integración de Angular              |
| ESLint y Prettier         | Análisis estático y formato                             |
| Husky y lint-staged       | Hook de validación previo al commit                     |
| pnpm                      | Gestión de dependencias y ejecución de scripts          |

Las versiones concretas de las dependencias se registran en `package.json` y `pnpm-lock.yaml`.

## Inicio rápido

### Requisitos

- Node.js compatible con las dependencias del proyecto. La revisión del 7 de septiembre de 2026 se ejecutó con Node.js **22.23.2**.
- **pnpm 11.11.0**, declarado en el campo `packageManager`.
- Git.

No es necesario instalar Angular CLI globalmente. Para ejecutar la aplicación completa también hacen falta JDK 21 y Docker (ver "Ejecutar la aplicación").

### Instalación

```bash
git clone https://github.com/CristianEscequiel/angular-enterprise-lab.git
cd angular-enterprise-lab
pnpm install --frozen-lockfile
```

### Ejecutar la aplicación

El frontend consume la API real del repositorio hermano [`angular-enterprise-lab-api`](../angular-enterprise-lab-api) (Java 21, Spring Boot 3, PostgreSQL). Ya no existe un JSON Server de desarrollo. Mantené las tres terminales abiertas.

**Terminal 1 — Base de datos** (en `angular-enterprise-lab-api`; requiere Docker):

```bash
docker compose up -d
docker compose ps   # el servicio postgres debe figurar como "healthy"
```

**Terminal 2 — API** (en `angular-enterprise-lab-api`; requiere JDK 21):

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

El perfil `dev` aplica las migraciones, siembra usuarios, técnicos, equipos, máquinas, partes y las 32 órdenes de prueba, y usa un secreto JWT por defecto solo para desarrollo. Sin el perfil `dev` hay que definir `JWT_SECRET` (mínimo 32 bytes).

**Terminal 3 — Angular** (en este repositorio):

```bash
pnpm start
```

| Servicio         | Dirección                                                               |
| ---------------- | ----------------------------------------------------------------------- |
| Aplicación       | [localhost:4200](http://localhost:4200)                                 |
| API (salud)      | [localhost:8080/actuator/health](http://localhost:8080/actuator/health) |
| API (Swagger UI) | [localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html) |

Levantar Angular no inicia la API. Sin ella el login y todas las pantallas muestran el error de conexión. La API solo acepta peticiones desde `http://localhost:4200` (CORS).

Las pruebas (`pnpm test`) **no** necesitan la API ni la base de datos: usan `HttpTestingController`.

### Configuración de la API

La URL base está en un único lugar, `src/app/core/config/api.config.ts` (`API_BASE_URL`, `http://localhost:8080`), y todos los servicios derivan sus rutas de ella. El `authInterceptor` solo envía el token (`Authorization: Bearer …`) a URLs que empiezan por esa base.

| Recurso           | Rutas                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sesión            | `POST /auth/login` → `{ token, user }`; `GET /auth/me`                                                                               |
| Técnicos          | `/technicians` y `/technicians/{legajo}` (el legajo identifica al técnico)                                                           |
| Equipos           | `/teams` y `/teams/{id}`                                                                                                             |
| Máquinas y partes | `/machines`, `/machines/{id}/parts` y `/parts/{id}`                                                                                  |
| Órdenes           | `/work-orders` (`page`, `size`, `title`, `status`, `priority`), `/work-orders/{id}` y `/work-orders/{id}/take`, `/close`, `/release` |
| Dashboard         | `/dashboard/summary` y `/dashboard/workload`                                                                                         |

La API devuelve errores como `{ code, message, timestamp, path }` (con `details` en los `400` de validación y en los `409` de las transiciones de una orden). El `errorInterceptor` los expone como `AppHttpError` con `code` y `details`, y cada servicio traduce los códigos de negocio (`DUPLICATE_MACHINE_CODE`, `PART_HAS_CHILDREN`, `WORK_ORDER_NOT_PENDING`, …) a errores tipados que las páginas muestran. Un `401` con sesión abierta cierra la sesión y lleva a `/login`; un `403` muestra el aviso de permisos y conserva la pantalla. Detalle del contrato en `.claude/specs/018-integracion-api-backend/`.

### Usuarios de prueba

El login es `POST /auth/login` contra la API (spec 018): devuelve un JWT (60 minutos de vida) y el usuario completo. Al abrir la app con una sesión guardada se contrasta con `GET /auth/me`: un `401` la descarta y una caída de conexión la conserva. Estos usuarios existen solo con el perfil `dev` de la API; para un técnico, la respuesta trae también su `legajo`, `specialty` y `teamType` (del maestro de técnicos):

| Usuario        | Contraseña        | Rol                         | Legajo → especialidad / tipo de equipo            |
| -------------- | ----------------- | --------------------------- | ------------------------------------------------- |
| `admin`        | `admin123`        | `administrador`             | —                                                 |
| `teamleader`   | `teamleader123`   | `team-leader-mantenimiento` | —                                                 |
| `produccion`   | `produccion123`   | `personal-produccion`       | —                                                 |
| `tecnico`      | `tecnico123`      | `tecnico`                   | `1001` → `mecanico` / `guardia`                   |
| `electricista` | `electricista123` | `tecnico`                   | `1002` → `electricista` / `preventivo-correctivo` |

Qué puede hacer cada rol sobre las órdenes (la regla vive en `features/work-orders/models/work-order.permissions.ts` y la usan las rutas, las páginas y el listado):

| Rol                         | Ver | Crear                      | Editar | Eliminar |
| --------------------------- | --- | -------------------------- | ------ | -------- |
| `administrador`             | Sí  | —                          | Sí     | Sí       |
| `team-leader-mantenimiento` | Sí  | `preventivo`, `correctivo` | Sí     | —        |
| `personal-produccion`       | Sí  | `pronto-intervencion`      | —      | —        |
| `tecnico`                   | Sí  | —                          | —      | —        |

El técnico gestiona (toma, comenta, cierra) las órdenes de su especialidad y tipo de equipo: `general` cubre ambas especialidades y `guardia` atiende `pronto-intervencion`, mientras que `preventivo-correctivo` atiende `preventivo` y `correctivo`. `canTechnicianHandle` (que además exige la especialidad de la orden) sigue siendo solo una consulta; la política real de tomar y cerrar es `canTakeWorkOrder` (spec 013d), que compara solo el tipo de equipo del técnico con el tipo de la orden, porque las órdenes todavía no llevan especialidad. Ver "Órdenes de trabajo: máquina, tomar y cerrar". Estas reglas son control de navegación y de interfaz: el rol vive en `localStorage` y es editable, así que la autorización real corresponde al backend.

### Técnicos y equipos

El **maestro de técnicos** (`tecnicos`) es una entidad independiente del usuario de login (spec 013c): guarda `legajo` (único), nombre, apellido, especialidad y tipo de equipo, y existe aunque el técnico no tenga usuario. Se vincula con `users` solo por `legajo`. Un **equipo** (`equipos`) tiene nombre, tipo (`guardia` o `preventivo-correctivo`) y la lista de legajos de sus miembros. Los datos de prueba traen tres técnicos (`1001`, `1002` y `1003`, este último sin usuario ni equipo) y dos equipos.

| Acción                                   | Permitido a                                  |
| ---------------------------------------- | -------------------------------------------- |
| Ver, crear y modificar técnicos          | `administrador`, `team-leader-mantenimiento` |
| Eliminar técnicos                        | `administrador`                              |
| Ver, crear, modificar y eliminar equipos | `team-leader-mantenimiento`                  |

Un técnico con usuario de login o miembro de un equipo no se puede eliminar. Crear un usuario de login con rol `tecnico` exige que su legajo exista en el maestro. La regla vive en `features/maintenance/models/maintenance.permissions.ts` y, como la de las órdenes, es control de navegación y de interfaz.

### Máquinas y árbol de partes

El **maestro de máquinas** (`maquinas`) guarda `code` (único, en mayúsculas, hasta 20 letras, dígitos o guiones) y `name`. Cada máquina tiene un **árbol de partes** de profundidad variable en la colección `partes` (spec 013a): cada parte apunta a su máquina (`machineId`) y a su padre (`parentId`, `null` en las de primer nivel), y una parte sin hijos es una hoja. Es la base para que la spec 013d asocie cada orden a "qué máquina y qué parte". Los datos de prueba traen tres máquinas: la Envasadora (árbol de 4 niveles, con una hoja hermana en el nivel 2), la Selladora (2 niveles) y la Rotuladora (sin partes, la única que se puede eliminar).

| Acción                                                            | Permitido a                                  |
| ----------------------------------------------------------------- | -------------------------------------------- |
| Ver la gestión, crear, modificar y eliminar máquinas y sus partes | `administrador`, `team-leader-mantenimiento` |

`personal-produccion` y `tecnico` no acceden a la gestión. Una parte con sub-partes no se puede eliminar, y una máquina con partes tampoco: no hay cascada, así que un subárbol se elimina de las hojas hacia arriba (así nunca quedan partes sin padre). La regla vive en `features/machines/models/machines.permissions.ts` y, como las demás, es control de navegación y de interfaz.

## Funcionalidades actuales

- Listado de órdenes de mantenimiento.
- Búsqueda por título con debounce y paginación desde la API.
- Filtros por estado y prioridad combinables con la búsqueda; viajan en la misma petición paginada y reinician la página a 1.
- Prioridad y estado (`pending`, `in-progress`, `completed`, `cancelled`) visibles como badges en el listado; el estado ya no se cambia a mano: cambia al tomar, cerrar o liberar una orden.
- Consulta del detalle mediante un identificador en la URL.
- Creación y edición con un formulario compartido.
- Tipo de orden (`preventivo`, `correctivo`, `pronto-intervencion`): se elige al crear, no se cambia al editar y se muestra en el listado y el detalle.
- Cada orden apunta a una máquina y, opcionalmente, a una parte de su árbol (spec 013d): se elige al crear (obligatorio para todos los tipos, en cualquier nivel), con un comentario corto de la falla; no se cambia al editar. La ruta se guarda como texto ("Envasadora línea 1 > Mesa de transporte > Cinta 1") y no se recalcula si luego se renombra la parte.
- Tomar, cerrar y liberar órdenes (spec 013d): el técnico habilitado toma una orden pendiente y queda como su dueño; la cierra (completada o cancelada) desde una página propia con un comentario obligatorio de 50 a 500 caracteres; otro técnico no puede tomarla ni cerrarla (se le advierte quién la ejecuta); administrador y team leader pueden liberar una orden en progreso.
- Autenticación con JWT contra la API y cuatro roles: crear, editar y eliminar órdenes dependen del rol (ver "Usuarios de prueba").
- Gestión de técnicos (listado con búsqueda, alta, edición y baja) y de equipos (listado, alta, edición y baja), según el rol (ver "Técnicos y equipos").
- Alta de miembros de un equipo por legajo, con validación en tiempo real: muestra si el técnico existe, si ya es miembro o si el legajo no es válido antes de confirmar.
- Gestión de máquinas (listado con la cantidad de partes, alta, edición y baja) y de su árbol de partes de profundidad variable (agregar sub-partes, renombrar y eliminar, con bloqueo si hay sub-partes), según el rol (ver "Máquinas y árbol de partes").
- Menú lateral que ofrece solo las secciones permitidas al rol.
- Eliminación con confirmación.
- Indicador global de peticiones en curso.
- Mensajes globales de éxito, advertencia y error.
- Layout mobile-first: bajo 768px una barra de navegación inferior fija; desde 768px un sidebar siempre visible. Sin sesión (p. ej. en `/login`) no hay navegación.
- Listados que son tarjetas bajo 1024px y tabla desde ahí, con una franja de color por estado en las órdenes.
- Dashboard "Turno de hoy": pendientes (y cuántas de prioridad alta), en curso (y cuántas son del usuario), cerradas hoy, la lista de las propias (spec 014), el resumen que calcula la API (total, abiertas, cerradas del período y tiempo promedio de resolución) y, para administrador y team leader, la carga de trabajo por técnico (spec 018).

La búsqueda, la paginación y la recarga después de eliminar requieren completar su coordinación. También están pendientes mejoras de recuperación ante errores y protección durante el envío de formularios.

## Arquitectura

La aplicación se organiza por funcionalidad, con infraestructura y componentes compartidos fuera de cada dominio.

```text
src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   ├── interceptors/
│   │   ├── services/
│   │   └── testing/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── machines/
│   │   ├── maintenance/
│   │   └── work-orders/
│   │       ├── components/form/
│   │       ├── data-access/
│   │       ├── models/
│   │       ├── pages/
│   │       └── work-orders.routes.ts
│   ├── layout/
│   │   ├── app-shell/
│   │   ├── header/
│   │   └── sidebar/
│   ├── shared/components/
│   ├── app.config.ts
│   ├── app.routes.ts
│   └── app.ts
├── styles/
│   ├── abstracts/
│   ├── base/
│   ├── components/
│   ├── layout/
│   ├── themes/
│   ├── utilities/
│   └── main.scss
└── styles.scss
```

| Capa       | Responsabilidad                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| `core`     | Infraestructura transversal: sesión y guards, loading, mensajes e interceptores HTTP |
| `layout`   | Composición visual y alojamiento del `RouterOutlet`                                  |
| `shared`   | Componentes reutilizables de interfaz                                                |
| `features` | Páginas, formularios, modelos y acceso a datos del dominio                           |
| `styles`   | Tokens y estilos compartidos                                                         |

Se incorporan carpetas y abstracciones cuando existe una responsabilidad concreta que justifica su uso.

Los imports entre capas usan los aliases `@core/*`, `@shared/*` y `@features/*` (definidos en `tsconfig.json`, sin `baseUrl`) en vez de rutas relativas de varios niveles; los imports dentro de una misma feature siguen siendo relativos.

### Órdenes de trabajo

Las páginas coordinan la carga de datos, las acciones y la navegación. `WorkOrdersService` encapsula las peticiones HTTP. El componente `Form`, ubicado dentro de la feature, recibe datos iniciales y emite los valores del formulario hacia las páginas de creación o edición.

`WorkOrder` representa una orden y `WorkOrderCreateRequest` los datos necesarios para crearla; ambos llevan el `type` de la orden. La política de permisos (`work-order.permissions.ts`) resuelve quién puede crear cada tipo, editar y eliminar; el `Form` no conoce roles: la página le pasa `allowedTypes` (qué tipos ofrecer) y `lockType` (en edición el tipo queda fijo), y `WorkOrderCreate` vuelve a validar el permiso al enviar. `PaginatedResponse<T>` describe la respuesta paginada utilizada por el listado.

Las páginas de detalle y edición consultan la orden por el identificador de la ruta. No necesitan recibir el objeto completo desde la lista, por lo que pueden cargar los datos al acceder directamente a una URL existente.

### Órdenes de trabajo: máquina, tomar y cerrar

**Máquina y parte (spec 013d).** `WorkOrder.machineRef` (`machineId`, `partId`, `breadcrumb`, `comment`) reemplaza al antiguo texto libre "activo" (`asset`). `MachinePartPicker` (presentacional, en `features/work-orders`) combina un selector de máquina con el `PartTree` de la spec 013a (`showActions=false`); `Form` no arma la ruta, solo emite `machineId`, `partId` y `comment`, y `WorkOrderCreate` arma el `breadcrumb` una sola vez, al enviar, con `buildBreadcrumb` (`machines/models/part.model.ts`). `buildBreadcrumb` sube por `parentId` y devuelve `null` —la orden no se crea— si la cadena no se puede resolver. En edición la referencia es de solo lectura: el `PUT` conserva la guardada.

**Tomar, cerrar y liberar.** Una orden pasa `pending` → `in-progress` (la toma un técnico, que queda en `takenBy`) → `completed` o `cancelled` (con un `closingNote`: comentario, autor y fecha). Una orden cerrada no se reabre. `WorkOrdersService.take`, `close` y `release` son un solo `POST` cada uno (`/work-orders/{id}/take`, `/close`, `/release`): el dueño y el autor del cierre salen del token y la API valida y hace atómica la transición. Si la lista o la página estaba desactualizada responde `409` (`WORK_ORDER_NOT_PENDING`, `WORK_ORDER_NOT_IN_PROGRESS` o `WORK_ORDER_TAKEN_BY_OTHER`) con el estado real y quién es el dueño en `details`; el servicio lo traduce a `WorkOrderStateError` y la página avisa y recarga. Un `403` en `take` significa que el equipo del técnico no atiende ese tipo. El cliente solo valida el comentario (50 a 500 caracteres) antes de enviar. La política (`canTakeWorkOrder`, `canResolveWorkOrder`, `canReleaseWorkOrder`) vive en `work-order.permissions.ts` y decide qué botones se muestran. La página `/work-orders/:id/resolve` (solo técnicos) muestra la orden en solo lectura con dos controles, el resultado y el comentario. Liberar no deja historial de quién lo hizo. Detalle de las decisiones y las limitaciones en `.claude/specs/013d-maquina-en-orden/notes.md`.

### Técnicos y equipos

La feature `maintenance` agrupa técnicos y equipos (una sola feature porque armar un equipo exige mirar técnicos). `TechniciansService` y `TeamsService` encapsulan el HTTP; las páginas (`technicians-list`, `technician-form`, `teams-list`, `team-form`) coordinan y deciden. Eliminar un técnico es un único `DELETE /technicians/{legajo}`: si tiene usuario de acceso o es miembro de un equipo, la API responde `409 TECHNICIAN_IN_USE` con el motivo y el listado lo muestra como aviso sin quitar la fila.

El maestro y el usuario de login se mantienen separados. La API identifica al técnico por su `legajo` en la URL (`/technicians/{legajo}`); el `id` lo asigna el servidor y **no es el legajo**. El legajo es único (`409 DUPLICATE_LEGAJO`, que el formulario muestra en el campo) y no se edita. El perfil del técnico (especialidad y tipo de equipo) llega ya dentro del `user` del login, así que el frontend no consulta el maestro para armar la sesión. Un equipo con un legajo de miembro inexistente se rechaza con `400 UNKNOWN_TECHNICIAN` y el formulario conserva la selección.

El alta de miembros por legajo espera 300 ms sin tipear, cancela la consulta en vuelo apenas cambia el campo (así una respuesta tardía nunca pisa a un legajo más nuevo) y resuelve "ya es miembro" sin HTTP. Detalle de las decisiones en `.claude/specs/013c-tecnicos-equipos/notes.md`.

### Máquinas y árbol de partes

La feature `machines` tiene sus propios servicios (`MachinesService` y `PartsService`), un componente presentacional recursivo (`PartTree`, sin HTTP ni permisos, reutilizable por la spec 013d para elegir una parte) y tres páginas: `machines-list`, `machine-form` y `machine-parts` (el árbol de una máquina). Las páginas deciden el permiso, traducen los errores de los servicios a avisos y recargan el árbol desde el servidor tras cada cambio.

El árbol se guarda como **lista de adyacencia plana** (cada parte con su `parentId`) y `buildPartTree` lo arma desde las raíces: lo que no cuelga de ninguna (datos rotos a mano) se muestra aparte como "partes sin padre" en vez de perderse. Las partes se piden por su máquina (`GET /machines/{id}/parts`), se crean ahí mismo (`POST`, con `parentId` en `null` para el primer nivel), se renombran con `PATCH /parts/{id}` (solo el nombre: la API rechaza mover una parte) y se eliminan con `DELETE /parts/{id}`. La API garantiza la integridad que antes verificaba el cliente: `409 PART_HAS_CHILDREN`, `409 MACHINE_HAS_PARTS`, `409 DUPLICATE_MACHINE_CODE` y `400 PARENT_PART_NOT_FOUND` / `PARENT_PART_OTHER_MACHINE`; los servicios los traducen a errores tipados y las páginas muestran el aviso y recargan. El listado de máquinas muestra el `partCount` que calcula la API. La página del árbol se prueba con `features/machines/testing/machines-api.fake.ts`, un servidor en memoria que cumple ese contrato. Detalle histórico de las decisiones en `.claude/specs/013a-maestro-maquinas-partes/notes.md`.

### Routing

| Ruta                                    | Vista                      |
| --------------------------------------- | -------------------------- |
| `/`                                     | Redirección a `/dashboard` |
| `/login`                                | Inicio de sesión (pública) |
| `/dashboard`                            | Turno de hoy (resumen)     |
| `/work-orders`                          | Listado de órdenes         |
| `/work-orders/new`                      | Creación de una orden      |
| `/work-orders/:id`                      | Detalle de una orden       |
| `/work-orders/:id/edit`                 | Edición de una orden       |
| `/maintenance`                          | Redirección a los técnicos |
| `/maintenance/technicians`              | Listado de técnicos        |
| `/maintenance/technicians/new`          | Alta de un técnico         |
| `/maintenance/technicians/:legajo/edit` | Edición de un técnico      |
| `/maintenance/teams`                    | Listado de equipos         |
| `/maintenance/teams/new`                | Alta de un equipo          |
| `/maintenance/teams/:id/edit`           | Edición de un equipo       |

La feature de órdenes utiliza `loadChildren()` y sus páginas se cargan mediante `loadComponent()`. `/dashboard` y `/work-orders/*` requieren sesión (`authGuard`, spec 011): sin ella se redirige a `/login` conservando la URL pedida para volver tras el login. `/login` redirige al destino de retorno (por defecto `/dashboard`) si ya hay sesión (`guestGuard`), y la página 404 es pública. Los roles son `administrador`, `team-leader-mantenimiento`, `personal-produccion` y `tecnico` (este último con especialidad y tipo de equipo, spec 013b). `requireUser(predicate)` restringe una ruta con una regla sobre el usuario y `requireRole(...roles)` es su atajo por rol: `/work-orders/new` exige un rol que pueda crear órdenes, `/work-orders/:id/edit` uno que pueda editarlas y `/work-orders/:id/resolve` (cierre de la orden, spec 013d) ser técnico, según la política de `work-order.permissions.ts`; sin permiso se vuelve a `/dashboard` con un aviso. `/maintenance/*` sigue el mismo esquema con la política de `maintenance.permissions.ts` (técnicos: Administrador y TeamLeader; equipos: solo TeamLeader), y un legajo con formato inválido en la URL de edición cae en la página 404 sin cargar el formulario. `/machines/*` (listado, alta, `:id/edit` y `:id/parts`) exige `canManageMachines` (Administrador y TeamLeader) en cada ruta, y un id con forma insegura (puntos, espacios, más de 64 caracteres) cae en la página 404 sin cargar la página. Estos guards son control de navegación: la autorización real corresponde al backend.

### Signals y RxJS

- `signal()` mantiene estado local, como la orden seleccionada o la apertura del modal.
- `computed()` deriva valores utilizados por la interfaz.
- `input()`, `output()` y `model()` comunican componentes según sus responsabilidades.
- RxJS gestiona HTTP y la búsqueda mediante `debounceTime`, `distinctUntilChanged` y `switchMap`.

El listado ya utiliza estas herramientas, pero aún requiere unificar búsqueda, página y recarga para mantener el estado consistente en todos los escenarios.

## HTTP y backend

Desde la spec 018 el frontend habla con la API real; JSON Server, `db.json`, el `mockApiInterceptor`, el `mockDelayInterceptor` y el emulador de tests (`in-memory-api`) se retiraron. El flujo configurado es:

```text
Página → servicio de la feature → HttpClient
      → authInterceptor → loadingInterceptor → errorInterceptor
      → API (localhost:8080)
```

- **`authInterceptor`:** agrega `Authorization: Bearer <token>` solo a las URLs de la API y solo si hay sesión.
- **`loadingInterceptor`:** informa el inicio y fin de las peticiones. `LoadingService` mantiene un contador para contemplar solicitudes simultáneas.
- **`errorInterceptor`:** convierte el error HTTP en un `AppHttpError` (`status`, `message`, `code`, `details`). Muestra un aviso global salvo en los `409`, los `400` con detalle por campo y los `401` del login y de `/auth/me`, que resuelve quien hizo la petición para no duplicar el mensaje. Un `401` con sesión abierta cierra la sesión y redirige a `/login` con el `returnUrl`.

Un mensaje global no reemplaza los estados persistentes de error ni las opciones de recuperación de cada pantalla.

La API es la autoridad: valida unicidad (legajo, código de máquina), integridad (no borrar una máquina con partes ni una parte con sub-partes, el padre debe ser de la misma máquina), las transiciones de estado de las órdenes y los permisos por rol. Los guards y los permisos del frontend son control de navegación y de interfaz; la autorización real es del servidor. Los servicios solo validan el formato antes de enviar y traducen los errores de la API.

Limitación conocida: la API no filtra por fecha de cierre, así que "Cerradas hoy" del tablero se calcula sobre la primera página (hasta 100) de órdenes `completed` y `cancelled`. Con más de 100 cerradas podría omitir alguna de hoy.

## Componentes compartidos y estilos

| Componente | Función                                                            |
| ---------- | ------------------------------------------------------------------ |
| `Button`   | Botones con variantes `primary`, `secondary`, `outline` y `danger` |
| `Badge`    | Representación visual de variantes y estados                       |
| `Alert`    | Mensajes dentro de una vista                                       |
| `Toast`    | Notificaciones globales con cierre                                 |
| `Spinner`  | Indicador de carga                                                 |
| `Modal`    | Confirmación o cancelación de una acción                           |

La operación de negocio permanece en la página que utiliza el componente. El modal, por ejemplo, emite la confirmación; la página decide qué orden eliminar y llama al servicio correspondiente.

Los estilos se apoyan en variables SCSS, propiedades CSS, mixins y clases compartidas. `src/styles.scss` carga `src/styles/main.scss`, que reúne las capas del sistema visual.

La auditoría de accesibilidad y responsive (`008b-accesibilidad-responsive`) cubrió landmarks, foco, `aria-invalid`/`aria-describedby` en formularios y contraste de color. El modal ya contaba con manejo de foco desde `005-foco-limpieza-modal`.

El rediseño de `014-rediseno-mobile-first` reemplazó el drawer por una barra inferior (mobile) y un sidebar fijo (desde 768px) que comparten los ítems por rol de `layout/nav-items.ts`, y pasó todo el CSS a mobile-first: en `src/styles` solo quedan media queries `min-width` y `prefers-*`. Los tokens (color, espaciado, escala tipográfica, radios) están como propiedades CSS en `:root`, con Atkinson Hyperlegible Next como fuente. El ámbar de señal (`--color-signal`) solo se usa como relleno, nunca como texto (1.82:1 sobre blanco); los bordes decorativos (`--color-border-subtle`) se separan de los de control (`--color-border`, 3.5:1). Con `prefers-reduced-motion: reduce` se apagan transiciones, animaciones y el scroll suave. Decisiones, contrastes medidos y la verificación en navegador en `.claude/specs/014-rediseno-mobile-first/`.

## Scripts y verificaciones

| Comando                        | Propósito                                      |
| ------------------------------ | ---------------------------------------------- |
| `pnpm start`                   | Iniciar Angular en desarrollo                  |
| `pnpm test:coverage`           | Ejecutar las pruebas con cobertura             |
| `pnpm build`                   | Generar el build de producción                 |
| `pnpm watch`                   | Compilar en modo desarrollo y observar cambios |
| `pnpm test`                    | Ejecutar las pruebas mediante Angular          |
| `pnpm test --watch=false`      | Ejecutar las pruebas una sola vez              |
| `pnpm lint`                    | Ejecutar ESLint                                |
| `pnpm exec prettier . --check` | Comprobar formato sin modificar archivos       |

El build se genera en `dist/angular-enterprise-lab`. Compilar el frontend no incluye ni despliega la API.

Husky tiene configurado un hook `pre-commit` que ejecuta `pnpm test`. La adaptación del hook a una ejecución finita y la integración de `lint-staged` están pendientes; su presencia como dependencia no implica que ya esté conectado.

## Flujo de desarrollo

Las funcionalidades no triviales se documentan como spec antes de implementarse,
siguiendo un ciclo de tres fases con revisión entre cada una:

1. **Spec**: qué debe hacer el cambio, requisitos y qué queda fuera de alcance.
2. **Plan**: tareas numeradas contra el código actual, con el test que valida cada una.
3. **Implementación**: ejecutada en una sesión separada de la planificación.

Los specs y planes se conservan en `.claude/specs/<número>-<nombre>/` como registro
de las decisiones tomadas para cada feature.

| Feature                                                                 | Spec                                                                                             | Estado                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Unificar búsqueda, paginación y recarga                                 | [`001-unificar-busqueda-paginacion`](.claude/specs/001-unificar-busqueda-paginacion)             | Implementado (5 tests nuevos, 21→51 en la suite)                                                      |
| Recuperación de la búsqueda tras errores                                | [`002-recuperacion-busqueda-tras-errores`](.claude/specs/002-recuperacion-busqueda-tras-errores) | Implementado (4 tests nuevos, 51→55 en la suite)                                                      |
| Estados de error en detalle y edición                                   | [`003-estados-error-detalle-edicion`](.claude/specs/003-estados-error-detalle-edicion)           | Implementado (13 tests nuevos, 55→73 en la suite)                                                     |
| Protección de formularios inválidos y envíos duplicados                 | [`004-proteccion-formularios`](.claude/specs/004-proteccion-formularios)                         | Implementado (11 tests nuevos, 73→84 en la suite)                                                     |
| Manejo de foco y limpieza del modal                                     | [`005-foco-limpieza-modal`](.claude/specs/005-foco-limpieza-modal)                               | Implementado (8 tests nuevos, 84→92 en la suite)                                                      |
| Página 404 y validación de formato de id                                | [`006-pagina-404`](.claude/specs/006-pagina-404)                                                 | Implementado (12 tests nuevos, 92→104 en la suite)                                                    |
| Cobertura de tests y verificaciones de formato                          | [`007-cobertura-y-verificaciones`](.claude/specs/007-cobertura-y-verificaciones)                 | Implementado (sin tests nuevos — configura medición y verificación, no persigue un número)            |
| Tipado estricto y aliases de imports                                    | [`008a-tipado-aliases`](.claude/specs/008a-tipado-aliases)                                       | Implementado (sin tests nuevos — tipado y refactor de imports, no persigue un número)                 |
| Accesibilidad y adaptación responsive                                   | [`008b-accesibilidad-responsive`](.claude/specs/008b-accesibilidad-responsive)                   | Implementado (15 tests nuevos, 104→119 en la suite)                                                   |
| Cobertura de Functions por feature                                      | [`009-cobertura-por-feature`](.claude/specs/009-cobertura-por-feature)                           | Implementado (9 tests nuevos, 119→128 en la suite; Functions 79.5%→87.57%)                            |
| Autenticación simulada, sesión, logout y retorno tras login             | [`010-autenticacion-simulada`](.claude/specs/010-autenticacion-simulada)                         | Implementado (82 tests nuevos, 128→210 en la suite; +17 del spec de `errorInterceptor`, 227 en total) |
| Guards de ruta y permisos por rol                                       | [`011-guards-permisos-rol`](.claude/specs/011-guards-permisos-rol)                               | Implementado (31 tests nuevos, 227→258 en la suite)                                                   |
| Filtros por estado y prioridad, cambio de estado de órdenes             | [`012-filtros-estado-prioridad`](.claude/specs/012-filtros-estado-prioridad)                     | Implementado (76 tests nuevos, 258→334 en la suite)                                                   |
| Roles extendidos del dominio de mantenimiento                           | [`013b-roles-extendidos`](.claude/specs/013b-roles-extendidos)                                   | Implementado (189 tests nuevos, 334→523 en la suite)                                                  |
| Gestión de técnicos y equipos                                           | [`013c-tecnicos-equipos`](.claude/specs/013c-tecnicos-equipos)                                   | Implementado (449 tests nuevos, 523→972 en la suite)                                                  |
| Maestro de máquinas y árbol de partes                                   | [`013a-maestro-maquinas-partes`](.claude/specs/013a-maestro-maquinas-partes)                     | Implementado (671 tests nuevos, 972→1643 en la suite; incluye el arreglo de 013c)                     |
| Máquina y parte en la orden, tomar, cerrar y liberar                    | [`013d-maquina-en-orden`](.claude/specs/013d-maquina-en-orden)                                   | Implementado (316 tests nuevos, 1645→1961 en la suite; ver notas)                                     |
| Rediseño "Tablero de turno", mobile-first                               | [`014-rediseno-mobile-first`](.claude/specs/014-rediseno-mobile-first)                           | Implementado (102 tests nuevos, 1961→2063 en la suite; ver notas)                                     |
| Integración con la API real (Spring Boot + JWT) y retiro de JSON Server | [`018-integracion-api-backend`](.claude/specs/018-integracion-api-backend)                       | En curso (ver `notes.md` de la spec)                                                                  |

### Estado de las pruebas

Vitest está integrado, pero la suite actual se concentra principalmente en pruebas de creación de componentes. Todavía no ofrece protección suficiente para los flujos completos del CRUD y sus casos límite.

La estrategia a completar incluye:

- Tests HTTP del servicio: método, URL, parámetros, payload y errores.
- Tests del listado: datos, vacío, error, búsqueda, paginación y recarga tras eliminar.
- Tests de formularios: validación y protección frente a envíos repetidos.
- Tests de detalle y edición ante registros inexistentes y fallos de carga: cubierto (spec 003).
- Tests de roles y permisos: modelo del usuario y atributos del técnico, guard `requireUser`, política de permisos, rutas de crear y editar con las rutas reales, y botones y acciones del listado según el rol: cubierto (spec 013b).
- Tests de técnicos y equipos: modelos y validadores, política de permisos, servicios HTTP (unicidad del legajo, consultas por ruta, errores de red distintos de "no existe"), validación cruzada del usuario técnico contra el maestro, las cuatro páginas (incluido el alta por legajo en tiempo real con timers y respuestas fuera de orden), las rutas reales con sus guards, el sidebar por rol y la integridad de los datos de prueba: cubierto (spec 013c).
- Tests de máquinas y árbol de partes: modelos y validadores, `buildPartTree` (5 niveles desordenados, huérfanas, ciclos, ids repetidos), política de permisos, servicios HTTP (verificación de máquina y padre antes de escribir, bloqueo de la eliminación con datos frescos, errores de red distintos de "no existe"), un emulador fiel de JSON Server y la ida y vuelta de los criterios de aceptación contra él (incluida una secuencia de 120 operaciones que nunca deja una huérfana), el componente `PartTree`, las tres páginas, las rutas reales con sus guards, el sidebar por rol y la integridad de los datos de prueba: cubierto (spec 013a).
- Tests de la máquina en la orden y del flujo de tomar y cerrar: `buildBreadcrumb` (niveles desordenados, ciclos, otra máquina), `MachinePartPicker`, el formulario y la página de creación (máquina obligatoria para los tres tipos, solo máquina, nivel 3, comentario separado, respuestas de partes fuera de orden), la ida y vuelta contra el emulador de JSON Server (incluido que renombrar una parte no cambia la orden ya creada), el comentario de cierre (límites de 49/50/500/501 caracteres), `take`/`close`/`release` con el estado fresco (dos técnicos, una carrera simulada, órdenes cerradas que no se reabren), la política de permisos, la página de cierre, el listado (tomar, continuar, liberar y la advertencia de quién ejecuta la orden) y la integridad de los datos de prueba: cubierto (spec 013d).
- Tests de interceptores: `loadingInterceptor` cubierto (spec 002); `authInterceptor` cubierto (spec 010); `errorInterceptor` cubierto (spec propio, agregado tras 010). Foco y limpieza del modal: cubierto (spec 005).

### Cobertura

`pnpm run test:coverage` (`ng test --configuration coverage`) corre la suite con `@vitest/coverage-v8` y muestra un reporte en consola (texto) y en `coverage/angular-enterprise-lab/index.html` (HTML, no versionado). Última medición, tras `014-rediseno-mobile-first` (2063 tests):

| Métrica    | % Cubierto |
| ---------- | ---------- |
| Statements | 98.39%     |
| Branches   | 97.98%     |
| Functions  | 97.00%     |
| Lines      | 99.27%     |

Es un número **informativo**, no un umbral bloqueante — no hay `coverageThresholds` configurado en `angular.json`, así que no falla el comando ni el commit si baja. El desbalance de Functions detectado en spec 007 (72.95% sobre specs 001-006, 79.5% recalculado tras 008a/008b) se cerró en spec 009 con tests dirigidos a funciones de lógica real sin cobertura (ver `.claude/specs/009-cobertura-por-feature`); no se persigue el 100%, solo un nivel consistente con el resto de las métricas.

El código nuevo de spec 010 quedó al 100% en las cuatro métricas. Al agregar `app.config.spec.ts`, `errorInterceptor` (que ningún test importaba y por eso no figuraba en el reporte) apareció con 0/21 ramas y Branches bajó transitoriamente a 88.83%; el spec propio de `errorInterceptor` lo llevó a 100% y dejó Branches en 93.62% (antes 91.86%). Detalle en `.claude/specs/010-autenticacion-simulada/notes.md`.

El código nuevo de spec 011 (`auth.guard.ts`, `auth.model.ts`, `app.routes.ts`, `login-page.ts`) quedó al 100% en las cuatro métricas. Branches es el número estable entre corridas (93.62% → 93.72%, 411/439 → 418/446). Statements, Functions y Lines oscilan entre corridas sobre el mismo código, como ya se documentó en 010: dos corridas consecutivas de 011 dieron 95.03% / 90.33% / 96.63% y 94.55% / 88.88% / 95.96%; la tabla usa la última. Por eso la baja de Functions respecto de 90.09% no se atribuye a código nuevo sin cubrir. Detalle en `.claude/specs/011-guards-permisos-rol/notes.md`.

El código nuevo o modificado de spec 012 (`work-orders-list.ts`, `work-order.service.ts`, `work-order.model.ts`, `work-order.display.ts`, `badge.ts`) no aparece en la tabla de archivos con huecos. Branches subió de 93.72% a 95.43% (418/446 → 460/482). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 95.33% / 89.82% / 96.73%; la tabla usa la de Functions más alta (91.15%). Detalle en `.claude/specs/012-filtros-estado-prioridad/notes.md`.

El código nuevo o modificado de spec 013b (`auth.guard.ts`, `auth.model.ts`, `work-order.permissions.ts`, `work-orders.routes.ts`) no aparece en la tabla de archivos con huecos: 100% en las cuatro métricas. `auth.model.ts` bajó a 95.65% en una medición intermedia (la rama de `toAuthUser` con un registro que no es un objeto) y se cerró con tests directos. Branches subió de 95.43% a 96.81% (460/482 → 516/533). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 96.38% / 92.77% / 97.70%; la tabla usa la de Functions más alta. Detalle en `.claude/specs/013b-roles-extendidos/notes.md`.

El código nuevo o modificado de spec 013c (`auth.model.ts`, `auth.service.ts`, `users.service.ts`, los servicios, modelos, política y rutas de `maintenance`, los dos listados, el sidebar y `app.routes.ts`) está al 100% en las cuatro métricas; `technician-form.ts` (98.66% Statements, 97.77% Branches) y `team-form.ts` (99.23%, 98.41%) tienen una rama sin cubrir. Branches subió de 96.81% a 97.43% (516/533 → 836/858). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 97.42% / 95.30% / 98.54%; la tabla usa la de Functions más alta. La tabla de la consola no lista los archivos al 100%, por lo que los porcentajes por archivo se leen del reporte HTML. Detalle en `.claude/specs/013c-tecnicos-equipos/notes.md`.

El código nuevo o modificado de spec 013a (los modelos, la política, los servicios y las rutas de `machines`, `PartTree`, `TechnicianDirectory`, el sidebar y `app.routes.ts`) está al 100% en las cuatro métricas. Las únicas ramas sin cubrir son los enlaces bidireccionales `[(isOpen)]` y `[(selectedId)]` que genera el compilador en las plantillas de `machines-list` y `machine-parts` (las mismas que ya tenían `teams-list` y `technicians-list`). El emulador de JSON Server de `core/testing` se excluye de la medición (`coverageExclude` en `angular.json`): es código de test y, cubierto, inflaba el número. Las cuatro métricas subieron respecto de 013c (Branches 97.43%→97.94%, 836/858 → 1192/1217). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 98.14% / 96.71% / 98.96%; la tabla usa la de Functions más alta. Detalle en `.claude/specs/013a-maestro-maquinas-partes/notes.md`.

El código nuevo o modificado de spec 013d (`buildBreadcrumb`, `MachinePartPicker`, `Form`, la página de creación y la de cierre, `work-order.model.ts`, `work-order.permissions.ts` y `work-order.service.ts`) está al 100% en las cuatro métricas salvo las plantillas: en `work-order-resolve.html` quedan sin cubrir los `(clicked)` de "Reintentar" (mismo patrón que detalle y edición) y en `work-orders-list.html` los enlaces `[(isOpen)]` de los dos modales, como ya ocurría con el de eliminar. Branches subió de 97.94% a 98.07% (1192/1217 → 1429/1457), Statements de 98.24% a 98.33% y Lines de 99.09% a 99.23%; **Functions bajó de 97.01% a 96.97%** (las plantillas nuevas suman controladores de eventos sin ejecutar). Detalle en `.claude/specs/013d-maquina-en-orden/notes.md`.

### Última verificación registrada

Revisión del **7 de septiembre de 2026**, sobre el commit [`9729052`](https://github.com/CristianEscequiel/angular-enterprise-lab/commit/9729052ad26311f593e2a65414f5e8f443cfd0f0):

- Build de producción: correcto, sin warnings.
- ESLint: correcto.
- Tests: 21 correctos en 17 archivos.
- Prettier: diferencias de formato pendientes.
- Cobertura: no ejecutable con las dependencias declaradas en ese commit.

Estos resultados corresponden a esa revisión, no constituyen una garantía para cambios posteriores ni equivalen a una validación completa en navegador.

Revisión del **22 de septiembre de 2026**, tras `008a-tipado-aliases` y `008b-accesibilidad-responsive` (sobre el working tree, previo al commit):

- Build de producción: correcto, sin warnings.
- ESLint: correcto (las 11 reglas de `templateAccessibility` siguen pasando; no cubren `aria-invalid`/`aria-describedby` ni contraste, verificados manualmente en 008b).
- Tests: 119 correctos en 23 archivos (104 antes de 008a/008b).
- Prettier: `pnpm exec prettier . --check` limpio.
- `tsc --noEmit`: 0 errores con `strict`, `strictTemplates`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` y `exactOptionalPropertyTypes` activos.
- Verificación manual en 375px y 768px: documentada en `.claude/specs/008b-accesibilidad-responsive/notes.md` (sin tooling de testing visual en el proyecto).
- Mutation testing: 4 mutaciones deliberadas sobre a11y (aria-label por fila, aria-describedby del form, botón de submit deshabilitado, `role="alert"` condicional) confirmaron el fallo esperado en sus tests antes de revertirse.

Revisión del **22 de septiembre de 2026**, tras `009-cobertura-por-feature`:

- Build de producción: correcto, sin warnings.
- ESLint: correcto.
- Tests: 128 correctos en 24 archivos (119 antes de spec 009).
- Prettier: `pnpm exec prettier . --check` limpio.
- Cobertura: ver sección "Cobertura" arriba (Functions 79.5%→87.57%; Statements/Branches/Lines subieron o se mantuvieron, ninguna bajó).

Revisión del **23 de septiembre de 2026**, tras `010-autenticacion-simulada` y el spec de `errorInterceptor` (commits `f106689` y `bfe47a6`):

- Build de producción: correcto, sin warnings.
- ESLint: correcto.
- Tests: 227 correctos en 31 archivos (128 antes de spec 010).
- Prettier: `pnpm exec prettier . --check` limpio.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Functions 87.57%→90.09%, Branches 91.86%→93.62%; ninguna métrica bajó).
- Mutation testing: 2 mutaciones deliberadas (retorno a `returnUrl` en `LoginPage` y `logout()` en `AppShell`) hicieron fallar los tests esperados antes de revertirse.
- Verificación manual de login contra `pnpm api` + `pnpm start`: no registrada en esta revisión (pasos en `.claude/specs/010-autenticacion-simulada/notes.md`).

Revisión del **25 de septiembre de 2026**, tras `013d-maquina-en-orden`:

- Build de producción: correcto (la página de cierre queda como chunk lazy).
- ESLint: correcto.
- Tests: 1961 correctos en 66 archivos (1645 antes de spec 013d, medidos al empezar).
- Prettier: `pnpm exec prettier . --check` limpio.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 97.94%→98.07%; Functions 97.01%→96.97%).
- Mutation testing: 29 mutaciones deliberadas sobre `buildBreadcrumb`, el formulario, las páginas de creación, edición, cierre y listado, el servicio (`take`, `close`, `release`), el modelo, la política y la ruta; 28 hicieron fallar los tests esperados y 1 es equivalente (el `required` de la plantilla también lo aplica). Tabla en `.claude/specs/013d-maquina-en-orden/notes.md`.
- Contrato con JSON Server (`pnpm api`, sobre una copia del `db.json`): objetos anidados (`machineRef`, `takenBy`, `closingNote`), `takenBy: null` y el filtro por `cancelled`, comprobados con `curl`; renombrar una parte no cambia el breadcrumb de las órdenes existentes.
- Verificación manual de la interfaz: no registrada en esta revisión (pasos en `.claude/specs/013d-maquina-en-orden/notes.md`).

Revisión del **24 de septiembre de 2026**, tras `013a-maestro-maquinas-partes`:

- Build de producción: correcto (cada página nueva queda como chunk lazy).
- ESLint: correcto.
- Tests: 1643 correctos en 62 archivos (972 antes de spec 013a).
- Prettier: `pnpm exec prettier . --check` limpio salvo `spec.md` y `plan.md` de esta spec (sin formatear hasta el commit) y `db.json` mientras hay un JSON Server local en ejecución.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (las cuatro métricas subieron; Branches 97.43%→97.94%).
- Mutation testing: 158 mutaciones deliberadas sobre los modelos, la política, los servicios, el componente `PartTree`, las tres páginas, las rutas, el sidebar y los datos de prueba (más 8 sobre el arreglo de 013c); 156 hicieron fallar los tests esperados y 2 son equivalentes (el recorte del nombre lo hace también el servicio). Las que no compilaban o no llegaron a aplicarse se repitieron con variantes válidas. Tabla en `.claude/specs/013a-maestro-maquinas-partes/notes.md`.
- Defecto de 013c corregido: `POST` descarta el `id` que manda el cliente, así que un técnico creado desde la app no se podía editar ni buscar por legajo; el `id` pasa a ser opaco y el legajo se busca con `TechnicianDirectory` (detalle en las notas de 013c).
- Contrato con JSON Server (`pnpm api`, sobre copias del `db.json`): la ida y vuelta de un árbol de 5 niveles, el bloqueo de borrados, los datos sembrados de máquinas y partes y el alta, edición y baja de técnicos, comprobados con scripts de un solo uso (los tests permanentes son el emulador y `db.seed.spec.ts`).
- Verificación manual de la interfaz: no registrada en esta revisión (pasos en `.claude/specs/013a-maestro-maquinas-partes/notes.md`).

Revisión del **24 de septiembre de 2026**, tras `013c-tecnicos-equipos`:

- Build de producción: correcto (cada página nueva queda como chunk lazy).
- ESLint: correcto.
- Tests: 972 correctos en 48 archivos (523 antes de spec 013c).
- Prettier: `pnpm exec prettier . --check` limpio salvo `spec.md` (el spec original) y `db.json` mientras hay un JSON Server local en ejecución.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 96.81%→97.43%; Functions dentro de la variabilidad entre corridas descrita ahí).
- Mutation testing: 47 mutaciones deliberadas sobre los servicios, los modelos, el login, la política, las cuatro páginas, las rutas, el sidebar y los datos de prueba; todas hicieron fallar los tests esperados antes de revertirse (las que no compilaban o no llegaron a aplicarse se repitieron con variantes válidas). Tabla en `.claude/specs/013c-tecnicos-equipos/notes.md`.
- Bug corregido en el sidebar: `routerLinkActive` sin `ariaCurrentWhenActive` borraba `aria-current` al moverse dentro de una sección; los cuatro links usan ahora `ariaCurrentWhenActive="page"`.
- Contrato con JSON Server (`pnpm api`): login de técnico (`/users` + `/tecnicos` buscando el legajo), `404` para equipos inexistentes, `/equipos`, `/users?role=tecnico` y `work-orders` comprobados con `curl`.
- Verificación manual de la interfaz: no registrada en esta revisión (pasos en `.claude/specs/013c-tecnicos-equipos/notes.md`).

Revisión del **23 de septiembre de 2026**, tras `013b-roles-extendidos`:

- Build de producción: correcto.
- ESLint: correcto.
- Tests: 523 correctos en 35 archivos (334 antes de spec 013b).
- Prettier: `pnpm exec prettier . --check` limpio.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 95.43%→96.81%; Functions dentro de la variabilidad entre corridas descrita ahí).
- Mutation testing: 34 mutaciones deliberadas sobre el guard `requireUser`, la política de permisos, el formulario, las páginas de crear, editar, listado y detalle, y las rutas; 33 hicieron fallar los tests esperados y una es equivalente (el `required` de la plantilla también lo aplica). Tabla en `.claude/specs/013b-roles-extendidos/notes.md`.
- Contrato con JSON Server (`pnpm api`): los 5 usuarios de prueba producen una sesión válida (técnicos con especialidad y tipo de equipo, sin `password`), una contraseña incorrecta no devuelve registros y las 29 órdenes traen un `type` válido.
- Verificación manual de la interfaz: no registrada en esta revisión (pasos en `.claude/specs/013b-roles-extendidos/notes.md`).

Revisión del **23 de septiembre de 2026**, tras `012-filtros-estado-prioridad`:

- Build de producción: correcto.
- ESLint: correcto.
- Tests: 334 correctos en 34 archivos (258 antes de spec 012).
- Prettier: `pnpm exec prettier . --check` limpio salvo `db.json` mientras hay un JSON Server en ejecución: al escribir un cambio de estado lo reescribe sin el salto de línea final.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 93.72%→95.43%; Functions dentro de la variabilidad entre corridas descrita ahí).
- Mutation testing: 16 mutaciones deliberadas sobre `search()`, `updateStatus()`, el armado de criterios, el reset de página, el parche de fila, la restauración del select y los mapas de badges; todas hicieron fallar los tests esperados antes de revertirse. Tabla en `.claude/specs/012-filtros-estado-prioridad/notes.md`.
- Contrato con JSON Server (`pnpm api`): filtros combinados, resultados vacíos, `?status=` vacío y `PATCH` comprobados con `curl`.
- Verificación manual de la interfaz: no registrada en esta revisión (pasos en `.claude/specs/012-filtros-estado-prioridad/notes.md`).

Revisión del **23 de septiembre de 2026**, tras `011-guards-permisos-rol`:

- Build de producción: correcto, sin warnings.
- ESLint: correcto.
- Tests: 258 correctos en 32 archivos (227 antes de spec 011).
- Prettier: `pnpm exec prettier . --check` limpio.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 93.62%→93.72%; Functions 88.88% dentro de la variabilidad entre corridas descrita ahí).
- Mutation testing: 8 mutaciones deliberadas sobre `authGuard`, `guestGuard`, `requireRole` y la estructura de `app.routes.ts` (7 hicieron fallar los tests esperados; la mutación de mover `**` dentro del grupo protegido provocó un bucle de redirecciones y la suite no terminó). Tabla completa en `.claude/specs/011-guards-permisos-rol/notes.md`.
- Verificación manual con `pnpm api` + `pnpm start`: realizada por el autor del proyecto (retorno tras login, `/login` con sesión, logout y 404 público).

Revisión del **22 de septiembre de 2026**, tras `007-cobertura-y-verificaciones`:

- Build de producción: correcto, sin warnings.
- ESLint: correcto.
- Tests: 104 correctos en 23 archivos.
- Prettier: `pnpm exec prettier . --check` limpio (antes: pendiente en todo el repo).
- Cobertura: medible, ver sección "Cobertura" arriba (antes: no ejecutable, sin proveedor).
- Pre-commit: `lint-staged` corrige Prettier y ESLint (`--fix`) en los archivos modificados antes de correr los tests; bloquea el commit si ESLint encuentra algo que no puede corregir solo.

## Roadmap

### 1. Estabilización de la base actual

- [x] Completar el arranque reproducible de la API y centralizar su URL.
- [x] Unificar búsqueda, paginación y recarga del listado.
- [x] Recuperar la búsqueda después de errores y evitar suscripciones duplicadas.
- [ ] Mantener una página válida y filtros coherentes después de eliminar.
- [x] Mejorar los estados de error de detalle y edición.
- [x] Proteger formularios inválidos y operaciones en curso.
- [x] Completar el manejo de foco y limpieza del modal.
- [x] Incorporar la página 404.
- [x] Completar pruebas de comportamiento (medición de cobertura y verificaciones de formato: spec 007; número de cobertura feature por feature: spec 009).
- [x] Revisar tipado estricto, aliases, accesibilidad y adaptación móvil.

### 2. Autenticación y evolución funcional

- [x] Implementar autenticación simulada, sesión, logout y retorno después del login (spec 010).
- [x] Agregar guards y permisos por rol (spec 011: mecanismo de guards y `requireRole`; qué puede hacer cada rol se define en las specs de cada feature).
- [x] Completar filtros por estado y prioridad y cambio de estado de las órdenes (spec 012: tres estados; la restricción por rol y las transiciones permitidas quedan para specs posteriores).
- [x] Definir los roles del dominio de mantenimiento y sus permisos sobre las órdenes (spec 013b: cuatro roles, atributos del técnico, tipo de orden, crear/editar/eliminar por rol; la asignación por especialidad y tipo de equipo queda para 013d).
- [x] Incorporar gestión de equipos y técnicos de forma incremental (spec 013c: maestro de técnicos y equipos con su alta, edición y baja, y el alta de miembros por legajo; la asignación de órdenes a técnicos y equipos queda para 013d).
- [x] Incorporar el maestro de máquinas y su árbol de partes de profundidad variable (spec 013a: alta, edición y baja de máquinas y partes, bloqueo de la eliminación si hay sub-partes o partes, y un componente de árbol reutilizable; asociar órdenes a máquina y parte queda para 013d).
- [ ] Desarrollar los indicadores del dashboard.

### 3. Cierre y evolución posterior

- [ ] Validar los flujos completos, accesibilidad y comportamiento responsive.
- [ ] Revisar rendimiento, documentación y despliegue.
- [ ] Evaluar un backend propio con Java, Spring Boot y PostgreSQL después de estabilizar el frontend.

## Criterio de cierre de una funcionalidad

Antes de avanzar, cada funcionalidad debe cumplir sus requisitos, contemplar los estados y validaciones aplicables, tener pruebas relevantes y mantener la documentación alineada con el código. Las verificaciones acordadas deben pasar y los problemas importantes deben estar resueltos o aceptados explícitamente.

El objetivo es terminar una aplicación acotada y defendible, incorporando nuevas herramientas solo cuando resuelvan una necesidad concreta.

## Autor

**Cristian Escequiel** — desarrollo frontend con foco en Angular.

[Repositorio en GitHub](https://github.com/CristianEscequiel/angular-enterprise-lab)
