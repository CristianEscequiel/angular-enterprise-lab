# Spec: Gestión de técnicos y equipos

## Problema actual

Los técnicos hoy son solo usuarios simulados hardcodeados en `db.json`
(spec 013b), sin una entidad propia ni pantalla de gestión. Tampoco
existe el concepto de "equipo" como agrupación gestionable — spec 013b
solo definió el atributo `teamType` como dato del perfil del técnico,
no una entidad de equipo real con miembros.

## Requisitos

- Entidad `Tecnico`: nombre, legajo (identificador único), especialidad
  (mecánico/electricista/general), tipo de equipo (guardia/preventivo-
  correctivo) — probablemente reutilizando o extendiendo el modelo de
  usuario ya definido en 013b, a resolver en plan.
- CRUD de técnicos:
  - Administrador: crear, modificar, eliminar.
  - TeamLeaderMantenimiento: crear, modificar (sin eliminar).
- Entidad `Equipo`: nombre/identificador, tipo (guardia o preventivo-
  correctivo), lista de técnicos miembros.
- CRUD de equipos, con gestión completa (crear/modificar/eliminar)
  exclusiva de TeamLeaderMantenimiento.
- Funcionalidad de "agregar técnico a un equipo por legajo": un campo
  de búsqueda donde se ingresa el número de legajo, se valida en tiempo
  real que exista un técnico con ese legajo (y que no esté ya en el
  equipo), y se lo agrega a la lista de miembros.
- Páginas de gestión accesibles solo para Administrador/TeamLeader según
  la matriz de permisos ya definida.

- El maestro de técnicos es una entidad independiente del usuario de
  autenticación: `legajo` (único), `nombre`, `apellido`, `especialidad`,
  `tipoEquipo`. Existe sin requerir que el técnico tenga acceso al
  sistema.
- El usuario de autenticación (login) usa `legajo` como identificador
  cuando el rol es `tecnico`, vinculando ambas entidades sin fusionarlas.
  Para los demás roles (Administrador, TeamLeader, Producción), el
  usuario de auth no requiere existir en el maestro de técnicos.
- Crear un usuario de auth con rol `tecnico` debe validar que el legajo
  exista en el maestro de técnicos (no se puede crear un login de
  técnico para un legajo inexistente).

## Fuera de alcance

- Asignación de órdenes a técnicos o equipos — eso es spec 013d, que
  consume estas entidades pero no las modifica.
- Historial de técnicos que pasaron por un equipo (altas/bajas en el
  tiempo).
- Validación de legajo contra un sistema externo de RRHH — la validación
  en tiempo real es solo contra los técnicos ya existentes en el sistema.

## Criterio de aceptación (con estado de fallo explícito)

- Test: Administrador crea un técnico con legajo único → debe persistir
  y aparecer en el listado de técnicos.
  **Debe fallar** si permite crear un técnico con legajo duplicado.

- Test: TeamLeader intenta eliminar un técnico → debe ser bloqueado
  (solo Administrador puede eliminar).
  **Debe fallar** si TeamLeader logra eliminar.

- Test: agregar un técnico a un equipo tipeando un legajo válido →
  debe validarse en tiempo real (mostrar feedback de "técnico
  encontrado" antes de confirmar) y agregarlo a la lista de miembros.
  **Debe fallar** si permite agregar un legajo inexistente, o si no
  da feedback antes de la confirmación.

- Test: intentar agregar un legajo ya presente en el equipo → debe
  bloquear la duplicación con un mensaje claro.
  **Debe fallar** si permite miembros duplicados en el mismo equipo.

  - Test: crear un usuario de auth con rol `tecnico` y un legajo que no
    existe en el maestro → debe bloquear la creación.
    **Debe fallar** si permite crear el login sin el técnico maestro
    correspondiente.

- Test: el maestro de técnicos permite crear un técnico sin crearle
  usuario de auth (técnico existe, pero no puede loguearse todavía).
  **Debe fallar** si el sistema fuerza la creación conjunta de ambas
  entidades.
