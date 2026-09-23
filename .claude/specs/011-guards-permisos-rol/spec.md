# Spec: Guards de ruta y permisos por rol

## Problema actual

Spec 010 construyó el mecanismo de sesión (login, logout, token
simulado, interceptor de Authorization) pero dejó explícitamente fuera
de alcance la protección real de rutas — hoy todas las rutas siguen
siendo accesibles sin sesión activa, el estado de autenticación existe
pero no bloquea nada.

Este spec agrega la capa de protección: rutas que requieren sesión, y
una primera noción de rol (aunque el roadmap solo pide "permisos por
rol" de forma genérica, sin especificar roles concretos todavía — eso
se resuelve en este spec, no se asume).

## Requisitos

- Implementar un `CanActivate` guard (funcional, con `inject()`, no de
  clase — coherente con el estilo del proyecto) que bloquee el acceso a
  rutas protegidas si no hay sesión activa, redirigiendo a login.
- El guard debe reutilizar la redirección con retorno ya construida en
  spec 010 (volver a la URL original tras loguearse) — no duplicar esa
  lógica.
- Definir qué rutas quedan protegidas y cuáles públicas: `/dashboard` y
  `/work-orders/*` protegidas; `/login` pública. La wildcard `**` (404)
  se mantiene pública (no tiene sentido bloquear el acceso a una página
  de error).
- Agregar el concepto de rol al modelo de usuario simulado de spec 010
  (ej: `admin` y `tecnico`, a definir en plan según lo que tenga sentido
  para el dominio de órdenes de mantenimiento).
- Implementar un segundo guard (o extender el mismo con datos) que
  restrinja rutas o acciones específicas por rol — el alcance exacto de
  qué se restringe por rol se define en plan, considerando que hoy no
  hay features que dependan de rol todavía (eso viene en specs
  posteriores como `013-gestion-equipos-tecnicos`).
  - Si un usuario con sesión activa intenta navegar a `/login`, debe ser
    redirigido automáticamente a `/dashboard`, sin mostrar el formulario
    de login. Esto se implementa como un guard adicional sobre la ruta
    `/login` (inverso al de las rutas protegidas: bloquea el acceso
    cuando SÍ hay sesión, en vez de cuando no la hay).

## Fuera de alcance

- Definir todas las reglas de negocio de qué puede hacer cada rol en
  detalle — este spec establece el mecanismo de guards por rol, no el
  catálogo completo de permisos (eso se define caso por caso en las
  specs de features que lo necesiten).
- Ocultar/mostrar elementos de UI según rol (botones, menús) — si se
  requiere, es una extensión menor de este mecanismo pero no forma
  parte del criterio de cierre de este spec salvo que el plan lo
  incluya como necesario para probar el guard correctamente.
- Cambios en el interceptor de Authorization de spec 010.

## Criterio de aceptación (con estado de fallo explícito)

- Test: navegar a `/work-orders` sin sesión activa → debe redirigir a
  login, y la URL debe quedar disponible para retorno tras login
  (reutilizando el mecanismo de spec 010).
  **Debe fallar** si permite el acceso sin sesión o si no preserva la
  URL de retorno.

- Test: navegar a `/work-orders` con sesión activa → debe permitir el
  acceso normalmente.
  **Debe fallar** si bloquea a un usuario autenticado sin motivo.

- Test: navegar a `/login` con sesión ya activa → comportamiento a
  definir en plan (¿redirige a dashboard, o permite ver login igual?
  debe quedar explícito, no ambiguo).

- Test: usuario con rol sin permiso intenta acceder a una ruta
  restringida por rol → debe ser bloqueado (redirección a una página
  de "no autorizado" o al dashboard, a definir en plan).
  **Debe fallar** si el guard de rol no se ejecuta o permite acceso
  indebido.

  - Test: navegar a `/login` con sesión ya activa → debe redirigir
    automáticamente a `/dashboard`, sin renderizar el formulario.
    **Debe fallar** si el formulario de login se muestra igual pese a
    tener sesión activa.
