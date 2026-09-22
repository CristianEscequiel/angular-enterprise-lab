# Plan 004: Protección de formularios inválidos y envíos duplicados

Spec: `.claude/specs/004-proteccion-formularios/spec.md`

## Contexto

Igual que en 003, este spec **requiere código de producción nuevo**, no
solo tests: `Form.onSubmit()` hoy emite `sendData` **siempre**, sin
chequear `workOrderForm.invalid`. El único freno existente es
`[disabled]="workOrderForm.invalid"` en el botón del template — que no
protege contra un `ngSubmit` disparado por otra vía (Enter dentro de un
`<input>`/`<textarea>`, o una llamada directa a `onSubmit()`). El
criterio de aceptación 1 ("el evento submit no debe emitir valores")
literalmente no se cumple hoy.

Leídos `form.ts/.html/.spec.ts`, `button.ts/.html`, `work-order-create.ts/.html/.spec.ts`,
`work-order-edit.ts/.html/.spec.ts` (post spec 003), `loading.service.ts`
y `loading.interceptor.ts`, el diagnóstico es:

| Requisito del spec                                 | Estado en el código                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Submit bloqueado si el form es inválido            | **No implementado de verdad** — solo el botón se deshabilita visualmente; `onSubmit()` no valida nada              |
| Sin doble-envío mientras hay una petición en curso | No existe ningún estado de "enviando" en ninguna página (`work-order-create.ts`/`work-order-edit.ts`) ni en `Form` |
| Estado de "enviando" visible                       | No existe                                                                                                          |
| Recuperación tras error (vuelve a habilitarse)     | No aplica — como no hay bloqueo, tampoco hay nada que liberar                                                      |

**Decisión de diseño (pedida explícitamente por el spec — "Nota para plan mode"):**
`LoadingService` global **no alcanza** y no conviene reutilizarlo tal
cual para esto:

1. Es un contador compartido por _toda_ la app (`activeRequests` en
   `loading.service.ts`), alimentado por `loadingInterceptor` en cada
   request HTTP — búsquedas, deletes, y también el propio `getById` que
   `WorkOrderLoader` dispara en `WorkOrderEdit.ngOnInit()` (spec 003).
   Si alguien entra a editar una orden y esa carga inicial todavía no
   resolvió, `isLoading()` ya es `true` sin que haya ningún submit en
   curso — un falso positivo real y concreto, no teórico, en la propia
   página que este spec toca.
2. Está diseñado como overlay de pantalla completa (`app.html`:
   `@if(loadingService.isLoading()) { <app-spinner size="lg" class="spinner-overlay" .../> }`),
   no como indicador local de un botón.
3. No hay precedente en el código de reutilizarlo así (grep de
   `submitting`/`isSubmitting` en todo `src/app`: cero resultados).

En su lugar: **`Form` gana un `submitting = input<boolean>(false)`**,
controlado por cada página con un signal local (`isSubmitting`) — tal
como sugiere la nota del propio spec. `LoadingService` sigue funcionando
en paralelo sin tocarse.

**Segunda decisión, no pedida explícitamente pero necesaria para que el
criterio 2 sea una garantía dura y no solo una mejora visual:** el
guardia real contra doble-envío no puede vivir _solo_ dentro de `Form`.
Un `input()` de señal en un hijo (`submitting`) solo se actualiza en el
próximo ciclo de detección de cambios de Angular — no es instantáneo
apenas la página setea su propio signal. Si dos submits ocurren sin que
medie un ciclo de CD (doble-click muy rápido, o un test que llama al
handler dos veces sin `detectChanges()` intermedio, que es justamente
como se va a testear el criterio 2), el input `submitting` en `Form`
puede seguir en `false` para ambos intentos. Por eso el guardia _duro_
(`if (this.isSubmitting()) return;`) vive en la página, que es quien
conoce el estado real de la petición HTTP; el `input()` en `Form` es la
capa de UX (deshabilita el botón, cambia el texto) — defensa en
profundidad, no redundancia. Esto además es coherente con el patrón que
ya usa el repo en `WorkOrderLoader` (spec 003): la página es dueña del
estado, los componentes lo reciben.

## Tareas

### 1. `Form`: guardia real de invalidez + input `submitting` + reflejo visual

- **Archivos:** `src/app/features/work-orders/components/form/form.ts`, `form.html`
- **Cambio en `.ts`:** agregar `submitting = input<boolean>(false);`.
  `onSubmit()` pasa de emitir siempre a:
  ```ts
  onSubmit(): void {
    if (this.submitting() || this.workOrderForm.invalid) {
      this.workOrderForm.markAllAsTouched();
      return;
    }
    this.sendData.emit(this.workOrderForm.getRawValue());
  }
  ```
  `markAllAsTouched()` no agrega reglas de validación nuevas (usa las
  que ya existen) — solo revela los mensajes de error que hoy quedan
  ocultos si el usuario nunca tocó un campo y aprieta Enter.
- **Cambio en `.html`:** `<app-button ... [disabled]="workOrderForm.invalid || submitting()">{{ submitting() ? 'Guardando...' : 'Submit Work Order' }}</app-button>`.
- **Tests (`form.spec.ts`, hoy solo tiene `should create`):**
  - `blocks emission and disables the submit button when required fields are empty` — llamar `component.onSubmit()` directo (simula Enter) sobre formulario vacío, `vi.spyOn(component.sendData, 'emit')`, assert no llamado; assert `<button>` deshabilitado en el DOM. **Este test falla contra el código actual** (confirma el bug real).
  - `reveals validation error messages after an attempted submit on an untouched form` — tras ese mismo `onSubmit()`, assert que aparecen los mensajes de error existentes en el DOM.
  - `emits the raw form value when the form is valid and not submitting` — setear valores válidos, `onSubmit()`, assert `emit` llamado una vez con el valor esperado.
  - `disables the submit button and blocks emission while submitting() is true, even with a valid form` — datos válidos + `fixture.componentRef.setInput('submitting', true)` + `detectChanges()`; assert botón deshabilitado y `onSubmit()` no emite.
  - `re-enables the button once submitting() goes back to false` — mismo setup, `setInput('submitting', false)`, assert botón habilitado de nuevo.

### 2. `WorkOrderCreate`: signal `isSubmitting`, guardia duro, `finalize`, wiring

- **Archivos:** `work-order-create.ts`, `work-order-create.html`
- **Cambio:**
  ```ts
  readonly isSubmitting = signal(false);

  onSubmit(workOrder: WorkOrderCreateRequest): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.workOrderService.create(workOrder).pipe(
      finalize(() => this.isSubmitting.set(false)),
    ).subscribe({
      next: () => { this.messageService.showSuccess('Work order created successfully.'); this.navigateToWorkOrdersList(); },
      error: () => { this.messageService.showError('Error al crear la orden de trabajo.'); },
    });
  }
  ```
  (`finalize`, ya usado en `loading.interceptor.ts`, evita duplicar
  `.set(false)` en `next`/`error`). Template:
  `<app-form (sendData)="onSubmit($event)" [submitting]="isSubmitting()" />`.
- **Tests (`work-order-create.spec.ts`, hoy solo `should create` sin mocks):**
  agregar providers mockeados (`WorkOrdersService`, `Router`; `MessageService`
  real, espiado), mismo patrón que `work-order-edit.spec.ts`.
  - `creates the work order and navigates to the list on success` — `create` con `of(...)`, assert llamado una vez y `router.navigate(['/work-orders'])`.
  - `sends a single create request when a second submit arrives while the first is still pending` (criterio 2) — `create` mockeado devolviendo un `Subject` pendiente (sin completar). Llamar `component.onSubmit(payload)` **dos veces seguidas, sin `detectChanges()` entre medio** (peor caso de carrera real). Assert `create` llamado exactamente 1 vez.
  - `re-enables submitting after a failed create so a retry is possible` (criterio 3) — `create` con `throwError`, `onSubmit(payload)`, assert `isSubmitting()` en `false`; volver a llamar `onSubmit(payload)` con mock exitoso y assert `create` llamado una 2ª vez (prueba que no quedó bloqueado permanentemente).
  - `reflects the pending state on the nested form's submit button` — con el `Subject` pendiente, tras `onSubmit` + `detectChanges()`, assert que el `<button>` renderizado por `app-form` está deshabilitado.

### 3. `WorkOrderEdit`: mismo patrón, sin tocar `hasChanges`/`!current`

- **Archivos:** `work-order-edit.ts`, `work-order-edit.html`
- **Cambio:** `readonly isSubmitting = signal(false);`. En `onSubmitEdit`,
  el guardia `if (this.isSubmitting()) return;` va como primera línea
  (antes del `!current`/`hasChanges` existente, que queda intacto). Solo
  al llegar al `.update(...)` real: `this.isSubmitting.set(true)` +
  `.pipe(finalize(() => this.isSubmitting.set(false)))` antes de
  `.subscribe(...)`. Template: agregar `[submitting]="isSubmitting()"`
  a `<app-form>` (rama `@else if (workOrder(); as workOrder)`).
- **Tests (`work-order-edit.spec.ts`):** extender el mock existente con
  `update: vi.fn().mockReturnValue(of(mockWorkOrder))` (reset en `beforeEach`).
  - `sends a single update request when a second submit arrives while the first is still pending` — mismo `Subject` pendiente, dos llamadas a `onSubmitEdit({...con cambios})` sin `detectChanges()` intermedio, assert `update` llamado 1 vez.
  - `re-enables submitting after a failed update so a retry is possible` — `update` con `throwError`, assert `isSubmitting()` en `false`; segunda llamada exitosa, assert `update` llamado 2 veces.
  - No se agrega test para el camino `!hasChanges` (fuera de alcance, no lo toca este cambio); se verifica en la tarea 4 que el guardia no interfiere ahí (el `return` de "sin cambios" ocurre antes de tocar `isSubmitting`).

### 4. Verificación por mutación

Con las tareas 1-3 ya implementadas (código final; se revierte solo el
punto mutado, no todo el archivo):

- `Form`: comentar `|| this.workOrderForm.invalid` en el guardia → debe
  fallar `blocks emission and disables the submit button when required fields are empty`.
- `Form`: comentar `this.submitting() ||` en el mismo guardia → debe
  fallar `disables the submit button and blocks emission while submitting() is true…`.
- `WorkOrderCreate`/`WorkOrderEdit`: comentar `if (this.isSubmitting()) return;`
  → debe fallar `sends a single ... request when a second submit arrives while the first is still pending` (pasa de 1 a 2 llamadas).
- `WorkOrderCreate`/`WorkOrderEdit`: quitar el `finalize(...)` (subscribe
  directo) → debe fallar `re-enables submitting after a failed ... so a retry is possible`.
- Resultado anotado en `notes.md`, mismo formato que 001-003.

### 5 (opcional, requiere confirmación). Actualizar README

- Tabla de specs y checkbox `- [ ] Proteger formularios inválidos y
operaciones en curso.` del roadmap — tildar solo si las tareas 1-4
  quedan en verde.

## Fuera de alcance (según el spec)

Reglas de validación de campos nuevas; estados de error de carga inicial
(spec 003, `WorkOrderLoader` queda intacto); confirmación previa al envío
(patrón `Modal`). Tampoco se toca: el input `mode="edit"` sin efecto real
en `Form` (inconsistencia preexistente, no relacionada); el nombre
`activateRoute` para el `Router` inyectado en `WorkOrderCreate`; nada de
`LoadingService`/`loadingInterceptor` (siguen funcionando en paralelo).

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar.
2. Tras cada tarea 1-3: `pnpm test` en verde.
3. Tarea 4: confirmar los 4 fallos esperados bajo mutación, revertir cada
   uno, confirmar verde.
4. `pnpm lint` y `pnpm build` sin errores (como en 003).
5. E2E manual: `pnpm api` + `pnpm start`; en creación, dejar un campo
   requerido vacío y confirmar botón deshabilitado + que Enter no dispara
   nada; llenar válido, doble-click rápido en "Submit" y confirmar que se
   crea una sola orden; apagar `json-server`, intentar enviar, confirmar
   que tras el error el botón vuelve a habilitarse y el reintento funciona
   al prender `json-server` de nuevo.
6. Commit solo si se pide; el hook de Husky corre `pnpm test`.
