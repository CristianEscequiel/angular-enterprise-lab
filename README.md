# Angular Enterprise Lab

> Laboratorio de arquitectura Angular moderna orientado a construir una aplicación mantenible, escalable y cercana a un entorno enterprise real.

**Angular Enterprise Lab** es un proyecto creado para experimentar, estudiar y aplicar buenas prácticas de desarrollo frontend utilizando las versiones más recientes de Angular.

El objetivo no es solamente construir funcionalidades, sino también documentar y poner en práctica decisiones relacionadas con:

- arquitectura;
- separación de responsabilidades;
- componentes reutilizables;
- manejo de estado;
- HTTP e interceptores;
- formularios;
- routing;
- testing;
- estilos;
- calidad de código.

El dominio elegido para el laboratorio es un pequeño sistema de **gestión de órdenes de mantenimiento**, permitiendo trabajar sobre escenarios similares a una aplicación empresarial real.

---

## Stack

- **Angular 22**
- **TypeScript 6**
- **RxJS 7**
- **Angular Signals**
- **Reactive Forms**
- **SCSS**
- **Vitest**
- **ESLint**
- **Prettier**
- **Husky**
- **pnpm**

Actualmente el backend está simulado mediante un **Mock API Interceptor**, permitiendo desarrollar el frontend manteniendo una arquitectura preparada para consumir posteriormente una API real.

---

# Objetivos del proyecto

Este repositorio cumple principalmente tres objetivos.

### Laboratorio Angular

Experimentar con APIs modernas de Angular y comprender cuándo utilizarlas:

```ts
signal()
computed()
effect()
input()
output()
model()
```

Además de:

```ts
provideHttpClient()
withInterceptors()
loadComponent()
loadChildren()
```

---

### Proyecto de referencia

Construir una aplicación que pueda servir como referencia para futuros proyectos Angular.

La intención es responder preguntas como:

- ¿Dónde debería vivir un servicio?
- ¿Qué pertenece a `core`?
- ¿Qué debería ser `shared`?
- ¿Qué debería encapsular una feature?
- ¿Dónde debería manejarse un error HTTP?
- ¿Cuándo usar Signals?
- ¿Qué debería testear un componente?
- ¿Qué debería testear un servicio?

---

### Proyecto demostrativo

Aplicar buenas prácticas sobre un proyecto funcional y no únicamente mediante ejemplos aislados.

La arquitectura y las decisiones técnicas tienen tanta importancia como las funcionalidades implementadas.

---

# Arquitectura

La aplicación utiliza una arquitectura **feature-first** combinada con capas globales bien definidas.

```text
src/app
│
├── core/
│   ├── interceptors/
│   └── services/
│
├── features/
│   ├── dashboard/
│   └── work-orders/
│
├── layout/
│
├── shared/
│   └── components/
│
├── app.config.ts
├── app.routes.ts
└── app.ts
```

La regla principal es:

```text
App
│
├── Core      → infraestructura global
├── Layout    → estructura visual global
├── Shared    → piezas reutilizables
└── Features  → lógica funcional del dominio
```

---

# Core

`core/` contiene infraestructura utilizada de manera transversal por toda la aplicación.

Actualmente:

```text
core/
├── interceptors/
│   ├── error.interceptor.ts
│   ├── loading.interceptor.ts
│   └── mock-api.interceptor.ts
│
└── services/
    ├── loading.service.ts
    └── message.service.ts
```

`core` no debería convertirse en un lugar genérico donde colocar cualquier archivo.

Su responsabilidad es alojar elementos globales o singleton relacionados con la infraestructura de la aplicación.

---

## HTTP Interceptors

Los interceptores están registrados globalmente utilizando la API funcional de Angular:

```ts
provideHttpClient(
  withInterceptors([
    loadingInterceptor,
    errorInterceptor,
    mockApiInterceptor
  ])
)
```

Cada interceptor tiene una responsabilidad concreta.

### Loading Interceptor

Detecta peticiones HTTP en curso y delega el estado de carga al `LoadingService`.

Esto permite tener un **spinner global** sin repetir lógica en cada componente.

```text
HTTP Request
     ↓
LoadingInterceptor
     ↓
LoadingService
     ↓
Global Spinner
```

---

### Error Interceptor

Centraliza el manejo de errores HTTP.

Permite evitar código repetido como:

```ts
error: () => {
  // interpretar status
  // decidir mensaje
  // mostrar toast
}
```

en cada componente.

El interceptor puede transformar los diferentes códigos HTTP en mensajes entendibles para la UI.

---

### Mock API Interceptor

Actualmente el proyecto no depende de un backend real.

El `mockApiInterceptor` simula endpoints HTTP para poder desarrollar las features manteniendo el mismo flujo que tendría una API REST real.

```text
Component
    ↓
Service
    ↓
HttpClient
    ↓
MockApiInterceptor
    ↓
Mock Response
```

Esto permite reemplazar posteriormente el mock por una API real sin modificar la arquitectura de los componentes.

---

# Shared

`shared/` contiene componentes visuales reutilizables que no conocen reglas específicas del dominio.

Actualmente existen:

```text
shared/components/
├── alert/
├── badge/
├── button/
├── modal/
├── spinner/
└── toast/
```

Estos componentes forman progresivamente un pequeño **UI Kit propio**.

---

## Principio de los componentes Shared

Un componente compartido debería recibir información y emitir eventos.

Por ejemplo:

```text
Parent
  ↓ input
Button
  ↓ output
Parent
```

El componente `Button` no debería conocer:

- Work Orders;
- servicios HTTP;
- rutas específicas;
- reglas de negocio.

Esto mantiene bajo el acoplamiento.

---

## Button

Componente reutilizable para evitar repetir estilos y comportamiento de botones en toda la aplicación.

Permite trabajar con variantes visuales como:

```text
primary
secondary
outline
danger
close
```

---

## Badge

Representa estados mediante variantes visuales.

Los badges pueden representar tanto estados semánticos generales:

```text
success
warning
error
info
```

como estados propios del dominio cuando sea necesario.

La intención es mantener separado:

```text
estado del dominio
        ↓
representación visual
```

---

## Alert

Componente utilizado para representar mensajes persistentes dentro de una vista.

Se diferencia del Toast principalmente por su comportamiento:

```text
Toast → notificación temporal

Alert → mensaje persistente dentro del layout
```

---

## Toast

Sistema de notificaciones globales utilizado junto con `MessageService`.

Ejemplo conceptual:

```ts
messageService.showSuccess(
  'Orden de trabajo actualizada correctamente'
);
```

La feature solicita mostrar el mensaje pero no necesita conocer cómo se renderiza.

```text
Feature
   ↓
MessageService
   ↓
Toast
```

---

## Spinner

Indicador de carga global conectado al estado generado por las peticiones HTTP.

La intención es evitar implementar:

```ts
loading = true;
```

en cada página solamente para representar peticiones HTTP globales.

---

## Modal

Componente genérico de confirmación.

Permite:

- abrir y cerrar el diálogo;
- personalizar el mensaje;
- cancelar una acción;
- emitir la confirmación hacia el componente padre.

La acción real permanece fuera del modal.

```text
Modal
  ↓ confirm
Page
  ↓
Business Action
```

De esta forma el componente puede reutilizarse para eliminar órdenes u otras futuras entidades.

---

# Layout

`layout/` representa la estructura visual general de la aplicación.

Aquí viven componentes relacionados con la composición de la interfaz, por ejemplo:

```text
App Shell
├── Header
├── Sidebar
└── Router Outlet
```

El layout organiza la aplicación pero no debería contener lógica específica de una feature.

---

# Features

Las funcionalidades se organizan por dominio.

Actualmente:

```text
features/
├── dashboard/
└── work-orders/
```

Cada feature debería ser lo suficientemente independiente como para contener sus propias:

```text
pages
components
models
services
routes
```

cuando sean necesarias.

---

# Work Orders

`work-orders` es actualmente la feature principal del laboratorio.

Representa la gestión de órdenes de mantenimiento.

Las rutas disponibles son:

```text
/work-orders
/work-orders/new
/work-orders/:id
/work-orders/:id/edit
```

Angular carga estas vistas mediante lazy loading.

---

## Routing

La aplicación utiliza lazy loading tanto a nivel de feature como de componente.

Ejemplo:

```ts
{
  path: 'work-orders',
  loadChildren: () =>
    import('./features/work-orders/work-orders.routes')
      .then(m => m.WORK_ORDERS_ROUTES)
}
```

Dentro de la feature:

```ts
{
  path: ':id/edit',
  loadComponent: () =>
    import('./pages/work-order-edit/work-order-edit')
      .then(m => m.WorkOrderEdit)
}
```

Esto mantiene separadas las features y evita cargar código que todavía no es necesario.

---

# Create y Edit

Crear y editar son dos casos de uso diferentes pero comparten gran parte de la interfaz.

Por eso la arquitectura favorece:

```text
Create Page ─┐
             ├── WorkOrderForm
Edit Page ───┘
```

Las páginas se encargan de:

- obtener datos;
- llamar servicios;
- navegar;
- manejar el resultado de la operación.

El formulario se encarga de:

- representar inputs;
- validaciones;
- emitir los datos ingresados.

Esto evita duplicar formularios sin mezclar responsabilidades.

---

## Edición mediante ID

Cuando se navega a:

```text
/work-orders/:id/edit
```

la página obtiene nuevamente la orden mediante su identificador.

Conceptualmente:

```text
URL
 ↓
:id
 ↓
WorkOrderEdit
 ↓
WorkOrdersService.getById(id)
```

Se evita depender de haber navegado previamente desde otra pantalla pasando el objeto completo.

Esto permite:

- refrescar el navegador;
- compartir la URL;
- entrar directamente mediante un enlace;
- mantener las rutas independientes del estado previo de navegación.

---

# Estado con Signals

El proyecto utiliza Signals principalmente para estado local y reactivo.

Ejemplo:

```ts
readonly workOrder = signal<WorkOrder | null>(null);
```

Para actualizar estado:

```ts
this.workOrder.update(current => ({
  ...current,
  ...workOrderData
}));
```

Cuando un valor depende de otro estado se prioriza `computed()` en lugar de recalcular información innecesariamente desde el template.

```ts
readonly classes = computed(() => {
  // derive UI state
});
```

---

## input(), output() y model()

Se priorizan las APIs modernas de Angular frente a los decoradores tradicionales cuando resulta adecuado.

```ts
input()
output()
model()
```

### input

Comunicación:

```text
Parent → Child
```

### output

Comunicación:

```text
Child → Parent
```

### model

Utilizado cuando existe un estado que realmente necesita comunicación bidireccional.

```text
Parent ⇄ Child
```

No se utiliza `model()` solamente para evitar escribir un output.

La decisión depende de quién es responsable del estado.

---

# Formularios

Los formularios utilizan **Reactive Forms**.

Se prioriza:

- tipado;
- validaciones explícitas;
- formularios reutilizables;
- separación entre formulario y operación HTTP.

La responsabilidad se mantiene así:

```text
Form
 ↓ valid data
Page
 ↓
Service
 ↓
HTTP
```

El formulario no debería decidir cómo persistir la información.

---

# Servicios

Los servicios de dominio encapsulan el acceso a datos.

Ejemplo conceptual:

```text
WorkOrdersList
       ↓
WorkOrdersService
       ↓
HttpClient
       ↓
API
```

La página no debería construir manualmente requests HTTP.

Esto permite cambiar posteriormente:

```text
Mock API
   ↓
Real REST API
```

manteniendo prácticamente intacta la UI.

---

# Manejo de responsabilidades

Una de las reglas principales del proyecto es que cada capa tenga una responsabilidad clara.

```text
Component
    ↓
interacción con usuario

Page
    ↓
orquestación del caso de uso

Service
    ↓
acceso a datos

Interceptor
    ↓
comportamiento HTTP transversal
```

Esto también define cómo se realizan los tests.

---

# Testing

El proyecto utiliza **Vitest** mediante la integración de testing de Angular.

La estrategia no consiste simplemente en comprobar:

```ts
expect(component).toBeTruthy();
```

El objetivo es probar el comportamiento correspondiente a cada unidad.

---

## Testing de servicios

Para un servicio HTTP:

```text
WorkOrdersService
       ↓
HttpClient
```

interesa comprobar cosas como:

```text
getAll()
    ↓
GET /api/work-orders
```

La responsabilidad del test es validar que el servicio genere correctamente la petición esperada.

---

## Testing de componentes

Cuando se prueba una página no es necesario volver a probar `HttpClient`.

En su lugar se mockea:

```text
WorkOrdersService
```

y se comprueba el comportamiento de la página.

Por ejemplo:

```text
success
   ↓
renderiza órdenes

empty
   ↓
muestra empty state

error
   ↓
muestra mensaje correspondiente

click
   ↓
ejecuta navegación esperada
```

---

## Regla de testing

> Cada test debería comprobar la responsabilidad de la unidad que está siendo testeada y no volver a probar toda la aplicación debajo de ella.

Esto evita tests excesivamente acoplados.

---

# Styling

El proyecto utiliza **SCSS** con una base de design tokens propios.

La intención es centralizar decisiones visuales como:

```text
brand colors
backgrounds
text colors
borders
semantic colors
spacing
states
```

y consumirlas mediante variables CSS.

Ejemplo:

```scss
.badge--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-subtle);
  border-color: var(--color-warning);
}
```

Esto permite construir componentes consistentes sin repetir valores visuales.

---

# Flujo HTTP general

Actualmente el flujo principal de una petición es:

```text
Component / Page
       ↓
Service
       ↓
HttpClient
       ↓
LoadingInterceptor
       ↓
ErrorInterceptor
       ↓
MockApiInterceptor
       ↓
Response
```

Cada interceptor agrega comportamiento sin modificar la responsabilidad del servicio.

---

# Principios aplicados

Algunas decisiones que guían el proyecto:

### Separación de responsabilidades

Cada pieza debería tener un motivo claro para cambiar.

### Bajo acoplamiento

Los componentes reutilizables no deberían conocer detalles de otros componentes o features.

### Composición sobre duplicación

Las páginas pueden componer componentes reutilizables en lugar de repetir lógica.

### Estado cerca de quien lo utiliza

No todo estado necesita una solución global.

Signals son utilizados para estado local cuando resulta suficiente.

### Infraestructura transversal centralizada

Loading, errores HTTP y mensajes globales se resuelven fuera de las features cuando corresponde.

### Features independientes

Cada dominio debe poder crecer sin convertir `app/` en una estructura plana y difícil de mantener.

---

# Calidad de código

El proyecto incluye:

```text
ESLint
Prettier
Husky
EditorConfig
```

La intención es mantener reglas consistentes independientemente del editor utilizado.

Husky permite ejecutar validaciones antes de aceptar determinados cambios en Git.

---

# Instalación

Clonar el repositorio:

```bash
git clone https://github.com/CristianEscequiel/angular-enterprise-lab.git
```

Ingresar al proyecto:

```bash
cd angular-enterprise-lab
```

Instalar dependencias:

```bash
pnpm install
```

---

# Desarrollo

Ejecutar el servidor:

```bash
pnpm start
```

Luego abrir:

```text
http://localhost:4200
```

---

# Testing

```bash
pnpm test
```

---

# Lint

```bash
pnpm lint
```

---

# Build

```bash
pnpm build
```

El resultado de producción será generado por Angular dentro del directorio de build configurado por el proyecto.

---

# Estructura conceptual

```text
Angular Enterprise Lab
│
├── Infrastructure
│   ├── HTTP
│   ├── Interceptors
│   ├── Loading
│   └── Global Messages
│
├── UI Kit
│   ├── Button
│   ├── Badge
│   ├── Alert
│   ├── Toast
│   ├── Spinner
│   └── Modal
│
├── Layout
│   ├── Header
│   ├── Sidebar
│   └── App Shell
│
└── Business Features
    ├── Dashboard
    │
    └── Work Orders
        ├── List
        ├── Detail
        ├── Create
        └── Edit
```

---

# Roadmap

El proyecto se encuentra en evolución.

Algunos de los próximos objetivos son:

- ampliar la cobertura de tests;
- profundizar testing de servicios HTTP;
- desarrollar el dashboard;
- implementar autenticación;
- agregar guards;
- incorporar nuevas features de mantenimiento;
- gestionar equipos;
- gestionar técnicos;
- mejorar estados y feedback visual;
- continuar evolucionando el UI Kit;
- evaluar nuevas APIs disponibles en Angular;
- reemplazar progresivamente el Mock API por un backend real.

Como evolución natural del laboratorio se contempla desarrollar una API utilizando:

```text
Java
Spring Boot
PostgreSQL
```

manteniendo Angular como frontend independiente.

---

# Filosofía del proyecto

Angular Enterprise Lab no busca ser únicamente una aplicación terminada.

Busca ser un proyecto que pueda evolucionar junto con Angular.

```text
Learn
  ↓
Implement
  ↓
Test
  ↓
Refactor
  ↓
Document
  ↓
Repeat
```

Cada nueva funcionalidad es también una oportunidad para analizar arquitectura, responsabilidades y alternativas de implementación.

---

# Repository

GitHub:

https://github.com/CristianEscequiel/angular-enterprise-lab

---

## Author

**Cristian Escequiel**

Frontend Developer enfocado en Angular y arquitectura frontend.

El proyecto forma parte de un proceso continuo de estudio, experimentación y construcción de aplicaciones Angular modernas.
