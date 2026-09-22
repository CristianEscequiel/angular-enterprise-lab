# Spec: Cobertura de tests y verificaciones de formato

## Problema actual

El README documenta explícitamente dos huecos en las verificaciones del
proyecto:

- Vitest está integrado pero la medición de cobertura no es ejecutable
  con las dependencias declaradas — falta incorporar y configurar un
  proveedor compatible con la versión instalada.
- La última verificación registrada muestra "Prettier: diferencias de
  formato pendientes" — el formato no está validado automáticamente en
  ningún punto del flujo (ni en CI, ni en el pre-commit hook).
- El hook de Husky solo corre `pnpm test`; la integración de `lint-staged`
  está pendiente según el propio README.

## Requisitos

- Configurar un proveedor de cobertura compatible con la versión de
  Vitest instalada (`@vitest/coverage-v8` es la opción estándar salvo
  que haya una razón concreta para otra).
- El comando de cobertura debe ejecutarse sin errores y producir un
  reporte legible (texto en consola como mínimo; HTML opcional).
- Corregir las diferencias de formato de Prettier pendientes, dejando el
  repo en estado limpio respecto a `pnpm exec prettier . --check`.
- Integrar `lint-staged` al hook de pre-commit de Husky, para que
  ESLint y Prettier se ejecuten sobre los archivos modificados antes de
  cada commit — no solo los tests.
- Documentar en el README el comando de cobertura y, si corresponde, un
  umbral mínimo aceptado (a definir: puede ser informativo por ahora,
  sin bloquear el commit si no se alcanza).

## Fuera de alcance

- Escribir tests nuevos para subir el porcentaje de cobertura — este
  spec configura la medición, no persigue un número. Los tests que
  falten se cubren en sus specs correspondientes (002-006 ya escritos,
  y los que vengan).
- Integrar cobertura a un pipeline de CI (GitHub Actions) — eso queda
  para cuando se aborde `015-rendimiento-documentacion-despliegue` o una
  spec de CI dedicada, si se decide más adelante.
- Cambiar la configuración de ESLint (reglas existentes) — solo se
  asegura que corra en el momento correcto, no se modifican sus reglas.

## Criterio de aceptación (con estado de fallo explícito)

- Ejecutar `pnpm test -- --coverage` (o el comando equivalente que
  resulte de la configuración) → debe correr sin errores y mostrar un
  reporte de cobertura con números reales, no un error de proveedor
  faltante.
  **Debe fallar** si el comando sigue arrojando el error de proveedor
  no configurado que hoy impide medir cobertura.

- Ejecutar `pnpm exec prettier . --check` → debe salir sin diferencias
  pendientes.
  **Debe fallar** si persiste algún archivo con formato no aplicado.

- Modificar un archivo con una violación de formato deliberada (ej: mal
  indentado) y hacer `git commit` → el hook debe bloquear el commit o
  corregir el archivo automáticamente vía `lint-staged`, según cómo se
  configure.
  **Debe fallar** si el commit se completa igual con el archivo mal
  formateado, sin intervención del hook.

## Nota para plan mode

lint-staged debe corregir automáticamente y re-agregar al stage lo que
sea corregible sin ambigüedad (Prettier: formato, siempre auto-fix).
Para ESLint, aplicar auto-fix donde la regla lo soporte (`--fix`); los
errores que ESLint no pueda corregir automáticamente deben bloquear el
commit, no ignorarse silenciosamente.
