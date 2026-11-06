# HU-08 · Entrega — UI Portal del Usuario Firmante: Lista Limpia y Modal de Auditoría

- **Tarea:** HU-08 / RF-02 — `REQ-1791910396039`
- **Rama:** `feature/hu-08-hu-08-panel-de-liquidacion-rap/req-1791910396039-ui-portal-del-usuario-firmante-lista-lim`
- **Script del flujo integrado:** [RF-02-entrega.sh](RF-02-entrega.sh)

## 1. Qué quedó implementado

Se implementó en React (`apps/web`) la interfaz completa de usuario para el **Usuario Firmante / RT Legal** ante la AGC (CABA):

1. **Portal del Firmante (`PortalFirmante.tsx`)**:
   - **Lista vertical limpia**: Presenta las máquinas asignadas para el mes con diseño moderno, tarjeta por máquina y contraste tipográfico óptimo.
   - **Identificación rápida**: Badges con código AGC (`M1`, `M2`), nombre del ascensor, dirección exacta del inmueble (`Av. Corrientes 1234`), consorcio y metadatos de ECA y RT Calle (60%).
   - **Indicador de estado visual**: Badges claros y diferenciados para los 3 estados de la normativa:
     - `Recorrida` (verde / badge-recorrida)
     - `Pendiente de Visita` (amarillo / badge-pendiente-de-visita)
     - `Advertencia` (rojo / badge-advertencia)
   - **Controles de acción**:
     - Botón *“Auditar Informe y Fotos”* para abrir el modal técnico en cualquier momento.
     - Botón *“Autorizar Firma AGC”*, habilitado **únicamente** cuando la máquina está `Recorrida`, posee ambas fotos obligatorias (`cables` y `frente`) y cuenta con la firma del encargado. En máquinas pendientes o con advertencia permanece **bloqueado** con indicación clara del motivo de bloqueo (tooltip y pista visible).
   - **Métricas ejecutivas de cabecera**: Chips de resumen con total de máquinas asignadas, cantidad recorridas, pendientes, advertencias y ya autorizadas ante AGC.

2. **Modal de Auditoría Técnica y Conformidad (`ModalAuditoria.tsx`)**:
   - **Previsualización de fotos obligatorias**:
     - Sección fotográfica con cards para *Cables de Tracción* y *Frente de Cabina y Botonera*.
     - Indicador badge de `✓ Presente` o `✗ Falta` por cada foto requerida.
   - **Conformidad del consorcio**:
     - Card de visualización de la firma digitalizada del encargado o administrador del edificio.
     - Indicador badge de `✓ Firmado` o `✗ Sin firma` con aclaración del firmante.
   - **Disparador de Autorización**:
     - Botón *“Autorizar Firma AGC”* dentro del modal que consume `POST /api/firmante/autorizar`.
     - Actualización reactiva instantánea del estado local y generación del número de protocolo legal AGC.

3. **Módulo de Lógica y Cliente API (`firmante.ts`)**:
   - Tipos TypeScript estrictos (`MaquinaAsignada`, `VisitaTecnica`, `RespuestaAutorizacion`).
   - Funciones puras de regla de negocio:
     - `puedeAutorizar(maquina)`: `true` si `estado === 'Recorrida'` y `fotosObligatorias.cables` y `fotosObligatorias.frente` y `firmaEncargado` están presentes.
     - `obtenerMotivoBloqueo(maquina)`: Devuelve el motivo exacto por el cual no se puede autorizar aún.
   - Clientes fetch `fetchMaquinasFirmante()` y `autorizarFirmaMaquina()`.

4. **Suite de pruebas unitarias (`firmante.test.ts`)**:
   - 15 pruebas con Vitest cubriendo todos los casos de habilitación, bloqueo por estado, bloqueo por fotos faltantes, bloqueo por firma faltante, manejo de errores de red y respuestas del backend.

## 2. Cómo se levanta y cómo se prueba

Requisitos: Node.js 22 o superior y las dependencias instaladas.

```bash
# Iniciar la aplicación web
npm run dev -w apps/web

# Ejecutar las pruebas automatizadas (Vitest)
npm test -w apps/web

# Ejecutar la verificación integrada del flujo
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-02-entrega.sh
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspaces` | TypeScript compila sin errores en `@mant-asc/api` y `@mant-asc/web`. |
| `npm test -w apps/web` | 19 tests en verde (15 de `firmante.test.ts` + 4 de `health.test.ts`). |
| `npm run verify` | 33 tests de API en Jest + 19 tests de Web en Vitest = 52 tests en verde total. |
| `npm run build -w apps/web` | Bundle Vite generado exitosamente con PWA y Service Worker. |

## 3. Criterios de Aceptación Cubiertos

- **TEST-1791910396049-0**: *El usuario visualiza una lista vertical de sus máquinas asignadas para el mes actual, con el indicador de estado claramente diferenciado (Recorrida, Pendiente de Visita, Advertencia).*
- **TEST-1791910396063-2**: *El botón 'Autorizar Firma AGC' permanece bloqueado para máquinas en 'Pendiente de Visita' o 'Advertencia', y se habilita únicamente tras auditar que las fotos y la firma del encargado estén completas.*
