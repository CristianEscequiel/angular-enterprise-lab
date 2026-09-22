# Spec: Protección de formularios inválidos y envíos duplicados

## Problema actual

El formulario compartido (`Form`, usado en creación y edición) recibe
datos iniciales y emite los valores hacia las páginas que lo consumen.
Hoy no hay garantía explícita de que:
- No se pueda enviar el formulario en estado inválido.
- No se puedan disparar múltiples envíos si el usuario hace click repetido
  o doble-click mientras la petición está en curso (relevante en creación,
  donde un doble submit puede crear dos órdenes duplicadas).

Este spec cubre ambos frentes de forma conjunta porque comparten el mismo
componente y probablemente el mismo mecanismo de protección.

## Requisitos

- El botón de envío debe estar deshabilitado (o el submit debe ser
  bloqueado) cuando el formulario está en estado inválido.
- Mientras una petición de creación/edición está en curso, el formulario
  no debe permitir un segundo envío — ni por click repetido en el botón
  ni por reenvío del evento submit.
- El estado de "enviando" debe reflejarse visualmente (ej: botón con
  estado de carga), reutilizando el patrón de `LoadingService` si aplica,
  o un estado local si el envío no pasa por el interceptor global.
- Al finalizar el envío (éxito o error), el formulario debe volver a un
  estado que permita reintentar si correspondiera (no debe quedar
  bloqueado permanentemente tras un error).

## Fuera de alcance

- Validaciones de negocio específicas de cada campo (ya se asumen
  existentes vía Reactive Forms) — este spec no agrega ni cambia reglas
  de validación, solo el control de envío.
- Estados de error persistentes de carga inicial (eso es spec 003, y
  aplica a la carga de la orden a editar, no al envío del formulario).
- Confirmación antes de enviar (eso ya lo cubre el patrón de `Modal`
  para eliminar; no se extiende a creación/edición en este spec salvo
  que se decida lo contrario en el plan).

## Nota para plan mode

`Form` solo depende de `form.invalid` para el estado del botón y no
tiene lógica de negocio — solo emite el submit. La protección contra
doble-envío no puede resolverse únicamente dentro de `Form`: necesita
un estado de "enviando" que las páginas de creación/edición (que sí
llaman al servicio) comuniquen hacia el formulario, probablemente vía
un `input()` que deshabilite el botón mientras la petición está en
curso, además de la condición existente de `form.invalid`.

Confirmar si conviene un solo input booleano (`submitting`) o si ya
existe algún mecanismo de estado en las páginas que se pueda reutilizar
(ej: si loading global de `LoadingService` alcanza, o si hace falta un
estado local por página porque loading global es demasiado amplio).

## Criterio de aceptación (con estado de fallo explícito)

- Test: formulario con campos requeridos vacíos → el botón de envío debe
  estar deshabilitado y el evento submit no debe emitir valores.
  **Debe fallar** si el formulario permite emitir con el formulario en
  estado inválido.

- Test: disparar el submit, y mientras la petición está pendiente
  (mock con delay), intentar un segundo submit → debe emitirse un solo
  evento/una sola llamada al servicio.
  **Debe fallar** si se registran dos o más llamadas al servicio para
  un solo intento de envío del usuario.

- Test: tras un envío fallido (mock con error), el formulario debe volver
  a estado habilitado para reintentar.
  **Debe fallar** si el botón queda deshabilitado indefinidamente después
  del error.
