# HU-15 · RF-02 — Portal ECA con sesión: cada ECA ve solo lo suyo

**Historia de Usuario:** HU-15: Aislamiento de datos entre ECA
**Requerimiento:** RF-02 (`REQ-1795008148136`)
**Tipo:** Seguridad (surgió de la revisión del 18/11/2026)

## El problema

El guard global de la API es **abierto por defecto**: una ruta sin `@Roles` es pública. Las del portal ECA (alertas, cobertura, máquinas, remito y acuse) nunca lo llevaron. Contra el código anterior, sin ninguna sesión:

- cualquiera veía las alertas, las máquinas y la cobertura de **cualquier** ECA;
- cualquiera descargaba el remito de la alerta de **otra** ECA;
- cualquiera registraba el **acuse de recibo legal** de una alerta con el usuario que escribiera en la URL (`?usuario=`), el cuerpo o un header, o sin usuario (quedaba «responsable.tecnico@eca.com.ar»);
- la ECA se tomaba de un header (`x-eca-name`) que cualquiera cambia, así que el aislamiento entre ECA (HU-15) no se sostenía.

El script de entrega, corrido contra ese código, da **16 errores**.

## Qué cambia

| Ruta | Quién entra | Qué ve |
|---|---|---|
| `GET /api/eca/alertas`, `/cobertura`, `/maquinas` | usuario **ECA**, Secretaría, Administrador | La ECA ve **solo la suya** (sale de su sesión). Secretaría y Administrador eligen cuál mirar (`x-eca-name`, `x-eca-id` o `?eca=`). |
| `GET /api/eca/remito/:alertaId` (JSON y PDF) | usuario **ECA** | Solo alertas de su ECA. La descarga registra el acuse legal a nombre de su usuario. |
| `POST /api/eca/alertas/:alertaId/acuse` | usuario **ECA** | Solo alertas de su ECA. El acuse queda a nombre de su usuario. |
| `GET /api/eca/remito/:alertaId/informe` | público (por ahora) | **Ya no crea acuses**: muestra el acuse si existe y, si no, «pendiente». |

Sin sesión → **401**. RT y Firmante → **403** en todo. Un usuario ECA **sin ECA asignada** → 403 «Tu usuario no tiene una ECA asignada: pedile al Administrador que la cargue».

### Reglas

- **La ECA sale de la sesión.** Un header, un parámetro o un cuerpo con otra ECA se ignora.
- **La comparación es exacta, como la del RLS de la base** (distingue mayúsculas): «MAICON» no ve la flota de «MAICON Mantenimiento» ni «MAICON MANTENIMIENTO» la de «MAICON Mantenimiento». Si el filtro de la API fuera más flexible que el RLS, un usuario vería alertas cuyo acuse la base le oculta. Por eso el nombre de la ECA del usuario tiene que ser **igual** al de sus máquinas.
- **La alerta de otra ECA da 404**, el mismo mensaje que una alerta que no existe: no se revela que existe. Y no queda ningún acuse.
- **El acuse es del usuario de la sesión**, no del `usuario` de la URL, el cuerpo ni los headers (`x-eca-user`, `x-user-id`).
- **El remito y el acuse son de la ECA.** La Secretaría y el Administrador ven las alertas pero no los descargan (403): el acuse es la constancia de que *la ECA* tomó conocimiento, y si lo registrara otra persona quedaría una constancia legal falsa. En la pantalla, en lugar del botón ven «El remito y el acuse de recibo legal los descarga y registra la ECA».
- **Lectura de la base:** la Secretaría y el Administrador, que no tienen ECA propia, leen los acuses y los avisos de las alertas con la ECA de esas alertas. (Antes de este cambio de lectura, con sesión de Secretaría el RLS le ocultaba el historial de recordatorios: lo encontró una prueba de integración.)

### En la web

- `Usuario` (la sesión) trae su `eca`.
- `eca.ts` pide alertas, cobertura, máquinas y remito con `fetchConSesion` y **ya no manda ningún `usuario`**. Un 401 dice «La sesión venció: ingresá de nuevo»; un 403, que no tiene acceso o que el remito es solo de la ECA.
- `PortalEca`: un usuario ECA ve su ECA fija (sin selector); Secretaría y Administrador, el selector; un usuario ECA sin ECA, el motivo y ningún dato.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RF-02-entrega.sh
```

Crea usuarios temporales (dos ECA, una ECA sin asignar, un RT y un Firmante) y los borra al terminar, con los acuses que hayan quedado (la API los recuerda en memoria hasta que se reinicia). Da **19 verificaciones OK**; contra el código anterior, 16 errores.

**La pantalla (criterio 5), a mano:** con la web levantada (`npm run dev`) y un usuario con rol ECA y la ECA «Conservación Porteña S.R.L.» (creado por el Administrador):

1. Ingresar como ese usuario: va directo al portal, con su ECA fija y sin selector; ve **2 máquinas y 1 alerta**.
2. «Descargar Remito de Notificación»: baja un PDF y debajo de la alerta aparece «Acuse de Recibo Legal Registrado… Usuario: *su usuario*».
3. Salir e ingresar como Secretaría → pestaña «Portal ECA»: hay selector; elegir «MAICON Mantenimiento» muestra sus 2 alertas **sin** el botón del remito.
4. Con un usuario ECA sin ECA cargada: se ve «Tu usuario no tiene una ECA asignada» y ningún dato.

Se recorrió en un navegador real (los cuatro casos) y los datos de prueba se borraron.

## Pruebas automáticas

- **API** — `eca.e2e-spec.ts` (HTTP con sesiones reales de cada rol y de cada ECA: 30 pruebas del bloque de esta tarjeta), `portal-eca-sesion.int-spec.ts` (PostgreSQL real: 9 pruebas) y el ayudante `sesiones-e2e.ts` (un usuario por rol y por ECA, incluidos los casos límite «MAICON», «MAICON MANTENIMIENTO» y ECA sin asignar).
- **Web** — `portal-sesion.test.ts` (31 pruebas): alcance por rol, mensajes de error, que todo el cliente use la sesión y nunca `fetch` sin sesión, el portal y la barra de acciones.
- Se adaptaron 6 archivos de prueba que llamaban a estas rutas sin sesión. Las pruebas que provocaban un error de la base con un NUL en `usuario` ya no pueden hacerlo (ese dato sale de la sesión): ahora afirman que el NUL se ignora; el 400 «Datos inválidos» sigue probado con un error simulado de la base.
- **41 mutaciones** (cada ruta sin `@Roles`, roles de más, ECA propia desactivada, modo estricto, header que gana sobre la sesión, usuario que no sale de la sesión, alerta ajena sin 404, comparación sin mayúsculas o parcial, canonización de la ECA, lectura con contexto de Secretaría, informe que crea acuses, y las 15 de la web): todas hacen fallar alguna prueba. Una sobrevivió (el valor por defecto de la barra de acciones) y se agregó la prueba que la cubre.

## Supuestos y limitaciones

- **El resto de las rutas públicas** (`/api/firmante/*`, `/api/fallas-criticas/*`, `/api/checklist/*`, `/api/whatsapp/*`, `/api/seguridad/rls`) siguen sin sesión: son las tarjetas siguientes de esta serie. En particular, el botón «Despachar Alerta WhatsApp» del portal ECA sigue llamando a una ruta pública.
- **La vista pública del informe** (`/remito/:alertaId/informe`, el link del WhatsApp) sigue pública hasta la tarjeta del link firmado, y **arma el HTML con los datos sin escapar** (título, motivo, observaciones): hay que escapar o reemplazar esa vista.
- **La Secretaría y el Administrador no descargan el remito.** Si se quiere que puedan obtener una copia de lectura *sin* acuse, hace falta una tarjeta (el PDF tendría que decir «acuse pendiente»).
- **El nombre de la ECA del usuario tiene que coincidir exacto con el de sus máquinas** (igual que el RLS): un usuario con la ECA mal escrita ve el portal vacío.
- En la web no hay pruebas de componente con datos (las pruebas renderizan el HTML inicial): el flujo con datos se verificó en un navegador real.
- Las alertas y las máquinas de demostración viven en memoria de la API.
