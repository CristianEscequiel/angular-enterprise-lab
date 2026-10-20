# Requisitos: Portada pública y página "Acerca de"

## Contexto y decisiones

- **Origen:** pedido del usuario: hoy, al entrar a la app, las rutas están protegidas y quien no
  tiene sesión cae directo en el login (`/` → `/dashboard` → `authGuard` → `/login`). No hay
  ninguna pantalla que explique qué hace la aplicación.
- **Decisiones del usuario:**
  - La portada se complementa con una página **"Acerca de"** que también puede ver quien ya
    tiene sesión.
  - Contenido solo con **texto y tarjetas**; sin capturas ni ilustraciones por ahora.
  - Tono **de producto, para usuarios de planta**: lenguaje de mantenimiento, sin stack técnico
    ni mención al repositorio.
- **Decisiones de diseño de la spec (a confirmar al aprobar):**
  - Una sola página (`AboutPage`) atendida por dos rutas: `/` (portada, para quien no tiene
    sesión) y `/acerca-de` (para todos, sin redirecciones).
  - El enlace "Acerca de" va en el **header**, no en el sidebar ni en la barra inferior: ahí
    ya hay hasta cinco secciones y el enlace aplica también sin sesión.
  - El ítem "Inicio" de la navegación sigue apuntando a `/dashboard` y no se renombra; la
    portada se llama "Acerca de" para no chocar con él.
  - Una vez iniciada la sesión, el destino por defecto sigue siendo `/dashboard`
    (`DEFAULT_RETURN_URL`); el flujo de `returnUrl` no cambia.
  - **Nombre visible del producto:** "Centro de Gestión de Mantenimiento", el mismo que ya
    muestra el header. El `h1` de la página lo usa. El **título del documento** sigue la
    convención de todas las páginas del repo (`<página> | Angular Enterprise Lab`): es la
    única aparición del nombre del repositorio y no forma parte del contenido de la página.
  - **"Sesión"** significa lo que ya usa `authGuard`: `AuthService.isAuthenticated()` es
    verdadero. Un token vencido o inválido se trata como sin sesión por ese mismo servicio; esta
    spec no cambia esa definición.
  - El logo/título del header **no cambia** y no es un enlace.
- **Hallazgo que condiciona la implementación:** `app.routes.ts` hoy tiene `'' → redirectTo:
'dashboard'`, y `app.routes.spec.ts` asume ese comportamiento; esos tests se actualizan.
- **Regla del repo:** la autorización real es de la API. Esta spec no agrega ningún permiso:
  la página es informativa y no hace llamadas HTTP.
- **Veracidad del contenido:** lo que la página dice de cada rol coincide con la matriz de
  permisos vigente del cliente (`work-order.permissions.ts`, `maintenance.permissions.ts`,
  `machines.permissions.ts`), no con una descripción aspiracional. REQ-4 fija las acciones
  literales de cada rol; el texto de redacción se aprueba en `design.md`.

## Fuera de alcance

- Capturas de pantalla, ilustraciones o videos.
- Modo oscuro propio de la página o personalización de tema.
- Contenido editable desde la API o un CMS; textos en otros idiomas.
- Mención, en el contenido visible de la página, del stack técnico, del repositorio o del
  propósito de portfolio.
- SEO, renderizado en servidor y analítica.
- Cambios en el backend y en el flujo de login, logout o `returnUrl`.
- Renombrar el ítem "Inicio" de la navegación o convertir el logo del header en enlace.
- Cambiar el título de las demás páginas.

## REQ-1: Portada para quien no tiene sesión

**Historia de usuario:** Como visitante sin sesión, quiero ver una presentación de la
aplicación al entrar, para entender qué hace antes de iniciar sesión.

### Criterios de aceptación

1. CUANDO un usuario sin sesión navega a `/` EL SISTEMA DEBERÁ mostrar la página "Acerca de"
   sin redirigirlo a `/login`.
2. CUANDO un usuario sin sesión navega a `/` EL SISTEMA DEBERÁ conservar la URL `/` en la barra
   de direcciones.
3. CUANDO se muestra la página EL SISTEMA DEBERÁ NO enviar ninguna petición a la API.

## REQ-2: Usuario con sesión en la raíz

**Historia de usuario:** Como usuario con sesión, quiero que al abrir la raíz de la app vaya
directo a mi trabajo, para no pasar por la presentación cada vez.

### Criterios de aceptación

1. CUANDO un usuario con sesión navega a `/` EL SISTEMA DEBERÁ redirigirlo a `/dashboard`.
   (Si la URL trae un `returnUrl` interno válido, p. ej. `/?returnUrl=/work-orders`, se respeta
   ese destino: es el comportamiento de `guestGuard` y el valor está saneado. Ver `design.md`.)
2. CUANDO un usuario sin sesión navega a `/dashboard` EL SISTEMA DEBERÁ redirigirlo a `/login`
   conservando `returnUrl=/dashboard`, como hoy.

## REQ-3: Qué hace la aplicación

**Historia de usuario:** Como visitante, quiero leer qué resuelve la aplicación, para saber si
es para mí.

### Criterios de aceptación

1. CUANDO se muestra la página EL SISTEMA DEBERÁ presentar un único encabezado de nivel 1 con
   el texto "Centro de Gestión de Mantenimiento".
2. CUANDO se muestra la página EL SISTEMA DEBERÁ mostrar bajo el `h1` una frase que contenga
   las palabras "órdenes de mantenimiento".
3. CUANDO se muestra la página EL SISTEMA DEBERÁ describir el recorrido de una orden con estos
   cinco pasos, en este orden: crear, tomar, cerrar, liberar y cancelar.
4. CUANDO se muestra la página EL SISTEMA DEBERÁ NO incluir ningún elemento `img`, `svg` ni
   `picture`, solo texto y tarjetas.

## REQ-4: Para quién es la aplicación

**Historia de usuario:** Como usuario de planta, quiero ver qué puede hacer cada rol, para
reconocer el mío.

### Criterios de aceptación

1. CUANDO se muestra la página EL SISTEMA DEBERÁ mostrar exactamente cuatro tarjetas de rol,
   con estos títulos: "Administrador", "Team Leader de Mantenimiento", "Personal de
   Producción" y "Técnico".
2. CUANDO se muestra la tarjeta de Administrador EL SISTEMA DEBERÁ listar estas acciones:
   editar órdenes, eliminar órdenes, liberar órdenes, cancelar órdenes, gestionar máquinas y
   gestionar técnicos.
3. CUANDO se muestra la tarjeta de Team Leader de Mantenimiento EL SISTEMA DEBERÁ listar estas
   acciones: crear órdenes preventivas y correctivas, editar órdenes, liberar órdenes,
   cancelar órdenes, gestionar máquinas, gestionar técnicos y gestionar equipos.
4. CUANDO se muestra la tarjeta de Personal de Producción EL SISTEMA DEBERÁ listar la acción:
   crear órdenes de pronto intervención.
5. CUANDO se muestra la tarjeta de Técnico EL SISTEMA DEBERÁ listar estas acciones: tomar
   órdenes según su tipo de equipo y cerrar las órdenes que tomó.
   > **Enmienda (2026-10-20, durante la fase de diseño):** el texto original decía "tomar
   > órdenes y cerrar órdenes, ambas según su especialidad y tipo de equipo". La matriz vigente
   > (`work-order.permissions.ts`) no lo respalda: `canTakeWorkOrder` evalúa solo el tipo de
   > equipo, y `canResolveWorkOrder` exige ser el dueño de la orden en curso. La especialidad
   > solo interviene en `canTechnicianHandle`, que no se usa para tomar.
6. CUANDO se muestra una tarjeta de rol EL SISTEMA DEBERÁ NO listar una acción que la matriz
   de permisos del cliente no le otorga a ese rol.

## REQ-5: Qué se puede hacer en la aplicación

**Historia de usuario:** Como visitante, quiero ver las áreas de la aplicación, para tener una
idea de su alcance.

### Criterios de aceptación

1. CUANDO se muestra la página EL SISTEMA DEBERÁ mostrar una tarjeta por cada una de estas
   áreas: "Órdenes de trabajo", "Máquinas y partes", "Técnicos y equipos" y "Tablero de turno".
2. CUANDO se muestra una tarjeta de área EL SISTEMA DEBERÁ incluir un título y una descripción
   de una o dos oraciones.

## REQ-6: Acceso al login desde la página

**Historia de usuario:** Como visitante, quiero un camino claro para iniciar sesión, para
entrar cuando termine de leer.

### Criterios de aceptación

1. CUANDO un usuario sin sesión ve la página EL SISTEMA DEBERÁ mostrar un botón "Iniciar
   sesión" junto al `h1`.
2. CUANDO un usuario sin sesión ve la página EL SISTEMA DEBERÁ mostrar un segundo botón
   "Iniciar sesión" al final del contenido.
3. CUANDO un usuario sin sesión activa un botón "Iniciar sesión" EL SISTEMA DEBERÁ navegar a
   `/login` sin `returnUrl`.
4. CUANDO un usuario inicia sesión llegando desde la página EL SISTEMA DEBERÁ llevarlo a
   `/dashboard`.
5. CUANDO un usuario con sesión ve la página EL SISTEMA DEBERÁ mostrar un botón "Ir al tablero"
   en lugar de "Iniciar sesión".
6. CUANDO un usuario con sesión activa "Ir al tablero" EL SISTEMA DEBERÁ navegar a
   `/dashboard`.

## REQ-7: Página "Acerca de" accesible con y sin sesión

**Historia de usuario:** Como usuario con o sin sesión, quiero abrir "Acerca de" cuando
quiera, para releer qué hace la aplicación.

### Criterios de aceptación

1. CUANDO un usuario sin sesión navega a `/acerca-de` EL SISTEMA DEBERÁ mostrar la página sin
   redirigirlo.
2. CUANDO un usuario con sesión navega a `/acerca-de` EL SISTEMA DEBERÁ mostrar la página sin
   redirigirlo a `/dashboard`.
3. CUANDO un usuario con sesión está en `/acerca-de` EL SISTEMA DEBERÁ mantener visible el
   sidebar (desde `md`).
4. CUANDO un usuario con sesión está en `/acerca-de` EL SISTEMA DEBERÁ mantener visible la
   barra inferior (mobile).

## REQ-8: Enlace "Acerca de" en el header

**Historia de usuario:** Como usuario, quiero un enlace a "Acerca de" siempre a mano, para no
tener que recordar la URL.

### Criterios de aceptación

1. CUANDO no hay sesión, en cualquier ruta (incluidas `/login` y la página 404), EL SISTEMA
   DEBERÁ mostrar en el header un enlace "Acerca de" que navega a `/acerca-de`.
2. CUANDO hay sesión EL SISTEMA DEBERÁ mostrar en el header el enlace "Acerca de" junto al
   nombre del usuario y al botón "Cerrar sesión".
3. CUANDO el usuario activa el enlace "Acerca de" EL SISTEMA DEBERÁ navegar a `/acerca-de`
   sin cerrar la sesión.
4. CUANDO se muestran el sidebar y la barra inferior EL SISTEMA DEBERÁ NO incluir "Acerca de"
   entre sus ítems.

## REQ-9: Las rutas protegidas no cambian

**Historia de usuario:** Como administrador del sistema, quiero que agregar la portada no abra
acceso a ninguna sección privada, para mantener la seguridad actual.

### Criterios de aceptación

1. CUANDO un usuario sin sesión navega a `/work-orders`, `/maintenance` o `/machines` EL
   SISTEMA DEBERÁ redirigirlo a `/login` conservando `returnUrl`.
2. CUANDO un usuario con sesión navega a `/login` EL SISTEMA DEBERÁ redirigirlo a su
   `returnUrl` o a `/dashboard`, como hoy.
3. CUANDO un usuario navega a una URL inexistente EL SISTEMA DEBERÁ mostrar la página 404.
4. CUANDO un usuario con sesión ve el sidebar y la barra inferior EL SISTEMA DEBERÁ mostrar los
   mismos ítems por rol que antes de esta spec.

## REQ-10: Título del documento

**Historia de usuario:** Como usuario, quiero que la pestaña del navegador diga dónde estoy,
para ubicarme entre varias pestañas.

### Criterios de aceptación

1. CUANDO se muestra la página, en `/` o en `/acerca-de`, EL SISTEMA DEBERÁ fijar el título
   del documento como `Acerca de | Angular Enterprise Lab`.

## Requisitos no funcionales

- NFR-1 (accesibilidad): la página tiene un único `h1`, encabezados sin saltos de nivel,
  landmarks (`main` ya provisto por el shell) y pasa `pnpm lint` con las reglas de
  accesibilidad de templates existentes.
- NFR-2 (responsive): a 360 px de ancho no hay scroll horizontal y las tarjetas se apilan en
  una columna; desde 768 px se acomodan en dos o más columnas.
- NFR-3 (carga diferida): la página se carga con `loadComponent()`, como el resto de las
  páginas, y no aumenta el bundle inicial.
- NFR-4 (idioma): todo el texto visible de la página está en español neutro y no contiene los
  términos "Angular", "API", "JWT", "token", "repositorio" ni "Spring".
- NFR-5 (consistencia con los permisos): existe un test que, para cada acción listada en las
  tarjetas de rol (REQ-4), verifica contra `work-order.permissions.ts`,
  `maintenance.permissions.ts` y `machines.permissions.ts` que ese rol la tiene, y falla si una
  tarjeta lista una acción que el rol no tiene (REQ-4.6).
- NFR-6 (cobertura): los componentes y guards nuevos cuentan con tests, y `pnpm lint`,
  `ng test` y `pnpm build` siguen en verde.

## Preguntas abiertas

- Texto de redacción de la frase del hero y de las descripciones de las tarjetas: se escribe
  en `design.md` y se aprueba junto con el diseño. Los requisitos fijan solo lo verificable
  (palabras clave, títulos, acciones por rol).

## Verificación final

<!-- Completar al cerrar la spec, después de terminar tasks.md. Recorrer
     cada criterio de aceptación con sí/no y una línea de evidencia. -->

Verificado por `spec-verifier` el 2026-10-20. `ng test` 2058/2058 (69 archivos), `pnpm lint` y
`pnpm build` en verde, los 8 hashes del baseline coinciden. Chunk lazy `about-page` de 6.15 kB.

| Criterio                      | ¿Cumplido?  | Evidencia                                                                                                                                                                                                            |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-1.1                       | SÍ          | `app.routes.spec.ts:440` y `:469`; ruta `''` con `guestGuard` y `loadComponent` en `app.routes.ts`                                                                                                                   |
| REQ-1.2                       | SÍ          | `app.routes.spec.ts:450`                                                                                                                                                                                             |
| REQ-1.3                       | SÍ          | `about-page.spec.ts:60`, `app.routes.spec.ts:459`; la página no importa `HttpClient`                                                                                                                                 |
| REQ-2.1                       | SÍ          | `app.routes.spec.ts:549`, `:558` (desviación aceptada) y `:564`                                                                                                                                                      |
| REQ-2.2                       | SÍ          | `app.routes.spec.ts:481`                                                                                                                                                                                             |
| REQ-3.1                       | SÍ          | `about-page.spec.ts:69`; `about-page.html:3`                                                                                                                                                                         |
| REQ-3.2                       | SÍ          | `about-page.spec.ts:76`, `about-content.spec.ts:21`                                                                                                                                                                  |
| REQ-3.3                       | SÍ          | `about-page.spec.ts:87`, `about-content.spec.ts:25`                                                                                                                                                                  |
| REQ-3.4                       | SÍ          | `about-page.spec.ts:102`                                                                                                                                                                                             |
| REQ-4.1                       | SÍ          | `about-page.spec.ts:141`, `about-content.spec.ts:38`                                                                                                                                                                 |
| REQ-4.2                       | SÍ          | `about-page.spec.ts:152`, `about-content.spec.ts:47`                                                                                                                                                                 |
| REQ-4.3                       | SÍ          | `about-page.spec.ts:152`, `about-content.spec.ts:58`                                                                                                                                                                 |
| REQ-4.4                       | SÍ          | `about-page.spec.ts:152`, `about-content.spec.ts:70`                                                                                                                                                                 |
| REQ-4.5                       | SÍ          | `about-content.spec.ts:74`, `about-page.spec.ts:152` (texto enmendado)                                                                                                                                               |
| REQ-4.6                       | SÍ          | `about-content.spec.ts:158` (cada acción contra los predicados reales; prueba "no lista de más")                                                                                                                     |
| REQ-5.1                       | SÍ          | `about-page.spec.ts:170`, `about-content.spec.ts:81`                                                                                                                                                                 |
| REQ-5.2                       | SÍ          | `about-content.spec.ts:90`, `about-page.spec.ts:170`                                                                                                                                                                 |
| REQ-6.1                       | SÍ          | `about-page.spec.ts:181`; `about-page.html:6-8`                                                                                                                                                                      |
| REQ-6.2                       | SÍ          | `about-page.spec.ts:188`; `about-page.html:50-54`                                                                                                                                                                    |
| REQ-6.3                       | SÍ          | `about-page.spec.ts:198` y `:207`                                                                                                                                                                                    |
| REQ-6.4                       | SÍ          | `app.routes.spec.ts:490`                                                                                                                                                                                             |
| REQ-6.5                       | SÍ          | `about-page.spec.ts:218` y `:229`                                                                                                                                                                                    |
| REQ-6.6                       | SÍ          | `about-page.spec.ts:236` y `:244`                                                                                                                                                                                    |
| REQ-7.1                       | SÍ          | `app.routes.spec.ts:507`                                                                                                                                                                                             |
| REQ-7.2                       | SÍ          | `app.routes.spec.ts:570`                                                                                                                                                                                             |
| REQ-7.3                       | SÍ (DOM)    | `app.routes.spec.ts:1296`; la visibilidad desde `md` es CSS, sin probar en navegador (T6)                                                                                                                            |
| REQ-7.4                       | SÍ (DOM)    | `app.routes.spec.ts:1308`; misma salvedad de CSS (T6)                                                                                                                                                                |
| REQ-8.1                       | SÍ          | `header.spec.ts:82` y `:93`, `app.routes.spec.ts:1263`; `header.html:4`                                                                                                                                              |
| REQ-8.2                       | SÍ (DOM)    | `header.spec.ts:103`, `app.routes.spec.ts:1274`; falta comprobar que no desborde en mobile (T6)                                                                                                                      |
| REQ-8.3                       | SÍ          | `header.spec.ts:122`, `app.routes.spec.ts:1283`                                                                                                                                                                      |
| REQ-8.4                       | SÍ          | `app.routes.spec.ts:1319`                                                                                                                                                                                            |
| REQ-9.1                       | SÍ          | `app.routes.spec.ts:517`                                                                                                                                                                                             |
| REQ-9.2                       | SÍ          | `app.routes.spec.ts:579`                                                                                                                                                                                             |
| REQ-9.3                       | SÍ          | `app.routes.spec.ts:529` y `:589`                                                                                                                                                                                    |
| REQ-9.4                       | SÍ          | `nav-items.spec.ts:64`, `sidebar.spec.ts:198`, `bottom-nav.spec.ts:90`; sin cambios de producción en la navegación                                                                                                   |
| REQ-10.1                      | SÍ          | `app.routes.spec.ts:595`; `ABOUT_TITLE` en ambas rutas                                                                                                                                                               |
| NFR-1                         | SÍ          | `about-page.spec.ts:256`, `pnpm lint` en verde                                                                                                                                                                       |
| NFR-2                         | SÍ (manual) | Verificado a mano por el usuario el 2026-10-20 (T6), sin problemas: 320 y 360 px (sin scroll horizontal, una columna, header legible con y sin sesión) y desde 768 px (dos o más columnas). Sin registro de capturas |
| NFR-3                         | SÍ          | `loadComponent()` en ambas rutas; chunk lazy `about-page` en `pnpm build`. No hay umbral numérico ni baseline previo                                                                                                 |
| NFR-4                         | SÍ          | `about-content.spec.ts:170`; revisión manual de `about-page.html`                                                                                                                                                    |
| NFR-5                         | SÍ          | `about-content.spec.ts:102` y `:158`                                                                                                                                                                                 |
| NFR-6                         | SÍ          | Tests de página y componentes, `ng test`, `lint` y `build` en verde; sin guards nuevos                                                                                                                               |
| Foco visible por teclado (T6) | SÍ (manual) | Verificado a mano por el usuario el 2026-10-20, sin problemas; `.header__link:focus-visible` existe en `_shell.scss`                                                                                                 |

Las salvedades de REQ-7.3, 7.4 y 8.2 (aspecto visual en mobile y desde `md`) quedan cubiertas por
la verificación manual de T6.

---

**Estado:** Implementada y cerrada. Todos los criterios cumplidos; NFR-2 y el foco por teclado se verificaron a mano.
