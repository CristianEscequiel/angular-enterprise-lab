# Plan 010: Autenticación simulada, sesión, logout y retorno tras login

Spec: `.claude/specs/010-autenticacion-simulada/spec.md`

## Contexto

No hay autenticación. El spec pide el **mecanismo** de sesión (login,
persistencia, logout, retorno a la URL original, token en header) de modo
que spec 018 (JWT real contra Spring Boot) sea un cambio de implementación
dentro de `AuthService`, no de arquitectura. Guards quedan para spec 011.

Lo relevado en el código:

- `app.config.ts:14-16` registra interceptores funcionales
  (`HttpInterceptorFn`) en `withInterceptors([loadingInterceptor,
mockDelayInterceptor, errorInterceptor])`. Cada uno vive en
  `core/interceptors/<nombre>.interceptor.ts`, usa `inject()` dentro de la
  función y tiene su `*.spec.ts` con `provideHttpClient(withInterceptors([x]))`
  - `provideHttpClientTesting()` + `httpMock.verify()` en `afterEach`
    (`loading.interceptor.spec.ts`). El nuevo interceptor sigue ese mismo patrón.
- `mock-api.interceptor.ts` existe pero **no** está registrado (código
  legado de antes de JSON Server) — no se toca.
- JSON Server se levanta con `pnpm api` sobre
  `src/app/features/work-orders/data-access/db.json` (json-server
  `1.0.0-beta.15`), una sola colección `work-orders`. La base URL está
  hardcodeada en `WorkOrdersService` (`http://localhost:3000/work-orders`).
- `LocalStorageService` (`core/services/localStorage.service.ts`) ya
  encapsula `get/set/remove` con try/catch y JSON — se reutiliza.
- Patrón de formulario: `features/work-orders/components/form/form.ts`
  (`FormBuilder`, controles `nonNullable`, `isInvalid()`, `onSubmit()` que
  hace `markAllAsTouched()` si es inválido).
- `errorInterceptor` ya muestra toast para 401/403 — relevante para no
  duplicar mensajes en el login (ver tarea 5).

## Decisiones

| Tema                   | Decisión                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validación             | Endpoint JSON Server `GET /users?username=<u>&password=<p>` (filtros de igualdad de json-server v1). Array vacío → credenciales inválidas. Más representativo que un usuario hardcodeado: hay round-trip HTTP, pasa por los interceptores y se testea con `HttpTestingController`, igual que será con `POST /auth/login` en 018. |
| Contrato del servicio  | `AuthService.login(credentials): Observable<AuthSession>` donde `AuthSession = { token, user }`. Hoy `AuthService` traduce la respuesta de `/users` a ese shape; en 018 solo cambia la llamada HTTP interna (`POST /auth/login` que ya devuelve `{ token, user }`). Páginas e interceptor no se enteran.                         |
| Token simulado         | Generado en `AuthService`: `mock-token.<userId>.<Date.now()>`. No se guarda en `db.json` (un token fijo por usuario no se parece a un JWT emitido por sesión).                                                                                                                                                                   |
| Persistencia           | **localStorage** vía `LocalStorageService`, clave `auth.session`. Sobrevive recargas y pestañas nuevas, que es el comportamiento esperado con JWT en 018 (el token se persiste; la expiración la resuelve 018). sessionStorage se descarta porque en 018 habría que migrar el storage además de la implementación.               |
| Restauración           | `AuthService` lee `auth.session` en su construcción y valida el shape con un type guard (`isAuthSession`); si es inválido lo borra y arranca como no autenticado. `LocalStorageService.get` devuelve `unknown`, así que el guard es obligatorio con el tipado estricto actual.                                                   |
| Ubicación              | `AuthService`, modelo y interceptor en `core/` (estado global transversal). Pantalla de login en `features/auth/` (`auth.routes.ts` con `loadChildren` → `loadComponent` de la página), igual que `work-orders`.                                                                                                                 |
| Retorno tras login     | Query param `returnUrl`. `LoginPage` lo lee, lo sanea (solo rutas internas: empieza con `/`, no con `//`, no es `/login`) y navega con `router.navigateByUrl`. Fallback `/dashboard`. `AuthService.loginUrlFor(url)` arma el `UrlTree` `/login?returnUrl=...` para que el guard de 011 solo tenga que llamarlo.                  |
| Header en peticiones   | `Authorization: Bearer <token>` solo si hay sesión **y** la URL empieza con `API_BASE_URL` (no filtrar el token a terceros). Sin sesión → header ausente (no vacío, no `Bearer undefined`).                                                                                                                                      |
| Orden de interceptores | `[authInterceptor, loadingInterceptor, mockDelayInterceptor, errorInterceptor]` — el header se agrega antes de que el resto vea la request.                                                                                                                                                                                      |
| Logout                 | Botón en `Header` que emite `logout` (output); `AppShell` decide: `authService.logout()` + `router.navigate(['/login'])`. Mantiene la regla "componente emite, contenedor decide". El botón y el nombre del usuario solo se muestran con sesión activa.                                                                          |

### Estructura propuesta en `db.json`

Nueva colección `users` en el mismo `db.json` (misma instancia de JSON
Server, mismo puerto; no se mueve el archivo en este spec):

```json
"users": [
  {
    "id": "1",
    "username": "admin",
    "password": "admin123",
    "displayName": "Administrador",
    "email": "admin@enterprise-lab.dev"
  },
  {
    "id": "2",
    "username": "tecnico",
    "password": "tecnico123",
    "displayName": "Técnico de Mantenimiento",
    "email": "tecnico@enterprise-lab.dev"
  }
]
```

- Contraseñas en texto plano: aceptado por el spec (backend de desarrollo).
- Dos usuarios para poder testear "el próximo login de otro usuario no
  hereda datos del anterior".
- Sin campo `role`: roles están fuera de alcance; se agrega cuando haya spec.
- `AuthUser` (lo que se guarda en sesión) = `{ id, username, displayName,
email }` — **nunca** `password`. El mapeo lo hace `AuthService`.
- Limitación conocida (documentar en `notes.md`): la contraseña viaja en
  query string. Aceptable solo por ser mock; en 018 pasa a body de `POST`.

## Tareas

### 1. `db.json` — colección `users`

- **Archivo:** `src/app/features/work-orders/data-access/db.json`
- **Cambio:** agregar `users` según la estructura de arriba, sin tocar
  `work-orders` ni `$schema`.
- **Valida:** manual — `pnpm api` y `GET http://localhost:3000/users?username=admin&password=admin123`
  devuelve 1 elemento; con password errónea devuelve `[]`. (Los tests
  unitarios no dependen de JSON Server levantado.)

### 2. Config de API y modelo de auth

- **Archivos nuevos:**
  - `core/config/api.config.ts` → `export const API_BASE_URL = 'http://localhost:3000';`
  - `core/auth/auth.model.ts` → `LoginCredentials`, `AuthUser`,
    `AuthSession`, `UserRecord` (shape crudo de `/users`, con `password`)
    e `isAuthSession(value: unknown): value is AuthSession`.
- `WorkOrdersService` **no** se migra a `API_BASE_URL` en este spec (solo
  se usa en auth + interceptor); se deja anotado en `notes.md`.
- **Test:** `core/auth/auth.model.spec.ts` — `isAuthSession` acepta un
  objeto válido y rechaza `null`, string, objeto sin `token`, `token`
  vacío, `user` sin `id`.

### 3. `AuthService`

- **Archivo nuevo:** `core/auth/auth.service.ts` (`providedIn: 'root'`)
- **API pública:**
  - `session = signal<AuthSession | null>(restaurada de storage)` (privada
    escribible, expuesta `asReadonly()`).
  - `isAuthenticated = computed(() => session() !== null)`,
    `currentUser = computed(() => session()?.user ?? null)`,
    `token = computed(() => session()?.token ?? null)`.
  - `login(credentials): Observable<AuthSession>` — `GET ${API_BASE_URL}/users`
    con `params: { username, password }`; `map` → si array vacío,
    `throwError(new InvalidCredentialsError())`; si hay usuario, arma
    `AuthSession` (sin password), `set` en signal + `LocalStorageService.set('auth.session', ...)`.
  - `logout(): void` — `session.set(null)` + `remove('auth.session')`.
    No navega (la navegación la decide el llamador).
  - `loginUrlFor(url: string): UrlTree` — `/login?returnUrl=<url>`.
- **Test:** `core/auth/auth.service.spec.ts` (`HttpTestingController`,
  `localStorage.clear()` en `beforeEach`):
  - login ok → request a `/users` con params correctos; `isAuthenticated()`
    true; `currentUser()` sin `password`; storage contiene la sesión.
  - login con `[]` → error `InvalidCredentialsError`; `isAuthenticated()`
    sigue false; storage vacío. (**criterio 2**)
  - persistencia: guardar sesión válida en `localStorage`, recrear el
    servicio (`TestBed.resetTestingModule` + nuevo inject) → autenticado
    con el mismo usuario y token. (**criterio 3**)
  - storage corrupto / shape inválido → no autenticado y la clave se borra.
  - logout → `session()`, `currentUser()`, `token()` en null y storage sin
    la clave; luego login con el usuario 2 → `currentUser().id === '2'` y
    ningún campo del usuario 1. (**criterio 5**, parte de estado)
  - `loginUrlFor('/work-orders/5')` serializa a `/login?returnUrl=%2Fwork-orders%2F5`.

### 4. `authInterceptor`

- **Archivo nuevo:** `core/interceptors/auth.interceptor.ts` — mismo
  formato que `loading.interceptor.ts`:
  ```ts
  export const authInterceptor: HttpInterceptorFn = (request, next) => {
    const token = inject(AuthService).token();
    if (!token || !request.url.startsWith(API_BASE_URL)) {
      return next(request);
    }
    return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  };
  ```
- **Registro:** `app.config.ts` → import + primer elemento del array de
  `withInterceptors`.
- **Test:** `core/interceptors/auth.interceptor.spec.ts` (mismo setup que
  `loading.interceptor.spec.ts`, con `AuthService` real + storage limpio):
  - sin sesión → `req.request.headers.has('Authorization')` es false.
    (**criterio 7**)
  - tras `authService.login(...)` flusheado → `GET ${API_BASE_URL}/work-orders`
    lleva `Authorization: Bearer <token de la sesión>`. (**criterio 6**)
  - tras logout → la siguiente request ya no lleva el header.
  - con sesión, request a URL externa (`https://example.com/x`) → sin header.
- **Test de registro:** `app.config.spec.ts` (nuevo) — `TestBed` con
  `appConfig.providers` + `provideHttpClientTesting()`, sesión activa,
  `WorkOrdersService.getAll()` → la request lleva el header. Confirma que
  el interceptor quedó registrado en la app real, no solo que funciona
  aislado.

### 5. Pantalla de login

- **Archivos nuevos:**
  - `features/auth/auth.routes.ts` → `AUTH_ROUTES` con `path: ''`,
    `title: 'Iniciar sesión | Angular Enterprise Lab'`, `loadComponent` a
    la página.
  - `features/auth/pages/login-page/login-page.{ts,html,scss}`
- **Formulario** (patrón de `form.ts`): `username` (required),
  `password` (required, `minLength(6)`), `isInvalid()`, `onSubmit()` con
  `markAllAsTouched()` si es inválido y guard de `submitting`.
- **Flujo:** `submitting` signal; `authService.login(...)` →
  éxito: `router.navigateByUrl(safeReturnUrl())`; error
  `InvalidCredentialsError`: `errorMessage` signal → `<app-alert>` inline
  ("Usuario o contraseña incorrectos"); otro error (conexión): el
  `errorInterceptor` ya muestra toast, la página solo resetea `submitting`.
- `safeReturnUrl = computed(...)` desde `ActivatedRoute` query param
  `returnUrl` (convertido con `toSignal`) aplicando las reglas de saneo.
- Si ya hay sesión al entrar a `/login`, redirige directo a `safeReturnUrl()`.
- Accesibilidad (continuidad con 008b): `<label for>` en cada campo,
  `aria-invalid`, `aria-describedby` a los mensajes de error, `role="alert"`
  en el error de credenciales.
- **Test:** `features/auth/pages/login-page/login-page.spec.ts` (`AuthService`
  real + `HttpTestingController`, `Router` real con `vi.spyOn(router, 'navigateByUrl')`):
  - credenciales ok → `isAuthenticated()` true y `navigateByUrl('/dashboard')`.
    (**criterio 1**)
  - credenciales inválidas → alerta visible en el DOM, `isAuthenticated()`
    false, `navigateByUrl` no llamado. (**criterio 2**)
  - con `returnUrl=/work-orders/5` → tras login navega a `/work-orders/5`,
    no a `/dashboard`. (**criterio 4**, nivel página)
  - `returnUrl` externo (`//evil.com`, `https://evil.com`) o `/login` →
    navega a `/dashboard`.
  - formulario vacío → no hay request HTTP (`httpMock.expectNone`) y los
    errores de validación se muestran.
  - doble submit mientras `submitting` → una sola request.

### 6. Ruta `/login`

- **Archivo:** `app.routes.ts` → `{ path: 'login', loadChildren: () =>
import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) }` antes
  de `**`.
- **Test:** `app.routes.spec.ts` (mismo `RouterTestingHarness`):
  - `/login` renderiza el formulario (heading "Iniciar sesión") y el
    `document.title` contiene "Iniciar sesión".
  - **criterio 4 end-to-end:** `harness.navigateByUrl(authService.loginUrlFor('/work-orders/5'))`
    (simula lo que hará el guard de 011), completar el form, flush de
    `/users` → `router.url === '/work-orders/5'`.

### 7. Logout en el layout

- **Archivos:** `layout/header/header.{ts,html}`, `layout/app-shell/app-shell.{ts,html}`
- `Header`: inputs `userName = input<string | null>(null)`; output
  `logout = output<void>()`; botón "Cerrar sesión" visible solo si
  `userName()` no es null.
- `AppShell`: inyecta `AuthService` y `Router`; pasa
  `authService.currentUser()?.displayName ?? null`; handler `onLogout()` →
  `logout()` + `router.navigate(['/login'])`.
- **Test:**
  - `header.spec.ts`: sin `userName` no hay botón; con `userName` se
    muestra el nombre y el click emite `logout`.
  - `app-shell.spec.ts`: con sesión en `AuthService`, click en "Cerrar
    sesión" → `isAuthenticated()` false, storage sin `auth.session`,
    `navigate` llamado con `['/login']`. (**criterio 5**, flujo UI)

### 8. `notes.md` (spec 010)

- Decisiones de la tabla (en especial storage y contrato `AuthSession`
  pensando en 018).
- Limitaciones conocidas: password en query string; `WorkOrdersService`
  sigue con URL hardcodeada; `db.json` vive en `features/work-orders/`
  aunque ahora tenga `users`; `mock-api.interceptor.ts` sin registrar.
- Qué cambia en 011 (guard usa `loginUrlFor`) y en 018 (solo
  `AuthService.login` + generación de token).

## Mapa criterios de aceptación → tests

| Criterio del spec                            | Test                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| 1. Login ok actualiza estado y sale de login | `login-page.spec.ts`                                            |
| 2. Login inválido: error, sin estado         | `login-page.spec.ts` + `auth.service.spec.ts`                   |
| 3. Recarga mantiene sesión                   | `auth.service.spec.ts` (restauración)                           |
| 4. Retorno a `/work-orders/5`                | `login-page.spec.ts` + `app.routes.spec.ts` (end-to-end router) |
| 5. Logout limpia todo / sin herencia         | `auth.service.spec.ts` + `app-shell.spec.ts`                    |
| 6. Header con sesión                         | `auth.interceptor.spec.ts` + test de registro en `appConfig`    |
| 7. Sin header sin sesión                     | `auth.interceptor.spec.ts`                                      |

## Fuera de alcance (confirmado del spec)

- Guards / protección de rutas (011): `/work-orders` sigue accesible sin login.
- Roles, registro, recuperación de contraseña.
- JWT real, expiración, refresh (018).
- Manejo de 401 → logout automático (depende de backend real).

## Verificación

1. `pnpm test` completo en verde (sin regresiones en los tests existentes),
   incluyendo los nuevos specs de las tareas 2-7.
2. `pnpm run test:coverage` — `core/auth/*`, `auth.interceptor.ts` y
   `login-page.ts` sin funciones sin cubrir; métricas globales no bajan.
3. Manual con `pnpm api` + `pnpm start`:
   - `/login?returnUrl=/work-orders/5` → login `admin/admin123` → queda en
     `/work-orders/5`.
   - DevTools → Network: requests a `localhost:3000/work-orders` llevan
     `Authorization: Bearer mock-token...`.
   - F5 → sigue logueado (nombre en header). Logout → `/login`, clave
     `auth.session` borrada; las requests siguientes sin header.
4. Commit solo si el usuario lo pide explícitamente.
