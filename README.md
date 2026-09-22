# Angular Enterprise Lab

Laboratorio de arquitectura Angular aplicado a un sistema de gestión de órdenes de mantenimiento.

El proyecto busca construir una aplicación pequeña y mantenible que sirva como referencia técnica, base de aprendizaje y material para explicar decisiones de desarrollo. El foco está en la separación de responsabilidades, la reutilización, el manejo de estado, las pruebas y la documentación.

**Estado:** en desarrollo. El flujo CRUD está implementado y la búsqueda con paginación está en proceso de estabilización. La autenticación y los indicadores del dashboard forman parte del roadmap.

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

Actualmente, la URL `http://localhost:3000/work-orders` se define en `WorkOrdersService`. Su extracción a una configuración central está pendiente. Si cambiás el puerto del servidor, debés mantener coherente la URL utilizada por el frontend.

La integración utiliza `_page`, `_per_page` y `title:contains`. La versión de JSON Server elegida debe soportar esos parámetros y devolver el formato paginado esperado por `PaginatedResponse<T>`. Consultá la [documentación de JSON Server](https://github.com/typicode/json-server#query-params) al cambiar de versión.

## Funcionalidades actuales

- Listado de órdenes de mantenimiento.
- Búsqueda por título con debounce y paginación desde la API.
- Consulta del detalle mediante un identificador en la URL.
- Creación y edición con un formulario compartido.
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
│   │   ├── interceptors/
│   │   └── services/
│   ├── features/
│   │   ├── dashboard/
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

| Capa       | Responsabilidad                                                     |
| ---------- | ------------------------------------------------------------------- |
| `core`     | Infraestructura transversal: loading, mensajes e interceptores HTTP |
| `layout`   | Composición visual y alojamiento del `RouterOutlet`                 |
| `shared`   | Componentes reutilizables de interfaz                               |
| `features` | Páginas, formularios, modelos y acceso a datos del dominio          |
| `styles`   | Tokens y estilos compartidos                                        |

Se incorporan carpetas y abstracciones cuando existe una responsabilidad concreta que justifica su uso.

Los imports entre capas usan los aliases `@core/*`, `@shared/*` y `@features/*` (definidos en `tsconfig.json`, sin `baseUrl`) en vez de rutas relativas de varios niveles; los imports dentro de una misma feature siguen siendo relativos.

### Órdenes de trabajo

Las páginas coordinan la carga de datos, las acciones y la navegación. `WorkOrdersService` encapsula las peticiones HTTP. El componente `Form`, ubicado dentro de la feature, recibe datos iniciales y emite los valores del formulario hacia las páginas de creación o edición.

`WorkOrder` representa una orden y `WorkOrderCreateRequest` los datos necesarios para crearla. `PaginatedResponse<T>` describe la respuesta paginada utilizada por el listado.

Las páginas de detalle y edición consultan la orden por el identificador de la ruta. No necesitan recibir el objeto completo desde la lista, por lo que pueden cargar los datos al acceder directamente a una URL existente.

### Routing

| Ruta                    | Vista                        |
| ----------------------- | ---------------------------- |
| `/`                     | Redirección a `/dashboard`   |
| `/dashboard`            | Página inicial del dashboard |
| `/work-orders`          | Listado de órdenes           |
| `/work-orders/new`      | Creación de una orden        |
| `/work-orders/:id`      | Detalle de una orden         |
| `/work-orders/:id/edit` | Edición de una orden         |

La feature de órdenes utiliza `loadChildren()` y sus páginas se cargan mediante `loadComponent()`. La página 404 y la protección de rutas mediante autenticación están pendientes.

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

| Feature                                                 | Spec                                                                                             | Estado                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Unificar búsqueda, paginación y recarga                 | [`001-unificar-busqueda-paginacion`](.claude/specs/001-unificar-busqueda-paginacion)             | Implementado (5 tests nuevos, 21→51 en la suite)                                           |
| Recuperación de la búsqueda tras errores                | [`002-recuperacion-busqueda-tras-errores`](.claude/specs/002-recuperacion-busqueda-tras-errores) | Implementado (4 tests nuevos, 51→55 en la suite)                                           |
| Estados de error en detalle y edición                   | [`003-estados-error-detalle-edicion`](.claude/specs/003-estados-error-detalle-edicion)           | Implementado (13 tests nuevos, 55→73 en la suite)                                          |
| Protección de formularios inválidos y envíos duplicados | [`004-proteccion-formularios`](.claude/specs/004-proteccion-formularios)                         | Implementado (11 tests nuevos, 73→84 en la suite)                                          |
| Manejo de foco y limpieza del modal                     | [`005-foco-limpieza-modal`](.claude/specs/005-foco-limpieza-modal)                               | Implementado (8 tests nuevos, 84→92 en la suite)                                           |
| Página 404 y validación de formato de id                | [`006-pagina-404`](.claude/specs/006-pagina-404)                                                 | Implementado (12 tests nuevos, 92→104 en la suite)                                         |
| Cobertura de tests y verificaciones de formato          | [`007-cobertura-y-verificaciones`](.claude/specs/007-cobertura-y-verificaciones)                 | Implementado (sin tests nuevos — configura medición y verificación, no persigue un número) |
| Tipado estricto y aliases de imports                    | [`008a-tipado-aliases`](.claude/specs/008a-tipado-aliases)                                       | Implementado (sin tests nuevos — tipado y refactor de imports, no persigue un número)      |
| Accesibilidad y adaptación responsive                   | [`008b-accesibilidad-responsive`](.claude/specs/008b-accesibilidad-responsive)                   | Implementado (15 tests nuevos, 104→119 en la suite)                                        |
| Cobertura de Functions por feature                      | [`009-cobertura-por-feature`](.claude/specs/009-cobertura-por-feature)                           | Implementado (9 tests nuevos, 119→128 en la suite; Functions 79.5%→87.57%)                 |

### Estado de las pruebas

Vitest está integrado, pero la suite actual se concentra principalmente en pruebas de creación de componentes. Todavía no ofrece protección suficiente para los flujos completos del CRUD y sus casos límite.

La estrategia a completar incluye:

- Tests HTTP del servicio: método, URL, parámetros, payload y errores.
- Tests del listado: datos, vacío, error, búsqueda, paginación y recarga tras eliminar.
- Tests de formularios: validación y protección frente a envíos repetidos.
- Tests de detalle y edición ante registros inexistentes y fallos de carga: cubierto (spec 003).
- Tests de interceptores: `loadingInterceptor` cubierto (spec 002); `errorInterceptor`, pendiente. Foco y limpieza del modal: cubierto (spec 005).

### Cobertura

`pnpm run test:coverage` (`ng test --configuration coverage`) corre la suite con `@vitest/coverage-v8` y muestra un reporte en consola (texto) y en `coverage/angular-enterprise-lab/index.html` (HTML, no versionado). Última medición, tras `009-cobertura-por-feature` (128 tests):

| Métrica    | % Cubierto |
| ---------- | ---------- |
| Statements | 93.87%     |
| Branches   | 91.86%     |
| Functions  | 87.57%     |
| Lines      | 95.71%     |

Es un número **informativo**, no un umbral bloqueante — no hay `coverageThresholds` configurado en `angular.json`, así que no falla el comando ni el commit si baja. El desbalance de Functions detectado en spec 007 (72.95% sobre specs 001-006, 79.5% recalculado tras 008a/008b) se cerró en spec 009 con tests dirigidos a funciones de lógica real sin cobertura (ver `.claude/specs/009-cobertura-por-feature`); no se persigue el 100%, solo un nivel consistente con el resto de las métricas.

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
- [ ] Unificar búsqueda, paginación y recarga del listado.
- [x] Recuperar la búsqueda después de errores y evitar suscripciones duplicadas.
- [ ] Mantener una página válida y filtros coherentes después de eliminar.
- [x] Mejorar los estados de error de detalle y edición.
- [x] Proteger formularios inválidos y operaciones en curso.
- [x] Completar el manejo de foco y limpieza del modal.
- [x] Incorporar la página 404.
- [x] Completar pruebas de comportamiento (medición de cobertura y verificaciones de formato: spec 007; número de cobertura feature por feature: spec 009).
- [x] Revisar tipado estricto, aliases, accesibilidad y adaptación móvil.

### 2. Autenticación y evolución funcional

- [ ] Implementar autenticación simulada, sesión, logout y retorno después del login.
- [ ] Agregar guards y permisos por rol.
- [ ] Completar filtros por estado y prioridad y cambio de estado de las órdenes.
- [ ] Incorporar gestión de equipos y técnicos de forma incremental.
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
