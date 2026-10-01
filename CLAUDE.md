# Angular Enterprise Lab

Frontend: Angular 22 + TypeScript 6, standalone components, signals.
Backend: API real (Java 21 / Spring Boot 3 / PostgreSQL) en el repo hermano
`../angular-enterprise-lab-api`, con JWT y autoridad de roles en el servidor. JSON Server y los
mocks se retiraron (spec 018). Para correr la app hay que levantar la API con el perfil `dev`
(ver README, "Ejecutar la aplicación"); los tests NO la necesitan.
La API es la fuente de verdad de unicidad, integridad referencial y transiciones de estado: el
cliente solo valida formato y traduce los errores (`code`/`details`) a errores tipados.

## Arquitectura

- Organización por feature (`features/work-orders/`), no por tipo de archivo
- `core/`: infraestructura transversal (interceptors, services globales)
- `shared/`: componentes reutilizables de UI (Button, Badge, Alert, Toast, Spinner, Modal)
- La lógica de negocio vive en las páginas, NO en componentes compartidos
  (ej: Modal emite confirmación, la página decide qué hacer)

## Convenciones técnicas

- `signal()` para estado local, `computed()` para valores derivados
- `input()`/`output()`/`model()` para comunicación entre componentes
- RxJS solo para HTTP y búsqueda reactiva (`debounceTime`, `distinctUntilChanged`, `switchMap`)
- Servicios encapsulan HTTP (`WorkOrdersService`), páginas coordinan carga/acciones/navegación
- Rutas con `loadChildren()` a nivel feature, `loadComponent()` a nivel página

## Estado actual (no lo repitas en cada spec, ya está acá)

- CRUD implementado, búsqueda+paginación en estabilización
- Autenticación: JWT contra la API (`POST /auth/login`, `GET /auth/me`); sesión en `localStorage`
- Coverage: no medible todavía, falta configurar proveedor Vitest
- Integración con la API (spec 018): ver `.claude/specs/018-integracion-api-backend/` (tareas T1–T12)

## Testing

- Vitest vía integración Angular
- pre-commit hook (Husky) corre `pnpm test`
- Antes de cerrar una feature: tests HTTP + listado + formularios + edge cases

## Instrucciones de compactación

Al compactar, preservar: spec/plan activo, archivos modificados, tests
fallidos, decisiones de arquitectura tomadas. Descartar: exploración
descartada, logs de comandos repetidos.
