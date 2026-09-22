# Spec: Auditoría de tipado estricto, aliases, accesibilidad y responsive

> **Estado: dividida en sub-specs.** El diagnóstico que pide la sección
> "Primera tarea del plan" se ejecutó y mostró que los cuatro frentes se
> agrupan en dos bloques con superficie de archivos disjunta y métodos de
> verificación distintos, así que se dividió en:
>
> - [`008a-tipado-aliases`](../008a-tipado-aliases/spec.md) — tsconfig e
>   imports; se verifica con `tsc`/`ng build`. Va **primero**.
> - [`008b-accesibilidad-responsive`](../008b-accesibilidad-responsive/spec.md)
>   — templates y SCSS; se verifica con lint + navegador manual.
>
> Accesibilidad y responsive **no** se separaron entre sí porque comparten
> los mismos archivos. El diagnóstico medido (conteos de errores por flag
> de compilador, imports profundos, hallazgos de a11y por pantalla, ratios
> de contraste y overflow real en 375px) está incorporado en el "Problema
> actual" de cada sub-spec. Este documento se conserva como registro del
> encuadre original, sin modificar.

## Problema actual

El README lista como pendiente, sin detalle: "Revisar tipado estricto,
aliases, accesibilidad y adaptación móvil". A diferencia de las specs
anteriores, esto no es un bug puntual sino una auditoría transversal —
el alcance real depende de lo que se encuentre al revisar, no de un
comportamiento incorrecto ya identificado.

## Requisitos

### Tipado estricto

- Confirmar si `strict: true` (y flags relacionados: `noImplicitAny`,
  `strictNullChecks`, etc.) están activos en `tsconfig.json`.
- Si no están todos activos, activarlos y resolver los errores de
  compilación que surjan — sin usar `any` como parche ni `// @ts-ignore`
  para silenciar errores reales.

### Aliases de paths

- Confirmar si existen aliases configurados (`@core/*`, `@shared/*`,
  `@features/*`, etc.) en `tsconfig.json`.
- Si no existen, evaluar si conviene introducirlos dado el tamaño actual
  del proyecto (puede no justificarse todavía con pocas features).

### Accesibilidad

- Auditar las pantallas centrales (listado, detalle, formulario) con
  un checklist básico: labels asociados a inputs, roles ARIA donde
  corresponda, contraste de color, navegación completa por teclado.
- Nota: el foco del Modal específicamente ya se cubrió en spec 005 —
  no duplicar ese trabajo acá, solo auditar el resto de la app.

### Responsive

- Verificar que las pantallas centrales sean usables en viewport móvil
  (ancho ~375px) y tablet (~768px), sin overflow horizontal ni elementos
  cortados.

## Fuera de alcance

- El foco y limpieza del Modal (ya cubierto en spec 005).
- Introducir un design system o librería de componentes de accesibilidad
  — el sistema de estilos custom existente se mantiene, se ajusta lo
  necesario dentro de sus convenciones.
- Cambios de funcionalidad — esta spec es de calidad/robustez, no agrega
  features nuevas.

## Primera tarea del plan: diagnóstico y decisión de alcance

Antes de planificar tareas de implementación, el plan debe incluir un
paso de diagnóstico que audite el estado real de cada uno de los cuatro
frentes (tipado, aliases, accesibilidad, responsive) y estime el tamaño
del trabajo restante en cada uno.

Si el diagnóstico muestra que dos o más frentes requieren trabajo
sustancial e independiente entre sí, dividir en sub-specs
(`008a-tipado-aliases`, `008b-accesibilidad-responsive`, u otra división
que el diagnóstico sugiera) en vez de continuar con un plan único.

## Criterio de aceptación (con estado de fallo explícito)

- `tsc --noEmit` con `strict: true` activo → debe compilar sin errores.
  **Debe fallar** si quedan errores de tipado sin resolver o si se
  silenciaron con `any`/`@ts-ignore` en vez de tipar correctamente.

- Test de accesibilidad (ej: con `@testing-library/angular` o similar,
  o verificación manual documentada si no hay tooling automatizado) en
  el formulario → todos los inputs deben tener label asociado.
  **Debe fallar** si algún input queda sin asociación accesible.

- Verificación manual en viewport 375px de listado, detalle y formulario
  → sin scroll horizontal, sin contenido cortado.
  **Debe fallar** (documentado en notes.md, no bloqueante para CI si no
  hay tooling de testing visual) si se detecta overflow.
