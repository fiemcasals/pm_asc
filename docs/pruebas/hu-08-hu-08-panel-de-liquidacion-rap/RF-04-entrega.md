# HU-08 · RF-04 — Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo

**Historia de Usuario:** HU-08: Panel de Liquidación Rápida y Autorización de Firma AGC
**Requerimiento:** RF-04 (`REQ-1795010603476`)
**Tipo:** Seguridad (segunda tarjeta de la serie que empezó con el Portal ECA, HU-15 RF-02)

## El problema

Las rutas del Firmante (`máquinas`, `autorizar`, `rechazar`) nunca llevaron `@Roles`, y en la API una ruta sin `@Roles` es pública. Peor: `autorizar` y `rechazar` **no controlaban que la máquina fuera del Firmante**, y la identidad salía de un header (`x-user-name`) con `gonza` como valor por defecto. Contra el código anterior, sin ninguna sesión:

- cualquiera **autorizaba la firma AGC** de cualquier máquina (200), y el registro quedaba a nombre del usuario que escribiera en el header;
- cualquiera rechazaba un informe (el rechazo lo manda de vuelta a la Secretaría);
- cualquiera —el RT, una ECA, nadie— veía el panel con las máquinas de todos.

El script de entrega, contra ese código, da **15 errores**.

## Qué cambia

| Ruta | Quién entra | Qué hace |
|---|---|---|
| `GET /api/firmante/maquinas` | **Firmante**, Secretaría, Administrador | El Firmante ve **solo las suyas** (sale de su sesión: un header o un `?firmante=` con otro se ignora). La Secretaría y el Administrador ven las de todos, o las del Firmante que elijan con `?firmante=`. |
| `POST /api/firmante/autorizar` | **Firmante** | Solo máquinas suyas. Queda a nombre del usuario de la sesión. |
| `POST /api/firmante/rechazar` | **Firmante** | Solo máquinas suyas. Queda a nombre del usuario de la sesión. |

Sin sesión → **401**. RT y ECA → **403** en todo. Secretaría y Administrador → **403** al autorizar o rechazar.

### Reglas

- **La identidad sale de la sesión**, no de un header. Ya no hay un «gonza» por defecto.
- **La máquina tiene que ser del Firmante**: su usuario de login coincide con el Firmante asignado a la máquina. Si no, **404 con el mismo mensaje que una máquina inexistente** (no se revela que existe), y no cambia nada. Vale también por el id de la visita.
- **La autorización es del Firmante.** La Secretaría y el Administrador ven el panel en modo lectura: pueden auditar el informe y las fotos, pero no hay botón de autorizar (y la API responde 403 si lo intentan). Mismo criterio que con el acuse de la ECA en la tarjeta anterior: el acto legal es de quien corresponde.

### En la web

- `firmante.ts` pide las máquinas, autoriza y rechaza con `fetchConSesion` (sin mandar ningún usuario). Un 401 dice «La sesión venció: ingresá de nuevo»; un 403, «Sólo el Firmante autoriza o rechaza la firma AGC».
- `PortalFirmante`: el Firmante ve «RT Legal: *su usuario*» (antes decía siempre «gonza») y los botones de autorizar; la Secretaría y el Administrador ven «Vista de lectura: todos los Firmantes», una nota de que la firma AGC la autoriza el Firmante, y ningún botón de autorizar (ni en la tarjeta ni en el modal de auditoría).
- La tarjeta de cada máquina pasó a un componente propio (`TarjetaMaquina`) para poder probarla.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API RECIÉN levantada (el script autoriza y rechaza máquinas de demostración y eso queda en memoria):
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-04-entrega.sh
```

Crea usuarios temporales (el Firmante «gonza», dueño de las máquinas de demostración, otro Firmante, un RT y una ECA) y los borra al terminar; si ya existe un usuario «gonza», se detiene sin tocarlo. Da **16 verificaciones OK**; contra el código anterior, 15 errores.

**La pantalla (criterio 5), a mano:** con la web levantada y un usuario con rol Firmante llamado `gonza` (creado por el Administrador):

1. Ingresar como `gonza`: va directo al panel, dice «RT Legal: gonza» y ve **5 máquinas** con su botón «Autorizar Firma AGC».
2. «Auditar Informe y Fotos» → «Autorizar Firma AGC»: aparece «Firma digital autorizada…» y el registro queda a nombre de `gonza`.
3. Ingresar como otro Firmante: «No se encontraron máquinas asignadas».
4. Ingresar como Secretaría → pestaña «Firmante»: «Vista de lectura: todos los Firmantes», las 5 máquinas, la nota, **sin botones de autorizar**; en «Auditar» el modal dice «Sólo lectura».

Se recorrió en un navegador real (los cuatro casos) y los usuarios de prueba se borraron.

## Pruebas automáticas

- **API** — `firmante-sesion.e2e-spec.ts` (22 pruebas: HTTP con sesiones reales de cada rol, y un segundo Firmante al que se le reasigna una máquina para distinguir la identidad de la sesión del «gonza» de antes). Se adaptaron `firmante.e2e-spec.ts` y `firmante-rechazo.e2e-spec.ts` (el Firmante de la sesión es `gonza`).
- **Web** — `firmante-sesion.test.ts` (28 pruebas): quién puede firmar, mensajes de error, que todo el cliente use la sesión y nunca `fetch` sin sesión (ni un `x-user-name`), el panel, la tarjeta y el modal según el rol.
- **32 mutaciones** (cada ruta sin `@Roles`, roles de más, el Firmante pidiendo las de otro, autorizar o rechazar sin controlar el dueño, identidad que no sale de la sesión, y las 18 de la web): 31 hacen fallar alguna prueba. Sobrevive una: que el panel le pase `puedeFirmar` al modal de auditoría; ese modal solo aparece al seleccionar una máquina y las pruebas renderizan el HTML inicial, así que se cubrió en el navegador.

## Supuestos y limitaciones

- **La web no tiene pantalla para rechazar un informe.** HU-08 RF-03 hizo solo la API. Esta tarjeta deja el cliente de rechazo (`rechazarInformeMaquina`) listo, con sesión y probado, pero **sin pantalla**: el criterio 5 se cumple para lo que existe (ver y autorizar). Queda para una tarjeta aparte.
- **El Firmante se identifica por su usuario de login**, que tiene que coincidir con el Firmante asignado a la máquina. Los datos de demostración (máquinas, visitas, Firmante `gonza`) viven en memoria de la API; el vínculo con la terna de roles por edificio (HU-02) queda para cuando esos datos vengan de la base.
- **Las demás rutas públicas** (fallas críticas, checklist, WhatsApp, `seguridad/rls`) siguen sin sesión: son las tarjetas siguientes. El «cartel de falla crítica» del portal del Firmante todavía llama a una ruta pública.
- La Secretaría y el Administrador ven las máquinas de **todos** los Firmantes; no hay un selector en pantalla (la API acepta `?firmante=`).
