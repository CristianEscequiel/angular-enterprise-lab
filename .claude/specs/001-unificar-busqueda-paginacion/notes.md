# Notas 001: ejecución

## Resultado

- Baseline: 19 archivos / 46 tests en verde.
- Final: 19 archivos / 51 tests en verde (−1 smoke test del servicio, +3 del listado, +3 del servicio).
- No hubo cambios en código de producción: los tests nuevos pasaron contra el código existente, no se encontraron bugs.

## Verificación por mutación (tarea 4)

Cambios temporales en `work-orders-list.ts`, revertidos con `git checkout`.

| Mutación                                            | Tests que fallaron                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `switchMap` → `mergeMap`                        | `two overlapping searches…` (criterio 2), `never keeps more than one active request subscription…`, `cancels a page request when a new search is applied` (existente)                          |
| (b) quitar el bloque `if (query.page > totalPages)` | `after searching and deleting the only item on page 2…` (criterio 1), más los existentes `clamps a restored page…`, `reloads after deletion…`, `uses page 1 when the collection becomes empty` |

Ambos criterios de aceptación fallan si se rompe el comportamiento que protegen.

## Pendiente

- Tarea 5b (README, checkboxes del roadmap líneas 258-260): requiere confirmación del usuario.
- Verificación E2E manual (`pnpm api` + `pnpm start`): no se ejecutó. Sigue sin verificarse cómo responde json-server ante una página inexistente.
