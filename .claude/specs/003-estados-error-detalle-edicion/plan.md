# Plan 003: Estados de error en detalle y edición

Spec: `.claude/specs/003-estados-error-detalle-edicion/spec.md`

## Contexto

A diferencia de 001 y 002, acá **sí hace falta tocar código de
producción**: el spec pide una distinción (404 vs conexión) que hoy no
existe en ningún lado del código.

Leídos `work-order.service.ts`, `work-order-detail.ts/.html`,
`work-order-edit.ts/.html`, sus specs, `error.interceptor.ts` y
`alert.ts/.html`, el estado real es:

| Requisito del spec | Estado en el código |
|---|---|
| `WorkOrdersService` distingue 404 vs conexión al pedir por id | **No existe.** `getById` (`work-order.service.ts:28-37`) tiene un único `catchError` que ignora el status y siempre lanza `new Error('No existe la orden de trabajo!')`, sea 404, 500 o error de red |
| Detalle muestra un estado de error persistente | **No existe — es peor que "solo el toast":** `work-order-detail.ts:22-27` hace `error: () => this.router.navigate(['/work-orders'])`. Ante *cualquier* fallo, la página redirige silenciosamente a la lista. Nunca se llega a ver un estado de error ni un formulario con datos undefined, porque no hay chance de quedarse en la pantalla |
| Edición se comporta igual que detalle ante error de carga | Confirmado: `work-order-edit.ts:23-29` tiene el mismo patrón `error: () => this.router.navigate(['/work-orders'])`, casi carácter por carácter idéntico a detalle |
| Botón "Reintentar" | No existe en ninguna de las dos páginas. (Sí existe el patrón `app-alert` + botón "Reintentar" en `work-orders-list.html:11-16`, que sirve de referencia de UI a reutilizar) |

Hallazgo adicional: `work-order-detail.ts:30-39` tiene un método
`getWorkOrderDetail(id)` muerto (no lo llama nada, ni la clase ni el
template) con su propio manejo de error distinto (`console.error` sin
navegar). Se elimina como parte de este spec — es el mismo área de
código y queda reemplazado por el mecanismo de reintento real.

**Decisión de diseño (pedida explícitamente por el spec):** detalle y
edición cargan la orden con el mismo código, carácter por carácter
(mismo `ngOnInit`, mismo `getById(id)`, mismo manejo de error). Extraigo
esa lógica a una clase inyectable con alcance de componente,
`WorkOrderLoader`, en `features/work-orders/data-access/work-order-loader.ts`
(sin `providedIn: 'root'`, provista vía `providers: [WorkOrderLoader]` en
cada `@Component` — una instancia nueva por página). Esto no viola la
regla de CLAUDE.md de "lógica de negocio en las páginas, no en
componentes compartidos": esa regla apunta a los átomos de UI de
`shared/` (Button, Alert, Modal...), que deben seguir siendo tontos. Acá
es lógica de *feature* (data-access), no un componente de UI, y evita
duplicar carga+estado+reintento en dos páginas que ya tienen la lógica de
negocio distinta donde sí importa (el `<app-form>` vs la tarjeta de solo
lectura, `onSubmitEdit`, etc. — eso se queda en cada página).

`WorkOrderLoader` expone:
- `workOrder = signal<WorkOrder | null>(null)`
- `error = signal<'not-found' | 'connection' | null>(null)`
- `load(id: string)`: guarda el id, llama a `getById`, setea uno de los
  dos signals.
- `retry()`: repite `load()` con el último id.

## Tareas

### 1. `WorkOrdersService.getById` distingue 404 vs conexión
- **Archivo:** `src/app/features/work-orders/data-access/work-order.service.ts`
- **Cambio:** agregar `export type WorkOrderLoadErrorKind = 'not-found' | 'connection'` y
  `export class WorkOrderLoadError extends Error { constructor(readonly kind: WorkOrderLoadErrorKind, message: string) { super(message); this.name = 'WorkOrderLoadError'; } }`.
  En `getById`, cambiar el `catchError` para leer `(error as { status?: number })?.status`
  (sin importar `HttpErrorResponse`/`AppHttpError` del interceptor — el
  status existe en ambas formas del error, venga o no envuelto por
  `errorInterceptor`, así que el chequeo es robusto en los dos casos) y
  lanzar `WorkOrderLoadError('not-found', ...)` si `status === 404`, o
  `WorkOrderLoadError('connection', ...)` para cualquier otro caso (0,
  5xx, sin status).
- **Tests que lo validan** (`work-order.service.spec.ts`):
  - `getById sends GET to /work-orders/:id` (no existía cobertura de este método).
  - `getById maps a 404 response to a not-found load error` — `flush(..., { status: 404 })`, `expect(error).toBeInstanceOf(WorkOrderLoadError)`, `expect(error?.kind).toBe('not-found')`.
  - `getById maps a network or server failure to a connection load error` — casos `{status: 0}` y `{status: 500}` con `it.each`, `expect(error?.kind).toBe('connection')`.

### 2. Extraer `WorkOrderLoader`
- **Archivo nuevo:** `src/app/features/work-orders/data-access/work-order-loader.ts`
- **Cambio:** clase `@Injectable()` (sin `providedIn`) con `workOrder`,
  `error`, `load(id)`, `retry()` como se describe en Contexto. Al
  atrapar el error del `subscribe`, hace
  `error instanceof WorkOrderLoadError ? err.kind : 'connection'` (fallback
  defensivo si algún día llega un error que no pasó por `getById`).
- **Test que lo valida:** `work-order-loader.spec.ts` (archivo nuevo, mockeando `WorkOrdersService`):
  - `load sets the work order and clears any previous error on success`
  - `load sets a not-found error and clears the work order on a WorkOrderLoadError('not-found')`
  - `load falls back to a connection error for an unrecognized failure`
  - `retry re-issues the request for the last id passed to load`

### 3. `WorkOrderDetail`: estado de error persistente + reintento
- **Archivos:** `work-order-detail.ts`, `work-order-detail.html`
- **Cambio en `.ts`:** inyectar `WorkOrderLoader` vía `providers: [WorkOrderLoader]`
  en el `@Component`. `ngOnInit` guarda el `id` y llama a
  `loader.load(id)`; si no hay `id` en la ruta, `loader.error.set('not-found')`
  (caso defensivo, hoy dejaba la pantalla en blanco para siempre). Exponer
  `workOrderDetail = loader.workOrder`, `loadError = loader.error`, y
  `retry() { this.loader.retry(); }`. Eliminar el método muerto
  `getWorkOrderDetail`.
- **Cambio en `.html`:** reemplazar el `<div class="card">` incondicional
  por `@if (loadError() === 'not-found') { <app-alert variant="error" title="Orden no encontrada" message="La orden de trabajo solicitada no existe o fue eliminada." /> <app-button (clicked)="retry()">Reintentar</app-button> } @else if (loadError() === 'connection') { <app-alert variant="error" title="Error de conexión" message="No pudimos conectar con el servidor. Intentá nuevamente." /> <app-button (clicked)="retry()">Reintentar</app-button> } @else if (workOrderDetail(); as workOrderDetail) { <div class="card">…(igual que hoy, usando la variable local en vez de la señal repetida)… </div> }` — mismo patrón que `work-orders-list.html:11-19`.
- **Tests que lo validan** (`work-order-detail.spec.ts`, hoy solo tiene `should create`):
  - `renders the not-found error state and no card when the id does not exist` — mock `getById` con `throwError(() => new WorkOrderLoadError('not-found', '...'))`; **debe fallar** si el componente renderiza la tarjeta con datos undefined.
  - `renders a distinct connection error state on a network/server failure` — mismo mock con `'connection'`; assert que el texto es distinto al del caso anterior (compara ambos `textContent`).
  - `retrying after an error re-fetches and renders the work order` — primer `getById` falla, click en "Reintentar" (`mockReturnValueOnce` exitoso), assert que la tarjeta se renderiza y el estado de error desaparece; **debe fallar** si el reintento no dispara una nueva petición o el error no se limpia.
  - `renders the work order normally on success` (fortalece el actual `should create`, que no afirma nada del DOM) — assert contenido real en pantalla.

### 4. `WorkOrderEdit`: mismo comportamiento que detalle
- **Archivos:** `work-order-edit.ts`, `work-order-edit.html`
- **Cambio:** mismo patrón que la tarea 3 (`providers: [WorkOrderLoader]`,
  `workOrder`/`loadError` desde el loader, `retry()`). `onSubmitEdit` y su
  manejo de errores de guardado **no se tocan** (fuera de alcance, spec 004).
  En el `.html`, el `@else if` final envuelve el `<app-form>` existente en
  vez de la tarjeta.
- **Tests que lo validan** (`work-order-edit.spec.ts`):
  - `renders the not-found error state instead of an empty form when the id does not exist`
  - `renders a distinct connection error state on a network/server failure`
  - `retrying after an error re-fetches and renders the form with the loaded data`
  - Descomentar/reescribir el test comentado `should load work order using route id` (línea 56-58) ya que ahora hay comportamiento real que verificar.

### 5. Verificación por mutación
- Con las tareas 1-4 ya implementadas (código final, no se revierte):
  romper temporalmente el chequeo `status === 404` en `getById` (ej.
  invertirlo) y confirmar que fallan los tests de la tarea 1 y las tareas
  3/4 que dependen de distinguir el mensaje; revertir con `git diff` (no
  `git checkout`, porque acá sí queremos conservar el código nuevo — se
  revierte solo la mutación puntual, comparando contra el estado post-tarea-4).
  Resultado anotado en `notes.md`, mismo formato que 001/002.

### 6 (opcional, requiere confirmación). Actualizar README
- Tabla de specs (línea ~255) y roadmap (`- [ ] Mejorar los estados de
  error de detalle y edición.`, línea 293) — tildar solo si las tareas
  1-5 quedan en verde.

## Fuera de alcance (según el spec)
Protección de envíos de formulario (004), cambios en `errorInterceptor`
o el toast global, foco/accesibilidad del modal (005), página 404 de
routing (006). Tampoco se toca `onSubmitEdit` ni el manejo de errores de
guardado en edición.

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar.
2. Tras cada tarea 1-4: `pnpm test` en verde.
3. Tarea 5: confirmar los fallos esperados bajo mutación, revertir, confirmar verde.
4. E2E manual: `pnpm api` + `pnpm start`; entrar a `/work-orders/xxx-inexistente` → ver estado "no encontrada"; apagar json-server y entrar a un detalle válido → ver estado de conexión distinto; prender json-server de nuevo y click "Reintentar" → se ve la orden.
5. Commit solo si se pide; el hook de Husky corre `pnpm test`.
