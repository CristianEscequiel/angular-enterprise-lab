# Spec: Tipado estricto y aliases de paths

Deriva de `008-tipado-estricto-accesibilidad-responsive`, tras el
diagnóstico que dividió esa auditoría en dos sub-specs. Ver también
`008b-accesibilidad-responsive`.

**Orden de ejecución: esta sub-spec va primero.** Activar `strictTemplates`
puede marcar errores en los mismos templates que 008b va a reescribir;
hacerlo al revés implica tocarlos dos veces.

## Problema actual

El README listaba "revisar tipado estricto y aliases" sin detalle. El
diagnóstico midió el estado real, y resultó bastante más chico de lo que
esa frase sugería — con una sola incógnita.

### Tipado: `strict` nunca estuvo activo, pero el código ya es strict-safe

`tsconfig.json` no declara `strict` ni ninguno de sus sub-flags. No es
que se haya relajado: el archivo no se tocó desde el commit inicial, o
sea el scaffold se generó sin él (un `ng new` de Angular 22 trae
`strict: true` y `strictTemplates: true`).

Lo que sí está activo hoy: `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, y de Angular `strictInjectionParameters` y
`strictInputAccessModifiers`.

Medición real con el compilador (sin modificar archivos, vía flags de CLI,
TypeScript 6.0.3):

| Variante                                | `tsconfig.app.json` | `tsconfig.spec.json` |
| --------------------------------------- | ------------------- | -------------------- |
| Base (sin flags)                        | 0 errores           | 0 errores            |
| `--strict`                              | **0 errores**       | **0 errores**        |
| `--strict --noUnusedLocals`             | 0                   | 0                    |
| `--strict --noUnusedParameters`         | 0                   | 0                    |
| `--strict --exactOptionalPropertyTypes` | 0                   | 0                    |
| `--strict --useUnknownInCatchVariables` | 0                   | 0                    |
| `--strict --noUncheckedIndexedAccess`   | **8 errores**       | **11 errores**       |

Es decir: **activar `strict` es gratis**. El único flag con costo real es
`noUncheckedIndexedAccess`, con **11 errores distintos en 4 archivos**:

- `features/work-orders/work-orders.routes.ts` (5) — `segments[0]` /
  `segments[1]` en los `UrlMatcher` de spec 006; hay guardas de
  `segments.length` justo antes, pero TS no las correlaciona con el índice.
- `shared/components/modal/modal.ts` (2) — `focusable[0]` y
  `focusable[focusable.length - 1]` en el focus trap de spec 005, pese al
  early-return de `length === 0`.
- `shared/components/modal/modal.spec.ts` (4) — indexado de arrays en tests.
- `core/interceptors/mock-api.interceptor.ts` (1) — spread de
  `WORK_ORDERS_MOCK[index]` que produce todas las props opcionales.

Higiene previa confirmada: **cero `any`, cero `@ts-ignore`/`@ts-expect-error`**
en todo `src/`.

**La incógnita:** `strictTemplates` está apagado (template type-check en
"basic mode": no verifica tipos de bindings de entrada, ni `$event`, ni
pipes, ni referencias de template). Su costo **no se pudo medir** durante
el diagnóstico porque requiere editar un tsconfig y el diagnóstico corrió
en modo solo-lectura. `ngc` con la config actual da 0 errores, pero eso no
dice nada sobre lo que aparecería con el flag activo.

### Aliases: no existen, y hay 15 imports de cuatro niveles

No hay `paths` ni `baseUrl` en ningún tsconfig ni en `angular.json`.

- 34 imports relativos de ≥2 niveles, en 10 archivos.
- **15 de ellos con `../../../../`**, y son todos el mismo patrón: desde
  `features/work-orders/pages/*` o `components/*` hacia
  `shared/components/*` (10) y `core/services/*` (5).
- Los otros 19 son de 2 niveles e intra-feature (`pages/X` →
  `../../data-access`, `../../models`): un alias tipo `@core`/`@shared`
  **no** los resolvería y no se tocan.
- Tamaño del proyecto: 55 archivos `.ts` (32 de implementación + 23 spec),
  una sola feature real (`work-orders`, 20 archivos).

Se evaluó si el tamaño actual justifica introducirlos y **se decidió que
sí**: los 15 casos de 4 niveles son exactamente el cruce de capa que un
alias resuelve, y es más barato hacerlo ahora que después de que el
patrón se consolide.

## Requisitos

### Tipado

- Activar `strict: true` en `tsconfig.json`.
- Activar también `noUnusedLocals`, `noUnusedParameters`,
  `exactOptionalPropertyTypes` y `useUnknownInCatchVariables` — los cuatro
  tienen costo 0 medido, así que entran sin trabajo adicional.
- Activar `noUncheckedIndexedAccess` y resolver los 11 errores tipando
  correctamente (son null-safety genuino, no ruido del flag): usar
  destructuring con guarda, `at()`, o early-returns que TS pueda
  correlacionar. **Prohibido** silenciarlos con `any`, aserciones `!` a
  ciegas, o `@ts-ignore`.
- **Medir `strictTemplates` antes de decidir**: activarlo, correr
  `ng build` y `pnpm test`, y recién ahí evaluar el tamaño. Si el costo es
  acotado, resolverlo dentro de esta sub-spec. Si resulta grande, es
  legítimo dejarlo documentado y diferido — pero la decisión debe tomarse
  **con el número medido a la vista**, no por anticipado.
- Activar `typeCheckHostBindings` si `strictTemplates` queda activo (su
  default sigue a ese flag).

### Aliases

- Introducir `@core/*`, `@shared/*` y `@features/*` en `tsconfig.json`.
- Reescribir los 15 imports de 4 niveles. Los intra-feature de 2 niveles
  quedan como están.
- **Riesgo a verificar explícitamente:** los aliases tienen que resolver en
  tres lugares, no uno — `ng build`, el builder de tests
  (`@angular/build:unit-test`, que no tiene un `vitest.config.ts` propio en
  este repo) y el editor. Que compile el build no alcanza como verificación.

## Fuera de alcance

- Accesibilidad y responsive: son `008b-accesibilidad-responsive`.
- Pasar ESLint a configs type-aware (`recommendedTypeChecked` /
  `strictTypeChecked`): hoy usa `recommended` + `stylistic` sin
  `parserOptions.project`. Es un cambio con su propio costo y merece su
  propia evaluación.
- El cruce de capas detectado en
  `core/interceptors/mock-api.interceptor.ts`, que importa de `features/`
  (`core` dependiendo de `features`). Se deja anotado como deuda: además
  es código muerto — no está registrado en `app.config.ts` desde que
  JSON Server reemplazó al mock.

## Criterio de aceptación (con estado de fallo explícito)

- `npx tsc -p tsconfig.app.json --noEmit` y
  `npx tsc -p tsconfig.spec.json --noEmit` → 0 errores con todos los flags
  nuevos activos en el `tsconfig.json` (no por CLI).
  **Debe fallar** si queda algún error sin resolver.

- Revisión de que no se silenció nada: `grep` de `any`, `as any`,
  `@ts-ignore`, `@ts-expect-error` y `!.` en `src/` → debe seguir dando
  cero (el estado previo medido).
  **Debe fallar** si algún error de tipado se "resolvió" silenciándolo en
  vez de tipándolo.

- `pnpm build` y `pnpm test` en verde con `strictTemplates` activo (o, si
  se difiere, con el número de errores medido y documentado en `notes.md`
  junto con la razón).
  **Debe fallar** si se activa `strictTemplates` y se deja el build roto.

- Los aliases resuelven en build **y** en tests: `pnpm build` y `pnpm test`
  verdes después de reescribir los imports.
  **Debe fallar** si compilan en el build pero rompen en la suite de tests
  — es el modo de falla esperado si el builder de tests no toma los `paths`.
