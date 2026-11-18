# HU-06 · RF-07 — Canal en tiempo real de fallas críticas con sesión

**Historia de Usuario:** HU-06: Gestión de Fallas Críticas
**Requerimiento:** RF-07 (`REQ-1795013508652`)
**Tipo:** Seguridad (cuarta tarjeta de la serie: Portal ECA, Portal del Firmante, RT con sesión y ésta)

## El problema

El canal de eventos de fallas críticas (`GET /api/fallas-criticas/eventos`, Server-Sent Events) no llevaba `@Roles`, y en esta API una ruta sin `@Roles` es pública. Contra el código anterior, **sin ninguna sesión**:

- cualquiera abre el canal (200) y recibe en vivo cada falla crítica —edificio, dirección, máquina, inspector, ECA— y cada apertura de alerta;
- el RT y la ECA también entran (200);
- **a todo Firmante le llegan las alertas de todos los edificios**: el panel del Firmante filtraba en el navegador, que no es una barrera (los datos ya habían viajado).

Además, el panel lo escuchaba con `EventSource`, que **no puede mandar el encabezado `Authorization`**: no se podía simplemente pedir sesión sin cambiar el cliente.

El script de entrega, contra ese código, da **6 errores** (4 verificaciones OK y 6 en rojo).

## Qué cambia

| | Antes | Ahora |
|---|---|---|
| Quién abre el canal | cualquiera | **Secretaría, Administrador y Firmante**. Sin sesión → 401; RT y ECA → 403. |
| Qué recibe un Firmante | todo | solo las fallas críticas y las aperturas de **sus** edificios (mismo criterio que la lista y que abrir una alerta, sin distinguir mayúsculas). La Secretaría y el Administrador reciben todo. |
| Cuánto dura una conexión | indefinido | **5 minutos** (`CANAL_FALLAS_VIGENCIA_SEG`, entero entre 1 y 900). Después el servidor la cierra. |
| Cómo escucha el panel | `EventSource` | `fetch` con la sesión (`fetchConSesion`) y un lector del formato SSE (`canalSesion.ts`). |

### Por qué el canal se corta solo

Una conexión abierta no se vuelve a validar: el guard comprueba la sesión al **abrirla**. Sin un corte, a un usuario al que el Administrador le revocó la sesión o desactivó la cuenta le seguirían llegando alertas hasta cerrar el navegador. El servidor la cierra cada 5 minutos y el panel la reabre con `fetchConSesion`, que renueva la sesión; si fue revocada, el reintento responde 401 «revocada», la app cierra la sesión y el canal no vuelve a abrirse. **La revocación vale, como máximo, a los 5 minutos** (el máximo permitido es 15, lo que dura el token de acceso).

### En la web

- **Reconexión sola**: si el servidor corta (lo normal) reabre a los 200 ms; si se corta la red o responde un 5xx, reintenta con espera creciente (1 s, 2 s, 4 s… hasta 30 s). Un corte de menos de 1 s se trata como falla para no entrar en un lazo apretado.
- **Cuándo no reintenta**: sesión revocada (la app ya la cerró) y 403 (el rol no alcanza). Un 401 sí se reintenta: puede ser que no se haya podido renovar justo por falta de señal.
- **Lo que pasa mientras el canal está cortado** no llega por el canal. Por eso, cada vez que el canal vuelve tras un corte, el panel **vuelve a pedir la lista** de alertas, la junta con lo que muestra (`fusionarPendientes`): agrega las nuevas, avisa con el sonido si hay alguna, y actualiza las que alguien abrió mientras tanto para que la alarma deje de sonar.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
bash docs/pruebas/hu-06-hu-06-gestion-de-fallas-critic/RF-07-entrega.sh
```

Abre los canales con `curl -N` (uno por usuario), registra una falla crítica como RT y comprueba qué le llegó a cada uno. Crea usuarios temporales (el Firmante «gonza», otro Firmante, un RT y una ECA) y los borra al terminar; si ya existe un usuario «gonza», se detiene sin tocarlo. Da **10 verificaciones OK**; contra el código anterior, 6 errores.

**El corte periódico real** dura 5 minutos. Para verlo: levantar la API con `CANAL_FALLAS_VIGENCIA_SEG=3` y correr `VERIFICAR_CORTE=3 bash …/RF-07-entrega.sh`: mide que el servidor cierra la conexión a los ~3 s (**11 OK**).

**La pantalla (criterio 5), a mano**, con la web levantada y la API con `CANAL_FALLAS_VIGENCIA_SEG=3` (así se ven los cortes y las reconexiones):

1. Ingresar como Secretaría, y desde otra terminal registrar una falla crítica como RT: aparece la alerta «Falla crítica reportada» sin recargar.
2. En el navegador (pestaña Red) el pedido a `eventos` se repite cada ~3 s, con `Authorization` y `Accept: text/event-stream`.
3. Con el panel abierto, el Administrador revoca las sesiones de esa Secretaría: en el siguiente reintento la app muestra «Tu sesión fue cerrada por un Administrador» y vuelve al ingreso (la consola muestra un solo 401).
4. Ingresar como un Firmante sin máquinas: el portal abre, el canal queda conectado y **no aparece ninguna alerta** aunque se registren fallas. Ingresar como «gonza»: aparecen las suyas, y una nueva llega en vivo (el contador pasó de «1 de 3» a «1 de 4»).

Se recorrió en un navegador real (los cuatro puntos) y los usuarios y datos de prueba se borraron.

## Pruebas automáticas

- **API** — `canal-sesion.e2e-spec.ts` (14 pruebas, con una conexión HTTP real por canal y sesiones reales de cada rol; M1 se le reasigna a otro Firmante para distinguir a quién le llega qué), `canal-vigencia.spec.ts` (3: el corte a los 5 minutos y el de la configuración, con reloj simulado) y `config.spec.ts` (+10: el valor por defecto y los rechazos de `CANAL_FALLAS_VIGENCIA_SEG`). `sse-cliente.ts` es un cliente SSE de prueba reutilizable.
- **Web** — `canal-sesion.test.ts` (37 pruebas): el parser SSE (pedazos cortados en cualquier punto, los tres saltos de línea, comentarios, varias líneas de dato), las esperas, la reconexión (corte normal, corte rápido, sin red, 401, 5xx, 403, sesión revocada), `close()`, que por defecto use la sesión y nunca `EventSource`, y `fusionarPendientes`.
- **Suites completas:** API 1143 de unidad/e2e y 188 de integración, web 515.
- **49 mutaciones** (el canal sin `@Roles`, roles de más o de menos, los flujos sin filtrar, `esVisiblePara`, el corte y la configuración, el parser, las esperas, la reconexión, `close()`, el pedido sin sesión, la vuelta a `EventSource`, la fusión de la lista): 47 hacen fallar alguna prueba. De las otras dos, una era una línea redundante del ciclo de reconexión (el comportamiento era idéntico sin ella) y la **eliminé**; la otra es **equivalente**: la guarda «informe desconocido» al filtrar aperturas no se puede alcanzar, porque una apertura solo se emite para un informe que existe.

## Supuestos y limitaciones

- **Lo que se pierde en un corte se recupera por la lista, no por el canal.** El canal no repite lo anterior a la conexión (tampoco antes). El panel pide la lista al reconectar, pero esa pieza del componente (`AlertaFallaCritica`) **no está cubierta por pruebas automáticas** (las pruebas renderizan el HTML inicial y no ejercitan los efectos) y **no pude verificarla de punta a punta en el navegador**: el intento de cortar la red con el navegador no fue concluyente y se cerró. La lógica que usa (`fusionarPendientes`) y el aviso de reconexión sí están probados.
- **El enlace al informe** que trae cada alerta (`GET /api/fallas-criticas/informes/:id`) sigue siendo una página pública, y no puede llevar la sesión porque se abre con un enlace común. Es la tarjeta de los links del informe.
- **La revocación vale en hasta 5 minutos** para quien ya tiene el canal abierto (no al instante). Se puede bajar con `CANAL_FALLAS_VIGENCIA_SEG`, a costa de más reconexiones.
- El Firmante se identifica por su usuario de login (tiene que coincidir con el asignado a la máquina; los datos de demostración viven en memoria), igual que en las tarjetas anteriores.
- **Scripts de entrega de otras tarjetas**: el de HU-06 RF-01 abre este canal sin sesión y ahora recibiría 401, como varios de los que registran fallas críticas sin sesión (RT con sesión). Quedan para un barrido al final de la serie, cuando el modelo de acceso esté cerrado.
