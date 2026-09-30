# Notas 014: ejecución y cierre

## Resultado

70 archivos / 2063 tests en verde (baseline medida al empezar: 66 archivos / 1961 tests, +102 tests,
+4 archivos). `pnpm ng build` sin errores ni warnings de presupuesto. Cobertura tras la spec:
Statements 98.39%, Branches 97.98%, Functions 97.00%, Lines 99.27%.

Una tarea por commit (T1–T12 en 11 commits; T8 y T9 juntas). El hook de Husky corrió la suite completa
en cada uno.

## Qué se implementó

- **T1 base:** tokens como propiedades CSS (`--color-chrome`, `--color-signal`, espaciado, escala
  tipográfica, radios, `--bottom-nav-h`), Atkinson Hyperlegible Next, reduced-motion global, utilidad
  `justify-end` (no existía y tres templates la usaban).
- **T2 componentes:** botones, inputs y paginación a 44px, sin lift ni sombras en botones y tarjetas,
  badge rectangular, radios de 4/6/8px. Las clases no cambiaron.
- **T3 + T4 shell:** `layout/nav-items.ts` (ítems por rol, compartidos), `BottomNav` nuevo, `Sidebar`
  sin drawer, `Header` sin hamburguesa y con el título como `<p>`. Sin sesión no hay navegación.
- **T5 listas:** tabla → tarjeta solo con CSS, `data-label` en cada celda, acciones en `.row-actions`,
  franja `row--<estado>` en las órdenes.
- **T6 formularios:** cada campo en su `.form-group`, pares en `.form-row`, acciones en `.form-actions`
  (sticky sobre la barra inferior en mobile).
- **T7 detalle:** número de orden y badge de estado arriba, cierre como bloque propio.
- **T8 + T9 + T10 dashboard:** `isSameLocalDay`, `buildShiftBoard` (función pura), página con carga,
  error con reintento y vacío, y el layout del tablero.
- **T11 auditoría:** toast y grids a mobile-first; `respond-below` eliminado.
- **T12 verificación:** en Chrome real (ver abajo). Encontró dos defectos que los tests no podían ver.

## Desvíos respecto de la spec original

Todos quedaron escritos en `requirements.md` / `design.md` al ocurrir:

1. **REQ-2.8 y REQ-5.10 agregados** al armar el diseño: el hamburguesa aparecía incluso en `/login`, y el
   "top 3 por columna" era el elemento distintivo del tablero sin requisito.
2. **REQ-4.4 enmendado en T7:** el borrador pedía "código", "creador" y "acciones". `WorkOrder` no tiene
   `createdBy`, el código es el `id` y el detalle no tiene acciones salvo "Volver a Lista". Se mostró lo
   que el modelo sí tiene. Además el pie mostraba el estado crudo en inglés (`in-progress`).
3. **REQ-3.1 y 3.2 enmendados en T12:** el corte tarjeta ↔ tabla pasó de 768px a **1024px**. Con el
   sidebar de 16rem visible desde 768px el contenido mide ~512px y la tabla de órdenes (6 columnas)
   quedaba cortada con Estado y Acciones fuera de vista. Las métricas de scroll horizontal no lo
   detectaron (el wrapper tenía `overflow-x: auto`); lo encontró una captura.
4. **Nombres de borde:** el diseño proponía `--color-border-control`; el repo ya tenía `--color-border`
   (3.53:1, spec 008b) como borde de control y `--color-border-subtle` como decorativo. Se reusaron esos
   nombres en vez de redefinir `--color-border`, que habría debilitado todos los controles.
5. **`--font-size-sm` se queda en 0.875rem** (el diseño decía 0.8rem): 12.8px es chico para leer de pie.
6. **`buildShiftBoard` en vez de `computed` sueltos** (D7).
7. **`btn--sm` compacto desde lg, no md**, por la enmienda 3.

## Verificación criterio por criterio

Evidencia: **T** = test automatizado, **N** = medido en Chrome (puppeteer-core contra `pnpm start` +
JSON Server, a 320/375/768/1024/1280px, seed con 32 órdenes), **G** = revisión del código/`grep`.

| Criterio                                      | ¿Se cumple?     | Evidencia                                                                                                                                                                                                                                         |
| --------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-1.1 fuente                                | Sí              | N: `Atkinson Hyperlegible Next` cargada (`document.fonts.check` = true)                                                                                                                                                                           |
| REQ-1.2 tokens como CSS vars                  | Sí              | G: `themes/_default.scss` (color, espaciado, tipo, radios, `--bottom-nav-h`)                                                                                                                                                                      |
| REQ-1.3 solo `min-width`                      | Sí              | G: `grep respond-below\|@media (max-width` en `src` solo encuentra un comentario                                                                                                                                                                  |
| REQ-1.4 reduced-motion                        | Sí              | N: con `reduce`, transición de botones = `1e-05s`, `scroll-behavior: auto`; sin `reduce`, `smooth`. La regla global cubre también `animation-duration` (no se midió una animación en vivo)                                                        |
| REQ-1.5 contraste                             | Sí, con alcance | Pares de la paleta nueva medidos con script (`design.md` §1, todos ≥ 4.5:1 / 3:1). Los colores semánticos de badge y alert no cambiaron desde 008b y no se re-midieron                                                                            |
| REQ-1.6 `justify-end`                         | Sí              | G: `utilities/_display.scss`                                                                                                                                                                                                                      |
| REQ-2.1 barra inferior < 768px                | Sí              | N: 64px a 320 y 375px; T: `bottom-nav.spec`, `app-shell.spec` (ítems por rol)                                                                                                                                                                     |
| REQ-2.2 sidebar ≥ 768px sin toggle            | Sí              | N: 256px a 768/1024/1280; T: header sin botón ni `aria-controls`                                                                                                                                                                                  |
| REQ-2.3 activa con `aria-current` + indicador | Sí              | T: `aria-current` y clase activa; G: franja de señal y peso 700 (no solo color)                                                                                                                                                                   |
| REQ-2.4 objetivos ≥ 44×44                     | Sí, con alcance | Barra: 64px de alto y ≥ 64px de ancho por ítem a 320px; sidebar: `min-height: 2.75rem`. Por construcción, **no medido directamente**                                                                                                              |
| REQ-2.5 `main` reserva espacio                | Parcial         | N: con la barra presente, el último elemento de `main` queda sobre la barra en las 9 pantallas a 320 y 375px. **`env(safe-area-inset-bottom)` no es verificable** en Chrome de escritorio (vale 0); queda sin probar en un dispositivo con muesca |
| REQ-2.6 sin scroll horizontal a 320px         | Sí              | N: `overflowX=false` en las 10 pantallas recorridas                                                                                                                                                                                               |
| REQ-2.7 usuario y cerrar sesión               | Sí              | T: `app-shell.spec`; N: visibles a 375 (nombre truncado con `…`) y 1280                                                                                                                                                                           |
| REQ-2.8 sin sesión, sin navegación            | Sí              | T: `app-shell.spec`; N: `/login` sin barra ni sidebar a los 4 anchos                                                                                                                                                                              |
| REQ-3.1 tarjetas < 1024px                     | Sí              | N: capturas a 320, 375 y 768; T: `data-label` = encabezado de su columna en los 4 listados                                                                                                                                                        |
| REQ-3.2 tabla ≥ 1024px                        | Sí              | N: capturas a 1024 y 1280, seis columnas visibles                                                                                                                                                                                                 |
| REQ-3.3 franja de estado + badge              | Sí              | T: `row--<estado>` y texto del badge; N: captura                                                                                                                                                                                                  |
| REQ-3.4 acciones con wrap, 44px en mobile     | Sí              | T: `.row-actions` contiene todos los botones; N: 0 objetivos < 44px a 320, 375 y 768px (tras el arreglo de T12)                                                                                                                                   |
| REQ-3.5 vacío y error sin cambios             | Sí              | T: los specs de listados existentes pasan sin modificarse                                                                                                                                                                                         |
| REQ-3.6 toolbar a 320px                       | Sí              | N: sin desborde; captura con buscador, botón y filtros apilados                                                                                                                                                                                   |
| REQ-4.1 pares en 2 columnas ≥ 768px           | Sí              | N: a 768 y 1280 tipo y prioridad comparten `top`; a 375 van apilados                                                                                                                                                                              |
| REQ-4.2 barra de acciones sobre la navegación | Sí              | N: a 375, `.form-actions` es `sticky` y su `bottom` (736) = `top` de la barra (736); desde 768, `static`                                                                                                                                          |
| REQ-4.3 errores vinculados                    | Sí              | T: todo `aria-invalid` apunta a un `aria-describedby` que existe                                                                                                                                                                                  |
| REQ-4.4 orden del detalle                     | Sí              | T: orden de los bloques y estado en español; N: captura a 375                                                                                                                                                                                     |
| REQ-4.5 nota de cierre                        | Sí              | T: bloque propio y rotulado; N: orden 3 (completada) muestra `section#closing-note`                                                                                                                                                               |
| REQ-5.1 tres columnas con cantidad            | Sí              | T y N: 12 / 9 / 0 con el seed                                                                                                                                                                                                                     |
| REQ-5.2 altas pendientes                      | Sí              | T; N: "3 de prioridad alta"                                                                                                                                                                                                                       |
| REQ-5.3 en curso: cuántas mías                | Sí              | T; N: técnico ve "1 es tuya"                                                                                                                                                                                                                      |
| REQ-5.4 cerradas hoy por fecha de cierre      | Sí              | T: bordes del día, ayer, cierre ≠ creación. N: el seed no tiene cierres de hoy, se ve 0                                                                                                                                                           |
| REQ-5.5 mías como enlaces                     | Sí              | T: `href="/work-orders/:id"`; N: 1 enlace para el técnico                                                                                                                                                                                         |
| REQ-5.6 sin en curso: mensaje y enlace        | Sí              | T y N                                                                                                                                                                                                                                             |
| REQ-5.7 carga con `role="status"`             | Sí              | T: `p[role=status]` antes de la respuesta                                                                                                                                                                                                         |
| REQ-5.8 error con Reintentar                  | Sí              | T y N: petición abortada → alerta; al volver el servidor, Reintentar trae 12/9/0                                                                                                                                                                  |
| REQ-5.9 mobile: fila de cifras + mías         | Sí              | N: captura a 375                                                                                                                                                                                                                                  |
| REQ-5.10 desktop: top 3 por columna           | Sí              | T: máximo 3, más reciente primero; N: captura a 1280                                                                                                                                                                                              |
| REQ-6.1 foco visible                          | Sí              | N: 44 elementos enfocados con Tab a 375 y a 1280, todos con contorno sólido ≥ 2px (primario sobre claro, señal sobre chrome: 6.89 y 6.77:1)                                                                                                       |
| REQ-6.2 un solo `h1`                          | Sí              | N: `h1 = 1` en las 10 pantallas × 4 anchos; T: header sin encabezados                                                                                                                                                                             |
| REQ-6.3 skip link                             | Sí              | N: primer Tab cae en el skip link y el Enter va a `#main-content`                                                                                                                                                                                 |

**Resumen:** 37 de 38 criterios verificados como "Sí" (algunos con el alcance indicado en la tabla: REQ-1.5,
REQ-2.4). **REQ-2.5 queda parcial**: la reserva de espacio está comprobada, pero la zona segura del
dispositivo no.

## Hallazgos de la verificación (T12)

1. **La tabla de órdenes quedaba cortada a 768px** (ver desvío 3). Las métricas decían "sin desborde";
   la captura mostraba Estado y Acciones fuera de vista. Las métricas por sí solas no alcanzan.
2. **El skip link usaba el anillo por defecto del navegador** (`outline: auto 1px`) en vez del contorno
   explícito del resto. Ahora tiene uno propio.
3. Los botones `sm` seguían en 32px entre 768 y 1023px con la fila ya en tarjeta (incumplía REQ-3.4).
4. Una columna vacía del tablero dejaba una línea divisoria colgando.
5. `app.routes.spec.ts` rompió 42 tests al montar el dashboard real en las redirecciones por permiso:
   su mock de `WorkOrdersService` no tenía `getAll`. Se agregó; no era un defecto de producción.

## Limitaciones conocidas

- **`getAll()` no escala:** el dashboard trae todas las órdenes y cuenta en el cliente. Con 32 órdenes no
  importa; con el backend real (Spring Boot) habrá que pedir conteos agregados.
- **Probado en Chrome de escritorio emulando mobile** (`isMobile`, `hasTouch`), no en un dispositivo real:
  no se vio la barra del navegador móvil ni la zona segura.
- **Título del header a 320–375px:** se trunca ("Centro de G…") porque el nombre del usuario y el botón
  tienen prioridad (REQ-2.7). Funciona, pero el nombre del sitio casi no se lee en mobile.
- **El link "Ver órdenes pendientes"** va a `/work-orders` sin filtro: el listado no lee el estado de la
  URL (lo guarda en `localStorage`), así que no se puede pre-filtrar sin tocar esa página.
- **Las capturas `fullPage` muestran la barra fija en el medio de la página:** es un artefacto de la
  captura, no del layout (la medición numérica confirma que queda al pie).

## Pendientes fuera de alcance

- **O2** (skeleton en el dashboard) no se hizo: el estado de carga actual no se sintió brusco.
- **Modo oscuro**, gráficos, creador de la orden y acciones en el detalle: fuera de alcance (ver
  `requirements.md`).
- **Verificar `safe-area-inset-bottom`** en un dispositivo con muesca (cierra REQ-2.5).
