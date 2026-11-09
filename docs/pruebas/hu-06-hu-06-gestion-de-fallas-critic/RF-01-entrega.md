# HU-06 · Entrega — RF-01 Recepción de Falla Crítica y Alerta Emergente en Secretaría

- **Requerimiento:** HU-06 / RF-01 — `REQ-1791910396411`
- **Rama:** `feature/hu-06-hu-06-gestion-de-fallas-critic/req-1791910396411-recepcion-de-falla-critica-y-alerta-emer`
- **Guía visual:** [RF-01-recepcion-de-falla-critica.md](RF-01-recepcion-de-falla-critica.md)

## 1. Qué quedó implementado

**API**, módulo nuevo `apps/api/src/fallas-criticas/`:

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/fallas-criticas/informes` | El RT carga el informe de una máquina. Si trae `cablesDesgastados` o `limitadorAnulado` en `true`, emite el evento. Responde `201 { informe, eventoEmitido }`. `400` nombrando cada campo inválido; `404` si la máquina no existe. |
| `GET` | `/api/fallas-criticas/eventos` | Canal en tiempo real (Server-Sent Events). Evento `falla-critica` con máquina, edificio, ECA, inspector, fallas y `enlaceInforme`. Manda un `ping` cada 25 s para que ningún proxy corte la conexión ociosa. |
| `GET` | `/api/fallas-criticas/informes/:id` | El informe en HTML, de sólo lectura. `404` si no existe. |

Cuerpo del `POST`: `maquinaId` (texto, obligatorio), `inspector` (texto, obligatorio),
`cablesDesgastados` y `limitadorAnulado` (booleanos, obligatorios), `observaciones` (texto, hasta
2000 caracteres) y `fotografias` (hasta 10 URLs http/https).

**Web**, `apps/web/src/fallas/`: el componente `AlertaFallaCritica`, montado en la vista de
Secretaría (en sus dos pestañas). Se suscribe al canal y por cada falla crítica muestra una
notificación emergente (`role="alertdialog"`) con tres pitidos de dos tonos generados con Web
Audio, sin archivos de audio, y el botón `Ver informe técnico`.

## 2. Condiciones de aprobación

| # | Condición | Cómo se verifica |
|---|---|---|
| 1 | Al registrarse un informe con falla crítica (cables desgastados o limitador anulado), el servidor emite un evento en tiempo real. | `test/fallas-criticas.e2e-spec.ts` abre el canal SSE con una conexión HTTP real, hace el `POST` y recibe el evento en menos de 2000 ms (el test lo exige). También lo comprueba `RF-01-entrega.sh`. |
| 2 | El panel de la secretaría despliega una notificación emergente con aviso sonoro y enlace directo al informe. | La guía visual, pasos 1 a 4. En el navegador se verificó la notificación, los 6 osciladores del sonido (contando las llamadas a `AudioContext.createOscillator`) y el enlace. La lógica está cubierta en `apps/web/src/fallas/fallas.test.ts`. |

## 3. Cómo se levanta y se prueba

```bash
npm ci
npm run dev                      # API :3050 + web https://localhost:8050 (requiere npm run certs)
bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-01-entrega.sh
bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-01-entrega.sh --carga 200
```

No hace falta base de datos. Máquinas válidas para `maquinaId`: las del semillero de
`FirmanteService` (`MAQ-CORRIENTES-M1`, `MAQ-CORRIENTES-M2`, `MAQ-CALLAO-M1`, `MAQ-SANTAFE-M1`,
`MAQ-SANTAFE-M2`).

## 4. Pruebas en verde

| Comando | Resultado |
|---|---|
| `npm run typecheck` | sin errores (api y web) |
| `npm test -w apps/api` | 21 suites, 160 tests en verde (16 nuevos: `fallas-criticas.spec.ts` y `fallas-criticas.e2e-spec.ts`) |
| `npm test -w apps/web` | 6 archivos, 75 tests en verde (11 nuevos: `fallas/fallas.test.ts`) |
| `RF-01-entrega.sh --carga 50` (local, http) | 10 OK, 0 con falla. 50 altas, 0 errores, 0 eventos perdidos, el `POST` más lento tardó 244 ms |

`npm run test:int` no se corrió: necesita PostgreSQL (Docker) y esta tarjeta no toca la base.

## 5. Qué quedó afuera o se asumió

- **No hay pantalla del RT de calle para cargar el informe.** El informe entra por la API (la
  carga desde la tablet es otra Historia). La tarjeta cubre el pipeline y el aviso en Secretaría.
- **Qué es "falla crítica":** exactamente los dos casos de la condición, dos booleanos explícitos
  del informe. No se infieren a partir de un texto libre.
- **Los informes viven en memoria**, igual que las máquinas de las que cuelgan (`FirmanteService`):
  se pierden al reiniciar la API. Persistirlos en PostgreSQL es trabajo aparte.
- **No se modifica la `alertaCritica` de la máquina** (la que leen el Portal ECA, el remito y
  WhatsApp). El PDF legal y el despacho a la ECA son RF-02 de esta misma Historia.
- **El enlace no usa `/api/eca/remito/:id/informe` a propósito:** esa ruta registra un acuse de
  recibo legal a nombre de la ECA cada vez que alguien la abre. Si la Secretaría la abriera,
  quedaría un acuse falso. Por eso el informe tiene su propia ruta de sólo lectura.
- **El canal no tiene autenticación.** Hoy la API no tiene sesiones en ningún endpoint. Cuando
  exista el login, `/eventos` tiene que quedar sólo para el rol Secretaría, porque expone
  direcciones de edificios.
- **Sonido:** los navegadores sólo dejan sonar audio después de que el usuario interactuó con la
  página. Entrar a la pestaña Secretaría cuenta como esa interacción. Si se recarga la página y
  no se toca nada, la notificación aparece igual pero sin sonido.
- **Eventos perdidos:** el canal entrega lo que pasa mientras está conectado. Si la Secretaría no
  tiene la página abierta en ese momento, no ve la notificación después: no hay historial de
  alertas pendientes.
