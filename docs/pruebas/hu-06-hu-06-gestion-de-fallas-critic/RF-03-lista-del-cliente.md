# HU-06 / RF-03 — Lista de Fallas Críticas definida por el cliente

Qué cambia: el informe de fallas acepta exactamente la lista que definió el cliente (P3 y P6), lo que el cliente sacó deja de ser crítico, el aceite de batea sólo se acepta en máquinas hidráulicas y la alerta de la Secretaría muestra el nombre legible de cada falla agrupado por zona.

## La lista (14 fallas críticas, en el checklist de HU-17)

| Zona | Fallas críticas |
| --- | --- |
| Sala de Máquinas | Cables de tracción desgastados · Corte de fuerza motriz NO ACTÚA · Limitador de velocidad anulado · Aceite de batea insuficiente (sólo hidráulicas) |
| Cabina | Botón de PARE: Falla · Paracaídas: Anomalía |
| Accesos | Destrabe manual trabado / inexistente · Cerradura: No traba · Contacto eléctrico puenteado / falla · Espacio entre puertas mayor a 12 cm |
| Caja | Instalaciones ajenas: SÍ · Espacios con aberturas · Límites superiores o inferiores fallan / anulados |
| Fosa | Stop de fosa deficiente / inexistente |

El catálogo del checklist **ya traía** estas fallas (lo cargó HU-17); esta tarjeta lo verifica contra la lista del cliente con una prueba que compara las 14 y sus zonas, y suma lo que faltaba: el informe de fallas (`POST /api/fallas-criticas/informes`) ahora usa ese catálogo como única fuente.

**Pendiente con MAICON (se mantiene hasta que respondan):** si «limitador anulado» sigue siendo crítico (se dejó como crítico) y si se agrega un ítem «frenos defectuosos», que hoy no existe en el checklist.

## Qué se agregó

| Criterio | Cómo queda |
| --- | --- |
| 1. Cada ítem genera la alerta | Cualquiera de las 14 fallas en `fallasCriticas` genera la alerta de Falla Crítica |
| 2. Lo que el cliente sacó | Pérdida de aceite crítica, limitador deficiente, tablero fuera de norma, puerta tijera, alarma, piso de madera, baranda de techo y extensión de cables (y cualquier código que no esté en la lista) se registran en `fallasComunes` del informe y no generan alerta |
| 3. Aceite de batea | En una máquina de tracción el informe responde **400** con el motivo («…sólo aplica a máquinas hidraulico») y no registra nada. Para eso las máquinas tienen un `tipo` (por defecto tracción; en los datos de ejemplo, `MAQ-CORRIENTES-M2` es hidráulica) |
| 4. Nombre legible y zona | Cada evento trae `fallasDetalle` (código, nombre, zona) en el orden de las zonas; el cartel de la Secretaría y el informe legible las muestran agrupadas por zona |

Los informes de fallas siguen siendo datos de ejemplo **en memoria**: se pierden al reiniciar la API.

## Cómo probarlo

1. `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal) y los datos demo (`RF-02-datos-demo.sh` de HU-04).
2. `bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-03-entrega.sh` (6 verificaciones: las 13 fallas de tracción, las 8 que se sacaron, el aceite en tracción y en hidráulica, y la agrupación por zona). Corré el script una sola vez por arranque.

## Pruebas automáticas

`fallas-lista-cliente.spec.ts` (32 casos: el catálogo es exactamente la lista, cada ítem genera alerta, lo que se sacó no, el aceite por tipo de máquina y la agrupación), `fallas-lista-cliente.e2e-spec.ts` (3 casos por HTTP) y 3 casos web de `agruparFallasPorZona`. Se rompió el código a propósito de ocho maneras (todo código crítico, descartar lo común, no controlar el tipo, no ordenar por zona, limitador deficiente crítico, aceite en todos los tipos, y las dos de la agrupación web) y todas hicieron fallar al menos una prueba.
