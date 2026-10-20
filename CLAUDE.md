# Angular Enterprise Lab

Frontend de un CMMS (órdenes de mantenimiento): Angular 22 + TypeScript 6, standalone
components, signals. Consume la API real del repo hermano `../angular-enterprise-lab-api`
(Java 21 / Spring Boot 3 / PostgreSQL, JWT, autoridad de roles en el servidor). JSON Server
y los mocks se retiraron (spec 19). Para correr la app hay que levantar la API con el perfil
`dev` (ver README, "Ejecutar la aplicación"); los tests NO la necesitan.
La API es la fuente de verdad de unicidad, integridad referencial y transiciones de estado: el
cliente solo valida formato y traduce los errores (`code`/`details`) a errores tipados.

## Metodología de desarrollo

Toda feature no trivial (más de ~3 archivos, o que toca datos/permisos/integraciones) sigue la
skill `anthropic-skills:sdd-flow`, flujo completo: `requirements.md` → `design.md` →
`tasks.md`, con aprobación explícita del usuario entre cada fase. No avances de una fase a la
siguiente sin esa aprobación, aunque el pedido parezca claro. (Las specs 00 a 17 usan el
formato corto `spec.md` + `plan.md` + `notes.md`; no se reescriben.)

- Specs en `.claude/specs/<NN>-<nombre>/`, numeración `00`–`NN` de dos dígitos sin letras ni
  huecos; la siguiente libre es la `21`. El mapa y la equivalencia con la numeración vieja
  están en `.claude/specs/ROADMAP.md`.
- Contexto de proyecto (qué es, stack, estructura) en `.claude/steering/` — leelo antes de
  escribir la primera spec de una sesión nueva.
- Si ya existe una spec para lo que se pide, es una enmienda (`NN-A`): se edita esa carpeta,
  nunca se crea una segunda para lo mismo.
- Los cambios de contrato con la API se acuerdan por spec en ambos repos (ver el ROADMAP de la
  API); este repo no toca el backend.

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

## Estado actual

- Specs 00 a 20 implementadas; el detalle por spec y los pendientes (19·T12, 18·O2) están en
  `.claude/specs/ROADMAP.md`.
- Autenticación: JWT contra la API (`POST /auth/login`, `GET /auth/me`); sesión en `localStorage`.
- Cobertura: `pnpm test:coverage` (informativa, sin umbral bloqueante).

## Testing

- Vitest vía integración Angular
- pre-commit hook (Husky) corre `pnpm test`
- Antes de cerrar una feature: tests HTTP + listado + formularios + edge cases

## Instrucciones de compactación

Al compactar, preservar: spec activa (requirements/design/tasks), fase en la que está (qué
aprobación falta), archivos modificados, tests fallidos, decisiones de arquitectura tomadas.
Descartar: exploración descartada, logs de comandos repetidos.
