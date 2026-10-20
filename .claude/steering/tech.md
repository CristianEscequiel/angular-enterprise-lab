---
inclusion: always
---

# Stack tecnológico

## Backend (proveedor, repo separado)

`angular-enterprise-lab-api` — Java 21, Spring Boot 3, PostgreSQL, JWT. No se toca
desde este repo; el contrato se acuerda por spec y se documenta en su OpenAPI
(`/swagger-ui.html`). La URL base vive en un solo lugar:
`src/app/core/config/api.config.ts` (`API_BASE_URL`, `http://localhost:8080`).

## Frontend

- Angular 22 y TypeScript 6 (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, etc.).
- Componentes standalone, signals, `inject()`; Reactive Forms para el formulario
  compartido; Angular Router con carga diferida.
- RxJS 7 solo para HTTP y búsqueda reactiva (`debounceTime`, `distinctUntilChanged`,
  `switchMap`).
- SCSS con tokens y estilos por capas en `src/styles/` (abstracts, base, components,
  layout, themes, utilities).
- pnpm 11 (`packageManager`), Node 22.

## Calidad

- Vitest vía la integración de Angular (`pnpm test`); cobertura con
  `pnpm test:coverage` (`@vitest/coverage-v8`), informativa, sin umbral bloqueante.
- ESLint (`angular-eslint`, reglas de accesibilidad de templates) y Prettier.
- Husky + lint-staged: el pre-commit corre `pnpm test`.
- Los tests NO necesitan la API: usan `HttpTestingController`.
- `verify-contract.mjs` (spec 19) contrasta el contrato contra la API real levantada.

## Infraestructura

- `Dockerfile` multi-etapa (build con Node 22, servido con nginx) y `nginx.conf`.
- CI en GitHub Actions (`.github/workflows/ci.yml`): `pnpm lint`, `ng test`,
  `pnpm build`; en push a `master` publica la imagen en GHCR.
- Para correr la app completa: Postgres (`docker compose up -d` en la API), la API con
  el perfil `dev` y `pnpm start` (ver README, "Ejecutar la aplicación").

## Restricciones técnicas

- El cliente valida formato y traduce los errores de la API (`code`/`details`) a
  errores tipados; no reimplementa unicidad, integridad ni transiciones.
- Sin librerías pagas. Nuevas dependencias solo con justificación en una spec.
