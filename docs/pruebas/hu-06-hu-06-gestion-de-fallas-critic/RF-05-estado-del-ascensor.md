# HU-06 / RF-05 — Estado del ascensor: el RT lo marca y el Firmante lo confirma

Definición del cliente: **«Reparación Urgente»** = funciona con riesgo; **«Fuera de Servicio»** = no debe usarse. El RT de Calle marca el estado, el Firmante del edificio lo confirma en coordinación con la Secretaría, y se avisa a la Secretaría y al Firmante. Vuelve a «Normal» sólo con una nueva inspección del RT con foto.

Se apoya en el reporte de parada de HU-17 RF-03 (`POST /api/paradas`), que ahora acepta los dos estados.

## Qué se agregó

| Criterio | Cómo queda |
| --- | --- |
| 1. El RT marca el estado; queda «Pendiente de confirmación» y se avisa | `POST /api/paradas` con `{ "maquinaId", "estado": "Reparación Urgente" o "Fuera de Servicio" (por defecto, fuera de servicio), "causa", "fotos" }`. El equipo queda `confirmacionEstado: "Pendiente de confirmación"` y el reporte avisa a la Secretaría y al Firmante. Un estado que no existe: 400 |
| 2. Sólo el Firmante asignado confirma o rechaza | `POST /api/paradas/:id/confirmar` y `POST /api/paradas/:id/rechazar` (con motivo obligatorio). Cualquier otro rol —y un Firmante de otro edificio— recibe 403; sin sesión, 401. Rechazar devuelve el equipo a «Normal». Un reporte ya resuelto da 409 |
| 3. El estado confirmado se ve en la ficha y en el portal de la ECA | La máquina lleva `estadoOperativo` y `confirmacionEstado`. El portal de la ECA muestra la insignia del estado y, mientras está pendiente, «Pendiente de confirmación». La ficha de la máquina del portal del Firmante recibe los mismos datos; la insignia visual en esa ficha no se agregó (queda para cuando se rehaga esa pantalla) |
| 4. Volver a «Normal» exige una nueva inspección del RT con foto | `POST /api/paradas/maquinas/:maquinaId/normalizar` con `{ "fotos": [...] }`: sin al menos una foto, 400. Sólo el RT (otro rol, 403). Mientras el estado esté pendiente de confirmación, 409; un equipo que ya está Normal, 409 |

Un Firmante ve en `GET /api/paradas` sólo los reportes de sus edificios (la Secretaría y el Administrador, todos). El módulo de máquinas del Firmante sigue **en memoria**: el estado se pierde al reiniciar la API.

## Cómo probarlo

1. `npm run db:up`, `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET`) y los datos demo (`RF-02-datos-demo.sh` de HU-04).
2. `bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-05-entrega.sh` (10 verificaciones; le pone una clave temporal a `rt.beto`, crea dos Firmantes de prueba y los borra; el estado de la máquina queda hasta reiniciar la API).
3. En pantalla, tras marcar un estado: entrá al portal de la ECA y mirá la máquina `MAQ-CORRIENTES-M1` en «Conservación Porteña»: aparece el estado con «Pendiente de confirmación».

## Pruebas automáticas

`estado-ascensor.spec.ts` (16 casos del servicio) y `estado-ascensor.e2e-spec.ts` (4, con roles reales y el flujo completo). Se rompió el código a propósito de nueve maneras (cualquier rol confirma, cualquier Firmante confirma, rechazar sin motivo, rechazar sin volver a Normal, normalizar sin foto, normalizar con la confirmación pendiente, un Firmante ve todo, la Secretaría normaliza y no dejar el estado pendiente) y todas hicieron fallar pruebas.
