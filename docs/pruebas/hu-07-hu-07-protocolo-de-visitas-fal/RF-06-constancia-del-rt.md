# HU-07 · RF-06 — Constancia de visita fallida en el celular del RT

**Qué hace.** Cuando el RT de Calle toca **«No se pudo realizar la inspección»** en un edificio, se abre una pantalla donde elige la causa, saca la foto del ingreso y el celular toma el GPS y la hora. Al guardar, el edificio suma una advertencia y su pin desaparece de la lista del RT por ese día.

## La pantalla (RT de Calle › «Mapa del RT»)

El mapa con pines llega con HU-16; mientras tanto la vista del RT muestra la lista de **«Edificios pendientes de hoy»** con el botón «No se pudo realizar la inspección» en cada uno.

| Elemento | Comportamiento |
|---|---|
| Causa | Lista desplegable que sale de la configuración. Arranca con **«Encargado o responsable ausente»** (la única confirmada por el cliente). |
| Foto del ingreso | Se saca con la cámara y se comprime a ≤ 500 KB. |
| Ubicación (GPS) y hora del dispositivo | Las toma el celular (una sola lectura, al abrir la pantalla) y se muestran **sólo de lectura**. |
| **Guardar Advertencia de Visita** | Deshabilitado hasta tener causa de la lista, foto y ubicación. |
| Después de guardar | Avisa «suma la advertencia N» y el edificio sale de la lista. Un segundo intento el mismo día se rechaza con el motivo. |

Captura: `imagenes/RF-06-constancia-guardada.png`.

## Lo que guarda la API

`POST /api/visitas-fallidas` (RT de Calle del edificio, Secretaría o Administrador), cuerpo con `consorcioId`, `causa`, `fotoFrenteUrl`, `gps {latitud, longitud, precision}` y `horaDispositivo`:

- Se guardan **coordenadas, precisión del GPS, hora del dispositivo y hora del servidor** (`fechaHora`, la pone la API; lo que mande el celular en ese campo se ignora).
- El **inspector** es siempre el usuario de la sesión.
- Para el RT son obligatorias la causa (de la lista configurada, si no 400 con las causas válidas) y la hora del dispositivo.
- **Nada de eso se edita**: no hay endpoint para modificarlo y la base lo impide con un disparador (`visitas_fallidas_inmutable`, migración `023_constancia_visita_fallida`) para el rol de la aplicación.
- Una política RLS nueva deja al RT insertar **sólo en los edificios que tiene asignados**.
- `GET /api/visitas-fallidas/causas` devuelve `{ causas, porDefecto }`.
- `GET /api/recorrido` agrega `visitaFallidaHoy`; al RT le saca los edificios bloqueados **y** los que ya tienen una visita fallida de hoy (día de Buenos Aires). La Secretaría y el Administrador los siguen viendo, marcados.

## Configuración de causas

Variable `VISITAS_FALLIDAS_CAUSAS`, causas separadas por `;`, la primera es la de por defecto:

```
VISITAS_FALLIDAS_CAUSAS="Encargado o responsable ausente;Consorcio cerrado;La administración canceló la visita"
```

Sin la variable, la única causa es «Encargado o responsable ausente».

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-07-hu-07-protocolo-de-visitas-fal/RF-06-entrega.sh
```

El script crea un edificio y un RT temporales, y los borra al terminar. Para la pantalla: entrar con un RT asignado a algún edificio (el RT de la demo no tiene clave), aceptar el aviso de ubicación y tocar el botón.

Pruebas automáticas: `constancia-visita.spec.ts` (servicio), `constancia-visita.int-spec.ts` (PostgreSQL real: RLS del RT, hora guardada, disparador de inmutabilidad) y `apps/web/src/visitasFallidas/constanciaVisita.test.ts` (reglas de la pantalla). Se verificaron con 15 mutaciones (sin causa, causa fuera de lista, sin hora del dispositivo, inspector del cuerpo, pin que no desaparece, dos días, causa por defecto, foto/ubicación opcionales, etc.): todas hacen fallar algún test. La pantalla se recorrió además en el navegador con un RT real.

## Cambios que arrastra

- Los tests de HU-07 RF-05 que miraban el recorrido del RT justo después de registrar visitas ahora miran «al día siguiente», porque hoy el pin desaparece.
- El disparador sólo actúa para el rol de la aplicación: quien administra la base puede corregir datos (los scripts de demostración que retrasan fechas siguen funcionando).

## Supuestos a confirmar con el cliente

- Si «Consorcio cerrado» y «La administración canceló la visita» también cuentan como causas (por eso la lista es configurable).
- Que «ese día» sea el día calendario de Buenos Aires (no 24 horas corridas).
- La constancia no se puede cargar sin conexión: la cola de sincronización del celular es otra tarjeta (HU-18).
