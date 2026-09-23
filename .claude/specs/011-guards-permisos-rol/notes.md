# Notas 011: ejecución

## Resultado

32 archivos / 258 tests en verde (baseline 31 archivos / 227 tests → +31
tests, +1 archivo). `pnpm lint`, `pnpm build` y `prettier --check` sin
errores.

| Área         | Archivos nuevos / tocados                                                      | Tests                                  |
| ------------ | ------------------------------------------------------------------------------ | -------------------------------------- |
| Rol          | `core/auth/auth.model.ts`, `auth.service.ts`, `db.json` (+7 fixtures de specs) | +6 modelo, +2 servicio                 |
| Guards       | `core/auth/auth.guard.ts` (`authGuard`, `guestGuard`, `requireRole`)           | 14 nuevos (`auth.guard.spec.ts`)       |
| Rutas        | `app.routes.ts`                                                                | `app.routes.spec.ts` reescrito (+11)   |
| `return-url` | movido de `features/auth/` a `core/auth/` (`git mv`, contenido intacto)        | sin cambios                            |
| `LoginPage`  | se quitó el redirect del constructor                                           | −2 (movidos al guard y a `app.routes`) |

## Decisiones tomadas

- **Guards funcionales en `core/auth/auth.guard.ts`.** `authGuard` solo
  devuelve `authService.loginUrlFor(state.url)`; no hay lógica de retorno
  nueva. `LoginPage` sigue leyendo `returnUrl` como en 010.
- **Rutas protegidas con un padre sin path y `canActivateChild`.**
  `dashboard` y `work-orders` cuelgan de ahí; rutas futuras dentro del
  grupo nacen protegidas. `canActivate` no alcanza: no se re-evalúa al
  navegar entre hijos del mismo padre (verificado por mutación, ver abajo).
  `/login` y `**` quedan fuera del grupo.
- **`/login` con sesión (criterio 3 del spec): redirige.** `guestGuard`
  navega al `returnUrl` saneado y cae en `/dashboard` sin query param (el
  caso del spec). Se respeta `returnUrl` para conservar el comportamiento
  que 010 ya tenía en `LoginPage` y reutilizar `sanitizeReturnUrl()`. Si se
  prefiere "siempre `/dashboard`", es una línea en `guestGuard` más los
  tests con `returnUrl`.
- **`return-url.ts` pasó a `core/auth/`** para que `core` no importe de
  `features`.
- **Redirect duplicado eliminado de `LoginPage`.** El guard corre antes de
  crear el componente, así que el constructor nunca lo ejecutaba en la app
  real. Sus 2 tests se reemplazaron por los de `guestGuard` y
  `app.routes.spec` (que además verifican que `#username` no está en el DOM).
- **Rol:** `UserRole = 'admin' | 'tecnico'`, `USER_ROLES` y `isUserRole` en
  `auth.model.ts`; `AuthUser.role` es obligatorio y `isAuthUser` lo valida.
- **`requireRole(...roles)` es una factory** (`canActivate: [requireRole('admin')]`),
  sin strings sueltos en `route.data`. Sin sesión redirige a login con
  `returnUrl` (no muestra "acceso denegado" a un anónimo). Con rol no
  permitido: `MessageService.showWarning('No tiene permiso...', 'Acceso denegado')`
  y redirección a `/dashboard`. No hay página 403.
- **Ninguna ruta real se restringe por rol todavía.** No hay features que
  dependan de rol; el mecanismo se prueba con rutas sintéticas en
  `auth.guard.spec.ts`. El primer uso real llega con 013.
- **404 sigue público:** `/work-orders/abc` no matchea ningún hijo y cae en
  `**` antes del guard, así que un anónimo ve 404 y no login.

## Limitaciones y cosas a tener en cuenta

- **Los guards son control de navegación/UX, no autorización.** El rol vive
  en `localStorage` y el usuario puede editarlo. La autorización real es del
  backend (spec 018).
- **Las sesiones guardadas por 010 no tienen `role`:** `isAuthSession` las
  rechaza, `restoreSession()` borra la clave y el usuario tiene que loguearse
  una vez. No se asigna un rol por defecto a propósito (otorgar un permiso
  "por omisión" desde storage es peor que pedir login). Hay test.
- **Regla para 013 y siguientes:** no restringir nunca `/dashboard` por rol;
  es el destino del rechazo y entraría en bucle.
- **Sidebar/Header siguen mostrando todo** con o sin sesión (fuera de alcance
  del spec: ocultar UI según rol).
- **`AppShell`/login:** la pantalla de login sigue renderizándose dentro del
  layout (limitación ya anotada en 010).

## Verificación por mutación

Con el código final, se rompió a propósito cada punto y se corrió la suite
completa; en todos los casos falló lo esperado y se restauró.

| Mutación                                                 | Resultado                                                                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authGuard` siempre deja pasar                           | 9 fallos (unit + integración: sin sesión, retorno, navegación entre hijos)                                                                                                                           |
| `authGuard` pierde la URL de retorno (`/dashboard` fijo) | 7 fallos (todos los de `returnUrl`, incluido el end-to-end del login)                                                                                                                                |
| `guestGuard` siempre deja pasar                          | 8 fallos (unit + `app.routes.spec`)                                                                                                                                                                  |
| Ruta `login` sin `guestGuard`                            | 3 fallos, **solo en `app.routes.spec`**: el spec unitario del guard sigue verde, por eso la integración con las rutas reales es necesaria                                                            |
| Grupo protegido sin `canActivateChild`                   | 7 fallos en `app.routes.spec`                                                                                                                                                                        |
| `canActivate` en vez de `canActivateChild` en el padre   | 1 fallo: "protects navigation between children once the session is gone". Confirma que ese test discrimina y que `canActivateChild` es necesario                                                     |
| `requireRole` siempre permite                            | 1 fallo: "blocks a user without the role…"                                                                                                                                                           |
| `**` movido dentro del grupo protegido                   | La suite **no termina**: `/login` matchea primero el comodín, el guard redirige a `/login?returnUrl=/login` y entra en bucle de redirecciones. Detectado por cuelgue, no por aserción; no se repitió |

Nota de la mutación con `**`: la corrida colgada se detuvo a mano y
`app.routes.ts` se restauró desde backup (verificado con `cmp` y con la
suite completa en verde).

## Cobertura

`auth.guard.ts`, `auth.model.ts`, `app.routes.ts` y `login-page.ts`
no aparecen en la tabla de archivos con huecos: 100% en las cuatro
métricas. Medición global (`pnpm run test:coverage`):

```
                corrida 1           corrida 2 (la del README)
Statements : 95.03% (977/1028)   94.55% (972/1028)
Branches   : 93.72% (418/446)    93.72% (418/446)   (010 cerró en 93.62%, 411/439)
Functions  : 90.33% (187/207)    88.88% (184/207)
Lines      : 96.63% (719/744)    95.96% (714/744)
```

Statements/Functions/Lines fluctúan entre corridas sobre el mismo código
(ver nota de 010); Branches es el número estable. La caída de Functions
respecto de 90.09% (010) cae dentro de esa variabilidad: los archivos
nuevos están al 100%.

## Pendiente

- Nada abierto. La verificación manual con `pnpm api` + `pnpm start` la
  hizo el autor del proyecto y el `README` ya tiene la cobertura y la
  revisión de este spec.
