# Plan 009: Subir cobertura de Functions por feature

Spec: `.claude/specs/009-cobertura-por-feature/spec.md`

## Contexto

El número del README (72.95% Functions) es de antes de 008a/008b. Medición
real hoy (`pnpm run test:coverage`, 23 archivos / 119 tests en verde):

```
Statements   : 91.71% ( 764/833 )
Branches     : 90.98% ( 313/344 )
Functions    : 79.5%  ( 128/161 )
Lines        : 93.49% ( 546/584 )
```

El desbalance sigue existiendo (Functions ~11-14 puntos por debajo del
resto), aunque menor de lo que sugería el README. Reportes HTML por
archivo (`coverage/angular-enterprise-lab/**/*.ts.html`) revisados función
por función (fracción exacta, no solo el %) para separar lógica real de
ruido:

| Archivo                                                             | Funcs | Gap real                                                                                             |
| ------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `core/services/message.service.ts`                                  | 2/4   | `showWarning`, `clear` — **sin spec file** hoy                                                       |
| `app.ts`                                                            | 1/2   | `closeToast()` — nunca se dispara un cierre de toast en los tests                                    |
| `features/work-orders/pages/work-order-detail/work-order-detail.ts` | 3/4   | `navigateToWorkOrdersList()` — el botón "Volver" nunca se clickea                                    |
| `features/work-orders/pages/work-orders-list/work-orders-list.ts`   | 20/24 | `viewWorkOrder`, `editWorkOrder`, `navigateToCreateWorkOrder`, callback `error` de `deleteWorkOrder` |
| `features/work-orders/work-orders.routes.ts`                        | 8/10  | `loadComponent` + `.then(...)` de la ruta `new` — nunca se navega a `/work-orders/new` en tests      |

Los **8/8** de `work-order-edit.ts` ya están al 100% en Functions (los
huecos ahí son de Branches/Statements, explícitamente fuera de alcance del
spec). Las filas `*.html` con 0% Functions en el reporte son funciones de
plantilla compiladas por Angular (control flow `@if`/`@for`), declarativas
por naturaleza — excluidas por el criterio de priorización del spec
("no getters triviales... funciones puramente declarativas").

**Hallazgo (no es un bug, no se toca código de producción):**
`layout/app-shell/app-shell.ts` tiene `showToast()`, `closeToast()` y las
signals `toastOpen`/`toastType`/`toastTitle`/`toastMessage` sin ninguna
referencia en `app-shell.html` ni en otro archivo — código muerto,
probablemente reemplazado por el `MessageService` + `<app-toast>` a nivel
de `App` root (visto en `app.html`). No se prioriza (sería cobertura de
código inalcanzable) ni se elimina (no es un bug real, es limpieza de
código — decisión de scope, no de este spec). Se documenta en `notes.md`.

**Proyección:** cerrar los 5 gaps reales de la tabla suma 10 funciones
(2+1+1+4+2) → 138/161 = **85.7%**, dentro del objetivo orientativo
85-90% sin tocar Branches/Statements/Lines ni código de producción.

## Tareas

### 1. `core/services/message.service.spec.ts` (archivo nuevo)

- **Por qué:** servicio core inyectado en 4 lugares (`app.ts`,
  `work-orders-list.ts`, `work-order-edit.ts`, `work-order-create.ts`,
  `error.interceptor.ts`) pero sin spec propio — depende 100% de
  cobertura incidental.
- **Tests (uno por método, con aserción sobre el signal `message`):**
  - `showError` → `message()` tiene `variant: 'error'` y el título default
    `'Error'`.
  - `showSuccess` → `variant: 'success'`, título default
    `'Operación exitosa'`.
  - `showWarning` → `variant: 'warning'`, título default `'Precaucion'`
    (**gap real**).
  - `clear` (llamado después de un `showError`) → `message()` vuelve a
    `null` (**gap real**).

### 2. `app.spec.ts` — cierre de toast

- **Por qué:** `closeToast()` (app.ts:19-21) nunca se invoca; es el
  handler real del botón de cierre del toast global.
- **Test:** con `MessageService` real (no mockeado), llamar
  `TestBed.inject(MessageService).showError('boom')`, `detectChanges()`,
  ubicar `button.btn--close` (aria-label "Cerrar notificación",
  `toast.html:23`) y clickearlo. Asertar que `messageService.message()`
  es `null` después del click (efecto observable real, no solo "no
  explota").

### 3. `work-order-detail.spec.ts` — navegación de vuelta

- **Por qué:** `navigateToWorkOrdersList()` (work-order-detail.ts:36-38)
  nunca se ejecuta.
- **Cambio de fixture:** agregar `routerMock = { navigate: vi.fn() }` y
  proveerlo (mismo patrón ya usado en `work-order-edit.spec.ts:32-34,52-55`).
- **Test:** clickear el botón "Volver a Lista" (`work-order-detail.html:4`,
  `(clicked)="navigateToWorkOrdersList()"`) y asertar
  `routerMock.navigate` llamado con `['/work-orders']`.

### 4. `work-orders-list.spec.ts` — navegación y error de borrado

- **Por qué:** 4 funciones sin ejecutar: `viewWorkOrder`, `editWorkOrder`,
  `navigateToCreateWorkOrder` (líneas 150-159) y el callback `error` de
  `deleteWorkOrder` (línea 177) — hoy solo se testea el camino feliz del
  borrado.
- **Tests (usando el `Router` real ya provisto vía `provideRouter([])`,
  con `vi.spyOn(router, 'navigate')` en vez de reemplazar el provider):**
  - `viewWorkOrder('1')` → `navigate` llamado con `['/work-orders', '1']`.
  - `editWorkOrder('1')` → `navigate` llamado con
    `['/work-orders', '1', 'edit']`.
  - `navigateToCreateWorkOrder()` → `navigate` llamado con
    `['/work-orders/new']`.
  - `deleteWorkOrder('1')` con `service.delete` devolviendo
    `throwError(() => new Error('boom'))` → inyectar `MessageService`
    real y asertar `messageService.message()` queda con
    `variant: 'error'` (confirma que se llamó `showError`, no solo que
    "no explotó").

### 5. `app.routes.spec.ts` — ruta `/work-orders/new`

- **Por qué:** de las 4 rutas lazy de `work-orders.routes.ts`, 3 ya se
  navegan en este archivo (`/work-orders`, `/work-orders/1`,
  `/work-orders/1/edit`); falta `/work-orders/new`, que es exactamente
  la que deja 2 funciones sin cubrir (`loadComponent` + su `.then`).
- **No es un test de integración nuevo:** se agrega un caso más al mismo
  `RouterTestingHarness` que el archivo ya usa (spec 006), no una capa de
  testing distinta.
- **Test:** `harness.navigateByUrl('/work-orders/new')` → asertar que
  `harness.routeNativeElement?.textContent` contiene `'Crear Orden de
Trabajo'` (heading real del componente) y no contiene `'Página no
encontrada'`.

### 6. `notes.md` (spec 009)

- Baseline real medido hoy (79.5% Functions, tabla completa de las 4
  métricas) vs. el 72.95% desactualizado del README.
- Registrar el hallazgo de código muerto en `app-shell.ts` (sección
  arriba) como observación para un futuro spec de limpieza — no se
  toca en este.
- Métrica final tras las tareas 1-5.

## Fuera de alcance (confirmado del spec)

- Subir Branches/Statements/Lines (ya están >90%).
- `work-order-edit.ts` (ya 100% Functions; sus gaps son de Branches).
- Los `loadComponent` ya cubiertos y las funciones de plantilla `.html`.
- Eliminar el código muerto de `app-shell.ts` (no es un bug; se
  documenta, no se corrige).
- `coverageThresholds` bloqueante en `angular.json`.

## Verificación

1. `pnpm run test:coverage` tras las tareas 1-5 → Functions debe leer
   **~85-86%** (138/161 o cercano), con Statements/Branches/Lines sin
   bajar respecto a 91.71/90.98/93.49.
2. Revisar que cada test nuevo tenga una aserción sobre un resultado u
   efecto observable (signal, mock de router/servicio) — ninguno debe
   ser un "smoke test" sin `expect` significativo (criterio de fallo
   explícito del spec).
3. `pnpm test` completo en verde (sin regresiones en los 119 tests
   existentes) antes de dar la tarea por cerrada.
4. Commit solo si el usuario lo pide explícitamente.
