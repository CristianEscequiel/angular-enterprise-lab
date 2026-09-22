# Notas 005: ejecución

## Resultado

- Baseline: 21 archivos / 84 tests en verde (heredado de spec 004).
- Final: 21 archivos / 92 tests en verde (+8: 7 en `modal.spec.ts`,
  1 en `work-orders-list.spec.ts`).

## Diagnóstico confirmado

- Foco al abrir y cierre con Escape ya estaban implementados
  (`openModal()` enfocaba el botón `×`; `onEscapeKey()` ya llamaba a
  `cancel()`) — solo faltaban tests.
- Focus trap y restauración de foco al cerrar: no existían, se
  implementaron desde cero en `Modal` (sin Angular CDK, tal como pide
  la nota del spec).
- `workOrderDeleted` en `work-orders-list.ts` ya se sobreescribía en
  cada `openDeleteModal(id)`, así que no había fuga funcional real entre
  aperturas — se blindó con test + mutación, y se endureció el valor
  inicial (`'1'` → `''`).

## Cambios de producción

1. `modal.ts`: `@ViewChild('modalRoot')` sobre la `<section class="modal">`;
   `onTabKey()` (`@HostListener('document:keydown')`) cicla el foco entre
   los elementos focuseables del modal en los límites (Shift+Tab desde el
   primero → último; Tab desde el último → primero); `previouslyFocusedElement`
   capturado en `openModal()` y restaurado en el nuevo `restoreFocus()`,
   llamado junto a `unlockBody()` desde `closeModalSideEffects()` — cubre
   los 4 caminos de cierre (confirmar/cancelar/Escape/overlay) porque
   todos pasan por el mismo `effect()`.
2. `modal.html`: agregado `#modalRoot` a la `<section class="modal">`.
3. `_modal.scss`: `@include a.focus-visible;` en `.modal__close` (mismo
   mixin que ya usan `.btn`/Cancelar/Confirmar — sin tokens nuevos).
4. `work-orders-list.ts`: `workOrderDeleted` inicial `'1'` → `''`.

## Hallazgo técnico durante los tests: la app es zoneless

No hay `zone.js` en `package.json` ni configuración de polyfills — el
proyecto usa change detection zoneless. Esto significa que
`fixture.whenStable()` **no espera** un `setTimeout` real programado
fuera del ciclo de reactividad de Angular (como el que usa `openModal()`
para mover el foco). El primer intento de test (`whenStable()` solo)
dejaba el foco todavía en el botón disparador. Se resolvió agregando una
espera real de un tick (`await new Promise(resolve => setTimeout(resolve, 0))`)
después de `whenStable()` en el helper `openModal()` del test. Esto no
es un bug de producción — es una particularidad del entorno de test que
había que tener en cuenta.

## Verificación por mutación (tarea 6)

Mutaciones temporales, confirmadas y revertidas (`git diff` limpio tras
revertir).

| Mutación                                                                        | Archivo               | Tests que fallaron                                                                                          |
| ------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Vaciar el cuerpo de `onTabKey` (siempre `return`)                               | `modal.ts`            | `cycles focus between the modal own elements...`                                                            |
| Vaciar `restoreFocus()`                                                         | `modal.ts`            | Los 4 casos de `restores focus to the triggering element after %s`                                          |
| Quitar el decorador `@HostListener('document:keydown.escape')` de `onEscapeKey` | `modal.ts`            | `restores focus to the triggering element after pressing Escape`, `closes the modal when Escape is pressed` |
| Quitar `this.workOrderDeleted.set(id)` de `openDeleteModal`                     | `work-orders-list.ts` | `does not carry over the previous order id when the delete modal is reopened for a different order`         |

## Verificación adicional

- `pnpm lint`: sin errores.
- `pnpm build`: build de producción correcto.
- No hay test automatizado para el estilo visual de `.modal__close`
  (Vitest no carga el SCSS global compilado) — se deja para la
  verificación E2E manual.

## Pendiente

- Tarea del README (agregar spec 005 y tildar el checkbox del roadmap):
  no incluida en el plan como tarea obligatoria; se ofrece al usuario
  igual que en specs 002-004.
- Verificación E2E manual (`pnpm api` + `pnpm start`, navegación por
  teclado real, outline visible en el botón `×`) no se ejecutó.
