# Notas 009: ejecución

## Baseline real (antes de las tareas)

Medido con `pnpm run test:coverage` justo antes de empezar (23 archivos /
119 tests en verde). El 72.95% del README quedó desactualizado por
008a/008b:

```
Statements   : 91.71% ( 764/833 )
Branches     : 90.98% ( 313/344 )
Functions    : 79.5%  ( 128/161 )
Lines        : 93.49% ( 546/584 )
```

## Resultado final

24 archivos / 128 tests en verde (+9 tests: 4 de `MessageService`, 1 de
cierre de toast en `App`, 1 de navegación en `WorkOrderDetail`, 2 de
navegación/error en `WorkOrdersList`, 1 de la ruta `/work-orders/new`).

```
Statements   : 93.87% ( 782/833 )
Branches     : 91.86% ( 316/344 )
Functions    : 87.57% ( 141/161 )
Lines        : 95.71% ( 559/584 )
```

Functions subió 8.07 puntos (79.5% → 87.57%), dentro del objetivo
orientativo 85-90%. Las otras tres métricas no bajaron — de hecho
subieron un poco como efecto colateral de ejercitar más ramas al llamar
las funciones nuevas.

No hubo cambios en código de producción: los tests nuevos pasaron contra
el código existente, no se encontró ningún bug real.

## Hallazgo: código muerto en `app-shell.ts` (no corregido, fuera de alcance)

`layout/app-shell/app-shell.ts` define `showToast()`, `closeToast()` y las
signals `toastOpen`/`toastType`/`toastTitle`/`toastMessage`, sin ninguna
referencia en `app-shell.html` ni en otro archivo del repo. Todo indica
que quedó de una iteración anterior a que `MessageService` + `<app-toast>`
se centralizaran en `App` root (`app.ts`/`app.html`).

No se tocó en este spec: no es un bug (no produce comportamiento
incorrecto, simplemente no se ejecuta nunca) y el spec 009 restringe los
cambios de código de producción a bugs reales encontrados al testear. Se
deja como candidato a limpieza para un spec futuro de mantenimiento.

## Pendiente

- Ninguno de este spec. La limpieza de código muerto en `app-shell.ts`
  queda para un spec aparte, si el usuario lo decide.
