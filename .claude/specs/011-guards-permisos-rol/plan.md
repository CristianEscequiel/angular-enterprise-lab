# Plan 011: Guards de ruta y permisos por rol

Spec: `.claude/specs/011-guards-permisos-rol/spec.md`

## Contexto

Spec 010 dejó el mecanismo de sesión y el retorno tras login, pero ninguna
ruta está protegida. Lo relevado en el código:

- `AuthService` (`core/auth/auth.service.ts`) ya expone `isAuthenticated`,
  `currentUser` y `loginUrlFor(returnUrl): UrlTree` (`/login?returnUrl=...`).
  `notes.md` de 010 dice explícitamente que el guard solo tiene que devolver
  `loginUrlFor(state.url)`. **No se toca la lógica de retorno**: `LoginPage`
  sigue leyendo `returnUrl` y navegando con `sanitizeReturnUrl()`.
- `sanitizeReturnUrl()` / `DEFAULT_RETURN_URL` viven hoy en
  `features/auth/return-url.ts`. El guard inverso necesita la misma regla de
  saneo, y `core/` no debe importar de `features/` (ver tarea 2).
- `LoginPage` (constructor, `login-page.ts:43-47`) ya redirige si entra con
  sesión activa. Eso es lo que el spec 011 pide como guard sobre `/login`:
  pasa a ser comportamiento duplicado y se elimina de la página (tarea 5).
- `app.routes.ts` es una lista plana: `dashboard`, `work-orders`
  (`loadChildren`), `login` (`loadChildren`), `**`. Hay un solo consumidor
  de `routes` en tests: `app.routes.spec.ts` (usa `RouterTestingHarness` y
  navega a `/dashboard`, `/work-orders`, etc. **sin sesión**). Al proteger
  las rutas esos tests van a redirigir a login; hay que sembrar sesión
  (tarea 4).
- `MessageService` + `<app-toast>` ya viven a nivel `App` (`showWarning`),
  así que un rechazo por rol puede avisar sin crear una página nueva.
- `db.json` ya tiene los dos usuarios `admin` y `tecnico` (sin campo `role`,
  decisión explícita de 010: "se agrega cuando haya spec").
- Fixtures de `AuthUser` con `displayName` en 7 specs (`auth.model`,
  `auth.service`, `auth.interceptor`, `login-page`, `app-shell`,
  `app.config`, `app.routes`): con `strict` y `role` obligatorio dejan de
  compilar hasta que se actualicen (tarea 1).

## Decisiones

| Tema                          | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estilo y ubicación            | Guards funcionales (`CanActivateFn`) con `inject()`, en `core/auth/auth.guard.ts`: es infraestructura transversal y los usarán varias features (013 en adelante).                                                                                                                                                                                                                                                                |
| Roles                         | `UserRole = 'admin' \| 'tecnico'` (los dos usuarios que ya existen en `db.json`). `admin` administra el sistema; `tecnico` ejecuta órdenes. Lista cerrada en `USER_ROLES` + type guard `isUserRole`. Qué puede hacer cada rol queda para las specs de feature.                                                                                                                                                                   |
| Dónde vive el rol             | `AuthUser.role` (y `UserRecord`, por herencia). `db.json` lo trae por usuario; `AuthService.login()` lo copia a la sesión. `isAuthUser` lo valida.                                                                                                                                                                                                                                                                               |
| Sesiones viejas sin `role`    | Se descartan: `isAuthSession` las rechaza, `restoreSession()` borra la clave y el usuario vuelve a loguearse una vez. Se descarta asignar un rol por defecto: otorgar un permiso "por omisión" desde storage es peor que pedir login. Efecto colateral aceptado (mock de desarrollo).                                                                                                                                            |
| Límite de seguridad           | El rol vive en `localStorage`, editable por el usuario. Estos guards son control de **navegación/UX**, no autorización. La autorización real es del backend (018) y se anota en `notes.md`.                                                                                                                                                                                                                                      |
| Rutas protegidas              | Un padre **sin path** con `canActivateChild: [authGuard]` que agrupa `dashboard` y `work-orders`. Rutas futuras dentro del grupo nacen protegidas. Se usa `canActivateChild` y no `canActivate` porque este último no se re-evalúa al navegar entre hijos del mismo padre (`/work-orders` → `/work-orders/1`); lo verifica un test (tarea 4). `/login` y `**` quedan fuera del grupo (públicas).                                 |
| `authGuard`                   | Con sesión → `true`. Sin sesión → `authService.loginUrlFor(state.url)`. Cero lógica de retorno propia.                                                                                                                                                                                                                                                                                                                           |
| `guestGuard` (sobre `/login`) | Sin sesión → `true`. Con sesión → redirige **sin renderizar el formulario** al `returnUrl` saneado, con fallback `/dashboard`. Sin query param (el caso del spec) siempre da `/dashboard`. Se respeta `returnUrl` para conservar el comportamiento que 010 ya tenía en `LoginPage` y reutilizar `sanitizeReturnUrl()`; si se prefiere "siempre `/dashboard`", es cambiar una línea. **Decisión de spec (criterio 3): redirige.** |
| Guard por rol                 | Factory `requireRole(...roles: UserRole[]): CanActivateFn` (tipado, sin strings sueltos en `data`). Sin sesión → `loginUrlFor(state.url)` (usable solo, sin depender de que `authGuard` corra antes). Rol permitido → `true`. Rol no permitido → `MessageService.showWarning(...)` + redirección a `/dashboard`. Uso: `canActivate: [requireRole('admin')]`.                                                                     |
| Rechazo por rol               | Redirige a `/dashboard` con aviso, sin página "403" nueva (no hay componente que justifique el alcance). Invariante documentada: `/dashboard` nunca se restringe por rol, o el rechazo entraría en bucle.                                                                                                                                                                                                                        |
| Alcance de la restricción     | Solo el **mecanismo**. Ninguna ruta real se restringe por rol en 011 (hoy ninguna feature depende de rol; no se inventa una regla de negocio). Se prueba con rutas sintéticas en el spec del guard. El primer uso real llega con 013.                                                                                                                                                                                            |
| 404 sigue público             | Un id inválido (`/work-orders/abc`) no matchea ningún hijo y cae en `**` antes de que corra el guard: un anónimo ve 404, no login. Consistente con "la 404 es pública".                                                                                                                                                                                                                                                          |

## Tareas

### 1. Rol en el modelo de usuario

- **Archivos:**
  - `core/auth/auth.model.ts`: `export const USER_ROLES = ['admin', 'tecnico'] as const;`,
    `export type UserRole = (typeof USER_ROLES)[number];`,
    `isUserRole(value: unknown): value is UserRole`; agregar `role: UserRole`
    a `AuthUser`; `isAuthUser` exige `isUserRole(value['role'])`.
  - `core/auth/auth.service.ts`: en el mapeo de `login()` agregar
    `role: record.role` al `user` de la sesión (nunca `password`).
  - `src/app/features/work-orders/data-access/db.json`: `"role": "admin"` para
    el usuario 1 y `"role": "tecnico"` para el 2. No se tocan `work-orders`.
  - Fixtures (agregar `role`): `auth.model.spec`, `auth.service.spec`,
    `auth.interceptor.spec`, `login-page.spec`, `app-shell.spec`,
    `app.config.spec`, `app.routes.spec`.
- **Test:**
  - `auth.model.spec.ts`: `isAuthSession` acepta `role: 'admin'` y
    `role: 'tecnico'`; rechaza sesión sin `role`, con `role: 'superuser'` y
    con `role: 7`.
  - `auth.service.spec.ts`: tras `login` con el usuario `tecnico`,
    `currentUser()?.role === 'tecnico'`, y `currentUser()` sigue sin
    `password`; sesión guardada en storage **sin** `role` → no autenticado y
    la clave `auth.session` se borra.
- **Valida (manual):** `pnpm api` y `GET /users?username=admin&password=admin123`
  devuelve `role: "admin"`.

### 2. Mover `return-url` a `core/auth/`

- **Archivos:** `features/auth/return-url.ts` → `core/auth/return-url.ts` y
  `return-url.spec.ts` idem (con `git mv`); actualizar el import en
  `features/auth/pages/login-page/login-page.ts` a `@core/auth/return-url`.
- **Por qué:** el `guestGuard` (core) necesita `sanitizeReturnUrl`; dejarlo
  en `features/auth/` invertiría la dependencia `core → features`. El
  contenido no cambia.
- **Test:** `return-url.spec.ts` se mueve sin cambios y sigue en verde;
  `login-page.spec.ts` sigue en verde (misma conducta).

### 3. Guards: `authGuard`, `guestGuard`, `requireRole`

- **Archivo nuevo:** `core/auth/auth.guard.ts`
  ```ts
  export const authGuard: CanActivateFn = (_route, state) => {
    const auth = inject(AuthService);
    return auth.isAuthenticated() ? true : auth.loginUrlFor(state.url);
  };

  export const guestGuard: CanActivateFn = (route) => {
    if (!inject(AuthService).isAuthenticated()) return true;
    return inject(Router).parseUrl(sanitizeReturnUrl(route.queryParamMap.get('returnUrl')));
  };

  export function requireRole(...roles: UserRole[]): CanActivateFn {
    return (_route, state) => {
      const auth = inject(AuthService);
      const user = auth.currentUser();
      if (!user) return auth.loginUrlFor(state.url);
      if (roles.includes(user.role)) return true;
      inject(MessageService).showWarning(
        'No tenés permiso para acceder a esa sección.',
        'Acceso denegado',
      );
      return inject(Router).parseUrl(DEFAULT_RETURN_URL);
    };
  }
  ```
- **Test nuevo:** `core/auth/auth.guard.spec.ts`. Se prueba con
  `RouterTestingHarness` sobre un arreglo de rutas mínimo (`/protected`
  con `authGuard`, `/login` con `guestGuard`, `/dashboard`,
  `/admin-only` con `requireRole('admin')`, componentes stub), sesión
  sembrada en `localStorage` antes de crear el harness — así se prueba el
  resultado real de navegar, no un valor de retorno suelto:
  - `authGuard`: sin sesión navegar a `/protected?x=1` → `router.url` es
    `/login?returnUrl=%2Fprotected%3Fx%3D1` y el stub protegido no se
    renderiza. **Debe fallar** si deja pasar o si pierde la URL de retorno.
  - `authGuard`: con sesión → se queda en `/protected` y se renderiza.
    **Debe fallar** si bloquea a un autenticado.
  - `authGuard`: hacer `logout()` con la sesión activa y navegar de nuevo →
    redirige (el guard lee el estado actual, no uno cacheado).
  - `guestGuard`: sin sesión, `/login` se renderiza.
  - `guestGuard`: con sesión, `/login` → `router.url === '/dashboard'` y el
    stub de login **no** se renderiza (nunca se crea el componente).
    **Debe fallar** si el formulario aparece con sesión activa.
  - `guestGuard`: con sesión, `/login?returnUrl=%2Fwork-orders%2F5` →
    `/work-orders/5`; con `returnUrl=%2F%2Fevil.com`, `https://evil.com` o
    `/login` → `/dashboard`.
  - `requireRole('admin')`: usuario `admin` → accede; usuario `tecnico` →
    `router.url === '/dashboard'`, `MessageService.message()` es un
    `warning` y el stub restringido no se renderiza. **Debe fallar** si el
    guard permite acceso indebido o no se ejecuta.
  - `requireRole('admin', 'tecnico')` (varios roles) → ambos entran.
  - `requireRole('admin')` sin sesión → `/login?returnUrl=%2Fadmin-only`
    (no es un 403 para un anónimo).

### 4. Aplicar los guards en `app.routes.ts` + actualizar su spec

- **Archivo:** `src/app/app.routes.ts`
  ```ts
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: 'dashboard', title: ..., loadComponent: ... },
      { path: 'work-orders', loadChildren: ... },
    ],
  },
  { path: 'login', canActivate: [guestGuard], loadChildren: ... },
  { path: '**', ... },   // sin guard
  ```
- **Test:** `src/app/app.routes.spec.ts`. Los tests existentes asumen
  navegar sin sesión; se agrega un helper que siembra una sesión `admin`
  en `localStorage` en el `beforeEach` (antes de crear el harness) y los
  tests de "sin sesión" hacen `TestBed.inject(AuthService).logout()`.
  El test de 010 "returns to /work-orders/5 after logging in…" deja de
  construir la URL a mano con `loginUrlFor` y pasa a navegar directo a
  `/work-orders/5` sin sesión. Tests nuevos:
  - `describe('without a session')`:
    - `/work-orders` → `router.url` empieza con `/login` y trae
      `returnUrl=%2Fwork-orders`; no se renderiza la lista y
      `workOrdersServiceMock.searchByName` **no** fue llamado. **Debe
      fallar** si permite el acceso o no preserva la URL.
    - `it.each` de `/dashboard`, `/work-orders/new`, `/work-orders/5`,
      `/work-orders/5/edit` → redirigen a login con su `returnUrl`.
    - **End-to-end del retorno con el guard real:** navegar a
      `/work-orders/5`, completar el form, flush de `/users` →
      `router.url === '/work-orders/5'` y `getById('5')` llamado.
    - `/no-existe` y `/work-orders/abc` → siguen mostrando NotFound (no
      redirigen a login).
    - `/login` → renderiza el formulario y título "Iniciar sesión" (test
      existente, ahora bajo este bloque).
  - `describe('with an active session')`:
    - `/work-orders` → se queda, lista renderizada, `router.url` sin
      cambios. **Debe fallar** si bloquea sin motivo.
    - `/dashboard` mantiene su título (test de títulos existente).
    - `/login` → `router.url === '/dashboard'`, `#username` **no** está en
      el DOM. **Debe fallar** si el formulario se muestra.
    - `/login?returnUrl=%2Fwork-orders%2F5` → `/work-orders/5`;
      `/login?returnUrl=%2F%2Fevil.com` → `/dashboard`.
    - Navegación entre hijos tras cerrar sesión: con sesión ir a
      `/work-orders`, `authService.logout()`, `navigateByUrl('/work-orders/1')`
      → login. Es el test que justifica `canActivateChild` sobre
      `canActivate` (ver verificación por mutación).
- `app.config.spec.ts` no navega; solo actualizar el fixture (tarea 1).

### 5. Quitar el redirect duplicado de `LoginPage`

- **Archivo:** `features/auth/pages/login-page/login-page.ts`: eliminar el
  `constructor` con el `navigateByUrl` condicionado a `isAuthenticated()`
  (y el import/inject que quede sin uso; `Router` y `returnUrl` siguen
  usándose en `onSubmit`).
- **Test:** `login-page.spec.ts`: borrar `describe('with an existing
session')` (2 tests) — esa conducta la cubren ahora el `guestGuard` y el
  spec de rutas (tareas 3 y 4), que además prueban que el formulario
  nunca se renderiza. Resto de la suite sin cambios. Confirmar que no
  bajan las métricas de `login-page.ts`.

### 6. Verificación por mutación

Con las tareas 1-5 implementadas (código final; se revierte solo el punto
mutado), mismo formato que specs 001-010:

- `authGuard` → `return true` → deben fallar los tests de "sin sesión" de
  `auth.guard.spec` y `app.routes.spec`.
- `authGuard` → `loginUrlFor('/dashboard')` fijo (pierde la URL) → deben
  fallar los tests de `returnUrl` (unit, `it.each` y end-to-end).
- `guestGuard` → `return true` → falla `/login con sesión` en ambos specs.
- Quitar `canActivate: [guestGuard]` de la ruta `login` → **falla solo
  `app.routes.spec`** (el unit del guard sigue verde): confirma que la
  integración con las rutas reales está cubierta.
- Quitar `canActivateChild` del padre del grupo protegido → fallan los
  tests de "sin sesión" de `app.routes.spec`.
- Cambiar `canActivateChild` por `canActivate` en el padre → debe fallar el
  test "navegación entre hijos tras cerrar sesión". Si **no** falla, el
  test no discrimina y se ajusta antes de cerrar.
- `requireRole` → `return true` en la comparación de rol → falla el test de
  `tecnico` rechazado.
- Mover `**` dentro del grupo protegido → falla "`/no-existe` sin sesión
  muestra NotFound".
- Resultado anotado en `notes.md`.

### 7. `notes.md` (spec 011)

- Decisiones de la tabla, en especial: `canActivateChild` sobre pathless,
  `guestGuard` con `returnUrl` saneado, rechazo por rol a `/dashboard` con
  aviso, y que `return-url.ts` pasó a `core/auth/`.
- Límite: el rol en `localStorage` es editable → guards = UX; la
  autorización real es del backend (018).
- Sesiones sin `role` de spec 010 se descartan una vez (re-login).
- Cómo usar el guard por rol en 013: `canActivate: [requireRole('admin')]`
  y no restringir nunca `/dashboard`.
- Cobertura antes/después de `auth.guard.ts`, `app.routes.ts` y
  `login-page.ts`, con la misma aclaración de 010 sobre la variabilidad de
  Functions entre corridas.

## Mapa criterios de aceptación → tests

| Criterio del spec                                      | Test                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Sin sesión `/work-orders` → login con URL de retorno   | `app.routes.spec` (sin sesión + end-to-end del retorno) y `auth.guard.spec` (`authGuard` sin sesión) |
| Con sesión `/work-orders` → acceso normal              | `app.routes.spec` (con sesión) y `auth.guard.spec` (`authGuard` con sesión)                          |
| `/login` con sesión → comportamiento explícito         | Definido en este plan: redirige. `auth.guard.spec` (`guestGuard`) y `app.routes.spec`                |
| Rol sin permiso en ruta restringida → bloqueado        | `auth.guard.spec` (`requireRole`: `tecnico` rechazado, aviso, sin render del stub)                   |
| `/login` con sesión → `/dashboard` sin renderizar form | `app.routes.spec` (`#username` ausente, `router.url === '/dashboard'`) y `auth.guard.spec`           |
| Rutas públicas: `/login` y `**`                        | `app.routes.spec` (`/login` y `/no-existe` sin sesión)                                               |
| Concepto de rol en el modelo                           | `auth.model.spec`, `auth.service.spec`                                                               |

## Fuera de alcance (confirmado del spec)

- Catálogo de permisos por rol y restricción de rutas reales (013).
- Mostrar/ocultar UI según rol (botones, menú, sidebar). No hace falta para
  probar los guards.
- Página "403" dedicada.
- Cambios en `authInterceptor` ni en el flujo de login/logout de 010
  (salvo el redirect duplicado de `LoginPage`, tarea 5).
- Expiración de sesión / 401 → logout automático (018).

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar; anotar el conteo de
   archivos/tests para compararlo al cierre.
2. Tras cada tarea 1-5: `pnpm test` en verde (la tarea 1 rompe compilación
   de los specs hasta actualizar los 7 fixtures, se hace en el mismo paso).
3. Tarea 6: confirmar cada fallo esperado, revertir cada mutación,
   confirmar verde.
4. `pnpm lint` y `pnpm build` sin errores.
5. `pnpm run test:coverage`: `auth.guard.ts` y `auth.model.ts` sin
   funciones sin cubrir; `app.routes.ts` y `login-page.ts` sin caída.
6. Manual con `pnpm api` + `pnpm start` (borrar `auth.session` del storage
   antes: las sesiones viejas sin `role` se descartan de todas formas):
   - Sin sesión ir a `/work-orders/5` → cae en `/login?returnUrl=...`;
     loguear `admin/admin123` → llega a `/work-orders/5`.
   - Con sesión escribir `/login` en la barra → aterriza en `/dashboard`
     sin parpadeo del formulario.
   - Logout → `/login`; volver atrás con el navegador a `/dashboard` →
     vuelve a `/login`.
   - `/no-existe` sin sesión → 404.
7. Commit solo si el usuario lo pide; el hook de Husky corre `pnpm test`.
