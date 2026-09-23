# Spec: Roles extendidos del dominio de mantenimiento

## Problema actual

Spec 011 dejó el mecanismo de guards por rol funcionando, pero sin roles
concretos definidos (usaba `admin`/`tecnico` como placeholder genérico).
El dominio real requiere un conjunto de roles específico, con reglas de
creación de órdenes y de gestión de entidades que dependen del rol.

## Requisitos

Definir y modelar los siguientes roles:

- **Administrador**: gestiona técnicos (crear/modificar/eliminar),
  máquinas y árbol de partes (junto con TeamLeader), y es el único rol
  que puede eliminar órdenes de trabajo.
- **TeamLeaderMantenimiento**: crea órdenes de tipo preventivo/correctivo
  (con fecha estimada), puede modificar cualquier orden (pero no
  eliminarla), gestiona máquinas/árbol de partes (junto con
  Administrador), gestiona técnicos (crear/modificar, sin eliminar), y
  tiene gestión completa de equipos (crear/modificar/eliminar).
- **PersonalDeProduccion**: único rol habilitado para crear órdenes de
  tipo pronto-intervención (guardia). No se distingue entre operador y
  supervisor a nivel de permisos — un solo rol por ahora.
- **Técnico**: gestiona (toma, comenta, cierra) las órdenes asignadas a
  su especialidad/tipo de equipo. Tiene dos atributos propios (no son
  roles distintos, son datos del perfil del técnico):
  - Especialidad: `mecanico`, `electricista`, o `general` (comodín,
    puede tomar órdenes de ambas especialidades).
  - Tipo de equipo: `guardia` (pronto-intervención) o
    `preventivo-correctivo`.

## Fuera de alcance

- CRUD de técnicos en sí (eso es spec 013c) — esta spec define el
  modelo de rol y los atributos que un técnico va a tener, no la
  pantalla ni el servicio para gestionarlos.
- Lógica de asignación de órdenes por especialidad/equipo (spec 013d).
- Diferenciar operador de supervisor dentro de PersonalDeProduccion —
  explícitamente un solo rol por ahora.

## Criterio de aceptación (con estado de fallo explícito)

- Test: usuario con rol `Administrador` → puede acceder a eliminar una
  orden; usuario con rol `TeamLeaderMantenimiento` → puede modificar
  pero el intento de eliminar debe ser bloqueado por el guard.
  **Debe fallar** si TeamLeader logra eliminar una orden, o si
  Administrador no puede.

- Test: usuario con rol `PersonalDeProduccion` intenta crear una orden
  de tipo preventivo/correctivo → debe ser bloqueado; el mismo usuario
  creando una de pronto-intervención → debe permitirse.
  **Debe fallar** si Producción puede crear preventivas, o si no puede
  crear las de guardia.

- Test: usuario con rol `TeamLeaderMantenimiento` intenta crear una
  orden de pronto-intervención → debe ser bloqueado (ese tipo es
  exclusivo de Producción, según lo definido).
  **Debe fallar** si TeamLeader puede crear órdenes de guardia.

- Test: un técnico con especialidad `mecanico` y tipo `guardia` →
  el guard/lógica de acceso debe reflejar ambos atributos correctamente
  al evaluar qué órdenes puede gestionar (aunque la asignación real de
  órdenes se implemente en 013d, el modelo de datos del técnico debe
  soportar la consulta desde ya).
  **Debe fallar** si el modelo de rol no distingue especialidad de tipo
  de equipo como atributos independientes.
