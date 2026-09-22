# Notas 008b: ejecución

## Resultado

- Baseline: 23 archivos / 104 tests en verde (heredado de 008a).
- Final: **23 archivos / 119 tests en verde** (+15 tests nuevos).
- `pnpm build`: correcto, sin warnings.
- `pnpm lint`: correcto (las 11 reglas de `templateAccessibility` siguen
  pasando; como ya advertía el spec, no cubren `aria-invalid`/
  `aria-describedby` ni contraste — esos se verificaron aparte).
- `pnpm exec prettier . --check`: limpio.

## Tareas 1-6 (documento/global, navegación, listado, formulario, detalle)

Ejecutadas en orden contra el plan. Resumen de lo verificado con tests:

- `lang="es"`, títulos por ruta (`app.routes.spec.ts`), sin el
  `title="shell for testing"` espurio (`app.spec.ts`).
- Skip-link, `aria-controls`/`aria-expanded` en el toggle del header,
  `aria-current` en el sidebar sin clase hardcodeada, foco devuelto al
  cerrar (mismo patrón que `Modal`, spec 005).
- Listado: `<h1>`, `<caption>`/`scope="col"`, nombre accesible por fila
  (requirió agregar `ariaLabel` a `Button`, único cambio transversal),
  región live siempre montada para anunciar resultados de búsqueda.
- Formulario: `aria-invalid`/`aria-describedby` atados a `isInvalid()`,
  labels en español, **submit habilitado** con el bloqueo real en
  `onSubmit()` sin tocar (decisión del usuario) — 2 tests de spec 004
  se renombraron/ajustaron porque asumían el botón deshabilitado; el
  comportamiento que protegían (no emitir con form inválido) se mantiene
  y quedó cubierto por un test nuevo explícito.
- Detalle: título como `<h2>` (antes `<p><strong>`), valores sueltos
  etiquetados ("Activo:", "Estado:").
- Estados dinámicos: `Alert` replica el patrón ya correcto de `Toast`
  (`role="alert"`/`aria-live="assertive"` sólo en `variant="error"`,
  `role="status"`/`polite` en el resto); `<app-shell>` recibe
  `[attr.inert]` mientras `LoadingService.isLoading()` es true, ocultando
  el contenido de fondo del spinner overlay para lectores de pantalla.

`work-order-create.spec.ts` y `work-order-edit.spec.ts` se revisaron por
si asumían el botón deshabilitado: la única aserción de `disabled` que
tienen es sobre `submitting()` (no sobre form inválido), así que no
requirieron cambios.

## Tarea 7: contraste (ratios recalculados)

Medidos con la fórmula de contraste relativo de WCAG (luminancia relativa
por canal, sin gamma-correction adicional). Tokens corregidos en
`_variables.scss`:

| Token                   | Antes                | Ratio antes | Después              | Ratio después                                      | Mínimo requerido        |
| ----------------------- | -------------------- | ----------- | -------------------- | -------------------------------------------------- | ----------------------- |
| `--color-focus-ring`    | `rgba(15,95,97,0.3)` | 1.63:1      | `rgba(15,95,97,0.7)` | 3.66:1 (contra blanco)                             | 3:1 (indicador de foco) |
| `--color-text-disabled` | `#98a2aa`            | 2.60:1      | `#626e78`            | 5.22:1 (blanco) / 4.62:1 (`--color-surface-light`) | 4.5:1 (texto)           |
| `--color-border`        | `#becaca`            | 1.68:1      | `#7a8c8c`            | 3.53:1 (blanco) / 3.31:1 (`--color-background`)    | 3:1 (borde de control)  |

Los tres afectan a los 4 campos del formulario, el buscador, la
paginación y cualquier borde/control deshabilitado que use esos tokens.
La paleta de texto base (`--color-text`, `--color-text-muted`) ya
cumplía (≥4.59:1) y no se tocó.

**No se tocó** la opacidad de `.btn:disabled`/`.pagination__item:disabled`
(0.5/0.6) pese a que el plan la señalaba: con los tokens ya corregidos,
el texto disabled efectivo baja a ~2.4-2.5:1 contra su fondo por la
opacidad, pero **WCAG 1.4.11 exime explícitamente a los componentes
inactivos/deshabilitados** del requisito de contraste. Se deja
documentado acá en vez de perseguir un ratio que la norma no exige, para
no inventar una regla nueva sin pedirla.

## Tarea 8: responsive y limpieza de CSS

### Responsive

- **Barras superiores** (`d-flex justify-between py-lg` en listado, crear,
  editar y detalle): no tenían `flex-wrap`, así que un título largo + botón
  se salían del viewport en mobile. Se agregó `flex-wrap gap-md` a las 4.
- **Buscador del listado**: usaba `.ml-lg` (clase que nunca existió) y un
  `<span class="mx-lg"></span>` vacío como separador fijo de 48px. Se
  reemplazó por `gap-md` en el contenedor flex (ya con `flex-wrap`), que
  además permite que el buscador y el botón se apilen en mobile en vez de
  depender de un spacer de ancho fijo.
- **Sidebar como drawer en mobile**: antes, por debajo de 768px el grid de
  `.sidebar-layout` caía a una columna y el sidebar se renderizaba en
  flujo normal, empujando el contenido hacia abajo en vez de superponerse.
  Ahora, por debajo de `$breakpoint-md`, `.sidebar` pasa a
  `position: fixed` (ancho `min(20rem, 85vw)`, `z-index` de modal,
  `box-shadow`) y se agregó un `.sidebar-backdrop` (mismo z-index que
  `Modal`, un nivel por debajo) que cierra el drawer al tocarlo fuera.
  Cubierto por un test nuevo en `app-shell.spec.ts`. En desktop el
  backdrop se oculta por CSS y el sidebar sigue empujando el contenido en
  el grid, sin cambios de comportamiento.
- **Ambigüedad de breakpoint a los 768px exactos**: `_layout.scss` tenía
  un `@media (max-width: a.$breakpoint-md)` crudo para `.grid--2/3/4`, que
  a los 768px exactos coincidía con el `min-width: 768px` del mixin
  `respond-above` en `_container.scss` (ambos activos a la vez). Se
  reemplazó por el mixin `respond-below`, que ya resta 1px para este caso.

### Clases muertas/rotas encontradas y corregidas

Más allá de lo que el diagnóstico original había medido, revisando
sistemáticamente clase-usada-en-template vs. clase-definida-en-SCSS
aparecieron varios casos adicionales del mismo patrón (clase o custom
property referenciada que nunca existió, sin efecto visible pero
silenciosa):

| Encontrado                                                | Dónde                                                              | Efecto real                                                                                                                                                      | Arreglo                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `.ml-lg`                                                  | listado (input de búsqueda)                                        | Ninguno (clase nunca definida)                                                                                                                                   | Eliminada; reemplazada por `gap-md` en el contenedor                                  |
| `.justify-center` (bare, sin definir)                     | listado (acciones de fila)                                         | Ninguno                                                                                                                                                          | Definida en `_display.scss` (familia de `d-flex`/`justify-between`)                   |
| `.card__body`                                             | detalle                                                            | Ninguno (wrapper sin estilos)                                                                                                                                    | Eliminado; `.card__header/__content/__footer` van directo en `.card`                  |
| `.table__row`                                             | listado                                                            | Ninguno (`.table` ya estiliza `tbody tr` directo)                                                                                                                | Eliminada                                                                             |
| `.toast__close`                                           | Toast                                                              | Ninguno (`.btn--close` ya lo posiciona/estiliza)                                                                                                                 | Eliminada                                                                             |
| `.badge--info`                                            | `badge.ts` asigna esta clase para `variant='info'`/`'in-progress'` | **Bug real**: esos badges no tenían color propio, caían al gris base                                                                                             | Agregada la regla en `_badge.scss` con los tokens `--color-info*`                     |
| `[class.toast--info]` sin bindear                         | `toast.html`                                                       | **Bug real**: `.toast--info` existía en SCSS pero nunca se aplicaba, toasts info sin color de borde                                                              | Agregado el binding faltante                                                          |
| `var(--color-text-secondary)`                             | `_toast.scss` (`.toast__message`)                                  | **Bug real**: custom property inexistente → resolvía a `inherit` (mismo patrón que el bug de `_sidebar.scss` de la tarea 3)                                      | Reemplazado por `var(--color-text-muted)`                                             |
| `var(--spacing-xl)` / `var(--spacing-lg)`                 | `not-found.scss`                                                   | **Bug real**: el sistema de spacing sólo existe como variables SCSS (`$spacing-*`), nunca se expuso como custom property → la página 404 no tenía padding ni gap | Reemplazado por `a.$spacing-xl`/`a.$spacing-lg` (con el `@use` correspondiente)       |
| `_section.scss` (`.section`)                              | archivo completo, forward en `layout/_index.scss`                  | Nunca usado en ningún template (huérfano de una idea que no se adoptó)                                                                                           | Archivo eliminado, `@forward` sacado de `_index.scss`                                 |
| `<section class="text-center">` envolviendo toda la vista | listado                                                            | **Bug real** (no muerto): `.text-center` sí existe (`_text.scss`) y centraba todo el texto de la sección — encabezado, tabla, formulario de búsqueda             | Clase quitada del `<section>`; queda sólo donde corresponde (el `<th>` de "Acciones") |

**Corrección sobre la marcha:** durante la limpieza cambié `text-center` →
`u-text-center` y `text-muted` → `u-text-muted` en 3 lugares (el `<th>`
de acciones, el `<h2>` del header, el "Menú" del sidebar) asumiendo que
las versiones sin prefijo no existían. Al revisar `_text.scss` (que se
me había pasado por alto) resultó que sí existen y hacen exactamente lo
mismo (`text-align: center` / `color: var(--color-text-muted)`), así que
esos tres cambios **no arreglaban un bug** — fueron un cambio de
consistencia hacia el prefijo `u-` ya usado en esos mismos templates
(`u-sr-only`, `u-align-center`, `u-full-width`), visualmente un no-op.
Queda anotado como hallazgo aparte: `_text.scss` y `_utilities.scss`
mantienen utilidades duplicadas bajo dos convenciones de nombre
(`text-center`/`u-text-center`, `text-muted`/`u-text-muted`); consolidar
esas dos convenciones es un cambio de sistema de diseño más grande que
excede la limpieza puntual de esta spec, así que no se tocó.

**Clases sin uso pero no rotas, dejadas como están:** `.grid`/`.grid--2/3/4`/
`.stack*`/`.cluster` (en `_layout.scss`) y `.form-row`/`.form-row--3`/
`.form-actions` (en `_form.scss`) no los usa ningún template hoy, pero
a diferencia de `.section` no son ideas huérfanas de un solo lugar: son
utilidades de layout de propósito general, coherentes con el resto del
sistema, simplemente sin adoptar todavía. Borrarlas sería podar
utilidad reusable, no arreglar algo roto — se dejan.

### Verificación manual en 375px y 768px

Sin tooling de testing visual en el proyecto (jsdom no calcula layout),
la verificación es por revisión del CSS resultante, no por captura de
pantalla:

- **375px** (`respond-below($breakpoint-sm)`/`respond-below($breakpoint-md)`
  activos): tabla dentro de `.table-wrapper` con `overflow-x: auto` (no
  desborda la página); barras superiores en columna por `flex-wrap` +
  ancho de los hijos; sidebar como drawer fijo con backdrop; formulario ya
  usaba `.form` (`flex-direction: column`) más `.form-row` a una columna
  (aunque `.form-row` no está en uso hoy, según arriba).
- **768px exacto**: con el fix de la tarea de breakpoints, `.grid--2/3/4`
  y el ancho ampliado de `.container` ya no compiten por el mismo punto de
  corte (uno pasa a 767px, el otro se mantiene en 768px mínimo).
- **≥768px**: sidebar vuelve a estar en flujo dentro del grid
  `.sidebar-layout`, el backdrop se oculta por CSS.

## Tarea 9: verificación por mutación

Cuatro mutaciones deliberadas, una por vez, confirmando el fallo esperado
y revirtiendo antes de seguir:

| Mutación introducida                                                 | Test que debía fallar                                                                   | Resultado                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Sacar `[ariaLabel]` del botón "Ver" en el listado                    | `gives each row a distinct accessible name for its action buttons`                      | ✓ Falló (`expected 5 to be 6`, nombres duplicados) |
| Sacar `aria-describedby` del input de título                         | `exposes aria-invalid and aria-describedby pointing to the error on an invalid control` | ✓ Falló (`expected null to be 'title-error'`)      |
| Volver a `[disabled]="workOrderForm.invalid \|\| submitting()"`      | `blocks emission when required fields are empty, with the submit button enabled`        | ✓ Falló (`expected true to be false`)              |
| Volver `role`/`aria-live` de `Alert` a estáticos (`status`/`polite`) | `uses role="alert" and aria-live="assertive" only for the error variant`                | ✓ Falló (`expected 'status' to be 'alert'`)        |

Las 4 se revirtieron inmediatamente después de confirmar el fallo;
`pnpm test`/`pnpm build`/`pnpm lint`/`pnpm exec prettier . --check`
quedaron en verde al cierre.

## Pendiente / fuera de alcance

- Consolidar `_text.scss` con las utilidades `u-*` de `_utilities.scss`
  (duplicación anotada arriba) — no es un bug, es deuda de sistema de
  diseño para una spec aparte si se decide.
- `.grid`/`.stack`/`.cluster`/`.form-row`/`.form-actions`: utilidades
  generales sin adoptar todavía, no se tocaron (ver justificación arriba).
- Validación cross-browser real y de lector de pantalla (NVDA/VoiceOver):
  no hay tooling en el proyecto; lo que se verificó es estático (HTML/CSS
  resultante) más los tests de jsdom, no una sesión real de asistencia.
- Con esto se cierran los cuatro frentes de `008-tipado-estricto-accesibilidad-responsive`
  (tipado y aliases en 008a, accesibilidad y responsive acá).
