# Spec: Selección de máquina y parte al crear una orden

## Problema actual

El campo "activo" de una orden es texto libre. Con el maestro de
máquinas y árbol de partes ya construido (013a), corresponde reemplazarlo
por una selección real contra esa estructura, con un comentario corto
que describa la falla en el punto seleccionado.

## Requisitos

- Al crear una orden, la selección de máquina/parte es **obligatoria**
  para todos los tipos de orden (preventivo, correctivo,
  pronto-intervención) — sin excepción.
- Quien crea la orden navega el árbol (reutilizando el componente
  `PartTree` de 013a con `showActions=false`) y puede detenerse en
  **cualquier nivel**: solo la máquina (sin bajar a partes), o hasta la
  hoja más profunda del árbol.
- Un comentario corto describe la falla en el punto seleccionado —
  campo de texto separado, no concatenado con la ruta del árbol.
- El modelo de `WorkOrder` incorpora una referencia estructurada:

```typescript
interface WorkOrderMachineRef {
  machineId: string;
  partId: string | null; // null = intervención a nivel de máquina completa
  breadcrumb: string; // snapshot de nombres al momento de crear
  comment: string;
}
```

- `breadcrumb` se arma **una sola vez, al crear la orden**, recorriendo
  la cadena de ancestros desde la raíz hasta el nodo seleccionado (o solo
  el nombre de la máquina si no se seleccionó parte). No se recalcula
  después — una orden ya creada conserva el nombre que tenía la parte en
  ese momento, aunque luego se renombre en el maestro (013a).
- El formulario de creación de orden no permite enviar sin máquina
  seleccionada (validación igual de estricta que los demás campos
  requeridos, según el patrón ya establecido en spec 004).

## Fuera de alcance

- Editar la máquina/parte de una orden ya creada — no está previsto que
  cambie después de creada (mismo criterio que `type`, spec 013b:
  inmutable tras el alta).
- Filtrar/buscar órdenes por máquina o parte — queda para una spec de
  indicadores/dashboard futura si se necesita.
- Comportamiento ante una parte eliminada después de haber sido
  referenciada por una orden — el `breadcrumb` snapshot ya resuelve el
  caso de visualización; no hace falta lógica adicional en esta spec.

## Criterio de aceptación (con estado de fallo explícito)

- Test: crear una orden sin seleccionar máquina → debe bloquear el envío
  con validación visible.
  **Debe fallar** si permite crear la orden sin referencia de máquina.

- Test: seleccionar solo la máquina (sin bajar a ninguna parte) → la
  orden se crea con `partId: null` y `breadcrumb` igual al nombre de la
  máquina.
  **Debe fallar** si fuerza obligatoriamente bajar a una parte.

- Test: seleccionar una parte de nivel 3 → `breadcrumb` refleja la
  cadena completa de ancestros en orden (máquina > nivel 1 > nivel 2 >
  nivel 3).
  **Debe fallar** si el breadcrumb omite algún nivel intermedio o el
  orden es incorrecto.

- Test: crear una orden, luego renombrar la parte seleccionada en el
  maestro (013a) → la orden ya creada sigue mostrando el `breadcrumb`
  original, sin actualizarse.
  **Debe fallar** si el breadcrumb se recalcula dinámicamente y refleja
  el nombre nuevo.

- Test: el comentario de falla es un campo propio, no concatenado en el
  breadcrumb.
  **Debe fallar** si el comentario aparece mezclado dentro del string de
  breadcrumb en el modelo guardado.

## Ampliación: tomar la orden y comentario de cierre del técnico

### Requisitos

- El técnico habilitado ve **"Tomar orden"** en las órdenes pendientes. Al tomarla, la orden pasa a
  **en progreso**, **queda a su nombre**, y se abre una página con la orden en **solo lectura** y
  **solo dos controles**: el **resultado** (completada o cancelada) y el **comentario del técnico**.
- El comentario es **obligatorio, de al menos 50 caracteres** (sin contar los espacios de los bordes)
  y de hasta 500. El resultado también es obligatorio, sin valor por defecto.
- **Una orden tomada no la puede tomar otro técnico.** Si otro técnico intenta tomarla, se le muestra
  una advertencia ("La orden está siendo ejecutada por {nombre}"); tampoco puede abrir su formulario
  de cierre ni cerrarla. Quien la tomó puede continuar después si sale sin cerrar.
- Se agrega el estado **cancelada**. Una orden cerrada (completada o cancelada) no se reabre.
- El comentario se guarda con quién lo escribió y cuándo, separado del comentario de falla de la
  referencia de máquina, y el detalle lo muestra junto con quién tomó la orden.
- Una orden que ya no está pendiente no se puede tomar, y una que no está en progreso no se puede
  cerrar, aunque el listado o la página estén desactualizados.
- **Liberar orden:** administrador y team leader pueden liberar una orden **en progreso**: vuelve a
  pendiente, sin técnico asignado, y cualquier técnico habilitado puede tomarla. El técnico que la
  tenía ya no puede cerrarla (su envío se rechaza sin pisar nada). Los técnicos y el personal de
  producción no pueden liberar, y no se puede liberar una orden pendiente ni una cerrada.
- El estado de una orden solo cambia tomándola, cerrándola o liberándola: desaparece el selector de estado libre
  del listado.

### Fuera de alcance

- Filtrar por especialidad (las órdenes no la tienen).
- Que administrador o team leader cierren órdenes, que el técnico devuelva su propia orden, registrar
  quién liberó una orden (auditoría) y reabrir una orden cerrada.
- Historial de varios comentarios por orden y comentarios mientras está en progreso.

### Criterio de aceptación (con estado de fallo explícito)

- Test: cerrar una orden (completada o cancelada) sin comentario → bloqueado, sin llamada al servicio.
  **Debe fallar** si se puede cerrar sin comentario.
- Test: comentario de 49 caracteres, de solo espacios, o sin elegir resultado → bloqueado; de 50 → se
  envía. **Debe fallar** si 49 caracteres pasan o si hay un resultado por defecto.
- Test: "Tomar orden" pasa la orden a en progreso a nombre del técnico y **después** abre la página de
  cierre; si tomarla falla, no navega. **Debe fallar** si navega sin haberla tomado.
- Test: un segundo técnico que intenta tomar una orden en progreso ve la advertencia con el nombre de
  quien la ejecuta, no se llama al servicio, y no puede cerrarla. **Debe fallar** si la toma, la cierra
  o ve el formulario.
- Test: la página solo permite editar el resultado y el comentario.
  **Debe fallar** si deja editar título, descripción, máquina u otro campo.
- Test: un rol que no es técnico, o un técnico cuyo equipo no atiende ese tipo de orden, no ve el botón
  ni entra a la página. **Debe fallar** si puede.
- Test: tomar una orden que ya no está pendiente, o cerrar una que no está en progreso → rechazado sin
  escribir. **Debe fallar** si una lista desactualizada reabre una orden cerrada o le quita la orden a
  otro técnico.
- Test: cerrar con comentario → se guarda con autor y fecha, y el detalle lo muestra separado del
  comentario de falla. **Debe fallar** si se pierde o se mezcla con el de falla.
- Test: liberar una orden en progreso (administrador o team leader) → vuelve a pendiente sin técnico y
  otro técnico habilitado puede tomarla. **Debe fallar** si queda con dueño, si un técnico o el
  personal de producción puede liberar, o si se puede liberar una orden pendiente o cerrada.
- Test: liberar la orden mientras el técnico anterior tiene abierta la página de cierre → su envío se
  rechaza y no pisa la orden. **Debe fallar** si el cierre del técnico anterior se aplica.
