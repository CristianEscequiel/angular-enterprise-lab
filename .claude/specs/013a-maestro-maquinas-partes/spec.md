# Spec: Maestro de máquinas y árbol de partes

## Problema actual

El sistema no tiene ninguna noción de máquinas ni de sus partes internas.
Las órdenes de trabajo no pueden ubicarse dentro de una estructura física
de equipamiento — es un prerequisito de datos para que 013d pueda asociar
una orden a "qué máquina, qué parte" en vez de solo texto libre.

## Requisitos

- CRUD de máquinas: nombre (y otros atributos básicos a definir en plan,
  ej. código/identificador único).
- Cada máquina tiene un árbol de partes de profundidad variable (N
  niveles) — una parte puede tener sub-partes, y una parte sin hijos es
  una "hoja" (ej: Mesa de transporte → Cinta 1, sin más niveles debajo).
- CRUD de partes dentro del árbol de una máquina: agregar, modificar,
  eliminar un nodo (y sus hijos, si los tiene, o impedir eliminar si
  tiene hijos — a definir en plan cuál es más seguro).
- Gestión (crear/modificar/eliminar máquinas y su árbol de partes)
  habilitada tanto para `administrador` como para
  `team-leader-mantenimiento` (roles ya definidos en spec 013b) — mismo
  nivel de permiso para ambos roles en esta entidad.
- El árbol debe ser navegable desde la UI para que, al crear una orden
  (spec 013d), se pueda seleccionar máquina → parte → sub-parte hasta
  llegar a una hoja. El árbol es una **guía de ubicación**, no determina
  automáticamente la especialidad requerida por la orden — eso lo decide
  quien la crea, a su criterio (definido en 013d).

## Fuera de alcance

- Asociar órdenes a máquinas/partes, y el comentario de "cuál es la
  falla" al seleccionar una hoja del árbol — eso es spec 013d, que
  consume esta estructura pero no la modifica.
- Historial de mantenimiento por máquina, indicadores o reportes.
- Importación masiva de máquinas/partes (si hiciera falta a futuro,
  sería una spec separada, similar a la carga de Excel de planes
  preventivos ya identificada como pendiente).

## Criterio de aceptación (con estado de fallo explícito)

- Test: crear una máquina y agregar un árbol de partes de al menos 3
  niveles de profundidad → la estructura debe persistir y recuperarse
  completa, en el orden jerárquico correcto.
  **Debe fallar** si se aplana la jerarquía o se pierde algún nivel al
  guardar/recuperar.

- Test: intentar eliminar una parte que tiene sub-partes → debe bloquear
  la eliminación o eliminar en cascada, según lo que defina el plan,
  pero el comportamiento debe ser explícito y consistente, nunca dejar
  sub-partes huérfanas sin padre.
  **Debe fallar** si quedan nodos huérfanos tras eliminar un padre.

- Test: usuario con rol `personal-produccion` o `tecnico` intenta acceder
  a la gestión de máquinas/partes → debe ser bloqueado (solo
  `administrador` y `team-leader-mantenimiento` tienen acceso).
  **Debe fallar** si un rol no autorizado puede crear/modificar/eliminar
  máquinas o partes.
