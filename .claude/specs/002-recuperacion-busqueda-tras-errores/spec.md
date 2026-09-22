# Spec: Recuperación de la búsqueda tras errores

## Problema actual

El pipeline de búsqueda usa `switchMap` para cancelar requests superpuestos
(ya cubierto y testeado en 001). El riesgo no cubierto: si el HTTP falla,
el error puede propagarse hacia arriba en la cadena de `switchMap` sin ser
capturado en el punto correcto. Si eso pasa, el observable externo se
completa o entra en error de forma permanente, y **búsquedas posteriores
dejan de disparar peticiones** — no es un problema de UX (falta un mensaje),
es una posible ruptura silenciosa del flujo reactivo.

El `errorInterceptor` ya interpreta errores HTTP y dispara el mensaje global
(ver README, sección "HTTP y backend de desarrollo"), pero interceptar no es
lo mismo que blindar el `switchMap` del componente de listado.

## Requisitos

- Un error de red/HTTP durante una búsqueda no debe romper búsquedas
  posteriores: escribir un nuevo término después de un error debe disparar
  una nueva petición y mostrar resultados si la petición es exitosa.
- El indicador de loading (`LoadingService`) debe resetearse correctamente
  tras un error — no debe quedar "colgado" en estado de carga.
- El mensaje de error global debe dispararse una vez por fallo, no
  acumularse ni repetirse en errores subsiguientes de la misma búsqueda.

## Fuera de alcance

- Retry automático de la petición fallida.
- Detección de estado offline.
- Estados de error persistentes y específicos por pantalla en detalle/edición
  (eso corresponde a spec `003-estados-error-detalle-edicion`).
- Cualquier cambio en `errorInterceptor` mismo — el spec asume que el
  interceptor ya funciona correctamente y se enfoca en el componente de
  listado y el servicio de búsqueda.

## Criterio de aceptación (con estado de fallo explícito)

- Test: forzar un error HTTP en una búsqueda (mock del servicio con error),
  luego disparar una segunda búsqueda válida → debe resolver correctamente
  y mostrar resultados.
  **Debe fallar** si el `switchMap` quedó muerto tras el primer error
  (síntoma: la segunda búsqueda nunca llega a completarse ni a emitir).

- Test: tras un error, el signal/estado de loading vuelve a `false`.
  **Debe fallar** si el loading queda en `true` de forma indefinida.

## Verificación de no-regresión

- El comportamiento actual del toast (un error nuevo sobrescribe al
  anterior, sin acumulación) debe mantenerse sin cambios tras este spec.
  No requiere test nuevo — se confirma que ningún test existente que
  cubra ese comportamiento se rompe.
