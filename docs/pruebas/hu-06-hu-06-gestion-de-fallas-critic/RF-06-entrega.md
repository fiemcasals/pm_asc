# HU-06 · RF-06 — RT con sesión: fallas críticas y checklist solo para quien corresponde

**Historia de Usuario:** HU-06: Gestión de Fallas Críticas
**Requerimiento:** RF-06 (`REQ-1795011668144`)
**Tipo:** Seguridad (tercera tarjeta de la serie que empezó con el Portal ECA, HU-15 RF-02, y siguió con el Portal del Firmante, HU-08 RF-04)

## El problema

Cargar un informe de falla crítica (`POST /api/fallas-criticas/informes`) y las rutas del checklist (configuración, crear y ver inspecciones) nunca llevaron `@Roles`, y en esta API una ruta sin `@Roles` es pública. Contra el código anterior, **sin ninguna sesión**:

- cualquiera registraba una falla crítica (201), que además **dispara el aviso a la Secretaría**;
- cualquiera —una ECA, el Firmante, nadie— creaba inspecciones y leía el checklist;
- el inspector del informe salía **del cuerpo del pedido**: se podía cargar una falla a nombre de otra persona.

Y había un problema escondido en el celular: la cola offline de fallas críticas **descartaba cualquier error 4xx** como «rechazo definitivo». Con sesión, un 401 (la sesión venció) habría **borrado una falla crítica pendiente** que el RT cargó sin señal.

El script de entrega, contra ese código, da **9 errores** (4 verificaciones OK y 9 en rojo).

## Qué cambia

| Ruta | Quién entra | Qué hace |
|---|---|---|
| `POST /api/fallas-criticas/informes` | **RT** | Registra la falla crítica. El inspector es **el usuario de la sesión**. |
| `POST /api/checklist/inspecciones` | **RT** | Crea la inspección. |
| `GET /api/checklist/config` | RT, Secretaría, Administrador, Firmante | Configuración del checklist. |
| `GET /api/checklist/inspecciones/:id` | RT, Secretaría, Administrador, Firmante | Lee una inspección. |

Sin sesión → **401**. Cualquier otro rol (incluida la ECA, que no lee nada del checklist) → **403**. La Secretaría y el Administrador **no** registran fallas críticas ni crean inspecciones: son actos del RT en la calle.

### Reglas

- **El inspector sale de la sesión.** Lo que venga como `inspector` en el cuerpo se ignora, y el cuerpo ya no necesita traerlo (si lo manda, no molesta; si falta, no es error). Un cuerpo inválido sigue dando 400 con el detalle de lo que falta.
- **El reintento sigue siendo idempotente**: mandar de nuevo el mismo informe (mismo identificador) devuelve el original, no uno nuevo.

### En el celular (la cola de fallas críticas)

- Se manda con `fetchConSesion` (la sesión va en cada pedido).
- **Un 401 o 403 no borra nada**: la falla queda guardada con sus fotos, el envío se corta en esa y, al volver a ingresar, se manda. Antes de esta tarjeta, un 4xx se descartaba. Ahora solo se descarta lo que **reintentar no arregla** (400, 404, 409, 422…). Los 5xx, 408, 425 y 429 se reintentan.
- **Cada falla guarda a nombre de quién la cargó**, y la cola solo manda las de la sesión que está abierta: si dos RT comparten el celular, lo de uno espera a que ingrese él (el inspector sale de la sesión, así que mandarla con la del otro sería mentirle a la Secretaría). Las que se guardaron **antes de esta versión** no tienen dueño y las manda quien tenga la sesión abierta. Si en medio del envío ingresa otro usuario, se frena.
- El aviso de la cola (`ColaInformesAviso`) ahora también sincroniza y cuenta las fallas críticas pendientes; el mensaje al cargar distingue si quedó guardada por **la sesión** o por **la señal**.
- La configuración del checklist se pide con la sesión; si no hay red, la sesión no sirve o la API falla, se sigue con el respaldo local (como antes).

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API RECIÉN levantada (el script registra fallas críticas de demostración y eso queda en memoria):
bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-06-entrega.sh
```

Crea usuarios temporales (un RT, un Firmante y una ECA, todos `h06r-*`) y la inspección de prueba, y los borra al terminar. Da **13 verificaciones OK**; contra el código anterior, 9 errores.

**El celular (criterios 4 y 5), a mano:** con la web levantada y un usuario RT (creado por el Administrador):

1. Ingresar como RT, abrir una inspección y marcar una falla crítica con la API cortada o la sesión vencida: la falla queda **guardada** y el aviso lo dice.
2. Volver a ingresar: el aviso de la cola manda la falla y desaparece.
3. Con dos RT en el mismo celular: lo que guardó uno no se manda al ingresar el otro; se manda cuando ingresa su dueño.
4. En la Secretaría, el informe aparece **a nombre del RT de la sesión**, aunque el pedido dijera otro inspector.

Se recorrió en un navegador real (la sesión vencida conserva las fallas, al ingresar se mandan las propias y las anteriores a esta versión, la de otro RT queda esperando, y el inspector que llega a la API es el de la sesión) y los usuarios y datos de prueba se borraron.

## Pruebas automáticas

- **API** — `rt-sesion.e2e-spec.ts` (25 pruebas: HTTP con sesiones reales de cada rol, una app nueva por prueba para que las fallas registradas no se mezclen). Se adaptaron los e2e y de integración que cargaban fallas críticas o inspecciones sin sesión (ahora lo hace un RT; `createTestApp` acepta el header `x-rol-de-prueba` para elegir el rol del usuario implícito de prueba).
- **Web** — `rt-sesion.test.ts` (56 pruebas): qué es un error de sesión y cuál es pasajero, cargar con sesión, la cola completa (401 y 403 que conservan, sesión vencida → ingresar → se manda, errores pasajeros y definitivos, cada RT manda lo suyo, las anteriores sin dueño, cambio de usuario a mitad del envío) y la configuración del checklist con respaldo. El IndexedDB simulado pasó a un ayudante compartido (`idb-en-memoria.ts`).
- **Suites completas:** API 1102 de unidad/e2e y 187 de integración, web 473.
- **28 mutaciones** (cada ruta sin `@Roles`, roles de más, el inspector sin salir de la sesión, y las de la cola: `fetch` sin sesión, 403 que no cuenta como sesión, 401 que borra, 429 que no se reintenta, mandar las de cualquier usuario, no guardar el dueño, no frenar al cambiar de usuario, la configuración con `fetch` sin sesión…): las 28 hacen fallar alguna prueba.

## Supuestos y limitaciones

- **El RT no está atado a «sus» máquinas.** Las máquinas y los datos de demostración viven en memoria y el campo `rtCalle` no son usuarios reales: hoy cualquier RT registra una falla en cualquier máquina. Se resuelve cuando esos datos vengan de la base (terna de roles por edificio, HU-02).
- **Siguen públicas**, y son las tarjetas siguientes: `GET /api/fallas-criticas/informes/:id` (el informe en HTML, que además no escapa el texto) y el canal en tiempo real `eventos`, que usa `EventSource` y no puede mandar `Authorization` (hay que pasarlo a un lector por `fetch`).
- La idempotencia por identificador del informe es **global**, no por usuario.
- Lo guardado en el celular antes de esta versión no tiene dueño: lo manda quien tenga la sesión abierta, como se explicó arriba.
- El cableado de `ColaInformesAviso` para las fallas críticas se verificó en el navegador; las pruebas renderizan el HTML inicial y no ejercitan ese efecto. La lógica que usa sí está probada.
- El payload de la web todavía **declara** `inspector` como obligatorio (el servidor lo ignora): se simplifica cuando se toque ese tipo.
