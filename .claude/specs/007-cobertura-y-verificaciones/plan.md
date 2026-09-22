# Plan 007: Cobertura de tests y verificaciones de formato

Spec: `.claude/specs/007-cobertura-y-verificaciones/spec.md`

## Contexto

**Precondición confirmada primero, como pide el spec:** `pnpm test` da
**23 archivos / 104 tests en verde** (corrida real, justo después del
commit de spec 006) — la suite de 002-006 está completa y en verde antes
de proponer nada de cobertura, así que el número que salga de configurar
el proveedor va a reflejar la suite real, no una parcial.

A diferencia de 001-006, este spec es de **tooling/configuración**, no
de código de aplicación. Investigado el estado real (no asumido):

| Requisito del spec                | Estado real (verificado)                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proveedor de cobertura compatible | **No instalado.** `ng test --coverage` falla hoy con: `Code coverage requires either "@vitest/coverage-v8" or "@vitest/coverage-istanbul" to be installed.` El builder `@angular/build:unit-test` (`angular.json`) ya expone `coverage`, `coverageReporters`, `coverageThresholds` como opciones nativas — solo falta el paquete |
| Formato Prettier limpio           | **No.** `pnpm exec prettier . --check` reporta **106 archivos** con diferencias (prácticamente todo el repo — `.ts`, `.html`, `.scss`, `tsconfig*.json`). Verificado que el diff es puramente de espacios/blank lines (ej. `button.ts`: solo remueve líneas en blanco sobrantes), no hay riesgo semántico                        |
| `lint-staged` integrado           | **No.** El paquete `lint-staged@17.2.0` ya está en `devDependencies` pero no tiene configuración en ningún lado (ni `.lintstagedrc*`, ni clave `lint-staged` en `package.json`) y `.husky/pre-commit` solo tiene `pnpm test`                                                                                                     |
| Vitest instalado                  | `vitest@4.1.10` (resuelto por pnpm) — el paquete de cobertura debe fijarse en esa misma línea mayor (`@vitest/coverage-v8` v5 exige `vitest@5`, incompatible; la línea 4.1.x sí matchea)                                                                                                                                         |

**Decisión de diseño — orden de tareas:** el reformateo masivo de 106
archivos se hace en su **propio commit aislado**, sin mezclar con la
configuración de `lint-staged`/cobertura — es una práctica estándar
para no ensuciar `git blame` con cambios mecánicos mezclados con cambios
de comportamiento. Por eso el reformateo va en su propia tarea, verificado
independientemente (`pnpm test`/`pnpm lint`/`pnpm build` en verde después,
para probar que no rompió nada).

**Decisión de diseño — cobertura vía configuración nombrada, no flags
sueltos:** en vez de documentar `pnpm test -- --coverage` con flags de
array repetidos (frágil entre bash/PowerShell), se agrega una
configuración `coverage` en el target `test` de `angular.json` (mismo
patrón que usa Angular para `--configuration production` en `build`) y
un script `test:coverage` en `package.json`. Sin `coverageThresholds`
— el spec pide explícitamente que sea informativo por ahora, y esa
opción hace que el builder **falle** si no se alcanza, lo cual bloquearía
sin que se haya pedido.

**Decisión de diseño — `lint-staged`:** según la nota del spec, Prettier
siempre corrige (`--write`) y ESLint corrige lo que pueda (`--fix`); lo
que ESLint no pueda arreglar debe bloquear el commit. Este es el
comportamiento **default** de `lint-staged` (aborta si algún comando de
la lista sale con código distinto de cero) — no hace falta configuración
extra para lograrlo, solo definir bien los comandos por tipo de archivo.

## Tareas

### 1. Proveedor de cobertura

- **Archivos:** `package.json` (nueva devDependency), `angular.json`
  (nueva configuración `coverage` en el target `test`)
- **Cambio:**
  - `pnpm add -D @vitest/coverage-v8@^4.1.10` (misma línea mayor que el
    `vitest` instalado).
  - En `angular.json`, target `test` del proyecto:
    ```json
    "test": {
      "builder": "@angular/build:unit-test",
      "configurations": {
        "coverage": {
          "coverage": true,
          "coverageReporters": ["text", "html"]
        }
      }
    }
    ```
  - En `package.json`: `"test:coverage": "ng test --configuration coverage"`.
- **Verificación:** `pnpm run test:coverage` corre sin el error de
  proveedor faltante y muestra una tabla de cobertura real en consola
  (criterio de aceptación 1 del spec, literal). Se anota el número
  resultante en `notes.md` (informativo, sin perseguirlo — fuera de
  alcance subirlo).

### 2. Reformateo completo con Prettier (commit aislado)

- **Archivos:** los 106 que reporta `pnpm exec prettier . --check`
  (todo `.ts`/`.html`/`.scss` bajo `src/`, `tsconfig*.json`) — no se
  listan uno por uno, es un `prettier --write .` sobre todo el repo.
- **Cambio:** `pnpm exec prettier . --write`.
- **Verificación:**
  - `pnpm exec prettier . --check` sale sin diferencias (criterio de
    aceptación 2 del spec, literal).
  - `pnpm test`, `pnpm lint` y `pnpm build` siguen en verde después del
    reformateo (prueba de que fue puramente mecánico, sin romper nada).

### 3. `lint-staged` integrado al pre-commit de Husky

- **Archivo nuevo:** `.lintstagedrc.json`
  ```json
  {
    "*.{ts,html}": ["eslint --fix", "prettier --write"],
    "*.{scss,json,md}": "prettier --write"
  }
  ```
  (`.ts`/`.html` son los únicos patrones que cubre `eslint.config.js`
  hoy — `**/*.ts` y `**/*.html` — así que solo esos pasan por ESLint;
  el resto solo por Prettier).
- **Archivo:** `.husky/pre-commit`
  ```
  pnpm exec lint-staged
  pnpm test
  ```
  (se agrega `lint-staged` **antes** de `pnpm test` — falla rápido en lo
  barato antes de correr la suite completa; se mantiene `pnpm test` tal
  cual, sin reemplazarlo).
- **Verificación (criterio de aceptación 3 del spec, con dos casos):**
  - **Caso corregible (Prettier):** modificar un archivo con una
    indentación incorrecta (algo que Prettier arregla solo), `git add`,
    `git commit` → el hook debe corregir el archivo, re-agregarlo al
    stage, y el commit debe completarse con el archivo ya bien
    formateado. **Debe fallar** (el test es inválido) si el commit
    completa con el archivo todavía mal formateado.
  - **Caso no corregible (ESLint):** introducir algo que ESLint marca
    como error pero no puede autofijar (ej. una variable declarada y no
    usada — `@typescript-eslint/no-unused-vars` no es auto-fixable),
    `git add`, `git commit` → el hook debe **bloquear** el commit
    (`lint-staged`/`eslint --fix` sale con código distinto de cero).
    **Debe fallar** si el commit se completa igual con el error presente
    (es exactamente el escenario que el spec marca como fallo explícito).
  - Ambas pruebas se hacen sobre un archivo/branch descartable (no se
    commitea el archivo roto real) y se documentan en `notes.md`.

### 4. Documentación en el README (requisito explícito del spec, no opcional)

- **Archivo:** `README.md`
- **Cambio:**
  - Sección "Estado de las pruebas": reemplazar el párrafo "La medición
    de cobertura requiere incorporar y configurar un proveedor... No se
    declara un porcentaje de cobertura alcanzado." por el comando real
    (`pnpm run test:coverage`) y el número medido tras la tarea 1,
    aclarando explícitamente que es informativo y no bloquea el commit
    (tal como pide el spec).
  - Agregar una línea sobre `lint-staged` ahora integrado al pre-commit
    (Prettier siempre corrige, ESLint corrige lo que puede y bloquea lo
    que no).
  - Sección "Última verificación registrada": agregar una entrada nueva
    fechada (no se reescribe la del 7 de septiembre, que es un registro
    histórico) con los resultados reales post-spec-007: build, lint,
    tests, Prettier (ahora limpio), cobertura (número real).
  - Tabla de specs: agregar fila para `007-cobertura-y-verificaciones`.

## Fuera de alcance (según el spec)

Escribir tests nuevos para subir el número de cobertura; integrar
cobertura a CI; cambiar reglas de ESLint (solo se asegura que corra en
el momento correcto). Tampoco se define un umbral bloqueante — el spec
lo permite informativo por ahora.

## Verificación

1. Confirmado antes de empezar: `pnpm test` → 23 archivos / 104 tests en
   verde (specs 002-006 completos).
2. Tras la tarea 1: `pnpm run test:coverage` sin el error de proveedor.
3. Tras la tarea 2: `pnpm exec prettier . --check` limpio; `pnpm test` +
   `pnpm lint` + `pnpm build` en verde.
4. Tras la tarea 3: los dos casos de commit (corregible / no corregible)
   se comportan como describe el spec, probados sobre archivos
   descartables y revertidos antes de continuar.
5. `pnpm lint` y `pnpm build` en verde al final, sobre el estado
   definitivo del repo.
6. Commit(s) solo si se piden — este spec, por su propia naturaleza
   (reformateo masivo + config), probablemente amerite más de un commit
   separado (ver Tarea 2); se decide con el usuario antes de commitear.
