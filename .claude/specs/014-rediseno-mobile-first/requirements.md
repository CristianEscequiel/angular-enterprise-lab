# Spec 014 — Rediseño "Tablero de turno", mobile-first

## Contexto y decisiones

**De dónde sale el pedido.** El usuario pidió aplicar la skill `frontend-design`
para mejorar la aplicación y que sea mobile-first, usando SDD para fijar los
requisitos. Los usuarios principales son técnicos de planta que toman y cierran
órdenes (spec 013d) desde el celular.

**Problemas detectados en el código actual:**

- Los estilos son desktop-first: todos los overrides usan `respond-below` (max-width).
- No se carga ninguna fuente; todo cae a Arial.
- Las 4 listas son `<table>` que solo hacen scroll horizontal en mobile. La de
  órdenes tiene 6 columnas y hasta 5 botones dentro de un `td.d-flex`, que rompe
  el layout de celda de tabla.
- La navegación es un drawer con toggle: sin Escape, sin focus trap, no se cierra
  al navegar.
- El dashboard es un placeholder.
- Los templates usan `justify-end`, una clase que no existe.

**Decisiones tomadas con el usuario:**

- Dirección visual B, "Tablero de turno": teal profundo como chrome, Atkinson
  Hyperlegible Next, señal ámbar solo como relleno.
- Navegación mobile: barra inferior fija. Desde 768px, sidebar siempre visible.
- Alcance: tokens y base, listas como tarjetas, formularios y detalle, dashboard
  con resumen real.

**Fuera de alcance:**

- Modo oscuro.
- Backend real o endpoints nuevos: el dashboard usa `WorkOrderService.getAll()`.
- Cambios en reglas de negocio o permisos.
- Gráficos.
- Reemplazar el `<table>` de las listas por otra estructura DOM: se reflowea con
  CSS para no romper los tests existentes (`tbody tr`, `thead th`).
- Control segmentado de estado en el listado de órdenes: reemplazaría los
  `select` de la spec 012 y rompería sus tests sin aportar algo esencial; la
  franja y el badge ya comunican el estado.

## REQ-1 Tokens y base

1. CUANDO la aplicación carga, EL SISTEMA DEBERÁ renderizar el texto en Atkinson
   Hyperlegible Next, con `system-ui, sans-serif` como respaldo.
2. EL SISTEMA DEBERÁ exponer tokens de color, espaciado, escala tipográfica y
   radios como custom properties CSS en `:root`.
3. EL SISTEMA DEBERÁ escribir todas las media queries de `src/styles/**` como
   `min-width`; las `prefers-*` son la excepción.
4. CUANDO el usuario tiene `prefers-reduced-motion: reduce`, EL SISTEMA DEBERÁ
   desactivar transiciones, animaciones y `scroll-behavior: smooth`, spinner
   incluido (duraciones de 0.01ms como máximo).
5. EL SISTEMA DEBERÁ dar a cada par texto/fondo de la nueva paleta una relación
   de contraste de al menos 4.5:1, y de 3:1 a bordes de UI y foco.
6. EL SISTEMA DEBERÁ definir la clase `justify-end`, usada hoy por los templates
   de máquinas, equipos y partes sin existir en los estilos.

## REQ-2 Layout y navegación

1. CUANDO el viewport es menor a 768px, EL SISTEMA DEBERÁ mostrar una barra de
   navegación inferior fija con las secciones que el rol del usuario puede ver.
2. CUANDO el viewport es de 768px o más, EL SISTEMA DEBERÁ mostrar la navegación
   como sidebar siempre visible, sin botón de toggle.
3. EL SISTEMA DEBERÁ marcar la sección activa con `aria-current="page"` y con un
   indicador visual que no dependa solo del color.
4. EL SISTEMA DEBERÁ dar a cada destino de navegación un área de al menos 44×44px.
5. CUANDO el viewport es menor a 768px, EL SISTEMA DEBERÁ reservar espacio
   inferior en `main` para que la barra no tape contenido, incluyendo
   `safe-area-inset-bottom`.
6. CUANDO el viewport mide 320px de ancho, EL SISTEMA NO DEBERÁ producir scroll
   horizontal en la página.
7. EL SISTEMA DEBERÁ mostrar el usuario logueado y la acción "Cerrar sesión" en
   el header en todos los anchos.
8. MIENTRAS no hay sesión iniciada, EL SISTEMA NO DEBERÁ mostrar ni la barra
   inferior ni el sidebar. _(Agregado al armar el diseño.)_

## REQ-3 Listados (órdenes, máquinas, técnicos, equipos)

1. CUANDO el viewport es menor a 1024px, EL SISTEMA DEBERÁ mostrar cada fila
   como una tarjeta apilada: primero el campo principal, luego pares
   etiqueta/valor, luego las acciones.
2. CUANDO el viewport es de 1024px o más, EL SISTEMA DEBERÁ mostrar el listado
   como tabla. _(Enmendado en T12: el borrador decía 768px. Con el sidebar de
   16rem visible desde 768px el contenido mide ~512px y la tabla de órdenes, de 6
   columnas, quedaba cortada con las columnas Estado y Acciones fuera de vista. A
   1024px el contenido mide ~720px y entra.)_
3. EL SISTEMA DEBERÁ mostrar el estado de cada orden como franja de color en la
   tarjeta o fila, además del badge con texto.
4. EL SISTEMA DEBERÁ colocar las acciones de fila en un contenedor que haga wrap,
   con botones de al menos 44px de alto en mobile.
5. CUANDO el listado está vacío o falla la carga, EL SISTEMA DEBERÁ conservar los
   mensajes y el comportamiento actuales; solo cambia el estilo.
6. EL SISTEMA DEBERÁ mantener utilizables a 320px, sin desborde, el buscador, los
   filtros y el botón "Nueva orden".

## REQ-4 Formularios y detalle

1. CUANDO el viewport es de 768px o más, EL SISTEMA DEBERÁ disponer en dos
   columnas los campos emparejados de un formulario (por ejemplo tipo y
   prioridad).
2. CUANDO el viewport es menor a 768px, EL SISTEMA DEBERÁ mostrar las acciones
   principales de cada formulario en una barra fija sobre la navegación inferior.
3. EL SISTEMA DEBERÁ conservar los mensajes de error vinculados a su campo
   (`aria-describedby`), como hoy.
4. EL SISTEMA DEBERÁ mostrar el detalle de una orden en este orden: número de
   orden y estado (con su texto en español), título, máquina › parte, prioridad,
   tipo y fecha de creación, descripción, y quién la tomó. _(Enmendado al
   implementar T7: el borrador decía "código", "creador" y "acciones". `WorkOrder`
   no tiene `createdBy`, el "código" es el `id`, y esta pantalla no tiene acciones
   salvo "Volver a Lista", que ya está en el encabezado. Se reemplazó por lo que el
   modelo sí tiene; agregar un creador o acciones en el detalle es otra spec.)_
5. CUANDO la orden está cerrada, EL SISTEMA DEBERÁ mostrar su nota de cierre
   (autor, fecha, comentario) como bloque propio en el detalle.

## REQ-5 Dashboard "Turno de hoy"

1. CUANDO un usuario autenticado abre `/dashboard`, EL SISTEMA DEBERÁ mostrar tres
   columnas, Pendientes, En curso y Cerradas hoy, cada una con su cantidad.
2. EL SISTEMA DEBERÁ mostrar, bajo Pendientes, cuántas son de prioridad alta.
3. EL SISTEMA DEBERÁ mostrar, bajo En curso, cuántas pertenecen al usuario actual
   (`takenBy.id`).
4. EL SISTEMA DEBERÁ contar como "Cerradas hoy" solo las órdenes cuyo
   `closingNote.at` cae en la fecha local actual.
5. CUANDO el usuario actual tiene órdenes en curso, EL SISTEMA DEBERÁ listarlas
   como enlaces a su detalle.
6. CUANDO el usuario actual no tiene órdenes en curso, EL SISTEMA DEBERÁ mostrar un
   mensaje y un enlace al listado de órdenes pendientes.
7. MIENTRAS los datos cargan, EL SISTEMA DEBERÁ mostrar un estado de carga con
   `role="status"`.
8. CUANDO la carga falla, EL SISTEMA DEBERÁ mostrar una alerta de error con un
   botón "Reintentar" que repita la solicitud.
9. CUANDO el viewport es menor a 768px, EL SISTEMA DEBERÁ mostrar las tres
   columnas como una fila de 3 celdas con cantidades, con la lista "Mis órdenes
   en curso" debajo.
10. CUANDO el viewport es de 768px o más, EL SISTEMA DEBERÁ listar bajo cada
    columna hasta 3 órdenes como enlaces a su detalle, de la más reciente a la
    más antigua (`createdAt` en Pendientes y En curso, `closingNote.at` en
    Cerradas hoy). _(Agregado al armar el diseño: era el elemento distintivo del
    tablero y no tenía requisito.)_

## REQ-6 Accesibilidad (transversal)

1. EL SISTEMA DEBERÁ mostrar un indicador de foco visible, de al menos 3:1, en
   todo elemento interactivo.
2. EL SISTEMA DEBERÁ mantener un único `h1` por página; el título del sitio en el
   header deja de ser un `h2`.
3. EL SISTEMA DEBERÁ conservar el skip link a `#main-content`, funcionando con la
   barra inferior presente.

## Auto-revisión

- REQ-2.1 y 2.2 eran un solo requisito unido por "y": separados por viewport.
- "Legible" reemplazado por criterios medibles (fuente concreta y contraste).
- Agregados REQ-5.6 (estado vacío) y REQ-5.8 (falla de dependencia).
- Enmienda durante el diseño: agregado REQ-5.10 (top 3 por columna en desktop).
  Agregado también REQ-2.8 (sin sesión no hay navegación), hallazgo al leer
  `app-shell.html`: hoy el hamburguesa aparece incluso en `/login`.
- Enmienda durante T12 (verificación en navegador): REQ-3.1 y 3.2 pasan el corte
  tarjeta ↔ tabla de 768px a 1024px.
- Enmienda durante T7: REQ-4.4 ajustado al modelo real (sin creador ni acciones en
  el detalle). El pie del detalle mostraba el estado crudo en inglés
  (`in-progress`); ahora usa el mismo texto y badge que el listado.
- Sin roles nuevos: los permisos siguen siendo los de 011 y 013b; la barra
  inferior solo filtra los ítems como ya lo hace el sidebar.
