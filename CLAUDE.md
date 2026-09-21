# Angular Enterprise Lab

Frontend: Angular 22 + TypeScript 6, standalone components, signals.
Backend actual: JSON Server (mock). Backend real (Java/Spring Boot/PostgreSQL)
planificado para después de estabilizar el frontend — NO asumir que existe todavía.

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
- Autenticación: NO implementada (roadmap fase 2)
- Coverage: no medible todavía, falta configurar proveedor Vitest

## Testing
- Vitest vía integración Angular
- pre-commit hook (Husky) corre `pnpm test`
- Antes de cerrar una feature: tests HTTP + listado + formularios + edge cases

## Instrucciones de compactación
Al compactar, preservar: spec/plan activo, archivos modificados, tests
fallidos, decisiones de arquitectura tomadas. Descartar: exploración
descartada, logs de comandos repetidos.
