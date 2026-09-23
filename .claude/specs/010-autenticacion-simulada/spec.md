# Spec: Autenticación simulada, sesión, logout y retorno tras login

## Problema actual

La aplicación no tiene ningún mecanismo de autenticación. Todas las
rutas son públicas. El roadmap define esto como "autenticación simulada"
porque el backend real (JSON Server hoy, Spring Boot en fase 3) no va a
validar credenciales de verdad todavía — la simulación debe ser diseñada
para que el reemplazo futuro por auth real (JWT contra Spring Boot,
spec 018) sea un cambio de implementación, no de arquitectura.

## Requisitos

- Pantalla de login con formulario (usuario/contraseña), validado con
  Reactive Forms siguiendo el patrón ya usado en `Form` de work-orders.
- La validación de credenciales es simulada: contra un usuario fijo
  hardcodeado o contra un endpoint de JSON Server (a definir en plan,
  según cuál sea más representativo del reemplazo futuro por JWT real).
- Al loguearse correctamente, se guarda el estado de sesión (signal de
  estado global: usuario autenticado sí/no, datos básicos del usuario).
- La sesión debe persistir entre recargas de página (localStorage o
  sessionStorage — a decidir en plan, considerando qué tan simulado debe
  ser esto dado que en fase 3 se reemplaza por JWT real, que sí requiere
  persistencia de token).
- Logout: limpia el estado de sesión y redirige a login.
- Retorno tras login: si un usuario no autenticado intenta acceder a
  una ruta protegida, debe ser redirigido a login, y tras loguearse
  exitosamente, debe volver a la URL que intentaba visitar originalmente
  (no siempre al dashboard).
- Mientras no haya guards implementados (spec 011), las rutas siguen
  siendo accesibles sin login — este spec construye el mecanismo de
  sesión, no la protección de rutas.
  - La validación de credenciales se hace contra un endpoint nuevo en
    JSON Server (`db.json`), agregando una colección de usuarios simulados
    con usuario/contraseña en texto plano (aceptable porque es un backend
    de desarrollo, nunca producción).
- El servicio de autenticación (`AuthService` o similar) debe devolver
  un token simulado tras el login exitoso (puede ser un string fijo o
  generado trivialmente — no necesita ser un JWT real todavía, pero debe
  guardarse y exponerse de la misma forma en que un JWT real lo haría).
- Ya en este spec, agregar un `HttpInterceptor` que adjunte el token
  simulado en el header `Authorization` de las peticiones — aunque
  JSON Server no lo valide, esto deja el mecanismo de interceptor
  funcionando y probado, para que en spec `018` el único cambio sea
  reemplazar "token simulado" por "JWT real emitido por Spring Boot",
  sin tocar la arquitectura del interceptor en sí.
- El interceptor debe registrarse en `app.config.ts`, siguiendo el mismo
  patrón que `loadingInterceptor`, `mockDelayInterceptor` y
  `errorInterceptor` ya existentes.

## Fuera de alcance

- Guards de ruta y protección real de acceso (spec `011`).
- Permisos por rol — este spec maneja "autenticado sí/no", no roles.
- Autenticación real contra backend con JWT (spec `018`, fase 3).
- Recuperación de contraseña, registro de usuario, o cualquier flujo
  más allá de login/logout.
- Validación real de JWT, expiración de token, refresh tokens — eso es
  spec `018`. Acá el token es un placeholder que ya circula por el
  pipeline correcto (interceptor → header), pero no tiene la semántica
  criptográfica real todavía.

## Criterio de aceptación (con estado de fallo explícito)

- Test: login con credenciales correctas → el estado de sesión debe
  reflejar usuario autenticado, y debe redirigir fuera de la pantalla
  de login.
  **Debe fallar** si el estado no se actualiza o si permanece en login
  tras un login exitoso.

- Test: login con credenciales incorrectas → debe mostrar un mensaje de
  error, sin actualizar el estado de sesión.
  **Debe fallar** si el estado se marca como autenticado con
  credenciales inválidas.

- Test: recargar la página estando logueado → la sesión debe persistir
  (no debe requerir loguearse de nuevo).
  **Debe fallar** si tras recargar, el estado vuelve a "no autenticado"
  pese a haber sesión guardada.

- Test: intentar acceder a `/work-orders/5` sin sesión, ser redirigido
  a login, loguearse → debe volver a `/work-orders/5`, no al dashboard.
  **Debe fallar** si tras el login siempre redirige a una ruta fija
  ignorando la URL original solicitada.

- Test: logout → el estado de sesión debe limpiarse completamente y
  navegar a login.
  **Debe fallar** si queda algún rastro de la sesión anterior (ej: el
  próximo login de otro usuario hereda datos del usuario anterior).

  - Test: tras un login exitoso, cualquier petición HTTP posterior (ej:
    cargar el listado de work-orders) debe incluir el header
    `Authorization` con el token guardado.
    **Debe fallar** si las peticiones salen sin ese header pese a haber
    sesión activa.

- Test: sin sesión activa, las peticiones HTTP no deben incluir el
  header `Authorization` (o deben incluirlo vacío/ausente, según se
  defina).
  **Debe fallar** si el interceptor agrega un header con token
  inválido/undefined cuando no hay sesión.
