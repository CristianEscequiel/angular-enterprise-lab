# Plan 008a: Tipado estricto y aliases de paths

Spec: `.claude/specs/008a-tipado-aliases/spec.md`

## Contexto

El diagnóstico de 008 ya midió todo este frente, así que este plan arranca
con los números puestos en vez de con una exploración:

- **`--strict` da 0 errores** en `tsconfig.app.json` y `tsconfig.spec.json`
  (medido dos veces, por mí y por un agente independiente). Activarlo es
  gratis — no es una migración, es levantar un flag que el scaffold nunca puso.
- `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes` y
  `useUnknownInCatchVariables`: 0 errores cada uno.
- `noUncheckedIndexedAccess`: **11 errores distintos en 4 archivos**, todos
  localizados y todos null-safety genuino.
- **`strictTemplates` es la única incógnita** y no se pudo medir en el
  diagnóstico (requiere editar el tsconfig). Revisé a mano los candidatos
  más probables y **ninguno debería romper**: `BadgeVariant` ya incluye los
  tres valores de `WorkOrderStatus` (así que `[variant]="workOrder.status"`
  es asignable), `size="full"` y `variant="error"` son literales válidos de
  sus uniones, y `mode="edit"`/`type="submit"`/`title="shell for testing"`
  no son inputs declarados, así que caen como atributos DOM y
  `strictTemplates` no los marca. Expectativa: costo bajo o cero. **Igual
  se mide antes de decidir** — la expectativa no reemplaza el número.
- Aliases: 15 imports de 4 niveles, todos `pages|components/*` →
  `shared/components/*` (10) y `core/services/*` (5).

Orden dentro del plan: primero lo gratis, después lo medido, después la
incógnita, y los aliases al final (es un refactor mecánico que conviene
hacer sobre un árbol que ya compila estricto).

## Tareas

### 1. Activar `strict` y los flags de costo cero

- **Archivo:** `tsconfig.json`
- **Cambio:** agregar a `compilerOptions`: `"strict": true` (que trae
  `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`,
  `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`,
  `useUnknownInCatchVariables` y `alwaysStrict`), más `"noUnusedLocals": true`,
  `"noUnusedParameters": true` y `"exactOptionalPropertyTypes": true`, que
  no vienen dentro de `strict` y miden 0.
- **Verificación:** `npx tsc -p tsconfig.app.json --noEmit` y
  `npx tsc -p tsconfig.spec.json --noEmit` → 0 errores. `pnpm test` (23/104)
  y `pnpm build` en verde. Si aparece algún error acá, es señal de que la
  medición del diagnóstico quedó desactualizada y hay que revisarlo antes
  de seguir.

### 2. `noUncheckedIndexedAccess` + los 11 arreglos

- **Archivo:** `tsconfig.json` → agregar `"noUncheckedIndexedAccess": true`.
- **Cambios, uno por archivo** (todos son tipado real, sin `!` a ciegas):
  - `features/work-orders/work-orders.routes.ts` (5 errores): desestructurar
    con guarda en ambos matchers, de modo que TS correlacione el índice con
    el chequeo — `const [idSegment] = segments;` / `const [idSegment, suffix] = segments;`
    y validar `!idSegment` (y `!suffix`) dentro del `if` que ya existe, antes
    de usar `.path`. El `posParams` pasa a usar la variable ya estrechada, lo
    que además resuelve el `TS2322` contra `UrlMatchResult`.
  - `shared/components/modal/modal.ts` (2): reemplazar
    `focusable[0]` / `focusable[focusable.length - 1]` por `focusable.at(0)` /
    `focusable.at(-1)` con un `if (!first || !last) return;` que sustituye al
    `if (focusable.length === 0) return;` actual.
  - `shared/components/modal/modal.spec.ts` (4): agregar un helper local que
    devuelva el elemento y **lance** si no está (`throw new Error(...)`), en
    vez de aserciones `!`. Un elemento faltante debe romper el test de forma
    ruidosa, no silenciosa.
  - `core/interceptors/mock-api.interceptor.ts` (1): guardar el acceso por
    índice antes del spread. Es código muerto (no está registrado en
    `app.config.ts`), así que el arreglo es mínimo y no se rediseña nada.
- **Verificación:** `tsc --noEmit` en ambos configs → 0 errores, y **los
  tests existentes de las piezas tocadas siguen verdes sin modificarse**:
  `work-orders.routes.spec.ts` (8 tests de los matchers) y `modal.spec.ts`
  (8 tests de foco) son la garantía de que el retipado no cambió
  comportamiento en runtime.

### 3. Medir y resolver `strictTemplates`

- **Archivo:** `tsconfig.json` → `angularCompilerOptions`:
  `"strictTemplates": true` (y `"typeCheckHostBindings": true`, cuyo default
  sigue a ese flag).
- **Cambio:** activarlo y **medir primero**: `pnpm build` y anotar el conteo
  exacto de errores antes de tocar un solo template. Recién con ese número:
  - Si es acotado (expectativa: bajo o cero), resolverlo acá.
  - Si resulta grande, es legítimo revertir el flag y documentar en
    `notes.md` el conteo, los archivos afectados y por qué se difiere —
    pero la decisión queda tomada con el dato, no por anticipado.
- **Verificación:** `pnpm build` y `pnpm test` en verde con el flag activo,
  o `notes.md` con el número medido y la razón del diferimiento.

### 4. Aliases `@core/*`, `@shared/*`, `@features/*`

- **Archivos:** `tsconfig.json` (`baseUrl` + `paths`) y los ~8 archivos que
  concentran los 15 imports de 4 niveles — las cuatro páginas de
  `features/work-orders/pages/*`, `components/form/form.ts`, y sus `.spec.ts`.
- **Cambio:** declarar los tres aliases y reescribir **solo** los imports de
  4 niveles (`../../../../core/...` → `@core/...`,
  `../../../../shared/...` → `@shared/...`). Los de 2 niveles son
  intra-feature y quedan como están, tal como fija el spec.
- **Verificación (el riesgo real de esta tarea):** los aliases tienen que
  resolver en **build y tests por separado**. `pnpm build` verde **no
  alcanza**: hay que correr `pnpm test` y confirmar 23/104. Este repo no
  tiene `vitest.config.ts` propio (los tests corren por
  `@angular/build:unit-test`), así que si el builder de tests no toma los
  `paths` del tsconfig, el modo de falla esperado es "compila pero la suite
  no resuelve los imports" — y en ese caso hay que configurarlo ahí también.

### 5. Verificación de que los flags realmente hacen algo

Equivalente al paso de mutación de las specs anteriores, adaptado a un
spec de tipado: no alcanza con que compile, hay que probar que los flags
nuevos **atrapan** lo que dicen atrapar.

- Introducir temporalmente, uno por vez y en un archivo descartable:
  un parámetro sin tipo (debe fallar por `noImplicitAny`), un acceso a
  posible `null` sin guarda (`strictNullChecks`), y un acceso por índice sin
  chequear (`noUncheckedIndexedAccess`). Confirmar que `tsc` falla en cada
  caso y revertir.
- Confirmar también que no se silenció nada en las tareas 2-3: `grep` de
  `any`, `as any`, `@ts-ignore`, `@ts-expect-error` y `!.` en `src/` debe
  seguir dando **cero**, que es el estado previo medido.
- Resultado anotado en `notes.md`, mismo formato que specs 001-007.

### 6 (opcional, requiere confirmación). README

- Tabla de specs: fila para `008a`. El checkbox del roadmap
  _"Revisar tipado estricto, aliases, accesibilidad y adaptación móvil"_
  cubre los cuatro frentes, así que **no se tilda todavía** — se reformula
  para dejar constancia de que tipado y aliases quedan listos acá y que
  accesibilidad y responsive siguen abiertos en `008b` (mismo criterio que
  usé en spec 007 con el checkbox combinado de cobertura/formato).

## Fuera de alcance (según el spec)

Accesibilidad y responsive (`008b`); pasar ESLint a configs type-aware; y
el cruce de capas `core/interceptors/mock-api.interceptor.ts` → `features/`,
que se deja anotado como deuda (es código muerto, sin registrar en
`app.config.ts`).

## Verificación

1. Baseline antes de empezar: `pnpm test` en 23 archivos / 104 tests.
2. Tras cada tarea 1-4: `tsc --noEmit` en ambos configs, `pnpm test` y
   `pnpm build` en verde.
3. Tarea 5: confirmar que cada flag atrapa su error, revertir, confirmar verde.
4. `pnpm lint` y `pnpm exec prettier . --check` limpios al final.
5. Commit solo si se pide; el hook de Husky corre `lint-staged` + `pnpm test`.
