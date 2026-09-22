# Spec: Accesibilidad y responsive de las pantallas centrales

Deriva de `008-tipado-estricto-accesibilidad-responsive`, tras el
diagnóstico que dividió esa auditoría en dos sub-specs. Ver también
`008a-tipado-aliases`.

**Orden de ejecución: esta sub-spec va segunda.** `008a` activa
`strictTemplates`, que puede marcar errores en los mismos templates que se
reescriben acá; hacerlo al revés implica tocarlos dos veces.

Accesibilidad y responsive van juntas a propósito: comparten los mismos
archivos. La tabla del listado necesita `.table-wrapper` (responsive) **y**
`<caption>`/`scope` (a11y); el sidebar necesita manejo de foco **y**
comportamiento de drawer. Separarlas obligaría a tocar cada template dos veces.

## Problema actual

### El lint de accesibilidad ya pasa, pero no cubre lo que falla

`eslint.config.js` ya aplica `angular.configs.templateAccessibility` a
`**/*.html`, con 11 reglas en `error`, y `pnpm lint` pasa limpio. Eso ya
garantiza: sin `autofocus`, sin `<marquee>`, roles con sus aria requeridos,
valores aria válidos, elementos con `(click)` focusables y con handler de
teclado, y que todo `<label>` **que exista** tenga `for` o control anidado.

Lo que ese preset **no** cubre, y explica por qué los hallazgos de abajo
conviven con un lint en verde:

- `label-has-associated-control` corre con `checkIds: false`: no verifica
  que el `for` apunte a un `id` que exista.
- No obliga a que un input _tenga_ label; sólo valida los que ya están.
- `table-scope` no exige `scope` en `<th>`, sólo prohíbe `scope` fuera de `<th>`.
- Nada sobre jerarquía de headings, `<caption>`, nombres accesibles
  duplicados, `aria-describedby`/`aria-invalid`, landmarks, skip-link,
  contraste, ni `lang`.

**Dato importante para no repetir trabajo:** el criterio de aceptación del
spec padre — _"todos los inputs deben tener label asociado"_ — **ya se
cumple y se verificó a mano**: los 4 `for`↔`id` del formulario matchean
(`title`, `description`, `asset`, `priority`) y el input de búsqueda tiene
`aria-label`. El hueco real está una capa más arriba, y es lo que esta
sub-spec ataca.

Hallazgos del diagnóstico: **~10 bloqueantes, ~25 importantes, ~15 menores**.

### Responsive: un solo overflow real, e infraestructura desconectada

- **El único scroll horizontal de toda la app** es la `<table>` del listado
  (`work-orders-list.html`), que no está envuelta en `.table-wrapper` — una
  clase que **ya existe** en `_table.scss` con `overflow-x: auto`,
  justamente para eso, y que no se usa en ningún template. Ancho min-content
  estimado ~550-700px contra 343px útiles en un viewport de 375px.
- El resto degrada sin desbordar: la barra superior del listado
  (`d-flex` sin wrap + un spacer `mx-lg` de 48px fijos), los headers de
  detalle/crear, y el sidebar apilado con `position: sticky` en vez de
  comportarse como drawer.
- **Meta-hallazgo:** de 6 media queries en todo el repo, **4 apuntan a
  clases que ningún template usa** (`.section`, `.grid--*`, `.form-row`,
  `.form-actions`, `.toast-container`). La infraestructura responsive está
  declarada pero no cableada al markup. `$breakpoint-lg` y `$breakpoint-xl`
  tienen cero usos.
- Varios "bugs de a11y" son en realidad **CSS roto**:
  `--color-text-secondary`, `--radius-lg` y `--radius-md` no existen como
  custom properties, así que los links del sidebar resuelven a `inherit` y
  quedan indistinguibles del texto plano.
- Lo que **sí está bien** y no hay que tocar: paginación (wrap + touch
  targets de 40px), modal (`width:100%` + `max-width:480px` resuelve
  correctamente a 343px), card de detalle, formulario (una columna fluida),
  header, y el `<meta name="viewport">`.
- **No hay tooling de testing visual** (Playwright/Cypress/snapshots: cero)
  y jsdom no calcula layout, así que la verificación responsive es
  necesariamente manual.

## Requisitos

### Documento y global

- `<html lang="es">` — hoy es `en` con toda la UI en español.
- Título por ruta (hoy `<title>` es estático, no anuncia cambio de página).
- Sacar `title="shell for testing"` de `<app-shell>` en `app.html`: no es
  un input declarado, queda como atributo HTML en el host y genera un
  nombre accesible espurio sobre toda la app.

### Navegación y landmarks

- Skip-link al contenido principal, reusando `.u-sr-only`, que ya existe.
- Sidebar: `:focus-visible` en los links (hoy no tienen ninguno),
  `aria-current="page"` (hoy el estado activo es sólo color),
  `aria-label` en el `<nav>`, sacar la clase activa hardcodeada en "Inicio"
  (hoy se ve activo aun estando en `/work-orders`), y arreglar las custom
  properties inexistentes que rompen su color y border-radius.
- Botón que abre el menú: hoy su nombre accesible es literalmente `-`.
  Darle nombre real, `aria-expanded` y `aria-controls`.
- Devolver el foco al disparador al cerrar el sidebar (hoy el botón de
  cerrar se destruye y el foco cae al `<body>`).

### Listado

- Agregar `<h1>` — hoy la pantalla no tiene ninguno.
- `<caption>` (o `aria-label`) y `scope="col"` en los 4 `<th>`.
- **Nombre accesible por fila** en Ver/Editar/Eliminar: hoy son 3 botones
  idénticos repetidos por cada fila, indistinguibles en la lista de botones
  de un lector de pantalla. Esto obliga a agregar un input `ariaLabel` al
  `Button` compartido — **es el único cambio transversal de esta sub-spec**,
  y afecta a todos sus usos.
- Región live que anuncie el resultado de la búsqueda (hoy el `<tbody>` se
  reemplaza tras el debounce sin ningún anuncio).
- Corregir `aria-label="Paginación de ejemplo"` (texto placeholder olvidado).

### Formulario

- Asociar los mensajes de error a su campo: `aria-describedby` + `id` en
  cada `.form-error`, y `aria-invalid` en el control. Hoy el estado
  inválido se comunica **sólo por color de borde**.
- `required`/`aria-required` en los 4 campos (tienen `Validators.required`
  pero el DOM no lo expone).
- Labels al español (hoy "Title:", "Description:", "Asset:", "Priority:" y
  "Low/Medium/High" dentro de pantallas tituladas en español).
- **Habilitar el botón de submit cuando el formulario es inválido**, y
  dejar que el guard que ya existe en `Form.onSubmit()` bloquee la emisión
  y `markAllAsTouched()` revele todos los errores de una.
  Hoy el botón está deshabilitado, lo que hace que `markAllAsTouched()` sea
  código inalcanzable y que un usuario de teclado llegue al final y
  encuentre un botón muerto sin explicación.
  Esto **sigue cumpliendo el requisito literal de spec 004** — _"el botón de
  envío debe estar deshabilitado **(o el submit debe ser bloqueado)**"_ — y
  no toca la protección contra doble-envío, que vive en el signal
  `isSubmitting` de cada página y se mantiene igual.

### Detalle

- El título de la orden como heading (hoy es `<p><strong>`, así que no
  aparece en la lista de encabezados).
- Etiquetar los valores sueltos: activo y estado se muestran sin decir qué
  campo son.

### Estados dinámicos

- `role="alert"` (assertive) para el `variant="error"` del `Alert`; hoy
  todos los variants son `role="status"` polite, incluidos los errores de
  carga de listado, detalle y edición. El `Toast` ya hace esta distinción
  bien y sirve de referencia.
- Revisar el montaje de las live regions: hoy nacen en el mismo tick que su
  contenido (dentro del `@if` del padre), lo que hace el anuncio poco fiable.
- `inert`/`aria-hidden` en el contenido de fondo mientras el overlay del
  spinner está activo: hoy tapa visualmente pero sigue siendo navegable por
  teclado y por lector de pantalla.

### Contraste

Corregir sólo lo que falla WCAG AA (ratios medidos en el diagnóstico):

| Qué                          | Ratio actual | Umbral | Dónde impacta                                                                                      |
| ---------------------------- | ------------ | ------ | -------------------------------------------------------------------------------------------------- |
| `--color-focus-ring`         | **1.63:1**   | 3:1    | El anillo de foco de los 4 campos del form, el buscador y la paginación es prácticamente invisible |
| `.btn--primary:disabled`     | 2.39:1       | 4.5:1  | Submit del formulario                                                                              |
| `.pagination__item:disabled` | 1.66:1       | 4.5:1  | Botones ‹ › en primera/última página                                                               |
| `--color-text-disabled`      | 2.60:1       | 4.5:1  | Falla ya en el token de origen                                                                     |
| `--color-border`             | 1.68:1       | 3:1    | Es el único delimitador visual de los inputs                                                       |

La paleta base de texto/fondo **está bien** (todas las combinaciones
normales ≥4.59:1) y no se toca.

### Responsive

- Envolver la tabla del listado en `.table-wrapper` — el único overflow real.
- `wrap` en las barras superiores de listado/detalle/crear.
- Sidebar con comportamiento de drawer en móvil, en vez de apilarse
  ocupando un bloque full-width.
- **Limpieza completa del CSS muerto y roto** (decidido al dividir la
  spec): media queries que apuntan a clases sin uso, clases referenciadas
  en templates que no existen (`.ml-lg`, `.card__tittle`,
  `.table__row--clickable`, `badge--info`), y usar `.form`/`.form-row` en
  el `<form>` en vez de `.form-control`, que es el estilo de un input.
- Resolver la ambigüedad de borde en 768px entre `max-width: 768px`
  (`_layout.scss`) y `min-width: 768px` (`_container.scss`), que hoy hacen
  convivir la regla "mobile" de una y la "desktop" de la otra justo en el
  breakpoint de tablet.

## Fuera de alcance

- El Modal: ya se cubrió en spec 005, y el diagnóstico lo confirmó como el
  componente con mejor cobertura ARIA del repo.
- Introducir un design system o una librería de componentes de
  accesibilidad: el sistema de estilos custom se mantiene y se ajusta
  dentro de sus propias convenciones.
- Cambios de funcionalidad: esta sub-spec es de calidad, no agrega features.
- Tipado y aliases: son `008a-tipado-aliases`.

## Criterio de aceptación (con estado de fallo explícito)

- Test en el formulario: un campo inválido debe exponer `aria-invalid="true"`
  y un `aria-describedby` que apunte al `id` real de su mensaje de error.
  **Debe fallar** si el error sigue comunicándose sólo por color de borde.
  (El criterio original del spec padre —"todos los inputs deben tener label
  asociado"— ya se verificó como cumplido y se reemplaza por este, que es
  el hueco real.)

- Test en el listado: los botones de acción de cada fila deben tener un
  nombre accesible que identifique de qué orden se trata.
  **Debe fallar** si dos filas distintas producen botones con el mismo
  nombre accesible.

- Test del formulario: con el form inválido, el botón de submit debe estar
  habilitado y un submit debe revelar los mensajes de error sin emitir
  `sendData`.
  **Debe fallar** si el botón sigue deshabilitado (los errores nunca se
  revelarían) o si emite con el form inválido (regresión de spec 004).

- `pnpm lint` en verde (las 11 reglas de accesibilidad siguen pasando).
  **Debe fallar** si algún cambio de markup rompe una regla existente.

- Verificación manual en 375px y 768px de listado, detalle y formulario,
  documentada en `notes.md` con el resultado por pantalla: sin scroll
  horizontal, sin contenido cortado.
  **Debe fallar** (documentado, no bloqueante para CI dado que no hay
  tooling de testing visual) si se detecta overflow.

- Ratios de contraste recalculados y documentados en `notes.md` para los
  cinco ítems de la tabla de arriba.
  **Debe fallar** si alguno sigue por debajo de su umbral.
