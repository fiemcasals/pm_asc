# HU-08 · Entrega — API de Máquinas Asignadas y Autorización de Firma AGC

- **Tarea:** HU-08 / RF-01 — `REQ-1791910395959`
- **Rama:** `feature/hu-08-hu-08-panel-de-liquidacion-rap/req-1791910395959-api-de-maquinas-asignadas-y-autorizacion`
- **Script del flujo integrado:** [RF-01-entrega.sh](RF-01-entrega.sh)

## 1. Qué quedó implementado

Se implementó el backend y modelo de datos para el módulo del **Usuario Firmante / RT Legal** ante la AGC (CABA):

1. **`GET /api/firmante/maquinas`**:
   - Retorna la lista vertical y limpia de máquinas del mes asignadas al usuario firmante autenticado (identificado por header `x-user-name` o `x-user-id`, por defecto `gonza`).
   - Cada máquina incluye su edificio/consorcio, dirección literal, referencia AGC (`M1`, `M2`, etc.), ECA responsable, RT de calle (60%), RT Legal firmante (25%), estado de inspección mensual (`Recorrida`, `Pendiente de Visita`, `Advertencia`), y los datos completos de la visita técnica.
   - Soporta filtrado por mes mediante query param `?mes=YYYY-MM`.

2. **`POST /api/firmante/autorizar`**:
   - Valida estrictamente las condiciones jurídicas y técnicas antes de registrar la autorización de firma digital ante AGC:
     - **Estado de visita**: Debe estar en estado `Recorrida` (si está en `Pendiente de Visita` o `Advertencia`, rechaza con 400 Bad Request).
     - **Fotos obligatorias**: Debe contar indispensablemente con las fotografías de `cables` y `frente` (si falta alguna, rechaza con 400 Bad Request).
     - **Firma del encargado**: Debe contener la firma del encargado registrada en el informe (si no está firmada, rechaza con 400 Bad Request).
   - Cumplidas todas las validaciones, persiste la autorización formal:
     - `autorizada: true`
     - `fechaAutorizacion`: timestamp ISO actual.
     - `autorizadoPor`: usuario firmante autenticado (`gonza`).
     - `protocoloAGC`: identificador de trazabilidad formal (`AGC-2026-AUT-<maquinaId>`).
     - Responde `200 OK` y actualiza inmediatamente el estado de la máquina para las consultas subsiguientes.

## 2. Cómo se levanta y cómo se prueba

Requisitos: Node.js 22 o superior y las dependencias instaladas.

```bash
# Iniciar la API
npm run dev -w apps/api

# Ejecutar las pruebas automatizadas (Jest)
npm test -w apps/api

# Ejecutar la verificación integrada de punta a punta (9 pasos)
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-01-entrega.sh

# Modo prueba de carga / estrés (ej. 100 peticiones concurrentes)
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-01-entrega.sh --carga 100
```

### Pruebas automatizadas (en verde)

| Comando | Resultado |
|---|---|
| `npm run verify` | Tipos TypeScript sin errores. 33 tests en verde (15 setup + 18 firmante: `firmante.spec.ts` y `firmante.e2e-spec.ts`). Web: 4 tests en verde. |
| `bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-01-entrega.sh` | 9/9 verificaciones exitosas cubriendo consultas, validaciones de fotos, firmas, estados y persistencia. |

## 3. Datos de prueba cargados

El servicio cuenta con registros de prueba representativos para la terna de CABA:
- `MAQ-CORRIENTES-M1`: Av. Corrientes 1234, M1. Estado `Recorrida` con fotos completas y firma de encargado (lista para autorizar).
- `MAQ-CORRIENTES-M2`: Av. Corrientes 1234, M2. Estado `Pendiente de Visita` (valida bloqueo de autorización).
- `MAQ-CALLAO-M1`: Av. Callao 850, M1. Estado `Advertencia` por ausencia de encargado (valida bloqueo).
- `MAQ-SANTAFE-M1`: Av. Santa Fe 3200, M1. Estado `Recorrida` pero sin firma de encargado (valida rechazo por firma).
- `MAQ-SANTAFE-M2`: Av. Santa Fe 3200, M2. Estado `Recorrida` pero sin foto de cables (valida rechazo por fotos).

## 4. Endpoints y contratos

| Método | Ruta | Headers | Qué hace | Respuesta exitosa |
|---|---|---|---|---|
| `GET` | `/api/firmante/maquinas` | `x-user-name: gonza` | Retorna lista de máquinas del mes asignadas al firmante | `200 OK` con array de máquinas |
| `POST` | `/api/firmante/autorizar` | `x-user-name: gonza`, `Content-Type: application/json` | Valida visita y registra autorización digital | `200 OK` con `{ ok: true, autorizacion: { ... } }` |

## 5. Qué quedó afuera o se asume para la siguiente tarjeta

- La interfaz visual de usuario del Portal Firmante con la grilla y el modal de auditoría de fotos/firma corresponde a la tarea siguiente **`HU-08: RF-02`**.
- La integración directa con los web services externos de AGC se simula mediante la emisión y persistencia del protocolo `protocoloAGC`, listo para vincularse cuando AGC exponga sus certificados en el entorno productivo.
