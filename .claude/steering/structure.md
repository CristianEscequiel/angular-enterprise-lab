---
inclusion: always
---

# Estructura del proyecto

## Organización de carpetas

```
angular-enterprise-lab/
├── .claude/
│   ├── steering/                # este contexto (product/tech/structure)
│   └── specs/<NN>-<nombre>/     # numeración 00–NN, ver specs/ROADMAP.md
├── src/app/
│   ├── core/                    # infraestructura transversal
│   │   ├── api/                 # api-error (readApiError)
│   │   ├── auth/                # AuthService, guards, modelo de sesión, return-url
│   │   ├── config/              # api.config.ts (API_BASE_URL)
│   │   ├── interceptors/        # auth, error, loading
│   │   └── services/            # loading, message, localStorage
│   ├── features/                # una carpeta por feature
│   │   ├── about/ | auth/ | dashboard/ | machines/ | maintenance/ | work-orders/
│   │   │   └── components/ data-access/ models/ pages/ testing/ <feature>.routes.ts
│   ├── layout/                  # header, sidebar, shell
│   ├── pages/                   # páginas globales (404)
│   ├── shared/components/       # alert, badge, button, modal, spinner, toast
│   ├── app.config.ts | app.routes.ts | app.ts
├── src/styles/                  # abstracts, base, components, layout, themes, utilities
├── public/ · Dockerfile · nginx.conf · proxy.conf.json
└── angular.json · tsconfig*.json · eslint.config.js
```

## Convención de nombres

- Carpetas por feature en kebab-case y en inglés (`work-orders`, `machines`).
- Specs: `<NN>-<nombre-en-kebab>` con dos dígitos, secuencial desde `00`, sin letras ni
  huecos. Una ampliación de una spec existente es una enmienda (`NN-A`) dentro de su
  carpeta, no una carpeta nueva.
- Servicios en `data-access/` (`*.service.ts`); políticas de permiso en
  `models/*.permissions.ts` (una por feature, con su `*.spec.ts`).
- Cada archivo lleva su `*.spec.ts` al lado; los datos de prueba compartidos van en
  `testing/`.
- Rama por spec: `feat/<NN>-<nombre>`.

## Patrones de import

- Aliases de `tsconfig.json`: `@core/*`, `@shared/*`, `@features/*`. Dentro de la misma
  feature se usan rutas relativas.
- `shared/` no importa de `features/`; `core/` no importa de `features/` ni de `shared/`.
- Rutas: `loadChildren()` a nivel feature, `loadComponent()` a nivel página.

## Decisiones de arquitectura

- Organización por feature, no por tipo de archivo.
- La lógica de negocio vive en las páginas; los componentes de `shared/` son
  presentacionales (el Modal emite confirmación, la página decide).
- Los servicios encapsulan HTTP y traducen los códigos de error de la API a errores
  tipados; las páginas coordinan carga, acciones y navegación.
- Los permisos por rol espejan la matriz de la API (`*.permissions.ts` ↔ `*Permissions`
  del dominio del backend), pero la autoridad es del servidor.
- Las features del front se corresponden con los módulos de la API
  (`work-orders`↔`workorders`, `maintenance`, `machines`, `dashboard`, `auth`), salvo `about`:
  es una feature solo de front (página informativa sin llamadas a la API).
