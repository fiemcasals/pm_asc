# HU-06 / RF-04 — Alerta de Falla Crítica al Firmante y alarma sonora hasta que se abra

Qué cambia, según lo que pidió el cliente: la Falla Crítica se avisa a la Secretaría **y al Firmante del edificio**, y la alarma sonora **sigue sonando hasta que alguien abra la alerta**.

## Qué se agregó

| Criterio | Cómo queda |
| --- | --- |
| 1. El Firmante asignado ve la alerta en su portal | Cada alerta lleva el `firmanteUsername` del edificio. `GET /api/fallas-criticas/informes` devuelve a un Firmante sólo las alertas de sus edificios (la Secretaría y el Administrador ven todas) y el cartel de su portal filtra también las que llegan en tiempo real. Antes lo veía cualquier Firmante |
| 2. La alarma se repite hasta abrir la alerta, y deja de sonar en todas las pantallas | En la Secretaría la alarma se repite cada 6 segundos mientras haya una alerta sin abrir. «Ver informe técnico» o «Entendido» la abre: `POST /api/fallas-criticas/informes/:id/abrir`. La API avisa por el canal en tiempo real (`falla-abierta`) y todas las pantallas de la Secretaría la silencian; una pantalla que se abre después ve `abiertaPor` y tampoco suena |
| 3. Se registra quién la abrió primero y cuándo | `abiertaPor` y `abiertaEn` quedan en la alerta. Una segunda apertura (de otro usuario) no cambia nada y devuelve la primera. Un Firmante sólo abre las de sus edificios (403 las demás); el RT y la ECA no abren (403); sin sesión, 401 |

**Pendiente con MAICON:** quién recibe las alertas fuera de horario (la persona de guardia). Hoy el aviso va a la Secretaría y al Firmante.

**Limitaciones:**
- Las alertas siguen en memoria (módulo de informes de fallas): se pierden al reiniciar la API.
- El canal en tiempo real (SSE) no sabe quién lo escucha, así que manda todas las alertas a todos los que se conectan; el filtro por Firmante lo hace la lista de la API y el cartel. Un filtro en el canal necesita autenticación del canal.
- La alarma sólo suena en la Secretaría, como pide la tarjeta; el Firmante ve el cartel sin alarma repetida.
- Los navegadores sólo dejan sonar audio si el usuario ya interactuó con la página (por ejemplo, entrar a la pestaña de la Secretaría).

## Cómo probarlo

1. `npm run db:up`, `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET`) y los datos demo (`RF-02-datos-demo.sh` de HU-04).
2. API: `bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-04-entrega.sh` (10 verificaciones; crea dos Firmantes de prueba y los borra; el informe queda hasta reiniciar la API).
3. Pantalla, a mano: entrá como `demo.secretaria` / `Demo-Clave-2026` a «Secretaría». En otra terminal, registrá una falla crítica: `POST /api/fallas-criticas/informes` con `{"maquinaId":"MAQ-CORRIENTES-M1","inspector":"Prueba","fallasCriticas":["PARACAIDAS_ANOMALIA"]}`. Aparece el cartel y la alarma suena **cada 6 segundos**. Tocá «Entendido» o «Ver informe técnico»: la alarma se detiene. Con dos ventanas de la Secretaría abiertas, abrir la alerta en una detiene el sonido en la otra.

## Pruebas automáticas

API: `fallas-apertura.spec.ts` (7) y `fallas-apertura.e2e-spec.ts` (5, con roles reales). Web: 7 casos nuevos en `fallas.test.ts` (cuándo suena la alarma, el filtro del Firmante, el aviso de apertura y `abrirAlerta`). Se rompió el código a propósito de nueve maneras (el Firmante ve todo, la última apertura pisa a la primera, no se avisa por el canal, el Firmante abre cualquiera, el RT abre, la alarma ignora lo abierto por otro o lo abierto acá, filtro sensible a mayúsculas, ruta equivocada) y todas hicieron fallar pruebas. En el navegador se verificó con la app corriendo: la alarma sonó 1 vez al llegar y 3 veces a los 14 segundos sin abrir; después de «Entendido» no volvió a sonar.
