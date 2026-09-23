# Notas 010: ejecución

## Resultado

30 archivos / 210 tests en verde (baseline 24 archivos / 128 tests → +82
tests). `pnpm lint` sin errores.

| Área              | Archivos nuevos / tocados                                                         | Tests nuevos |
| ----------------- | --------------------------------------------------------------------------------- | ------------ |
| Datos (`db.json`) | colección `users` (2 usuarios)                                                    | manual       |
| Modelo y config   | `core/auth/auth.model.ts`, `core/config/api.config.ts`                            | 14           |
| `AuthService`     | `core/auth/auth.service.ts`                                                       | 16           |
| Interceptor       | `core/interceptors/auth.interceptor.ts`, `app.config.ts` (+ `app.config.spec.ts`) | 5 + 2        |
| Login             | `features/auth/` (`auth.routes.ts`, `return-url.ts`, `pages/login-page/*`)        | 19 + 15      |
| Ruta `/login`     | `app.routes.ts`                                                                   | 2            |
| Logout            | `layout/header/*`, `layout/app-shell/*`                                           | 5 + 4        |

Cada criterio de aceptación del spec tiene test (mapa completo en
`plan.md`). Los tests de los criterios 4 y 5 se contrastaron con una
mutación (se rompió a propósito `returnUrl` en `LoginPage` y `logout()` en
`AppShell`; en ambos casos falló el test correspondiente y se restauró).

## Decisiones tomadas

- **Validación:** `GET /users?username=&password=` contra JSON Server, no
  usuario hardcodeado. Es lo más parecido al reemplazo por
  `POST /auth/login` de spec 018: hay round-trip HTTP, pasa por los
  interceptores y se testea con `HttpTestingController`.
- **Contrato:** `AuthService.login()` devuelve `AuthSession = { token, user }`.
  Páginas, interceptor y header solo conocen ese shape; en 018 cambia la
  llamada HTTP interna y la generación del token, nada más.
- **Token simulado:** `mock-token.<userId>.<Date.now()>`, generado en el
  servicio (no vive en `db.json`).
- **Persistencia:** `localStorage` (clave `auth.session`) vía el
  `LocalStorageService` existente. Con JWT real el token también se
  persiste; `sessionStorage` habría obligado a migrar el storage además
  de la implementación.
- **Restauración:** al construirse, `AuthService` lee la clave y valida el
  shape con `isAuthSession`. Ausente, JSON corrupto o shape inválido →
  no autenticado **y se borra la clave**. `LocalStorageService.get`
  devuelve `null` tanto para "ausente" como para "corrupto", por eso el
  borrado es incondicional.
- **Doble chequeo en `login()`:** además del filtro de JSON Server, el
  servicio verifica que el usuario devuelto coincida en `username` y
  `password`. Si otra versión de JSON Server ignorara los filtros,
  cualquier login entraría con el primer usuario.
- **Header `Authorization: Bearer <token>`:** solo si hay sesión **y** la
  URL empieza con `API_BASE_URL`. Sin sesión el header no existe (ni
  vacío ni `Bearer undefined`); el token no sale hacia URLs de terceros.
  `authInterceptor` va primero en `withInterceptors([...])`.
- **`returnUrl`:** query param saneado por `sanitizeReturnUrl()`. Solo
  rutas internas; `//host`, `/\host`, `/<whitespace>`, URLs absolutas,
  `javascript:` y `/login` caen a `/dashboard`.
- **`loginUrlFor(url)`** en `AuthService`: arma el `UrlTree`
  `/login?returnUrl=...`. El guard de 011 solo tiene que llamarlo.
- **Logout:** `Header` emite `logout`; `AppShell` decide
  (`authService.logout()` + `navigate(['/login'])`). El botón depende de
  `userName() !== null`, no de que el nombre sea truthy.
- **Sesión previa en `/login`:** si ya hay sesión al entrar, `LoginPage`
  redirige al `returnUrl` saneado. No estaba en el spec; es un
  comportamiento de la página, no protección de rutas (esa es 011).

## Diferencias respecto del plan

- `isAuthSession` valida más de lo planeado (`id` y `username` no vacíos,
  `displayName` y `email` strings) porque el resultado se usa para decidir
  si se restaura una sesión desde storage.
- No se agregó `role="alert"` manual al error de credenciales: `<app-alert
variant="error">` ya lo aplica junto con `aria-live="assertive"`.
- La verificación 2 del plan decía "métricas globales no bajan"; ver la
  sección de cobertura: Branches baja por un efecto de medición, no por
  código sin testear de este spec.

## Cobertura

Código nuevo de 010: 100% de Statements/Branches/Functions/Lines en todos
los archivos (`auth.model`, `auth.service`, `auth.interceptor`,
`login-page.ts/.html`, `return-url`, `header`, `app-shell.html`), salvo
`app-shell.ts` (5/7 funciones): las dos sin cubrir son `showToast` y
`closeToast`, el código muerto ya documentado en las notas de 009.

Medición global (`pnpm run test:coverage`):

```
                 baseline (HEAD)      ahora
Branches       : 91.86% (316/344)    88.83% (390/439)
```

**Branches bajó 3 puntos y no es una regresión de tests.** El diff de
Branches por archivo contra un worktree limpio de `HEAD` muestra una sola
diferencia en lo que estaba sin cubrir: `core/interceptors/error.interceptor.ts`
pasó de "ausente del reporte" a **0/21**. Ese archivo nunca tuvo spec y
ningún test importaba `app.config.ts`, así que la cobertura no lo veía.
`app.config.spec.ts` (tarea 4) sí importa `appConfig`, y con eso
`errorInterceptor` entró al reporte. Las 21 ramas sin cubrir son
exactamente la diferencia (316/344 → 390/439); todo lo demás sumó
cobertura completa.

**Statements/Functions/Lines no son comparables al decimal.** Dos corridas
consecutivas sobre `HEAD` sin cambios dieron Functions 85.09% y 87.57%
(Statements 93.15% / 93.87%); dos corridas con 010 dieron 87.62% y 86.13%.
Esas métricas fluctúan entre ejecuciones (los reportes de 009 midieron una
de esas dos). Branches, en cambio, dio 316/344 en ambas corridas de
baseline y 390/439 en ambas con 010, así que ese número sí es estable.

## Limitaciones conocidas (no se corrigen en este spec)

- **La contraseña viaja en el query string** (`GET /users?...&password=`).
  Aceptable solo por ser un mock de desarrollo; en 018 pasa al body de un
  `POST`.
- **`WorkOrdersService` sigue con la URL hardcodeada**
  (`http://localhost:3000/work-orders`); `API_BASE_URL` solo lo usan
  `AuthService` y el interceptor. Migrarlo es un cambio aparte.
- **`db.json` vive en `features/work-orders/data-access/`** aunque ahora
  contiene también `users`. Moverlo implica tocar el script `pnpm api`.
- **`mock-api.interceptor.ts` sigue sin registrarse** en `app.config.ts`
  (legado de antes de JSON Server); ningún archivo lo importa, así que ni
  siquiera aparece en el reporte de cobertura.
- **`error.interceptor.ts` contiene dos `console.log` de depuración.** El
  spec que le faltaba se agregó aparte de 010 (`error.interceptor.spec.ts`,
  17 tests, 100% en las 4 métricas); con él, Branches quedó en 93.62%
  (411/439), por encima del baseline. Los `console.log` no se tocaron: el
  spec los silencia con `vi.spyOn`.
- **La pantalla de login se renderiza dentro de `AppShell`** (header +
  sidebar visibles). El spec no pide un layout aparte.
- **Sin manejo de 401 → logout automático:** depende de un backend que
  valide el token (018).
- **`/work-orders` y el resto siguen accesibles sin login** (spec 011).

## Qué cambia en los specs siguientes

- **011 (guards):** el guard solo tiene que devolver
  `authService.loginUrlFor(state.url)` cuando `isAuthenticated()` sea
  false. El retorno tras login ya está probado de punta a punta en
  `app.routes.spec.ts`.
- **018 (JWT real):** cambian únicamente `AuthService.login()` (llamada a
  `POST /auth/login` que ya devuelva `{ token, user }`) y la generación
  del token. `authInterceptor`, `LoginPage`, `Header` y `AppShell` no se
  tocan. Ahí también hay que definir expiración/refresh y qué hace el
  `errorInterceptor` con un 401.

## Pendiente

- **Limpieza opcional:** quitar los `console.log` de `error.interceptor.ts`
  (y el `vi.spyOn(console, 'log')` del spec cuando se haga).
- **Verificación manual** con `pnpm api` + `pnpm start` (paso 3 de la
  verificación del plan): login con `admin/admin123` desde
  `/login?returnUrl=/work-orders/5`, header `Authorization` en la pestaña
  Network, persistencia tras F5 y logout.
