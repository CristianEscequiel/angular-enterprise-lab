---
inclusion: always
---

# Producto

## Qué es

Frontend de un sistema de gestión de órdenes de mantenimiento (CMMS) con roles,
técnicos, equipos, máquinas y árbol de partes. Consume la API real del repo hermano
`angular-enterprise-lab-api` (Java 21 + Spring Boot 3 + PostgreSQL, JWT). Nació como
laboratorio de arquitectura Angular sobre JSON Server; la spec 19 lo migró a la API
real y retiró los mocks.

## Usuarios objetivo

Los cuatro roles del dominio, con autoridad real en el servidor (el cliente solo
oculta lo que la API rechazaría):

| Rol                         | Qué hace                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `administrador`             | Gestiona maestros, edita/elimina/libera/cancela órdenes                             |
| `team-leader-mantenimiento` | Crea órdenes `preventivo`/`correctivo`, gestiona equipos y máquinas, libera/cancela |
| `personal-produccion`       | Crea órdenes `pronto-intervencion`                                                  |
| `tecnico`                   | Toma, comenta y cierra las órdenes de su especialidad y tipo de equipo              |

Usuarios principales: técnicos de planta, de ahí el diseño mobile-first "Tablero de
turno" (spec 18). Sin usuarios externos ni multi-tenant.

## Objetivos del proyecto

- **Sistema CMMS usable:** cubrir el ciclo completo de una orden (alta, toma, cierre,
  liberación, cancelación) para los cuatro roles.
- **Portfolio fullstack:** demostrar un Angular + Spring Boot real, con autenticación,
  autorización y contrato de API verificado, para roles Angular + Java/Spring.
- **Material de estudio:** dejar registro de las decisiones técnicas y del proceso
  (specs versionadas en `.claude/specs/`, README con revisiones por spec).

## Features (módulos de `features/`)

`about` (portada pública y "Acerca de"), `auth` (login JWT), `dashboard` ("Turno de hoy" + resumen de la API), `work-orders`
(listado con búsqueda/paginación/filtros, alta, edición, baja, tomar, cerrar, liberar,
cancelar), `machines` (maestro y árbol de partes), `maintenance` (técnicos y equipos).

## Fuera de alcance (por ahora)

- Asignar una orden a un técnico concreto.
- Alta y gestión de usuarios, recuperación de contraseña.
- Notificaciones push/email, multi-tenant.
- Reglas de negocio con autoridad en el cliente: unicidad, integridad referencial y
  transiciones de estado las decide la API.
