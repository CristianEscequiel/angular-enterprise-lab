# Spec: Subir cobertura de funciones por feature

## Problema actual

La medición de cobertura configurada en spec 007 mostró un desbalance:
Statements (89.38%), Branches (89.58%) y Lines (91.63%) están en un rango
similar, pero Functions está notablemente más bajo (72.95%). Esto indica
que hay funciones completas (métodos, handlers, funciones puras) que
nunca se ejecutan durante la suite actual — no ramas parciales dentro de
una función ya testeada, sino funciones enteras sin cubrir.

La medición fue tomada sobre specs 001-006 (antes de 008a/008b), así que
el número real hoy puede diferir levemente, pero el desbalance relativo
entre Functions y el resto es la señal a resolver.

## Requisitos

- Generar el reporte de cobertura actualizado (`pnpm run test:coverage`)
  y a partir del reporte HTML, identificar los archivos con menor
  porcentaje de funciones cubiertas.
- Priorizar funciones de lógica real (servicios, componentes con lógica
  de negocio) por sobre getters triviales o funciones puramente
  declarativas que no aportan riesgo real si fallan.
- Escribir los tests que falten para las funciones identificadas como
  prioritarias, hasta llevar la métrica de Functions a un nivel
  consistente con las otras tres métricas (referencia: acercarse al
  85-90%, no exigir 100%).
- No modificar código de producción salvo que, al escribir un test,
  se detecte un bug real (en cuyo caso, documentar el hallazgo en
  notes.md antes de corregir, igual que se hizo en spec 001 con la
  mutación).

## Fuera de alcance

- Subir Statements, Branches o Lines si ya están en un nivel razonable
  — el foco es exclusivamente el desbalance de Functions.
- Configurar `coverageThresholds` bloqueante en `angular.json` — spec 007
  decidió explícitamente que el número es informativo, no bloqueante;
  este spec no revierte esa decisión.
- Tests end-to-end o de integración nuevos — este spec es sobre cerrar
  huecos de cobertura unitaria en funciones existentes, no agregar una
  capa de testing distinta.

## Criterio de aceptación (con estado de fallo explícito)

- Ejecutar `pnpm run test:coverage` tras los cambios → Functions debe
  subir de 72.95% a un valor significativamente mayor (objetivo
  orientativo: 85%+), sin que Statements/Branches/Lines bajen respecto
  a la medición actual.
  **Debe fallar** si Functions sube pero a costa de tests triviales que
  no verifican comportamiento real (ej: un test que solo llama a la
  función sin ninguna aserción sobre su resultado).

- Cada función nueva testeada debe tener al menos una aserción que
  verifique un resultado o efecto observable (retorno, cambio de signal,
  llamada a un mock), no solo "no explota al ejecutarse".
  **Debe fallar** si algún test agregado no tiene aserciones
  significativas — sería cobertura "de vidriera", no real.
