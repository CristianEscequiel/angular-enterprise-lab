# Plan 008b: Accesibilidad y responsive de las pantallas centrales

Spec: `.claude/specs/008b-accesibilidad-responsive/spec.md`

## Contexto

Es el spec más grande de la serie: ~10 hallazgos bloqueantes, ~25
importantes y ~15 menores, más el frente responsive. Todo el inventario ya
está medido en el "Problema actual" del spec, así que este plan no
re-explora: ordena la ejecución.

Dos restricciones que fijan el orden:

- **`Button` va primero.** Agregarle un input `ariaLabel` es el único
  cambio transversal del spec, y el listado depende de él para dar nombre
  accesible a los botones por fila.
- **Los tests nuevos van con su ola, no al final.** Tres de los cuatro
  criterios de aceptación son automatizables (form, listado, submit); el
  responsive y el contraste son verificación manual documentada, porque el
  repo no tiene tooling visual y jsdom no calcula layout.

`008a` ya cerró con `strictTemplates` activo y 0 errores, así que cualquier
cambio de binding en los templates de acá se valida contra el compilador.

## Tareas

### 1. `Button`: input `ariaLabel` (cambio transversal, va primero)

- **Archivos:** `shared/components/button/button.ts`, `button.html`
- **Cambio:** `ariaLabel = input<string>()` y en el template
  `[attr.aria-label]="ariaLabel() ?? null"`. Se usa `attr.` para no emitir
  el atributo cuando no se pasa nada. Aprovechar para declarar también
  `type = input<'button' | 'submit'>('button')` y bindearlo al `<button>`
  interno: hoy `type="submit"` cae como atributo inerte en el host y
  funciona sólo por el default del navegador dentro de un `<form>`.
- **Test (`button.spec.ts`):** `no emite aria-label cuando no se pasa`,
  `expone el aria-label recibido`, `refleja el type en el botón nativo`.

### 2. Documento y global

- **Archivos:** `src/index.html`, `src/app/app.html`, `app.routes.ts` y
  `work-orders.routes.ts`
- **Cambio:** `lang="es"`; sacar `title="shell for testing"` de
  `<app-shell>`; agregar `title` a cada ruta (Angular ya lo soporta de
  forma nativa — `app.routes.ts` ya lo usa en el wildcard 404).
- **Verificación:** `app.routes.spec.ts` ya navega entre rutas; extenderlo
  con un assert de `document.title` por ruta.

### 3. Layout: skip-link, sidebar y toggle del header

- **Archivos:** `layout/app-shell/app-shell.html/.ts`, `header/header.html`,
  `sidebar/sidebar.html`, `styles/components/_sidebar.scss`
- **Cambios:**
  - Skip-link al `<main>`, reusando `.u-sr-only` (ya existe) con revelado
    en `:focus`.
  - Sidebar: `aria-label` en el `<nav>`, `aria-current="page"` vía
    `routerLinkActive`, sacar la clase `sidebar__link--active` hardcodeada
    en "Inicio", `:focus-visible` en `.sidebar__link`, y arreglar
    `--color-text-secondary` → `--color-text-muted` y `--radius-*` (que no
    existen como custom properties) → los `$radius-*` de SCSS.
  - Header: nombre accesible real en el botón de menú (hoy es `-`),
    `aria-expanded` y `aria-controls` apuntando al id del sidebar.
  - Devolver el foco al toggle al cerrar el sidebar (mismo patrón que
    `Modal.restoreFocus()` de spec 005, que ya está probado y sirve de
    referencia).
- **Test (`app-shell.spec.ts` / `header.spec.ts`):** el toggle expone
  `aria-expanded` que refleja el estado, y al cerrar el sidebar el foco
  vuelve al toggle.

### 4. Listado

- **Archivos:** `work-orders-list.html/.ts`
- **Cambios:** `<h1>`; `<caption>` y `scope="col"` en los 4 `<th>`;
  `[ariaLabel]` por fila en Ver/Editar/Eliminar usando el input de la
  tarea 1 (ej. `'Eliminar ' + workOrder.title`); región live que anuncie
  la cantidad de resultados tras la búsqueda; corregir
  `aria-label="Paginación de ejemplo"`; envolver la `<table>` en
  `.table-wrapper` (que ya existe con `overflow-x:auto` y nunca se usó).
- **Test (`work-orders-list.spec.ts`):** `los botones de acción distinguen
la orden a la que pertenecen` — dos filas distintas deben producir
  nombres accesibles distintos (**debe fallar** si dos filas dan el mismo).

### 5. Formulario

- **Archivos:** `components/form/form.html/.ts`
- **Cambios:** `id` en cada `.form-error` + `aria-describedby` en su
  control, `aria-invalid` bindeado al estado del control, `required` en los
  4 campos, labels al español, y **habilitar el submit cuando el form es
  inválido** (el guard de `onSubmit()` ya existe desde spec 004 y bloquea
  la emisión; `markAllAsTouched()`, hoy inalcanzable, pasa a revelar todos
  los errores de una).
- **Tests (`form.spec.ts`):**
  - `un control inválido expone aria-invalid y aria-describedby apuntando a su error`
    (**debe fallar** si el error se comunica sólo por color).
  - `con el form inválido el submit está habilitado y revela los errores sin emitir`
    (**debe fallar** si sigue deshabilitado, o si emite con el form inválido
    — esto último sería una regresión de spec 004).
  - Ajustar los tests de spec 004 que asumen el botón deshabilitado: el
    comportamiento que protegen (no emitir con form inválido) se mantiene,
    cambia sólo el estado del botón.

### 6. Detalle y estados dinámicos

- **Archivos:** `work-order-detail.html`, `shared/components/alert/alert.ts/.html`,
  `app.html`
- **Cambios:** título de la orden como heading; etiquetar activo/estado
  (hoy son valores sueltos sin decir qué campo son); `Alert` con
  `role="alert"`/`aria-live="assertive"` cuando `variant === 'error'` y
  `status`/`polite` en el resto (el `Toast` ya hace exactamente esto y
  sirve de referencia); `inert` en el contenido de fondo mientras el
  overlay del spinner está activo.
- **Test (`alert.spec.ts`):** `usa role=alert sólo en la variante error`.

### 7. Contraste

- **Archivos:** `styles/abstracts/_variables.scss`, `styles/themes/_default.scss`
- **Cambio:** subir a umbral los cinco tokens que fallan, sin tocar la
  paleta base (que ya está ≥4.59:1): `--color-focus-ring` (1.63:1 → ≥3:1),
  `--color-text-disabled` (2.60:1 → ≥4.5:1), `--color-border` (1.68:1 →
  ≥3:1), y revisar los estados `disabled` de `.btn--primary` y
  `.pagination__item`, cuyo problema es el `opacity` compuesto más que el
  color en sí.
- **Verificación:** recalcular cada ratio y documentarlo en `notes.md`.
  No hay test automatizado de contraste en el repo.

### 8. Responsive y limpieza de CSS

- **Archivos:** `work-orders-list.html`, `work-order-detail.html`,
  `work-order-create.html`, `styles/utilities/_display.scss`,
  `_layout.scss`, `_container.scss`, `_form.scss`, `_table.scss`,
  `_badge.scss`, `_card.scss`, `components/form/form.html`
- **Cambios:**
  - `wrap` en las barras superiores (hoy `d-flex` sin wrap + un spacer
    `mx-lg` de 48px fijos y una clase `.ml-lg` que no existe).
  - Sidebar como drawer en móvil en vez de apilarse full-width.
  - Resolver el borde ambiguo en 768px entre `max-width: 768px`
    (`_layout.scss`) y `min-width: 768px` (`_container.scss`).
  - **Limpieza completa:** podar las media queries que apuntan a clases sin
    uso, las clases inexistentes referenciadas en templates (`.ml-lg`,
    `.card__tittle`, `.table__row--clickable`), `badge--info` (que
    `badge.ts` devuelve y `_badge.scss` no define), y usar `.form` en el
    `<form>` en vez de `.form-control`, que es el estilo de un input.
- **Verificación:** manual en 375px y 768px de listado, detalle y
  formulario, documentada por pantalla en `notes.md`.

### 9. Verificación por mutación

Sobre el código final, revirtiendo sólo el punto mutado:

- Quitar el `[ariaLabel]` de los botones del listado → debe fallar el test
  de la tarea 4.
- Quitar el `aria-describedby` del form → debe fallar el test de la tarea 5.
- Volver a deshabilitar el submit → debe fallar el test de submit de la tarea 5.
- Quitar el `role="alert"` condicional del `Alert` → debe fallar el test de
  la tarea 6.
- Resultado anotado en `notes.md`, mismo formato que specs 001-008a.

### 10. README

Esta vez **sí** corresponde tocarlo sin preguntar: con 008b cerrado se
completan los cuatro frentes del spec 008, así que el checkbox
_"Revisar tipado estricto, aliases, accesibilidad y adaptación móvil"_ se
tilda, y se agregan las filas de `008a` y `008b` a la tabla de specs.

## Verificación

1. Baseline: `pnpm test` en 23 archivos / 104 tests.
2. Tras cada ola: `pnpm test`, `pnpm lint` (las 11 reglas de a11y deben
   seguir pasando) y `pnpm build` en verde.
3. Tarea 9: confirmar los 4 fallos esperados bajo mutación y revertir.
4. Verificación manual responsive + ratios de contraste documentados en
   `notes.md`.
5. Commit solo si se pide.
