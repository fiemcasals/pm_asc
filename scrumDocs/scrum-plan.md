# Plan de Tareas — mant_asc

_Generado automáticamente el 2026-10-22T21:40:06.677Z — no editar a mano, se sobreescribe en cada publicación._

Orden sugerido de desarrollo (respeta dependencias entre Tareas). Cada fila indica de qué Tareas depende, si tiene.

| Orden | Código | Tarea | Historia de Usuario | Módulo | Sprint | Estado | Desarrollador | Depende de | Rechazos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RF-01 | RO-01: Setup del proyecto y entorno de desarrollo verificable | RO-01 | — | — | Hacer | dev-ma | — | — |
| 2 | RF-01 | API y Modelo de Datos de Consorcios y Máquinas | HU-01 | — | — | Hacer | dev-ma | RF-01 | — |
| 3 | RF-02 | UI de Secretaría: Carga y Ficha de Edificios y Máquinas | HU-01 | — | — | Hacer | dev-ma | RF-01 | — |
| 4 | RF-01 | API de Asignación Tripartita de Roles por Edificio | HU-02 | — | — | Hacer | dev-ma | RF-01 | — |
| 5 | RF-02 | UI de Secretaría: Pestaña de Asignación de Roles de Trabajo | HU-02 | — | — | Hacer | dev-ma | RF-01, RF-02 | — |
| 6 | RF-01 | Servicio de Telemetría GPS y Proximidad de Inspectores | HU-03 | — | — | Hacer | dev-ma | RF-01 | — |
| 7 | RF-01 | API de Máquinas Asignadas y Autorización de Firma AGC | HU-08 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 8 | RF-02 | UI Mapa de Flota interactivo CABA y Despacho de Emergencia | HU-03 | — | — | Hacer | dev-ma | RF-01 | — |
| 9 | RF-01 | Motor de Control Semafórico por Antigüedad de Visita | HU-04 | — | — | Hacer | dev-ma | RF-01 | — |
| 10 | RF-02 | UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría | HU-08 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 11 | RF-01 | API de Cobertura de Flota por Empresa Conservadora | HU-09 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 12 | RF-02 | Integración Visual del Semáforo en Mapa y Reasignación Rápida | HU-04 | — | — | Hacer | dev-ma | RF-01, RF-02 | — |
| 13 | RF-01 | API de Monitoreo Backoffice y Acciones Comerciales | HU-05 | — | — | Hacer | dev-ma | RF-01 | — |
| 14 | RF-02 | UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura | HU-09 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 15 | RF-01 | Recepción de Falla Crítica y Alerta Emergente en Secretaría | HU-06 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 16 | RF-02 | UI Tablero Dinámico de Monitoreo General (Backoffice) | HU-05 | — | — | Hacer | dev-ma | RF-01, RF-02 | — |
| 17 | RF-01 | Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio | HU-07 | — | — | Hacer | dev-ma | RF-01 | — |
| 18 | RF-02 | Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA | HU-06 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 19 | RF-02 | Bloqueo por Advertencia 3 y Cálculo de Recargo del 45% | HU-07 | — | — | Hacer | dev-ma | RF-01, RF-02 | — |
| 20 | RF-01 | Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA | HU-10 | — | — | Hacer | dev-ma-2 | RF-02, RF-02 | — |
| 21 | RF-02 | Descarga de Remito Técnico y Registro de Acuse de Recibo Legal | HU-10 | — | — | Hacer | dev-ma-2 | RF-01 | — |
| 22 | RF-01 | Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica | HU-11 | — | — | Hacer | dev-ma-2 | RF-02 | — |
| 23 | RF-02 | Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo | HU-11 | — | — | Hacer | dev-ma-2 | RF-01 | — |

## Detalle

### RF-01 — RO-01: Setup del proyecto y entorno de desarrollo verificable
- Estimado: 4h

### RF-01 — API y Modelo de Datos de Consorcios y Máquinas
- Estimado: 4h

### RF-02 — UI de Secretaría: Carga y Ficha de Edificios y Máquinas
- Estimado: 4h

### RF-01 — API de Asignación Tripartita de Roles por Edificio
- Estimado: 3h

### RF-02 — UI de Secretaría: Pestaña de Asignación de Roles de Trabajo
- Estimado: 3h

### RF-01 — Servicio de Telemetría GPS y Proximidad de Inspectores
- Estimado: 4h

### RF-01 — API de Máquinas Asignadas y Autorización de Firma AGC
- Estimado: 4h

### RF-02 — UI Mapa de Flota interactivo CABA y Despacho de Emergencia
- Estimado: 5h

### RF-01 — Motor de Control Semafórico por Antigüedad de Visita
- Estimado: 4h

### RF-02 — UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría
- Estimado: 4h

### RF-01 — API de Cobertura de Flota por Empresa Conservadora
- Estimado: 3h

### RF-02 — Integración Visual del Semáforo en Mapa y Reasignación Rápida
- Estimado: 4h

### RF-01 — API de Monitoreo Backoffice y Acciones Comerciales
- Estimado: 4h

### RF-02 — UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura
- Estimado: 4h

### RF-01 — Recepción de Falla Crítica y Alerta Emergente en Secretaría
- Estimado: 4h

### RF-02 — UI Tablero Dinámico de Monitoreo General (Backoffice)
- Estimado: 4h

### RF-01 — Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio
- Estimado: 4h

### RF-02 — Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA
- Estimado: 4h

### RF-02 — Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%
- Estimado: 4h

### RF-01 — Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA
- Estimado: 3h

### RF-02 — Descarga de Remito Técnico y Registro de Acuse de Recibo Legal
- Estimado: 3h

### RF-01 — Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica
- Estimado: 4h

### RF-02 — Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo
- Estimado: 3h
