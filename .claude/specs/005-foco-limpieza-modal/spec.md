# Spec: Manejo de foco y limpieza del modal

## Problema actual

El `Modal` compartido se usa para confirmar/cancelar acciones (ej:
eliminación de una orden). El README señala explícitamente que la
accesibilidad completa del modal está pendiente de validación. Los
riesgos concretos sin resolver:

- El foco del teclado no se gestiona al abrir ni al cerrar el modal
  (un usuario de teclado o lector de pantalla puede perder la ubicación
  de foco, o el foco puede quedar "atrapado" fuera del modal).
- El estado interno del modal (si lo tiene, más allá de abierto/cerrado)
  puede no limpiarse entre usos — relevante si el mismo modal se reutiliza
  para confirmar distintas acciones en la sesión.

## Requisitos

- Al abrir el modal, el foco debe moverse a un elemento dentro de él
  (ej: el botón de acción principal o el primer elemento interactivo).
- Mientras el modal está abierto, el foco no debe poder salir de él por
  Tab/Shift+Tab (focus trap) — debe ciclar entre los elementos internos.
- Al cerrar el modal (por confirmación, cancelación, o Escape), el foco
  debe volver al elemento que lo abrió originalmente (ej: el botón
  "Eliminar" de la fila correspondiente).
- El modal debe cerrarse con la tecla Escape.
- Al cerrarse, cualquier estado interno del modal (ej: qué acción/orden
  estaba confirmando) debe limpiarse, para que una apertura posterior no
  arrastre datos de la vez anterior.

  ## Nota para plan mode

El Modal es un componente hecho a mano, sin librería de UI externa (no
usa Angular CDK ni similar) — el focus trap y el manejo de foco deben
implementarse desde cero (listener de keydown para Tab/Shift+Tab/Escape,
guardar referencia al elemento que abrió el modal antes de moverse).

Los datos que muestra el modal (qué acción, qué orden) llegan por input()
desde la página que lo invoca — el modal no mantiene estado propio de
"qué está confirmando". La limpieza de estado entre usos es responsabilidad
de la página que lo invoca (asegurarse de que el input() se actualice o
se resetee correctamente entre aperturas), no del modal.

El proyecto usa un sistema de estilos custom propio (no una librería de
componentes) — cualquier cambio visual para reflejar el foco (ej: outline
visible en el elemento enfocado) debe seguir las convenciones de ese
sistema de estilos, no introducir clases o tokens nuevos sin necesidad.

## Fuera de alcance

- Cambios en el contenido o las variantes visuales del modal.
- Extender el uso del modal a flujos donde no se usa hoy (ej: confirmación
  antes de guardar en edición — eso quedó descartado explícitamente en
  spec `004`).
- Auditoría de accesibilidad del resto de la aplicación (eso es parte de
  spec `008-tipado-estricto-accesibilidad-responsive`, que es transversal).

## Criterio de aceptación (con estado de fallo explícito)

- Test: abrir el modal → el foco debe estar en un elemento interno
  específico (no en `body` ni en el elemento que quedó atrás en la página).
  **Debe fallar** si el foco permanece en el botón que abrió el modal o
  se pierde en `document.body`.

- Test: con el modal abierto, simular Tab repetidas veces → el foco debe
  ciclar solo entre elementos internos del modal, nunca llegar a un
  elemento de la página de fondo.
  **Debe fallar** si el foco escapa del modal hacia elementos externos.

- Test: cerrar el modal (confirmar, cancelar, o Escape) → el foco debe
  volver exactamente al elemento que lo abrió.
  **Debe fallar** si el foco queda en `body` o en cualquier otro elemento
  distinto al de origen.

- Test: abrir el modal para la orden A, cerrarlo sin confirmar, abrirlo
  para la orden B → el estado interno no debe contener referencias a la
  orden A.
  **Debe fallar** si al abrir para B se observa algún rastro de estado
  de la apertura anterior (ej: el mismo id, el mismo texto de confirmación
  sin actualizar).
