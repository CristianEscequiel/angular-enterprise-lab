# Notas 002: ejecución

## Resultado
- Baseline: 19 archivos / 51 tests en verde.
- Final: 20 archivos / 55 tests en verde (+1 test en `work-orders-list.spec.ts`,
  +1 archivo nuevo `loading.interceptor.spec.ts` con 3 tests).
- No hubo cambios en código de producción: el comportamiento que pide el
  spec (el `switchMap` sobrevive a un error, `LoadingService` se resetea
  vía `finalize`) ya estaba implementado correctamente; el trabajo fue
  blindarlo con tests que puedan fallar de verdad.

## Diagnóstico
- Criterio 1 (una búsqueda posterior a un error resuelve y muestra
  resultados): el `catchError` en `work-orders-list.ts:63-66` está dentro
  del pipe interno que arma `switchMap`, así que el stream externo
  (`this.requests`) nunca ve el error. Ya existía un test parcial
  (`shows an error and keeps the query stream alive…`) que verificaba que
  se dispara una nueva petición, pero no que esa petición se renderice.
  Se agregó `recovers after an HTTP error: a later search resolves and
  renders results`, que sí verifica `workOrders()` y el DOM.
- Criterio 2 (loading se resetea tras error): `work-orders-list.ts` **no**
  inyecta `LoadingService` — el contrato vive enteramente en
  `loading.interceptor.ts` vía `finalize()`. Los tests del listado
  mockean `WorkOrdersService` y nunca pasan por HTTP real, así que no
  podían probar esto. Se agregó `loading.interceptor.spec.ts` (archivo
  nuevo) con `provideHttpClient(withInterceptors([loadingInterceptor]))`
  + `provideHttpClientTesting()`, cubriendo éxito, error HTTP y
  cancelación (caso real de `switchMap` reemplazando un request en vuelo).

## Verificación por mutación (tarea 3)
Cambios temporales, revertidos con `git checkout` (confirmado sin diff
tras revertir).

| Mutación | Archivo | Tests que fallaron |
|---|---|---|
| (A) Quitar el `catchError` interno (líneas 63-66) | `work-orders-list.ts` | `shows an error and keeps the query stream alive…` (existente), `recovers after an HTTP error…` (nuevo, criterio 1), `never keeps more than one active request subscription…` (existente) |
| (B) `finalize(() => hide())` → `tap(() => hide())` | `loading.interceptor.ts` | Los 3 tests de `loading.interceptor.spec.ts` (el de éxito también falla porque `tap` no corre con el mismo timing esperado tras `flush`, y los de error/cancelación fallan porque `tap` no corre en esos casos) |

Ambos criterios de aceptación fallan si se rompe el comportamiento que
protegen.

## No-regresión del toast (sin test nuevo, según pide el spec)
- Revisado `message.service.ts`: `_message` es un único signal, cada
  `showError`/`showSuccess`/`showWarning` hace `.set(...)` y pisa el
  anterior — no hay cola ni acumulación.
- No se tocó `error.interceptor.ts` ni `message.service.ts` en esta
  ejecución. La suite completa (55 tests) sigue en verde, sin tests
  existentes afectados.

## Pendiente
- Tarea 5 (README): opcional, no se tocó — el checkbox de
  "Recuperar la búsqueda después de errores…" (línea 291) ya estaba
  marcado desde 001 y sigue siendo válido; no se agregó fila a la tabla
  de specs (línea 255-257) a la espera de confirmación del usuario.
- Verificación E2E manual (`pnpm api` + `pnpm start`) no se ejecutó.
