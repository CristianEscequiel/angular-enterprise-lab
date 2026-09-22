# Spec: Estados de error en detalle y edición

## Problema actual

Las páginas de detalle y edición consultan la orden por el identificador
de la ruta (no reciben el objeto completo desde el listado). Actualmente,
si esa consulta falla —registro inexistente o error de red— el único
manejo visible es el toast global del `errorInterceptor`. El toast es
transitorio: desaparece solo y no dice qué hacer ni deja la pantalla en
un estado claro para el usuario.

Esto es distinto del problema de búsqueda (spec 002): ahí el fallo es
recuperable con un reintento del usuario escribiendo de nuevo. Acá el
fallo bloquea la pantalla completa — no hay orden que mostrar ni
formulario que completar si el `id` no existe o la petición falló.

## Requisitos

- `WorkOrdersService` debe distinguir el tipo de fallo al consultar una
  orden por id: "no encontrado" (404) vs "error de conexión/servidor"
  (network o 5xx). Hoy no hace esa distinción — es parte de este spec,
  no un supuesto previo.
- Si la orden no existe o la petición falla por red, la página de detalle
  debe mostrar un estado de error persistente en el lugar del contenido
  — no depender solo del toast.
- El estado de error debe distinguir, en el mensaje mostrado, entre
  "la orden no existe" y "hubo un problema de conexión".
- La página de edición debe comportarse igual que detalle para el error
  de carga inicial.
- Debe existir un botón "Reintentar" que vuelva a disparar la petición.

## Nota para plan mode

Detalle y edición son componentes independientes hoy. Si al revisar el
código el comportamiento de carga/error resulta idéntico en ambos, evaluar
si conviene extraer la lógica compartida (ej: un composable o servicio de
carga) en vez de duplicarla — pero es una decisión a tomar en el plan,
con el código real a la vista, no una obligación de este spec.

## Fuera de alcance

- Protección de envío de formularios inválidos o duplicados
  (corresponde a spec `004-proteccion-formularios`).
- Cambios en `errorInterceptor` o en el toast global — este spec agrega
  un estado local a la página, no reemplaza el mecanismo existente.
- Manejo de foco/accesibilidad del modal (spec `005`).
- Página 404 de routing (ruta inexistente a nivel de la app, no orden
  inexistente) — eso es spec `006-pagina-404`.

## Criterio de aceptación (con estado de fallo explícito)

- Test: navegar directo a `/work-orders/:id` con un `id` que no existe
  → debe mostrar el estado de error de "no encontrado", no un formulario
  vacío ni una pantalla en blanco.
  **Debe fallar** si el componente renderiza el formulario/detalle con
  datos undefined en vez de mostrar el estado de error.

- Test: simular fallo de red al cargar la orden → debe mostrar el estado
  de error de conexión, distinto en texto/acción al de "no encontrado".
  **Debe fallar** si ambos casos muestran el mismo mensaje genérico.

- Test: desde el estado de error, click en "Reintentar" con un mock que
  ahora responde exitosamente → debe mostrar la orden correctamente.
  **Debe fallar** si el reintento no dispara una nueva petición o si
  queda pegado en el estado de error anterior.
