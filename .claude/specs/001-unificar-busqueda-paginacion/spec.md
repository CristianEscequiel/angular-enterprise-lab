# Spec: Unificar búsqueda, paginación y recarga del listado

## Problema actual
La búsqueda, paginación y recarga tras eliminar no están coordinadas.
(Referencia: README sección "Funcionalidades actuales" y roadmap punto 1)

## Requisitos
- Al buscar, la página debe resetear a 1
- Al eliminar un registro en la última página con un solo ítem, retroceder de página
- La búsqueda no debe generar suscripciones duplicadas (ver RxJS: switchMap ya en uso)

## Fuera de alcance
- Filtros por estado/prioridad (roadmap fase 2)
- Autenticación

## Criterio de aceptación (con estado de fallo explícito)
- Test: buscar "X", cambiar a página 2, eliminar único resultado de esa página
  → debe navegar a página 1 automáticamente, NO mostrar página vacía
- Test: dos búsquedas rápidas seguidas → solo la última request debe resolver
  (test debe FALLAR si hay condición de carrera, no debe poder "saltearse")
