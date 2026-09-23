# Spec: Filtros por estado y prioridad, cambio de estado de órdenes

## Problema actual

El modelo `WorkOrder` ya define `prioridad` (low, medium, high) y
`estado` (pending, in-progress, completed, canceled), pero ninguno de
los dos se muestra ni se puede filtrar/modificar desde la UI hoy. El
listado no tiene forma de filtrar por estos campos, y no existe ningún
mecanismo para cambiar el estado de una orden.

## Requisitos

- Mostrar `prioridad` y `estado` en el listado (ej: como badge,
  reutilizando el componente `Badge` ya existente con sus variantes).
- Agregar controles de filtro en el listado (selects) para `estado` y
  `prioridad`, combinables entre sí y con la búsqueda por título ya
  existente (spec 001) — los filtros deben viajar como parámetros de
  la misma petición paginada a JSON Server, no como filtrado en cliente
  sobre resultados ya paginados.
- Aplicar cualquier filtro debe resetear la página a 1 (mismo criterio
  ya establecido para la búsqueda en spec 001).
- El cambio de estado se realiza como acción rápida desde el listado:
  un select inline por fila con las cuatro opciones de estado, sin
  necesidad de navegar al detalle.
- El cambio de estado debe persistir vía `WorkOrdersService` (PATCH a
  JSON Server) y reflejarse inmediatamente en el listado sin recarga
  manual.

## Fuera de alcance

- Restricción de qué usuarios/roles pueden cambiar el estado — spec 011
  dejó el mecanismo de guards por rol listo, pero aplicarlo acá es una
  decisión a evaluar en plan, no obligación de este spec.
- Historial de cambios de estado (quién cambió qué y cuándo).
- Transiciones de estado restringidas (ej: no permitir volver de
  "completed" a "pending") — salvo que el plan detecte que es trivial
  de agregar y lo proponga como mejora menor, no es requisito de cierre.
- Indicadores del dashboard que usen estos datos — eso es spec `014`.

## Criterio de aceptación (con estado de fallo explícito)

- Test: el listado muestra el badge de estado y prioridad para cada
  orden, con la variante visual correspondiente a cada valor.
  **Debe fallar** si algún valor de estado/prioridad no tiene badge
  o usa una variante incorrecta.

- Test: aplicar un filtro de estado → la petición a JSON Server debe
  incluir el parámetro correspondiente, resultados mockeados deben
  reflejar solo lo filtrado.
  **Debe fallar** si el filtrado ocurre sobre datos ya recibidos en
  vez de vía parámetro de la petición.

- Test: combinar búsqueda por título + filtro de estado + filtro de
  prioridad → los tres parámetros deben viajar juntos en la misma
  petición.
  **Debe fallar** si aplicar un filtro pisa o ignora los otros criterios
  activos.

- Test: aplicar cualquier filtro estando en página 2 → debe resetear
  a página 1.
  **Debe fallar** si mantiene la página anterior con un filtro que
  puede no tener suficientes resultados para esa página.

- Test: cambiar el estado desde el select inline de una fila → debe
  llamar al servicio con el nuevo valor, y el listado debe reflejar
  el cambio sin recargar la página.
  **Debe fallar** si el cambio requiere refresh manual para verse
  reflejado, o si actualiza la fila incorrecta.
