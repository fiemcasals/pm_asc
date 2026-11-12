# Grafo de Dependencias -- mant_asc

_Generado automaticamente el 2026-11-12T13:26:54.128Z -- no editar a mano, se sobreescribe en cada publicacion._

```mermaid
graph TD
  subgraph US_1791560828588["RO-01: RO-01: Setup del proyecto y entorno de desarrollo verificable"]
    REQ_1791560828605["RF-01: RO-01: Setup del proyecto y entorno de desarrollo verificable"]
  end
  subgraph US_1791560828711["HU-01: HU-01: Gestión y Alta de ECA y Máquinas"]
    REQ_1791909582859["RF-01: API y Modelo de Datos de Consorcios y Máquinas"]
    REQ_1791910394885["RF-02: UI de Secretaría: Carga y Ficha de Edificios y Máquinas"]
    REQ_1793979090598["RNF-01: Rechazar con 400 los textos que la base no puede guardar (carácter NUL)"]
    REQ_1794000103321["RNF-02: Evitar que las pruebas de integración fallen al correr en paralelo"]
  end
  subgraph US_1791560828789["HU-02: HU-02: Asignación de Roles Tripartitos por Edificio"]
    REQ_1791910395002["RF-01: API de Asignación Tripartita de Roles por Edificio"]
    REQ_1791910395101["RF-02: UI de Secretaría: Pestaña de Asignación de Roles de Trabajo"]
    REQ_1794015939180["RF-03: Evitar que un guardado pise una asignación más nueva"]
    REQ_1794015939447["RNF-01: Leer todas las ternas en una sola consulta"]
  end
  subgraph US_1791560828900["HU-03: HU-03: Mapa Interactivo de Flota y Rastreo GPS en CABA"]
    REQ_1791910395196["RF-01: Servicio de Telemetría GPS y Proximidad de Inspectores"]
    REQ_1791910395292["RF-02: UI Mapa de Flota interactivo CABA y Despacho de Emergencia"]
  end
  subgraph US_1791560828979["HU-04: HU-04: Semáforo de Control Mensual y Reasignación Operativa"]
    REQ_1791910395389["RF-01: Motor de Control Semafórico por Antigüedad de Visita"]
    REQ_1791910395476["RF-02: Integración Visual del Semáforo en Mapa y Reasignación Rápida"]
  end
  subgraph US_1791560829061["HU-05: HU-05: Tablero Dinámico de Monitoreo Backoffice"]
    REQ_1791910395565["RF-01: API de Monitoreo Backoffice y Acciones Comerciales"]
    REQ_1791910395676["RF-02: UI Tablero Dinámico de Monitoreo General (Backoffice)"]
  end
  subgraph US_1791560829152["HU-06: HU-06: Gestión de Fallas Críticas y Deslinde Legal"]
    REQ_1791910396411["RF-01: Recepción de Falla Crítica y Alerta Emergente en Secretaría"]
    REQ_1791910396553["RF-02: Generación de PDF Legal MAICON S.R.L. y Despacho por Email a ECA"]
  end
  subgraph US_1791560829237["HU-07: HU-07: Protocolo de Visitas Fallidas y Recargo de Tercera Visita"]
    REQ_1791910395756["RF-01: Gestión de Advertencias 1 y 2 por Visita Fallida y Email a Consorcio"]
    REQ_1791910395872["RF-02: Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%"]
    REQ_1794013110546["RF-03: Persistir las visitas fallidas en PostgreSQL"]
  end
  subgraph US_1791560829306["HU-08: HU-08: Panel de Liquidación Rápida y Autorización de Firma AGC"]
    REQ_1791910395959["RF-01: API de Máquinas Asignadas y Autorización de Firma AGC"]
    REQ_1791910396039["RF-02: UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría"]
  end
  subgraph US_1791560829397["HU-09: HU-09: Portal de Monitoreo de Cobertura para Empresas Conservadoras"]
    REQ_1791910396167["RF-01: API de Cobertura de Flota por Empresa Conservadora"]
    REQ_1791910396255["RF-02: UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura"]
  end
  subgraph US_1791560829468["HU-10: HU-10: Centro de Alertas Críticas y Acuse Legal en Portal ECA"]
    REQ_1791910396649["RF-01: Carteles de Alerta de Fuera de Uso y Reparación Urgente en Portal ECA"]
    REQ_1791910396729["RF-02: Descarga de Remito Técnico y Registro de Acuse de Recibo Legal"]
    REQ_1793980587652["RF-03: Registrar el acuse de recibo legal solo si quedó guardado en la base"]
  end
  subgraph US_1791560829559["HU-11: HU-11: Notificaciones Automáticas por WhatsApp a la ECA"]
    REQ_1791910396804["RF-01: Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica"]
    REQ_1791910396892["RF-02: Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo"]
    REQ_1794155773535["RF-03: No informar como entregado un WhatsApp que no se envió"]
    REQ_1794155774018["RF-04: Enviar las alertas por WhatsApp a través de un proveedor real"]
  end
  subgraph US_1794486885074["HU-12: HU-12: Interfaz NEO Linear, Sidebar Colapsable y Buscador Global Inline"]
    REQ_1794486918351["RF-01: Shell Visual NEO Linear (Dark/Light), Sidebar Colapsable, Cobertura Neón y Buscador Global Inline"]
    REQ_1794488168014["RF-02: FIX: Corregir contraste de textos y contenedores en Modo Oscuro"]
  end
  subgraph US_1794486885243["HU-13: HU-13: Claridad Operativa y Limpieza de Obviedades en Portales ECA y Consorcios"]
    REQ_1794486918510["RF-01: Alertas Críticas del Portal ECA sin prefijos obvios ni códigos duplicados"]
    REQ_1794486918616["RF-02: Limpieza de badges obvios y jerga técnica en Portal ECA y Consorcios"]
  end
  REQ_1791560828605 --> REQ_1791909582859
  REQ_1791909582859 --> REQ_1791910394885
  REQ_1791909582859 --> REQ_1793979090598
  REQ_1791909582859 --> REQ_1791910395002
  REQ_1791910395002 --> REQ_1791910395101
  REQ_1791910394885 --> REQ_1791910395101
  REQ_1791910395101 --> REQ_1794015939180
  REQ_1791910395101 --> REQ_1794015939447
  REQ_1791910395002 --> REQ_1791910395196
  REQ_1791910395196 --> REQ_1791910395292
  REQ_1791910395196 --> REQ_1791910395389
  REQ_1791910395389 --> REQ_1791910395476
  REQ_1791910395292 --> REQ_1791910395476
  REQ_1791910395389 --> REQ_1791910395565
  REQ_1791910395565 --> REQ_1791910395676
  REQ_1791910395476 --> REQ_1791910395676
  REQ_1791910396167 --> REQ_1791910396411
  REQ_1791910396411 --> REQ_1791910396553
  REQ_1791910395565 --> REQ_1791910395756
  REQ_1791910395756 --> REQ_1791910395872
  REQ_1791910395676 --> REQ_1791910395872
  REQ_1791910395756 --> REQ_1794013110546
  REQ_1791910395002 --> REQ_1791910395959
  REQ_1791910395959 --> REQ_1791910396039
  REQ_1791910395959 --> REQ_1791910396167
  REQ_1791910396167 --> REQ_1791910396255
  REQ_1791910396255 --> REQ_1791910396649
  REQ_1791910396553 --> REQ_1791910396649
  REQ_1791910396649 --> REQ_1791910396729
  REQ_1791910396729 --> REQ_1793980587652
  REQ_1791910396729 --> REQ_1791910396804
  REQ_1791910396804 --> REQ_1791910396892
  REQ_1791910396804 --> REQ_1794155773535
  REQ_1791910396892 --> REQ_1794155773535
  REQ_1794155773535 --> REQ_1794155774018
  REQ_1791910396804 --> REQ_1794155774018
  REQ_1791910395002 --> REQ_1794155774018
  REQ_1794486918351 --> REQ_1794488168014
```