# Spec 018 — Integración con la API real (Spring Boot + JWT)

## Contexto y decisiones

**De dónde sale el pedido.** El backend `angular-enterprise-lab-api` (Java 21, Spring
Boot 3, PostgreSQL) está terminado: auth con JWT, técnicos y equipos, máquinas y
partes, órdenes (CRUD, tomar/cerrar/liberar) y dashboard. Hasta hoy el frontend corre
contra JSON Server y varias specs dejaron anotado "esto cambia en la spec 018"
(010, 011, 013a, 013c). Esta spec cambia el origen de los datos sin cambiar reglas de
negocio ni pantallas.

**Decisiones tomadas con el usuario:**

- Una sola spec 018, organizada por capas (base → sesión → maestros → órdenes →
  dashboard → retiro del mock). El orden de ejecución se fija en `tasks.md`.
- Al terminar se **retira** JSON Server, `db.json`, los interceptores mock, el emulador
  `in-memory-api` y la lógica de cliente que suplía al servidor (unicidad, integridad
  referencial, validación de transiciones de estado). Los tests pasan a
  `HttpTestingController` con el contrato real de la API.
- Dashboard: las listas del tablero "Turno de hoy" salen de `GET /work-orders` con
  filtros; las cifras, de `GET /dashboard/summary`; la carga de trabajo solo se
  muestra a administrador y team leader.

**Hechos de la API verificados en su código** (`application.yml`, controladores):
base `http://localhost:8080`; JWT con TTL de 60 minutos; CORS permite
`http://localhost:4200`; `page` es 1-based; todos los `id` viajan como string; los
técnicos se identifican por `legajo` en la URL; el listado de órdenes responde
`{data, page, size, totalItems, totalPages}`; los errores controlados responden
`{code, message, timestamp, path, details?}`.

**Diferencias de contrato que fuerzan cambios en el frontend:**

| Tema                                                                                | JSON Server (hoy)                                                               | API real                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rutas                                                                               | `/tecnicos`, `/equipos`, `/maquinas`, `/partes`                                 | `/technicians`, `/teams`, `/machines`, `/machines/{id}/parts` + `/parts/{id}`                   |
| Paginación                                                                          | `_page`, `_per_page`; respuesta `{first, prev, next, last, pages, items, data}` | `page`, `size` (máx. 100); respuesta `{data, page, size, totalItems, totalPages}`               |
| Filtro de título                                                                    | `title:contains`                                                                | `title`                                                                                         |
| Login                                                                               | `GET /users?username&password` + armado de sesión en cliente                    | `POST /auth/login` → `{token, user}`; `GET /auth/me`                                            |
| Perfil del técnico                                                                  | Se resuelve en cliente contra `/tecnicos`                                       | Ya viene en `user` (`legajo`, `specialty`, `teamType`)                                          |
| Alta de orden                                                                       | El cliente manda `status`, `createdAt`, `breadcrumb`                            | El servidor los fija; el cliente manda `machineRef {machineId, partId, comment}`                |
| Edición de orden                                                                    | `PUT` del documento entero                                                      | `PUT` de título, descripción y prioridad; tipo y máquina son inmutables                         |
| Tomar / cerrar / liberar                                                            | `PATCH` tras releer la orden                                                    | `POST /work-orders/{id}/take`, `/close {outcome, comment}`, `/release`; el dueño sale del token |
| Errores de estado                                                                   | Calculados en el cliente                                                        | `409` con `code` y `details {status, takenById, takenByName}`                                   |
| Integridad (código de máquina único, borrado con hijos, padre válido, legajo único) | Verificada en el cliente                                                        | Verificada en el servidor; el cliente solo traduce el error                                     |
| Usuarios                                                                            | `UsersService` crea logins en `/users`                                          | La API no expone alta de usuarios                                                               |

**Fuera de alcance:**

- Refresh token y renovación de sesión: la API no los ofrece. Al vencer el token se
  cierra la sesión.
- Alta o edición de usuarios de login (la API no tiene endpoint).
- Cambios en reglas de negocio, permisos por rol o diseño visual.
- Despliegue, variables de entorno de producción y CI contra la API.
- Cambios en la API. Si se detecta una discrepancia de contrato, se documenta en
  `notes.md` y se resuelve en el repo del backend.

## REQ-1 Configuración de la API

1. EL SISTEMA DEBERÁ tomar la URL base de la API de un único valor de configuración
   (`API_BASE_URL`) cuyo valor de desarrollo es `http://localhost:8080`.
2. EL SISTEMA DEBERÁ construir todas las URL de los servicios a partir de ese valor,
   sin URL absolutas escritas en los servicios.
3. CUANDO una petición va a una URL que no empieza por `API_BASE_URL`, EL SISTEMA
   DEBERÁ enviarla sin el header `Authorization`.

## REQ-2 Manejo de errores de la API

1. CUANDO la API responde un error con cuerpo `{code, message}`, EL SISTEMA DEBERÁ
   mostrar el `message` recibido.
2. CUANDO la API responde un `400` de validación con `details` por campo, EL SISTEMA
   DEBERÁ exponer ese detalle a la página que hizo la petición.
3. CUANDO la API responde un error sin cuerpo con `message` (p. ej. `0`, `502`), EL
   SISTEMA DEBERÁ mostrar el mensaje genérico correspondiente al código de estado.
4. CUANDO la API responde `403`, EL SISTEMA DEBERÁ mostrar "No tenés permisos para
   realizar esta acción." y conservar la sesión.
5. CUANDO la API responde `401` a una petición distinta de `POST /auth/login`, EL
   SISTEMA DEBERÁ cerrar la sesión y redirigir a `/login` con el `returnUrl` actual.
6. CUANDO la API responde `409`, EL SISTEMA DEBERÁ entregar a la página el `code` y los
   `details` para que decida qué mostrar.
7. EL SISTEMA DEBERÁ eliminar los `console.log` de depuración del interceptor de
   errores.

## REQ-3 Sesión con JWT

1. CUANDO el usuario envía credenciales válidas, EL SISTEMA DEBERÁ llamar a
   `POST /auth/login` con `{username, password}` y guardar el `{token, user}`
   recibido como sesión.
2. CUANDO el login responde `401`, EL SISTEMA DEBERÁ mostrar "Usuario o contraseña
   incorrectos." y no crear sesión.
3. CUANDO el login falla por conexión o `5xx`, EL SISTEMA DEBERÁ mostrar el error de
   conexión o de servidor, distinto del de credenciales.
4. EL SISTEMA DEBERÁ usar el `user` devuelto por la API tal cual, sin consultar el
   maestro de técnicos para completar `specialty` ni `teamType`.
5. CUANDO el `user` recibido es un técnico sin `legajo`, `specialty` o `teamType`
   válidos, o un no-técnico con alguno de ellos, EL SISTEMA DEBERÁ rechazar la sesión
   con el error de perfil incompleto.
6. CUANDO la aplicación arranca con una sesión guardada, EL SISTEMA DEBERÁ validarla
   con `GET /auth/me` antes de darla por válida y reemplazar el `user` guardado por el
   recibido.
7. CUANDO `GET /auth/me` responde `401`, EL SISTEMA DEBERÁ descartar la sesión
   guardada.
8. CUANDO `GET /auth/me` falla por conexión, EL SISTEMA DEBERÁ conservar la sesión
   guardada y no cerrarla.
9. CUANDO el usuario cierra sesión, EL SISTEMA DEBERÁ borrar la sesión guardada.
10. EL SISTEMA DEBERÁ conservar sin cambios el contrato público de `AuthService`
    (`login()`, `logout()`, `session`, `currentUser`, `token`, `isAuthenticated`) para
    que guards, interceptor y páginas no se modifiquen.

## REQ-4 Técnicos

1. CUANDO el usuario abre el listado de técnicos, EL SISTEMA DEBERÁ cargarlos con
   `GET /technicians`.
2. CUANDO el usuario abre el detalle de un técnico, EL SISTEMA DEBERÁ cargarlo con
   `GET /technicians/{legajo}`.
3. CUANDO el usuario da de alta un técnico, EL SISTEMA DEBERÁ enviar `POST /technicians`
   con legajo, nombre, apellido, especialidad y tipo de equipo.
4. CUANDO el usuario edita un técnico, EL SISTEMA DEBERÁ enviar
   `PUT /technicians/{legajo}` sin modificar el legajo.
5. CUANDO el usuario elimina un técnico, EL SISTEMA DEBERÁ enviar
   `DELETE /technicians/{legajo}`.
6. CUANDO la baja responde `409` porque el técnico tiene login o es miembro de un
   equipo, EL SISTEMA DEBERÁ mostrar el motivo que informa la API y conservar el
   técnico en el listado.
7. CUANDO el alta responde un error por legajo repetido, EL SISTEMA DEBERÁ mostrarlo
   en el campo legajo del formulario.
8. EL SISTEMA DEBERÁ eliminar `TechnicianDirectory` y `UsersService` junto con las
   verificaciones de cliente que reemplazan (legajo único, "tiene usuario").

## REQ-5 Equipos

1. CUANDO el usuario abre el listado de equipos, EL SISTEMA DEBERÁ cargarlos con
   `GET /teams`.
2. CUANDO el usuario abre un equipo, EL SISTEMA DEBERÁ cargarlo con `GET /teams/{id}`.
3. CUANDO el usuario crea un equipo, EL SISTEMA DEBERÁ enviar `POST /teams` con
   `{name, type, memberLegajos}`.
4. CUANDO el usuario guarda un equipo, EL SISTEMA DEBERÁ enviar `PUT /teams/{id}` con
   la lista completa de miembros.
5. CUANDO el usuario elimina un equipo, EL SISTEMA DEBERÁ enviar `DELETE /teams/{id}`.
6. CUANDO la API responde `400 UNKNOWN_TECHNICIAN`, EL SISTEMA DEBERÁ informar que
   algún legajo de la lista no existe y conservar la selección del formulario.
7. CUANDO la API responde `404` a la carga de un equipo, EL SISTEMA DEBERÁ mostrar el
   estado "no existe" ya definido en la spec 003.

## REQ-6 Máquinas

1. CUANDO el usuario abre el listado de máquinas, EL SISTEMA DEBERÁ cargarlas con
   `GET /machines` y mostrar el `partCount` recibido.
2. CUANDO el usuario abre una máquina, EL SISTEMA DEBERÁ cargarla con
   `GET /machines/{id}`.
3. CUANDO el usuario crea o edita una máquina, EL SISTEMA DEBERÁ enviar `POST /machines`
   o `PUT /machines/{id}` con `{code, name}` sin consultar el listado previamente.
4. CUANDO la API responde `409 DUPLICATE_MACHINE_CODE`, EL SISTEMA DEBERÁ mostrar el
   error en el campo código.
5. CUANDO el usuario elimina una máquina, EL SISTEMA DEBERÁ enviar `DELETE /machines/{id}`
   sin consultar sus partes previamente.
6. CUANDO la baja responde `409 MACHINE_HAS_PARTS`, EL SISTEMA DEBERÁ mostrar que la
   máquina tiene partes y conservarla en el listado.
7. CUANDO la API responde `404` a la carga de una máquina, EL SISTEMA DEBERÁ mostrar el
   estado "no existe" ya definido.

## REQ-7 Partes

1. CUANDO el usuario abre el árbol de una máquina, EL SISTEMA DEBERÁ cargar la lista
   plana con `GET /machines/{machineId}/parts` y armar el árbol por `parentId`.
2. CUANDO el usuario agrega una parte, EL SISTEMA DEBERÁ enviar
   `POST /machines/{machineId}/parts` con `{name, parentId}`, con `parentId` en `null`
   para una parte de primer nivel.
3. CUANDO el usuario renombra una parte, EL SISTEMA DEBERÁ enviar `PATCH /parts/{id}`
   con solo `{name}`.
4. CUANDO el usuario elimina una parte, EL SISTEMA DEBERÁ enviar `DELETE /parts/{id}`.
5. CUANDO la API responde `409 PART_HAS_CHILDREN`, EL SISTEMA DEBERÁ mostrar que la
   parte tiene sub-partes y conservarla en el árbol.
6. CUANDO la API responde `400 PARENT_PART_NOT_FOUND` o `PARENT_PART_OTHER_MACHINE`,
   EL SISTEMA DEBERÁ mostrar el error y recargar el árbol.
7. EL SISTEMA DEBERÁ dejar de pedir la colección global de partes.

## REQ-8 Órdenes: listado y consulta

1. CUANDO el usuario abre el listado de órdenes, EL SISTEMA DEBERÁ pedir
   `GET /work-orders` con `page` (desde 1) y `size`.
2. CUANDO el usuario busca por título, EL SISTEMA DEBERÁ enviar el parámetro `title`.
3. CUANDO el usuario filtra por estado o prioridad, EL SISTEMA DEBERÁ enviar `status` o
   `priority`, y omitirlos cuando el filtro está vacío.
4. EL SISTEMA DEBERÁ calcular la paginación visible con `totalItems` y `totalPages` de
   la respuesta.
5. CUANDO la respuesta no trae ninguna orden, EL SISTEMA DEBERÁ mostrar el estado vacío
   ya definido.
6. CUANDO la petición falla, EL SISTEMA DEBERÁ mostrar el estado de error con
   "Reintentar", ya definido en la spec 002.
7. CUANDO el usuario abre el detalle de una orden, EL SISTEMA DEBERÁ cargarla con
   `GET /work-orders/{id}` y distinguir `404` ("no existe") de otros fallos
   ("conexión").
8. EL SISTEMA DEBERÁ tratar `createdAt`, `takenBy.at` y `closingNote.at` como instantes
   UTC en ISO-8601.

## REQ-9 Órdenes: alta, edición y baja

1. CUANDO el usuario crea una orden, EL SISTEMA DEBERÁ enviar `POST /work-orders` con
   `{title, description, type, priority, machineRef: {machineId, partId, comment}}` y
   sin `status`, `createdAt` ni `breadcrumb`.
2. CUANDO el alta responde `201`, EL SISTEMA DEBERÁ mostrar el `breadcrumb` y el estado
   recibidos del servidor.
3. CUANDO el alta responde `400` con `MACHINE_NOT_FOUND`, `PART_NOT_FOUND` o
   `PART_OTHER_MACHINE`, EL SISTEMA DEBERÁ mostrar el error en el selector de
   máquina/parte y conservar el resto del formulario.
4. CUANDO el alta responde `400` de validación, EL SISTEMA DEBERÁ mostrar cada error en
   su campo.
5. CUANDO el usuario edita una orden, EL SISTEMA DEBERÁ enviar `PUT /work-orders/{id}`
   solo con `{title, description, priority}`.
6. CUANDO el usuario elimina una orden, EL SISTEMA DEBERÁ enviar
   `DELETE /work-orders/{id}`.
7. CUANDO una de estas operaciones responde `403`, EL SISTEMA DEBERÁ mostrar el mensaje
   de permisos y conservar el estado de la pantalla.
8. CUANDO la edición o la baja responde `404`, EL SISTEMA DEBERÁ mostrar el estado
   "no existe".

## REQ-10 Órdenes: tomar, cerrar y liberar

1. CUANDO un técnico toma una orden, EL SISTEMA DEBERÁ enviar
   `POST /work-orders/{id}/take` sin cuerpo y mostrar la orden devuelta.
2. CUANDO un técnico cierra una orden, EL SISTEMA DEBERÁ enviar
   `POST /work-orders/{id}/close` con `{outcome, comment}`, con el comentario sin
   espacios sobrantes.
3. CUANDO un administrador o team leader libera una orden, EL SISTEMA DEBERÁ enviar
   `POST /work-orders/{id}/release`.
4. EL SISTEMA DEBERÁ mantener en el cliente la validación de 50 a 500 caracteres del
   comentario de cierre antes de enviar.
5. CUANDO la API responde `409 WORK_ORDER_NOT_PENDING`, `WORK_ORDER_NOT_IN_PROGRESS` o
   `WORK_ORDER_TAKEN_BY_OTHER`, EL SISTEMA DEBERÁ mostrar el mensaje de estado ya
   definido en la spec 013d usando `details.status`, `takenById` y `takenByName`.
6. CUANDO una transición responde `409`, EL SISTEMA DEBERÁ recargar la orden para
   mostrar su estado real.
7. CUANDO el `take` responde `403` porque el equipo del técnico no atiende el tipo, EL
   SISTEMA DEBERÁ mostrar el mensaje de permisos.
8. EL SISTEMA DEBERÁ dejar de enviar el dueño o el autor del cierre en el cuerpo, y
   dejar de releer la orden antes de cada transición.

## REQ-11 Dashboard

1. CUANDO el usuario abre el tablero, EL SISTEMA DEBERÁ pedir las cifras con
   `GET /dashboard/summary` sin `from` ni `to`.
2. CUANDO el tablero carga las listas de pendientes, en curso y cerradas hoy, EL SISTEMA
   DEBERÁ obtenerlas con `GET /work-orders` filtradas por `status` y con `size`
   máximo (100).
3. CUANDO un estado tiene más órdenes que las devueltas en la primera página, EL
   SISTEMA DEBERÁ indicar que se muestran las primeras N de `totalItems`.
4. CUANDO el usuario es administrador o team leader, EL SISTEMA DEBERÁ pedir
   `GET /dashboard/workload` y mostrar los técnicos con órdenes en curso.
5. CUANDO el usuario no es administrador ni team leader, EL SISTEMA DEBERÁ no pedir
   `/dashboard/workload` ni mostrar esa sección.
6. CUANDO `averageResolutionMinutes` es `null`, EL SISTEMA DEBERÁ mostrar "Sin datos".
7. CUANDO alguna de las lecturas falla, EL SISTEMA DEBERÁ mostrar el estado de error
   con "Reintentar" ya definido en la spec 014.

## REQ-12 Retiro del mock

1. EL SISTEMA DEBERÁ eliminar `mockApiInterceptor`, `mockDelayInterceptor`,
   `work-order.mock.ts`, `in-memory-api` y su spec.
2. EL SISTEMA DEBERÁ eliminar `db.json`, `db.seed.spec.ts`, el script `api` y la
   dependencia `json-server` de `package.json`.
3. EL SISTEMA DEBERÁ reemplazar los tests de integración que usaban el emulador por
   tests con `HttpTestingController` que fijen el contrato real (ruta, método, cuerpo y
   parámetros).
4. CUANDO se ejecuta `pnpm test`, EL SISTEMA DEBERÁ pasar todos los tests sin necesidad
   de que la API esté levantada.
5. CUANDO se ejecuta `pnpm build` y `pnpm lint`, EL SISTEMA DEBERÁ terminar sin errores.
6. EL SISTEMA DEBERÁ actualizar `README.md` y `CLAUDE.md` para indicar que el backend
   es la API real, cómo levantarla y los usuarios de desarrollo.

## REQ-13 Verificación contra la API real

1. CUANDO la API corre con el perfil `dev`, EL SISTEMA DEBERÁ permitir iniciar sesión
   con cada uno de los cinco usuarios del seed y mostrar el rol y nombre correctos.
2. CUANDO se recorre manualmente el flujo completo con la API real (login, alta de
   máquina y parte, alta de orden, tomar, cerrar, liberar, dashboard), EL SISTEMA
   DEBERÁ completarlo sin errores de CORS ni de contrato.
3. EL SISTEMA DEBERÁ registrar en `notes.md` el resultado de esa verificación manual y
   cualquier discrepancia de contrato encontrada.

---

## Auto-revisión

- **Requisitos mezclados:** REQ-3.10 y REQ-2.3 eran dos ideas; quedaron separados de los
  requisitos vecinos. REQ-4.8 y REQ-7.7 agrupan retiro de código, aceptable porque cada
  uno es una sola acción de borrado verificable por `grep`.
- **Palabras no verificables:** se eliminaron "adecuado" y "correcto"; los mensajes
  citan texto o código de error concreto.
- **Caminos no felices:** cubiertos `400`, `401`, `403`, `404`, `409`, conexión y vacío.
  **Falta confirmar con la API** (anotado en preguntas abiertas) los `code` exactos del
  `409` de baja de técnico y del alta con legajo repetido.

## Preguntas abiertas (a resolver durante el diseño, leyendo el código o Swagger de la API)

1. `code` exacto de los `409` de técnicos (baja bloqueada, legajo duplicado).
2. Valor por defecto de `size` y comportamiento de `title` (¿contiene o exacto?, ¿sin
   distinguir mayúsculas?). El README dice "filtra por título"; se asume "contiene".
3. Si el `401` del login trae un `code` propio, para distinguirlo de un token vencido.
4. Si `GET /work-orders` admite filtrar por fecha de cierre; si no, "cerradas hoy" se
   calcula en cliente sobre la primera página de `completed` y `cancelled`.
