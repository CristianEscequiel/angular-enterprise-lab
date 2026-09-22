# Notas 008a: ejecución

## Resultado

- Baseline: 23 archivos / 104 tests en verde.
- Final: **23 archivos / 104 tests en verde, sin tests nuevos** — este spec
  no agrega comportamiento, endurece el tipado. Los tests existentes son la
  garantía de que el retipado no cambió runtime.
- `tsc --noEmit` en `tsconfig.app.json` y `tsconfig.spec.json`: **0 errores**
  con todos los flags nuevos activos.
- `pnpm lint` y `pnpm build`: en verde.

## La incógnita se resolvió sola: `strictTemplates` costó 0

Era el único número que el diagnóstico no había podido medir (requería
editar el tsconfig, y el diagnóstico corrió en modo solo-lectura). Se
activó junto con `typeCheckHostBindings` y **`pnpm build` dio 0 errores**,
confirmando la predicción que se había hecho revisando los candidatos a
mano: `BadgeVariant` ya incluía los tres valores de `WorkOrderStatus`,
`size="full"` y `variant="error"` eran literales válidos de sus uniones, y
`mode="edit"`/`type="submit"`/`title="shell for testing"` no son inputs
declarados, así que caen como atributos DOM y el flag no los marca.

No hizo falta diferir nada ni tocar un solo template.

## Flags activados

En `compilerOptions`: `strict`, `noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`.
En `angularCompilerOptions`: `strictTemplates`, `typeCheckHostBindings`.

De todos ellos, **el único con costo real fue `noUncheckedIndexedAccess`**
(11 errores), tal como había medido el diagnóstico. El resto entró con 0
errores, confirmando que el código ya estaba escrito de forma strict-safe
aunque el flag nunca hubiera estado prendido.

## Los 11 arreglos de `noUncheckedIndexedAccess`

Todos resueltos tipando, ninguno silenciado:

- `work-orders.routes.ts` (5): desestructuración con guarda
  (`const [idSegment, suffixSegment] = segments;` + chequeo de `!idSegment`)
  en ambos `UrlMatcher`. Esto además resolvió de arrastre el `TS2322` contra
  `UrlMatchResult`, porque `posParams` pasa a usar la variable ya estrechada.
- `modal.ts` (2): `focusable.at(0)` / `focusable.at(-1)` con
  `if (!first || !last) return;`, que reemplaza al `if (focusable.length === 0)`
  anterior — TS no correlacionaba ese chequeo con el acceso por índice.
- `modal.spec.ts` (4): helper `buttonAt()` que **lanza** si el botón no
  existe, en vez de aserciones `!`. Un elemento faltante ahora rompe el test
  de forma ruidosa.
- `mock-api.interceptor.ts` (1): se captura el elemento
  (`const current = WORK_ORDERS_MOCK[index]`) y se guarda antes del spread.
  Es código muerto (no está registrado en `app.config.ts`), así que el
  arreglo es mínimo y no se rediseñó nada — la deuda de que `core/` importe
  de `features/` queda anotada, sin resolver, como fija el spec.

## Aliases: el riesgo previsto no era el que apareció

El spec advertía que los aliases tenían que resolver en tres lugares
(build, tests, editor) y que "compila el build" no alcanzaba como
verificación. Se verificó build y tests por separado, como correspondía —
pero **el problema real fue otro**: `baseUrl` está **deprecado en
TypeScript 6** (este repo usa 6.0.3) y rompió el build con `TS5101` apenas
se agregó.

Solución: sacar `baseUrl` por completo y declarar los `paths` con rutas
relativas al tsconfig (`"./src/app/core/*"`), que es la forma soportada
desde TS 5. Con eso, build y tests resolvieron los aliases sin ninguna
configuración adicional — el builder de tests
(`@angular/build:unit-test`) toma los `paths` del tsconfig directamente,
así que el escenario de "compila pero la suite no resuelve" no llegó a darse.

Se reescribieron los **15 imports de 4 niveles** (`@core/`, `@shared/`);
los 19 de 2 niveles son intra-feature y quedaron como estaban, según el spec.

## Verificación de que los flags hacen algo (tarea 5)

Equivalente al paso de mutación de las specs anteriores, adaptado a un spec
de tipado. Sobre un archivo descartable (`_scratch-strict-check.ts`, nunca
commiteado, borrado después), uno por vez:

| Violación introducida              | Error esperado             | Resultado                                                  |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Parámetro sin tipo                 | `noImplicitAny`            | `TS7006: Parameter 'value' implicitly has an 'any' type` ✓ |
| Acceso a posible `null` sin guarda | `strictNullChecks`         | `TS18047: 'value' is possibly 'null'` ✓                    |
| Acceso por índice sin chequear     | `noUncheckedIndexedAccess` | `TS2532: Object is possibly 'undefined'` ✓                 |

Confirmado además que no se silenció nada: `grep` de `any`, `as any`,
`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` y aserciones `!.` en
`src/**/*.ts` → **cero coincidencias**, igual que el estado previo medido.

## Pendiente

- README: tarea 6 del plan, opcional, no se tocó — el checkbox del roadmap
  cubre los cuatro frentes y accesibilidad/responsive siguen abiertos en
  `008b`, así que no corresponde tildarlo todavía.
- `008b-accesibilidad-responsive` queda habilitado para ejecutarse: el
  riesgo de secuencia que motivaba hacer 008a primero (que `strictTemplates`
  marcara errores en templates que 008b iba a reescribir) no se materializó,
  porque costó 0.
