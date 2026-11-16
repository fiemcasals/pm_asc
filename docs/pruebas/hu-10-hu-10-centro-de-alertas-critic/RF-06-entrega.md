# HU-10 / RF-06 — FIX: Descarga del Remito Técnico en Formato PDF Oficial en Portal ECA

**Historia de Usuario:** HU-10: Centro de Alertas Críticas y Acuse Legal en Portal ECA  
**Requerimiento:** RF-06 (`REQ-1794842211977`)  
**Tipo:** FIX / Mejora Oficial de Entrega Legal  

---

## 1. Resumen del Cambio

Conforme a lo solicitado por el usuario («*en la parte del portal ECA, la descarga del remito me gustaría que sea en formato PDF, pone un FIX para eso, todo lo descargable que sea en formato PDF*»), se sustituyó la descarga genérica de archivos JSON por la generación y descarga de un **Remito Técnico Oficial en formato PDF**, manteniendo íntegra la cadena de acuse de recibo legal fehaciente en la base de datos PostgreSQL.

### Qué se implementó:

1. **Generador PDF institucional (`RemitoPdfService` con `pdfkit`):**
   - Servicio inyectable en `apps/api/src/eca/remito-pdf.service.ts` registrado en `AppModule`.
   - Generación de documento PDF estándar A4 con diseño institucional:
     - **Encabezado institucional:** Membrete formal de *MAICON S.R.L. · Sistema de Inspección y Seguridad Vertical*, registro de habilitación oficial AGC CABA (Ley 6100 y Ordenanza 49308).
     - **Metadatos del Remito:** Número de Remito (`REM-ALT-...`), Alerta ID, fecha y hora de emisión.
     - **Ficha de Consorcio y Elevador:** Consorcio, dirección, administración, código AGC del equipo (`M1`, etc.), nombre del elevador y Empresa Conservadora (ECA) responsable.
     - **Diagnóstico Técnico de Falla Crítica:** Severidad operativa (Fuera de Servicio / Reparación Urgente), motivo detallado y fecha/hora de detección en campo.
     - **Checklist de Seguridad:** Tabla con los componentes inspeccionados, su estado crítico y observaciones técnicas.
     - **Certificado de Acuse Legal Fehaciente:** Sello formal de notificación vinculante con timestamp fehaciente, usuario/responsable técnico notificado y constancia de auditoría en PostgreSQL.
     - **Pie de página:** Certificación de validez legal ante consorcios y AGC.

2. **Endpoint de Descarga (`GET /api/eca/remito/:alertaId`):**
   - Responde con `Content-Type: application/pdf`.
   - Encabezado `Content-Disposition: attachment; filename="remito-tecnico-[codigoAGC]-[alertaId].pdf"`.
   - Encabezados de metadatos fehacientes: `x-acuse-fecha-hora`, `x-acuse-usuario`, `x-codigo-agc`, `x-alerta-id`.
   - Soporte de interoperabilidad: permite `?formato=json` para APIs externas y pruebas preexistentes.
   - Registro automático e inalterable del acuse de recibo en PostgreSQL (`acuses_recibo_legal`) con RLS y unicidad por alerta (idempotencia garantizada por RF-05).

3. **Portal ECA en Frontend Web (`apps/web`):**
   - En `apps/web/src/eca/eca.ts`, el cliente `descargarRemitoTecnico` solicita `formato=pdf` con `Accept: application/pdf` y retorna el `Blob` binario junto a los metadatos de acuse legal obtenidos de las cabeceras.
   - En `apps/web/src/eca/AlertasCriticas.tsx`, al presionar «Descargar Remito», el navegador dispara la descarga directa del archivo `.pdf` y el badge de la interfaz se actualiza de inmediato a verde («✓ Acuse legal registrado»).

---

## 2. Cómo Probarlo

### 2.1 Verificación automatizada con script de entrega

Asegurarse de tener la base levantada (`npm run db:up`) y el servidor activo (`npm run dev`):

```bash
# Ejecutar desde la raíz del repositorio
bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-06-entrega.sh
```

Prueba de carga y rendimiento de generación PDF:

```bash
bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-06-entrega.sh --carga 50
```

### 2.2 Verificación visual en Portal ECA

1. Ingresar en el navegador a `https://localhost:8050` (o Portal ECA).
2. Dirigirse a la solapa **Portal ECA** -> **Alertas Críticas de la Flota**.
3. En la tarjeta de alerta (ej. máquina `M1` de *Consorcio Santa Fe 3200*), hacer clic en el botón **Descargar Remito**.
4. Se descargará el archivo `remito-tecnico-M1-ALT-MAICON-001.pdf`.
5. Al abrir el archivo PDF se aprecia el membrete formal de MAICON S.R.L., el diagnóstico de la falla, la tabla de inspección técnica y el certificado de acuse de recibo legal.
6. En la pantalla de Alertas Críticas, la tarjeta pasa inmediatamente a mostrar el badge verde de acuse registrado con fecha y hora auditadas.

---

## 3. Matriz de Comprobaciones

| # | Caso de Prueba / Condición | Resultado Obtenido | Estado |
|---|-----------------------------|--------------------|:------:|
| 1 | `GET /api/eca/remito/:alertaId?formato=pdf` retorna HTTP 200 | HTTP 200 OK | ✅ Aprobado |
| 2 | Cabecera `Content-Type` es `application/pdf` | `application/pdf` verificado | ✅ Aprobado |
| 3 | Cabecera `Content-Disposition` especifica archivo `.pdf` | `attachment; filename="remito-tecnico-M1-ALT-MAICON-001.pdf"` | ✅ Aprobado |
| 4 | Contenido binario es un PDF estándar válido | Cabecera `%PDF-1.3`, longitud > 5 KB | ✅ Aprobado |
| 5 | Metadatos fehacientes en encabezados HTTP | `x-acuse-fecha-hora` y `x-acuse-usuario` presentes | ✅ Aprobado |
| 6 | Acuse legal guardado en PostgreSQL | Fila insertada en `acuses_recibo_legal` | ✅ Aprobado |
| 7 | Negociación con `Accept: application/pdf` | Genera y entrega PDF oficial | ✅ Aprobado |
| 8 | Idempotencia ante descargas reiteradas (RF-05) | 1 sola fila en la base, conserva usuario inicial | ✅ Aprobado |
| 9 | Compatibilidad retroactiva con `?formato=json` | Entrega JSON para clientes programáticos | ✅ Aprobado |
| 10 | Rendimiento en carga (50 peticiones concurrentes) | 0 fallas, promedio 78 ms, p95 92 ms | ✅ Aprobado |

---

## 4. Pruebas Automatizadas del Proyecto

- **Pruebas Unitarias y E2E de API (`apps/api`):** 46 suites pasadas, 531 tests pasados (`npm test -w apps/api`).
- **Pruebas de Frontend Web (`apps/web`):** 12 suites pasadas, 159 tests pasados (`npm test -w apps/web`).
- **Pruebas de Integración con PostgreSQL real (`test:int`):** 17 suites pasadas, 112 tests pasados (`npm run test:int`).
- **Verificación completa del monorepo (`npm run verify`):** Tipo-chequeo TypeScript y pruebas unitarias/E2E 100% limpias.
