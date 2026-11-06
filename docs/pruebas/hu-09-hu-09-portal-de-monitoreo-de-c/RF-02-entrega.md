# HU-09 · Entrega — UI Portal ECA: Dashboard de Solo Lectura y Medidor de Cobertura

- **Tarea:** HU-09 / RF-02 — `REQ-1791910396255`
- **Rama:** `feature/hu-09-hu-09-portal-de-monitoreo-de-c/req-1791910396255-ui-portal-eca-dashboard-de-solo-lectura`
- **Script del flujo integrado:** [RF-02-entrega.sh](RF-02-entrega.sh)

## 1. Qué quedó implementado

Se implementó en React (`apps/web`) la interfaz completa de usuario para el **Portal de la Empresa Conservadora Aliada (ECA)**:

1. **Medidor Gráfico de Cobertura (`MedidorCobertura.tsx`)**:
   - **Gauge circular interactivo**: Presenta de forma visual el porcentaje exacto de cobertura mensual (`% firmadas AGC`), con colores semánticos dinámicos (verde para >=80%, amarillo para >=40%, rojo para <40%).
   - **Chips de métricas en tiempo real**: Desglose claro de flota total, máquinas inspeccionadas, máquinas firmadas con respaldo legal ante AGC, pendientes de visita y advertencias.
   - **Barra lineal de progreso**: Complemento visual que refleja el porcentaje acumulado de la flota certificada.

2. **Catálogo de Flota en Modo Solo Lectura (`PortalEca.tsx`)**:
   - **Acceso protegido y aislado**: Selector de empresas conservadoras (`Conservación Porteña S.R.L.`, `Elevadores San Martín`, `MAICON Mantenimiento`) y períodos mensuales.
   - **Estricto Modo Solo Lectura**: Cumple rigurosamente el Criterio 2 al omitir de forma absoluta cualquier botón de edición, alta, modificación o eliminación.
   - **Tabla informativa corporativa**: Exhibe Código AGC (`M1`, `M2`), denominación del ascensor, dirección literal del edificio, consorcio, inspector RT Calle asignado, estado de inspección y certificación legal AGC con número de protocolo formal.

3. **Módulo de integración y utilidades (`eca.ts`)**:
   - Consumo reactivo de los endpoints `/api/eca/cobertura` y `/api/eca/maquinas`.
   - Lógica de estilos y determinación de colores semánticos según el porcentaje alcanzado.

4. **Navegación integrada en la aplicación (`App.tsx`)**:
   - Pestaña **"Portal ECA (Conservadoras)"** accesible directamente desde la barra superior de la app, permitiendo alternar fluidamente entre el Portal Firmante, el Portal ECA y el Estado del Sistema.

## 2. Cómo se levanta y cómo se prueba

Requisitos: Node.js 22 o superior y dependencias instaladas.

```bash
# Iniciar la aplicación web
npm run dev -w apps/web

# Ejecutar las pruebas automatizadas (Vitest)
npm test -w apps/web -- eca

# Ejecutar la verificación integrada del flujo
bash docs/pruebas/hu-09-hu-09-portal-de-monitoreo-de-c/RF-02-entrega.sh
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspaces` | TypeScript compila sin errores en `@mant-asc/api` y `@mant-asc/web`. |
| `npm test -w apps/web` | 27 tests en verde (8 en `eca.test.ts`, 15 en `firmante.test.ts`, 4 en `health.test.ts`). |
| `npm run verify` | 44 tests Jest en API + 27 tests Vitest en Web = 71 tests en verde total. |
| `npm run build -w apps/web` | Bundle Vite generado exitosamente con PWA y Service Worker. |

## 3. Criterios de Aceptación Cubiertos

- **TEST-1791910396258-0**: *La pantalla principal presenta el grafico/medidor con el porcentaje de cobertura de maquinas cubiertas y firmadas.*
- **TEST-1791910396275-2**: *El listado de la flota se despliega en modo solo lectura, ocultando cualquier opcion de edicion o carga.*
