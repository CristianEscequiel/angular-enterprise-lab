# Plan 005: Manejo de foco y limpieza del modal

Spec: `.claude/specs/005-foco-limpieza-modal/spec.md`

## Contexto

`Modal` (`src/app/shared/components/modal/`) es un componente hecho a
mano (sin Angular CDK): ya maneja apertura/cierre, bloqueo de scroll del
body, y cierre con Escape. Leído el código completo, el diagnóstico
frente a los 5 requisitos del spec es:

| Requisito del spec                                      | Estado en el código                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foco se mueve a un elemento interno al abrir            | **Ya implementado** — `openModal()` hace `focus()` sobre `modalCloseButton` (el botón `×`) vía `setTimeout`                                                                                                                                                                                                                                                                                                                                                                                    |
| Focus trap (Tab/Shift+Tab cicla dentro del modal)       | **No existe** — no hay ningún listener de Tab, ni referencia a los elementos focuseables internos                                                                                                                                                                                                                                                                                                                                                                                              |
| Foco vuelve al elemento que abrió el modal, al cerrar   | **No existe** — `closeModal()`/`unlockBody()` no guardan ni restauran nada, solo revierten `overflow` del body                                                                                                                                                                                                                                                                                                                                                                                 |
| Cierre con Escape                                       | **Ya implementado** — `@HostListener('document:keydown.escape') onEscapeKey()` ya llama a `cancel()`                                                                                                                                                                                                                                                                                                                                                                                           |
| Limpieza de estado "qué se está confirmando" entre usos | El propio `Modal` no tiene ese estado (solo `title`/`message`/`confirmText`/`cancelText` vía `input()`, sin dato de negocio) — el estado real vive en la página: `work-orders-list.ts` tiene `workOrderDeleted = signal<string>('1')`, seteado en `openDeleteModal(id)` antes de cada apertura. Como se sobreescribe en cada apertura, no hay fuga funcional real, pero el valor inicial `'1'` es un id real como placeholder — un smell defensivo a corregir, no un bug reportado por el spec |

**Estilos:** `_modal.scss` ya usa el sistema de tokens del proyecto
(`var(--color-primary)`, etc.) y `_button.scss` ya tiene un mixin
`a.focus-visible` (`outline: 2px solid var(--color-primary); outline-offset: 3px;`,
definido en `_mixins.scss`) que usan `.btn` y por lo tanto los botones
Cancelar/Confirmar del modal (son `.btn.btn--secondary`/`.btn.btn--danger`).
El botón `×` (`.modal__close`) **no** usa `.btn` y no tiene ningún estilo
de foco — es el único hueco visual real, y se resuelve reusando el mismo
mixin existente, sin crear tokens ni clases nuevas (tal como pide la nota
del spec).

**División de responsabilidades (según la nota del propio spec):** el
focus trap, el foco al abrir/cerrar y el Escape son responsabilidad de
`Modal` (UI/accesibilidad genérica, no lógica de negocio — no choca con
la regla de CLAUDE.md de "lógica de negocio en las páginas", que apunta
a decisiones de negocio como qué hacer al confirmar, no a manejo de foco).
La limpieza del _dato_ que se está confirmando (`workOrderDeleted`) es
responsabilidad de `work-orders-list.ts`, como ya está diseñado.

## Tareas

### 1. `Modal`: focus trap (Tab/Shift+Tab cicla dentro del modal)

- **Archivos:** `src/app/shared/components/modal/modal.ts`, `modal.html`
- **Cambio:** agregar `@ViewChild('modalRoot') private modalRoot?: ElementRef<HTMLElement>`
  apuntando a la `<section class="modal">` (agregar `#modalRoot` en el
  template). Nuevo `@HostListener('document:keydown', ['$event'])
onTabKey(event: KeyboardEvent)`: si `!isOpen()` o `event.key !== 'Tab'`,
  no hace nada; si no, obtiene los elementos focuseables del modal
  (`querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')`
  sobre `modalRoot`) y, si el foco está en el último y se presiona Tab (o
  en el primero y se presiona Shift+Tab, o el foco no está en ninguno de
  los focuseables del modal), hace `preventDefault()` y mueve el foco al
  extremo opuesto.
- **Test (`modal.spec.ts`, hoy solo `should create`):** usar un host de
  prueba (`@Component` inline con `imports: [Modal]`) que renderiza un
  `<button #trigger>` antes del modal y un `<button #decoy>` después,
  para poder verificar que el foco nunca llega al `decoy`.
  - `cycles focus between the modal's own elements and never reaches an element outside it` — abrir el modal, disparar `Shift+Tab` desde el primer elemento interno → foco al último; disparar `Tab` desde el último → foco al primero; en ningún punto `document.activeElement` es `decoy` ni `body`. **Debe fallar** si se quita el listener o su lógica de límites.

### 2. `Modal`: foco vuelve al elemento que lo abrió, al cerrar

- **Archivo:** `src/app/shared/components/modal/modal.ts`
- **Cambio:** nuevo campo privado `previouslyFocusedElement: HTMLElement | null = null`.
  En `openModal()`, primera línea: `this.previouslyFocusedElement = this.document.activeElement as HTMLElement | null;`.
  Separar el `unlockBody()` actual de un nuevo `restoreFocus()`
  (`this.previouslyFocusedElement?.focus(); this.previouslyFocusedElement = null;`),
  y llamar a ambos desde la rama `else` del `effect()` (ej. un método
  `closeModalSideEffects()` que llama a los dos). Esto cubre los 4 caminos
  de cierre (confirmar/cancelar/Escape/click en el overlay) porque todos
  pasan por `closeModal()` → `isOpen.set(false)` → el mismo `effect()`.
- **Test (`modal.spec.ts`):**
  - `moves focus into the modal when it opens, not to the trigger or body` — foco en `trigger`, click, `detectChanges()` + avanzar el `setTimeout` (fake timers); assert `document.activeElement` es el botón `×` del modal (no `trigger`, no `body`). **Debe fallar** si `openModal()` deja de mover el foco.
  - `it.each(['confirm', 'cancel', 'escape', 'overlay'])`: `restores focus to the triggering element after closing via %s` — abrir desde `trigger`, cerrar por cada uno de los 4 caminos, assert `document.activeElement === trigger`. **Debe fallar** si el foco queda en `body` o en el botón interno del modal.

### 3. `Modal`: cierre con Escape (ya implementado, sin test)

- **Archivo:** `modal.spec.ts` (sin cambios de producción — `onEscapeKey()` ya existe)
- **Test:** `closes the modal when Escape is pressed` — abrir, disparar `keydown.escape` en `document`, assert `isOpen()` es `false` y se emitió `cancelled`. Se incluye en la tarea 4 (mutación) para confirmar que es un test real, no solo una constatación.

### 4. Estilo de foco visible en el botón `×` (reusando el mixin existente)

- **Archivo:** `src/styles/components/_modal.scss`
- **Cambio:** agregar `@include a.focus-visible;` dentro de `.modal__close`
  (mismo mixin que ya usa `.btn` en `_button.scss` — cero tokens/clases
  nuevas). Los botones Cancelar/Confirmar ya lo heredan de `.btn`, no se tocan.
- **Verificación:** no hay test automatizado de estilos visuales en este
  repo (Vitest no carga el SCSS global compilado); se confirma con
  `pnpm build` (compila sin errores) y con la verificación E2E manual
  (ítem 5 de Verificación).

### 5. `WorkOrdersList`: endurecer el valor inicial de `workOrderDeleted` + test del criterio 4

- **Archivo:** `src/app/features/work-orders/pages/work-orders-list/work-orders-list.ts`
- **Cambio:** `readonly workOrderDeleted = signal<string>('1');` →
  `readonly workOrderDeleted = signal<string>('');` (el valor `'1'` era un
  id real como placeholder antes de que se abra el modal por primera vez;
  no es un bug reportado, pero es el smell defensivo que señala el spec
  bajo "limpieza de estado"). No se agrega un handler nuevo en
  `(cancelled)`: `openDeleteModal(id)` ya hace `workOrderDeleted.set(id)`
  en cada apertura, así que no hay fuga real entre A y B — se blinda con
  test + mutación en vez de agregar código que el flujo actual no necesita.
- **Test (`work-orders-list.spec.ts`, hoy sin tests de modal/delete):**
  - `does not carry over the previous order's id when the delete modal is reopened for a different order` — `openDeleteModal('A')`, simular cierre sin confirmar (`component.deleteModalOpen.set(false)`), `openDeleteModal('B')`, assert `workOrderDeleted() === 'B'` (nunca `'A'`). **Debe fallar** si `openDeleteModal` dejara de actualizar el signal en cada apertura (se confirma en la tarea 6).

### 6. Verificación por mutación

Con las tareas 1-5 ya implementadas (código final; se revierte solo el punto mutado):

- Quitar el `if` de límites en `onTabKey` (o comentar el listener) → debe
  fallar el test de la tarea 1.
- Quitar la captura/restauración de `previouslyFocusedElement` → deben
  fallar los tests de la tarea 2.
- Comentar temporalmente `onEscapeKey()` → debe fallar el test de la tarea 3.
- Quitar `this.workOrderDeleted.set(id)` de `openDeleteModal` → debe
  fallar el test de la tarea 5.
- Resultado anotado en `notes.md`, mismo formato que specs 001-004.

## Fuera de alcance (según el spec)

Contenido/variantes visuales del modal; extender su uso a otros flujos
(descartado en spec 004); auditoría de accesibilidad del resto de la app
(spec 008). No se toca `errorInterceptor`, `MessageService` ni el resto
de páginas que no usan `Modal`.

## Verificación

1. Baseline: `pnpm test` en verde antes de empezar.
2. Tras cada tarea 1-2 y 5: `pnpm test` en verde.
3. Tarea 6: confirmar los 4 fallos esperados bajo mutación, revertir cada
   uno, confirmar verde.
4. `pnpm lint` y `pnpm build` sin errores.
5. E2E manual: `pnpm api` + `pnpm start`; abrir el modal de eliminar con
   teclado (Tab hasta "Eliminar", Enter), confirmar que el foco entra al
   modal y se ve el outline en el botón `×`; Tab repetido nunca sale del
   modal; Escape cierra y el foco vuelve al botón "Eliminar" de la fila.
6. Commit solo si se pide; el hook de Husky corre `pnpm test`.
