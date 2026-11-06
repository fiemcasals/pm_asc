# HU-09 · Entrega — API de Cobertura de Flota por Empresa Conservadora

- **Tarea:** HU-09 / RF-01 — `REQ-1791910396167`
- **Rama:** `feature/hu-09-hu-09-portal-de-monitoreo-de-c/req-1791910396167-api-de-cobertura-de-flota-por-empresa-co`
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)

## 1. Qué quedó implementado

Se implementó el backend y modelo de métricas para el módulo de consulta exclusiva de la **Empresa Conservadora Aliada (ECA)**:

1. **`GET /api/eca/cobertura`**:
   - Calcula y retorna el porcentaje y resumen de máquinas inspeccionadas y firmadas de la flota de la ECA para el mes actual (`2026-11` por defecto o filtrable por `?mes=YYYY-MM`).
   - Métricas devueltas:
     - `totalMaquinas`: Cantidad total de máquinas asociadas a la ECA.
     - `inspeccionadas`: Cantidad con estado `Recorrida`.
     - `firmadas`: Cantidad con visita técnica formalmente autorizada ante la AGC (`autorizada: true`).
     - `pendientes`: Cantidad con estado `Pendiente de Visita`.
     - `advertencias`: Cantidad con estado `Advertencia`.
     - `porcentajeInspeccionadas`: Porcentaje de avance de inspecciones.
     - `porcentajeFirmadas`: Porcentaje de máquinas autorizadas con firma digital.
     - `porcentajeCobertura`: Indicador global de cobertura de la flota.

2. **`GET /api/eca/maquinas`**:
   - Lista protegida de máquinas de la flota pertenecientes exclusivamente a la ECA autenticada (`x-eca-name`, `x-eca-id` o parámetro `?eca=...`).
   - Cada elemento incluye la información completa de edificio, dirección literal, referencia AGC (`M1`, `M2`), estado de visita y datos de auditoría.
   - Aislamiento estricto: evita la exposición de máquinas pertenecientes a otras empresas conservadoras competidoras.

## 2. Cómo se levanta y cómo se prueba

Requisitos: Node.js 22 o superior y dependencias instaladas.

```bash
# Iniciar la API
npm run dev -w apps/api

# Ejecutar las pruebas automatizadas (Jest)
npm test -w apps/api

# Ejecutar la verificación integrada de punta a punta
bash docs/pruebas/hu-09-hu-09-portal-de-monitoreo-de-c/RF-01-entrega.sh
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | TypeScript sin errores. 44 tests Jest en API (8 suites) + 19 tests Vitest en Web = 63 tests en verde total. |
| `bash docs/pruebas/hu-09-hu-09-portal-de-monitoreo-de-c/RF-01-entrega.sh` | Verificación de cálculo de cobertura y catálogo protegido de máquinas. |

## 3. Endpoints y contratos

| Método | Ruta | Headers | Qué hace | Respuesta exitosa |
|---|---|---|---|---|
| `GET` | `/api/eca/cobertura` | `x-eca-name: Conservación Porteña S.R.L.` | Métricas y porcentaje de cobertura mensual | `200 OK` con `{ eca, mes, totalMaquinas, inspeccionadas, firmadas, ... }` |
| `GET` | `/api/eca/maquinas` | `x-eca-name: Conservación Porteña S.R.L.` | Lista protegida de máquinas de la flota | `200 OK` con array de máquinas de la ECA |

## 4. Qué quedó afuera o se asume para la siguiente tarjeta

- La interfaz visual del **Portal ECA** con el medidor gráfico de cobertura y el catálogo de solo lectura corresponde a la siguiente tarea **`HU-09: RF-02` (`REQ-1791910396255`)**.
