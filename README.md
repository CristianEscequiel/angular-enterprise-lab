# Angular Enterprise Lab

Laboratorio de arquitectura Angular aplicado a un sistema de gestión de órdenes de mantenimiento.

El proyecto busca construir una aplicación pequeña y mantenible que sirva como referencia técnica, base de aprendizaje y material para explicar decisiones de desarrollo. El foco está en la separación de responsabilidades, la reutilización, el manejo de estado, las pruebas y la documentación.

**Estado:** en desarrollo. El flujo CRUD está implementado y la búsqueda con paginación está en proceso de estabilización. La autenticación simulada, los roles y la gestión de técnicos y equipos ya están implementados (specs 010, 011, 013b y 013c); los indicadores del dashboard y la asignación de órdenes forman parte del roadmap.

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

| Tecnología                | Uso                                             |
| ------------------------- | ----------------------------------------------- |
| Angular 22 y TypeScript 6 | Aplicación con componentes standalone           |
| Angular Router            | Navegación y carga diferida                     |
| Signals                   | Estado local y valores derivados                |
| RxJS 7 y HttpClient       | Peticiones HTTP y búsqueda reactiva             |
| Reactive Forms            | Formulario compartido para creación y edición   |
| SCSS                      | Tokens, estilos globales y componentes visuales |
| JSON Server               | API REST local de desarrollo                    |
| Vitest                    | Pruebas mediante la integración de Angular      |
| ESLint y Prettier         | Análisis estático y formato                     |
| Husky y lint-staged       | Hook de validación previo al commit             |
| pnpm                      | Gestión de dependencias y ejecución de scripts  |

Las versiones concretas de las dependencias se registran en `package.json` y `pnpm-lock.yaml`.

## Inicio rápido

### Requisitos

- Node.js compatible con las dependencias del proyecto. La revisión del 7 de septiembre de 2026 se ejecutó con Node.js **22.23.2**.
- **pnpm 11.11.0**, declarado en el campo `packageManager`.
- Git.

No es necesario instalar Angular CLI ni JSON Server globalmente.

### Instalación

```bash
git clone https://github.com/CristianEscequiel/angular-enterprise-lab.git
cd angular-enterprise-lab
pnpm install --frozen-lockfile
```

### Ejecutar la aplicación

Ejecutá los siguientes comandos desde la raíz del repositorio y mantené ambas terminales abiertas.

**Terminal 1 — API de desarrollo:**

```bash
pnpm api
```

**Terminal 2 — Angular:**

```bash
pnpm start
```

| Servicio             | Dirección                                                       |
| -------------------- | --------------------------------------------------------------- |
| Aplicación           | [localhost:4200](http://localhost:4200)                         |
| Colección de órdenes | [localhost:3000/work-orders](http://localhost:3000/work-orders) |

Levantar Angular no inicia la API automáticamente. Si JSON Server no está disponible, las operaciones sobre órdenes no podrán completarse.

### Datos y configuración de la API

Los datos de desarrollo se encuentran en:

```text
src/app/features/work-orders/data-access/db.json
```

JSON Server utiliza ese archivo como almacenamiento local; las operaciones de escritura pueden modificarlo. Revisá los cambios de datos antes de incluirlos en un commit.

`db.json` tiene cuatro colecciones: `work-orders`, `users` (usuarios de login), `tecnicos` (maestro de técnicos) y `equipos` (spec 013c). Un JSON Server en ejecución reescribe el archivo cada vez que se guarda algo desde la interfaz (y le quita el salto de línea final), así que las pruebas manuales dejan cambios que conviene descartar antes de commitear. `db.seed.spec.ts` comprueba la integridad de los datos de prueba (legajos únicos, referencias que existen, un usuario por rol).

Actualmente, la URL `http://localhost:3000/work-orders` se define en `WorkOrdersService`. Su extracción a una configuración central está pendiente. Si cambiás el puerto del servidor, debés mantener coherente la URL utilizada por el frontend.

La integración utiliza `_page`, `_per_page`, `title:contains` y los filtros por igualdad `status` y `priority` (los parámetros vacíos no se envían, porque `?status=` filtra por cadena vacía). El cambio de estado usa `PATCH /work-orders/:id` con `{ status }`. La versión de JSON Server elegida debe soportar esos parámetros y devolver el formato paginado esperado por `PaginatedResponse<T>`. Consultá la [documentación de JSON Server](https://github.com/typicode/json-server#query-params) al cambiar de versión.

### Usuarios de prueba

La autenticación es simulada: el login consulta la colección `users` de `db.json` (spec 010). Cada usuario tiene un rol y, si es técnico, un `legajo` que lo vincula con el maestro de técnicos (`tecnicos`): de ahí el login toma su especialidad y su tipo de equipo (specs 013b y 013c):

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

El técnico gestiona (toma, comenta, cierra) las órdenes de su especialidad y tipo de equipo: `general` cubre ambas especialidades y `guardia` atiende `pronto-intervencion`, mientras que `preventivo-correctivo` atiende `preventivo` y `correctivo`. Hoy solo existe la consulta (`canTechnicianHandle`); la asignación real de órdenes es de la spec 013d. Estas reglas son control de navegación y de interfaz: el rol vive en `localStorage` y es editable, así que la autorización real corresponde al backend.

### Técnicos y equipos

El **maestro de técnicos** (`tecnicos`) es una entidad independiente del usuario de login (spec 013c): guarda `legajo` (único), nombre, apellido, especialidad y tipo de equipo, y existe aunque el técnico no tenga usuario. Se vincula con `users` solo por `legajo`. Un **equipo** (`equipos`) tiene nombre, tipo (`guardia` o `preventivo-correctivo`) y la lista de legajos de sus miembros. Los datos de prueba traen tres técnicos (`1001`, `1002` y `1003`, este último sin usuario ni equipo) y dos equipos.

| Acción                                   | Permitido a                                  |
| ---------------------------------------- | -------------------------------------------- |
| Ver, crear y modificar técnicos          | `administrador`, `team-leader-mantenimiento` |
| Eliminar técnicos                        | `administrador`                              |
| Ver, crear, modificar y eliminar equipos | `team-leader-mantenimiento`                  |

Un técnico con usuario de login o miembro de un equipo no se puede eliminar. Crear un usuario de login con rol `tecnico` exige que su legajo exista en el maestro. La regla vive en `features/maintenance/models/maintenance.permissions.ts` y, como la de las órdenes, es control de navegación y de interfaz.

## Funcionalidades actuales

- Listado de órdenes de mantenimiento.
- Búsqueda por título con debounce y paginación desde la API.
- Filtros por estado y prioridad combinables con la búsqueda; viajan en la misma petición paginada y reinician la página a 1.
- Prioridad y estado visibles como badges en el listado, y cambio rápido de estado desde un select por fila (`pending`, `in-progress`, `completed`).
- Consulta del detalle mediante un identificador en la URL.
- Creación y edición con un formulario compartido.
- Tipo de orden (`preventivo`, `correctivo`, `pronto-intervencion`): se elige al crear, no se cambia al editar y se muestra en el listado y el detalle.
- Autenticación simulada con cuatro roles: crear, editar y eliminar órdenes dependen del rol (ver "Usuarios de prueba").
- Gestión de técnicos (listado con búsqueda, alta, edición y baja) y de equipos (listado, alta, edición y baja), según el rol (ver "Técnicos y equipos").
- Alta de miembros de un equipo por legajo, con validación en tiempo real: muestra si el técnico existe, si ya es miembro o si el legajo no es válido antes de confirmar.
- Menú lateral que ofrece solo las secciones permitidas al rol.
- Eliminación con confirmación.
- Indicador global de peticiones en curso.
- Mensajes globales de éxito, advertencia y error.
- Layout con header, sidebar y área de contenido.
- Página inicial de dashboard, todavía sin indicadores.

La búsqueda, la paginación y la recarga después de eliminar requieren completar su coordinación. También están pendientes mejoras de recuperación ante errores y protección durante el envío de formularios.

## Arquitectura

La aplicación se organiza por funcionalidad, con infraestructura y componentes compartidos fuera de cada dominio.

```text
src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   ├── interceptors/
│   │   └── services/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
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

### Técnicos y equipos

La feature `maintenance` agrupa técnicos y equipos (una sola feature porque borrar un técnico exige mirar equipos y armar un equipo exige mirar técnicos). `TechniciansService` y `TeamsService` encapsulan el HTTP; las páginas (`technicians-list`, `technician-form`, `teams-list`, `team-form`) coordinan y deciden. El listado de técnicos, antes de eliminar, consulta usuarios y equipos y bloquea con un aviso si hay referencias.

El maestro y el usuario de login se mantienen separados: `core/auth` no importa de `features`, así que el login y `UsersService` consultan `/tecnicos/:legajo` con un tipo mínimo (`TechnicianProfile`) y el modelo completo (`Technician`) vive en la feature. En `tecnicos`, `id` y `legajo` son iguales y el legajo no se edita. JSON Server no rechaza ids repetidos ni tiene integridad referencial, y convierte a número los valores numéricos del query string (`?legajo=100` no encuentra `"100"`): por eso el maestro se consulta por ruta y la unicidad y las referencias se validan en el cliente. Con el backend real pasan a ser una FK y un índice único.

El alta de miembros por legajo espera 300 ms sin tipear, cancela la consulta en vuelo apenas cambia el campo (así una respuesta tardía nunca pisa a un legajo más nuevo) y resuelve "ya es miembro" sin HTTP. Detalle de las decisiones en `.claude/specs/013c-tecnicos-equipos/notes.md`.

### Routing

| Ruta                                    | Vista                        |
| --------------------------------------- | ---------------------------- |
| `/`                                     | Redirección a `/dashboard`   |
| `/login`                                | Inicio de sesión (pública)   |
| `/dashboard`                            | Página inicial del dashboard |
| `/work-orders`                          | Listado de órdenes           |
| `/work-orders/new`                      | Creación de una orden        |
| `/work-orders/:id`                      | Detalle de una orden         |
| `/work-orders/:id/edit`                 | Edición de una orden         |
| `/maintenance`                          | Redirección a los técnicos   |
| `/maintenance/technicians`              | Listado de técnicos          |
| `/maintenance/technicians/new`          | Alta de un técnico           |
| `/maintenance/technicians/:legajo/edit` | Edición de un técnico        |
| `/maintenance/teams`                    | Listado de equipos           |
| `/maintenance/teams/new`                | Alta de un equipo            |
| `/maintenance/teams/:id/edit`           | Edición de un equipo         |

La feature de órdenes utiliza `loadChildren()` y sus páginas se cargan mediante `loadComponent()`. `/dashboard` y `/work-orders/*` requieren sesión (`authGuard`, spec 011): sin ella se redirige a `/login` conservando la URL pedida para volver tras el login. `/login` redirige al destino de retorno (por defecto `/dashboard`) si ya hay sesión (`guestGuard`), y la página 404 es pública. Los roles son `administrador`, `team-leader-mantenimiento`, `personal-produccion` y `tecnico` (este último con especialidad y tipo de equipo, spec 013b). `requireUser(predicate)` restringe una ruta con una regla sobre el usuario y `requireRole(...roles)` es su atajo por rol: `/work-orders/new` exige un rol que pueda crear órdenes y `/work-orders/:id/edit` uno que pueda editarlas, según la política de `work-order.permissions.ts`; sin permiso se vuelve a `/dashboard` con un aviso. `/maintenance/*` sigue el mismo esquema con la política de `maintenance.permissions.ts` (técnicos: Administrador y TeamLeader; equipos: solo TeamLeader), y un legajo con formato inválido en la URL de edición cae en la página 404 sin cargar el formulario. Estos guards son control de navegación: la autorización real corresponde al backend.

### Signals y RxJS

- `signal()` mantiene estado local, como la orden seleccionada o la apertura del modal.
- `computed()` deriva valores utilizados por la interfaz.
- `input()`, `output()` y `model()` comunican componentes según sus responsabilidades.
- RxJS gestiona HTTP y la búsqueda mediante `debounceTime`, `distinctUntilChanged` y `switchMap`.

El listado ya utiliza estas herramientas, pero aún requiere unificar búsqueda, página y recarga para mantener el estado consistente en todos los escenarios.

## HTTP y backend de desarrollo

JSON Server reemplaza al antiguo `mockApiInterceptor` como fuente de datos de desarrollo. Las solicitudes salen del navegador hacia un servidor HTTP local; el interceptor anterior permanece en el código, pero no está registrado en el flujo activo.

El flujo configurado es:

```text
Página → WorkOrdersService → HttpClient
      → loadingInterceptor → mockDelayInterceptor → errorInterceptor
      → JSON Server
```

- **`loadingInterceptor`:** informa el inicio y fin de las peticiones. `LoadingService` mantiene un contador para contemplar solicitudes simultáneas.
- **`mockDelayInterceptor`:** introduce una demora artificial de 300 ms en las emisiones de respuesta. No genera datos ni reemplaza al servidor.
- **`errorInterceptor`:** interpreta errores HTTP, solicita un mensaje global y propaga el error para que la feature pueda responder al caso particular.

Un mensaje global no reemplaza los estados persistentes de error ni las opciones de recuperación de cada pantalla. Completar esos estados es parte del trabajo pendiente.

JSON Server permite desarrollar y probar el frontend sin construir todavía un backend propio. No representa la solución de producción ni sustituye reglas de negocio y controles de acceso del servidor definitivo.

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

La auditoría de accesibilidad y responsive (`008b-accesibilidad-responsive`) cubrió landmarks, foco, `aria-invalid`/`aria-describedby` en formularios, contraste de color y el comportamiento del sidebar como drawer en mobile. El modal ya contaba con manejo de foco desde `005-foco-limpieza-modal`.

## Scripts y verificaciones

| Comando                        | Propósito                                      |
| ------------------------------ | ---------------------------------------------- |
| `pnpm start`                   | Iniciar Angular en desarrollo                  |
| `pnpm api`                     | Iniciar json-server en desarrollo              |
| `pnpm build`                   | Generar el build de producción                 |
| `pnpm watch`                   | Compilar en modo desarrollo y observar cambios |
| `pnpm test`                    | Ejecutar las pruebas mediante Angular          |
| `pnpm test --watch=false`      | Ejecutar las pruebas una sola vez              |
| `pnpm lint`                    | Ejecutar ESLint                                |
| `pnpm exec prettier . --check` | Comprobar formato sin modificar archivos       |

El build se genera en `dist/angular-enterprise-lab`. Compilar el frontend no incluye ni despliega JSON Server.

Husky tiene configurado un hook `pre-commit` que ejecuta `pnpm test`. La adaptación del hook a una ejecución finita y la integración de `lint-staged` están pendientes; su presencia como dependencia no implica que ya esté conectado.

## Flujo de desarrollo

Las funcionalidades no triviales se documentan como spec antes de implementarse,
siguiendo un ciclo de tres fases con revisión entre cada una:

1. **Spec**: qué debe hacer el cambio, requisitos y qué queda fuera de alcance.
2. **Plan**: tareas numeradas contra el código actual, con el test que valida cada una.
3. **Implementación**: ejecutada en una sesión separada de la planificación.

Los specs y planes se conservan en `.claude/specs/<número>-<nombre>/` como registro
de las decisiones tomadas para cada feature.

| Feature                                                     | Spec                                                                                             | Estado                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Unificar búsqueda, paginación y recarga                     | [`001-unificar-busqueda-paginacion`](.claude/specs/001-unificar-busqueda-paginacion)             | Implementado (5 tests nuevos, 21→51 en la suite)                                                      |
| Recuperación de la búsqueda tras errores                    | [`002-recuperacion-busqueda-tras-errores`](.claude/specs/002-recuperacion-busqueda-tras-errores) | Implementado (4 tests nuevos, 51→55 en la suite)                                                      |
| Estados de error en detalle y edición                       | [`003-estados-error-detalle-edicion`](.claude/specs/003-estados-error-detalle-edicion)           | Implementado (13 tests nuevos, 55→73 en la suite)                                                     |
| Protección de formularios inválidos y envíos duplicados     | [`004-proteccion-formularios`](.claude/specs/004-proteccion-formularios)                         | Implementado (11 tests nuevos, 73→84 en la suite)                                                     |
| Manejo de foco y limpieza del modal                         | [`005-foco-limpieza-modal`](.claude/specs/005-foco-limpieza-modal)                               | Implementado (8 tests nuevos, 84→92 en la suite)                                                      |
| Página 404 y validación de formato de id                    | [`006-pagina-404`](.claude/specs/006-pagina-404)                                                 | Implementado (12 tests nuevos, 92→104 en la suite)                                                    |
| Cobertura de tests y verificaciones de formato              | [`007-cobertura-y-verificaciones`](.claude/specs/007-cobertura-y-verificaciones)                 | Implementado (sin tests nuevos — configura medición y verificación, no persigue un número)            |
| Tipado estricto y aliases de imports                        | [`008a-tipado-aliases`](.claude/specs/008a-tipado-aliases)                                       | Implementado (sin tests nuevos — tipado y refactor de imports, no persigue un número)                 |
| Accesibilidad y adaptación responsive                       | [`008b-accesibilidad-responsive`](.claude/specs/008b-accesibilidad-responsive)                   | Implementado (15 tests nuevos, 104→119 en la suite)                                                   |
| Cobertura de Functions por feature                          | [`009-cobertura-por-feature`](.claude/specs/009-cobertura-por-feature)                           | Implementado (9 tests nuevos, 119→128 en la suite; Functions 79.5%→87.57%)                            |
| Autenticación simulada, sesión, logout y retorno tras login | [`010-autenticacion-simulada`](.claude/specs/010-autenticacion-simulada)                         | Implementado (82 tests nuevos, 128→210 en la suite; +17 del spec de `errorInterceptor`, 227 en total) |
| Guards de ruta y permisos por rol                           | [`011-guards-permisos-rol`](.claude/specs/011-guards-permisos-rol)                               | Implementado (31 tests nuevos, 227→258 en la suite)                                                   |
| Filtros por estado y prioridad, cambio de estado de órdenes | [`012-filtros-estado-prioridad`](.claude/specs/012-filtros-estado-prioridad)                     | Implementado (76 tests nuevos, 258→334 en la suite)                                                   |
| Roles extendidos del dominio de mantenimiento               | [`013b-roles-extendidos`](.claude/specs/013b-roles-extendidos)                                   | Implementado (189 tests nuevos, 334→523 en la suite)                                                  |
| Gestión de técnicos y equipos                               | [`013c-tecnicos-equipos`](.claude/specs/013c-tecnicos-equipos)                                   | Implementado (449 tests nuevos, 523→972 en la suite)                                                  |

### Estado de las pruebas

Vitest está integrado, pero la suite actual se concentra principalmente en pruebas de creación de componentes. Todavía no ofrece protección suficiente para los flujos completos del CRUD y sus casos límite.

La estrategia a completar incluye:

- Tests HTTP del servicio: método, URL, parámetros, payload y errores.
- Tests del listado: datos, vacío, error, búsqueda, paginación y recarga tras eliminar.
- Tests de formularios: validación y protección frente a envíos repetidos.
- Tests de detalle y edición ante registros inexistentes y fallos de carga: cubierto (spec 003).
- Tests de roles y permisos: modelo del usuario y atributos del técnico, guard `requireUser`, política de permisos, rutas de crear y editar con las rutas reales, y botones y acciones del listado según el rol: cubierto (spec 013b).
- Tests de técnicos y equipos: modelos y validadores, política de permisos, servicios HTTP (unicidad del legajo, consultas por ruta, errores de red distintos de "no existe"), validación cruzada del usuario técnico contra el maestro, las cuatro páginas (incluido el alta por legajo en tiempo real con timers y respuestas fuera de orden), las rutas reales con sus guards, el sidebar por rol y la integridad de los datos de prueba: cubierto (spec 013c).
- Tests de interceptores: `loadingInterceptor` cubierto (spec 002); `authInterceptor` cubierto (spec 010); `errorInterceptor` cubierto (spec propio, agregado tras 010). Foco y limpieza del modal: cubierto (spec 005).

### Cobertura

`pnpm run test:coverage` (`ng test --configuration coverage`) corre la suite con `@vitest/coverage-v8` y muestra un reporte en consola (texto) y en `coverage/angular-enterprise-lab/index.html` (HTML, no versionado). Última medición, tras `013c-tecnicos-equipos` (972 tests):

| Métrica    | % Cubierto |
| ---------- | ---------- |
| Statements | 97.56%     |
| Branches   | 97.43%     |
| Functions  | 95.73%     |
| Lines      | 98.73%     |

Es un número **informativo**, no un umbral bloqueante — no hay `coverageThresholds` configurado en `angular.json`, así que no falla el comando ni el commit si baja. El desbalance de Functions detectado en spec 007 (72.95% sobre specs 001-006, 79.5% recalculado tras 008a/008b) se cerró en spec 009 con tests dirigidos a funciones de lógica real sin cobertura (ver `.claude/specs/009-cobertura-por-feature`); no se persigue el 100%, solo un nivel consistente con el resto de las métricas.

El código nuevo de spec 010 quedó al 100% en las cuatro métricas. Al agregar `app.config.spec.ts`, `errorInterceptor` (que ningún test importaba y por eso no figuraba en el reporte) apareció con 0/21 ramas y Branches bajó transitoriamente a 88.83%; el spec propio de `errorInterceptor` lo llevó a 100% y dejó Branches en 93.62% (antes 91.86%). Detalle en `.claude/specs/010-autenticacion-simulada/notes.md`.

El código nuevo de spec 011 (`auth.guard.ts`, `auth.model.ts`, `app.routes.ts`, `login-page.ts`) quedó al 100% en las cuatro métricas. Branches es el número estable entre corridas (93.62% → 93.72%, 411/439 → 418/446). Statements, Functions y Lines oscilan entre corridas sobre el mismo código, como ya se documentó en 010: dos corridas consecutivas de 011 dieron 95.03% / 90.33% / 96.63% y 94.55% / 88.88% / 95.96%; la tabla usa la última. Por eso la baja de Functions respecto de 90.09% no se atribuye a código nuevo sin cubrir. Detalle en `.claude/specs/011-guards-permisos-rol/notes.md`.

El código nuevo o modificado de spec 012 (`work-orders-list.ts`, `work-order.service.ts`, `work-order.model.ts`, `work-order.display.ts`, `badge.ts`) no aparece en la tabla de archivos con huecos. Branches subió de 93.72% a 95.43% (418/446 → 460/482). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 95.33% / 89.82% / 96.73%; la tabla usa la de Functions más alta (91.15%). Detalle en `.claude/specs/012-filtros-estado-prioridad/notes.md`.

El código nuevo o modificado de spec 013b (`auth.guard.ts`, `auth.model.ts`, `work-order.permissions.ts`, `work-orders.routes.ts`) no aparece en la tabla de archivos con huecos: 100% en las cuatro métricas. `auth.model.ts` bajó a 95.65% en una medición intermedia (la rama de `toAuthUser` con un registro que no es un objeto) y se cerró con tests directos. Branches subió de 95.43% a 96.81% (460/482 → 516/533). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 96.38% / 92.77% / 97.70%; la tabla usa la de Functions más alta. Detalle en `.claude/specs/013b-roles-extendidos/notes.md`.

El código nuevo o modificado de spec 013c (`auth.model.ts`, `auth.service.ts`, `users.service.ts`, los servicios, modelos, política y rutas de `maintenance`, los dos listados, el sidebar y `app.routes.ts`) está al 100% en las cuatro métricas; `technician-form.ts` (98.66% Statements, 97.77% Branches) y `team-form.ts` (99.23%, 98.41%) tienen una rama sin cubrir. Branches subió de 96.81% a 97.43% (516/533 → 836/858). Statements, Functions y Lines volvieron a variar entre corridas sobre el mismo código: otra corrida dio 97.42% / 95.30% / 98.54%; la tabla usa la de Functions más alta. La tabla de la consola no lista los archivos al 100%, por lo que los porcentajes por archivo se leen del reporte HTML. Detalle en `.claude/specs/013c-tecnicos-equipos/notes.md`.

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

Revisión del **24 de septiembre de 2026**, tras `013c-tecnicos-equipos`:

- Build de producción: correcto (cada página nueva queda como chunk lazy).
- ESLint: correcto.
- Tests: 972 correctos en 48 archivos (523 antes de spec 013c).
- Prettier: `pnpm exec prettier . --check` limpio salvo `spec.md` (el spec original) y `db.json` mientras hay un JSON Server local en ejecución.
- `tsc --noEmit`: 0 errores en `tsconfig.app.json` y `tsconfig.spec.json`.
- Cobertura: ver sección "Cobertura" arriba (Branches 96.81%→97.43%; Functions dentro de la variabilidad entre corridas descrita ahí).
- Mutation testing: 47 mutaciones deliberadas sobre los servicios, los modelos, el login, la política, las cuatro páginas, las rutas, el sidebar y los datos de prueba; todas hicieron fallar los tests esperados antes de revertirse (las que no compilaban o no llegaron a aplicarse se repitieron con variantes válidas). Tabla en `.claude/specs/013c-tecnicos-equipos/notes.md`.
- Bug corregido en el sidebar: `routerLinkActive` sin `ariaCurrentWhenActive` borraba `aria-current` al moverse dentro de una sección; los cuatro links usan ahora `ariaCurrentWhenActive="page"`.
- Contrato con JSON Server (`pnpm api`): login de técnico (`/users` + `/tecnicos/:legajo`), `404` para legajos y equipos inexistentes, `/equipos`, `/users?role=tecnico` y `work-orders` comprobados con `curl`.
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
