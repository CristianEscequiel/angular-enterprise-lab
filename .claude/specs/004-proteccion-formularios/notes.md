# Notas 004: ejecución

## Resultado
- Baseline: 21 archivos / 73 tests en verde.
- Final: 21 archivos / 84 tests en verde (+11: 5 en `form.spec.ts`,
  4 en `work-order-create.spec.ts`, 2 en `work-order-edit.spec.ts`).
- **Igual que 003, requirió código de producción nuevo**: `Form.onSubmit()`
  emitía siempre, sin chequear `workOrderForm.invalid` — el `[disabled]`
  del botón era el único freno (cosmético, no protegía contra Enter ni
  una llamada directa a `onSubmit()`).

## Cambios de producción
1. `form.ts`: `submitting = input<boolean>(false)`; `onSubmit()` ahora
   bloquea si `submitting()` o `workOrderForm.invalid`, con
   `markAllAsTouched()` para revelar los errores existentes.
2. `form.html`: botón deshabilitado por `invalid || submitting()`, texto
   condicional "Guardando...".
3. `work-order-create.ts`: `isSubmitting` signal, guardia duro
   (`if (isSubmitting()) return;`) antes de llamar a `create`, reseteo
   vía `finalize()`. Wiring de `[submitting]` en el template.
4. `work-order-edit.ts`: mismo patrón en `onSubmitEdit`, agregado como
   primera línea (antes del `!current`/`hasChanges` existente, que no se
   tocó). Wiring de `[submitting]` en el template.

## Decisión de arquitectura confirmada
El guardia *duro* contra doble-envío vive en cada página
(`if (this.isSubmitting()) return;`), no solo en el `input()` de `Form`.
Motivo verificado en la práctica: los tests de doble-submit llaman al
handler de la página dos veces **sin `detectChanges()` intermedio**
(simulando la peor carrera posible) — si el guardia dependiera solo del
binding `submitting()` propagado hacia `Form`, no se habría actualizado
a tiempo para la segunda llamada. El `input()` en `Form` queda como capa
de UX (deshabilita el botón, cambia el texto), no como la única defensa.

## Hallazgo colateral durante los tests
Al agregar el primer test de éxito real en `work-order-edit.spec.ts`
(`update` resolviendo con éxito → `navigateToWorkOrdersList()`), apareció
un `NG04002: Cannot match any routes` no manejado: ese spec nunca había
provisto un mock de `Router`, y el camino de éxito de `onSubmitEdit`
nunca se había ejercitado antes de este spec. Se agregó
`{ provide: Router, useValue: routerMock }` (mismo patrón que ya se usó
en `work-order-create.spec.ts`). No es un bug de producción — el `Router`
real de la app sí tiene la ruta `/work-orders` registrada.

## Verificación por mutación (tarea 4)
Mutaciones temporales sobre el código final, confirmadas y revertidas.

| Mutación | Archivo | Tests que fallaron |
|---|---|---|
| Quitar `|| this.workOrderForm.invalid` del guardia | `form.ts` | `blocks emission and disables the submit button when required fields are empty`, `reveals validation error messages after an attempted submit on an untouched form` |
| Quitar `this.submitting() ||` del mismo guardia | `form.ts` | `disables the submit button and blocks emission while submitting() is true...` |
| Quitar `if (this.isSubmitting()) return;` | `work-order-create.ts` y `work-order-edit.ts` (por separado) | `sends a single create/update request when a second submit arrives while the first is still pending` en cada archivo respectivo |
| Quitar `finalize(() => this.isSubmitting.set(false))` | `work-order-create.ts` y `work-order-edit.ts` (por separado) | `re-enables submitting after a failed create/update so a retry is possible` en cada archivo respectivo |

Las 4 mutaciones se revirtieron; `pnpm test` quedó en 21/84 verde tras
cada reversión.

## Verificación adicional
- `pnpm lint`: sin errores.
- `pnpm build`: build de producción correcto.

## Pendiente
- Tarea 5 (README): opcional, no se tocó — pendiente confirmación del usuario.
- Verificación E2E manual (`pnpm api` + `pnpm start`, incluyendo doble-click
  real en el botón y apagar json-server para forzar el error) no se ejecutó.
- No se agregó test para el camino `!hasChanges` de `WorkOrderEdit` (fuera
  de alcance); se confirmó por lectura que el `return` de "sin cambios"
  ocurre antes de tocar `isSubmitting`, así que el guardia nuevo no lo
  afecta.
