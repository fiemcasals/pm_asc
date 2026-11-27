# HU-19 · RF-04 — La API del chat rechaza con un mensaje claro lo que no corresponde en vez de fallar o guardarlo

**Historia de Usuario:** HU-19: Chat interno entre operarios e ingenieros para consultas y reportes
**Requerimiento:** RF-04 (`REQ-1795778246508`)
**Tipo:** Funcional. Sale de la revisión del chat del 25/11/2026 (pedido del usuario: «fijate el estado del chat… ¿tiene errores?»). Depende de HU-19 RF-03 (la lista de contactos ya incluye a la Secretaría).

## El problema

La API del chat casi no validaba lo que recibía. Probado con la sesión de un Técnico RT:

- Un destinatario que no es un identificador, un tipo de sala inventado o ausente, un edificio inválido, un contenido que no es texto o pedir los mensajes de una sala inválida devolvían **500** (error del servidor) en vez de 400.
- Y se **guardaban** sin objeción: un mensaje de **100.000 caracteres** (armó un globo de casi 59.000 px que dejó el hilo inutilizable para todos), adjuntos con dirección `javascript:` o `http://` externa (el navegador de cada lector pide esa dirección: rastreo), y privados a quien está dado de baja o ni siquiera usa el chat (una ECA).

## Qué cambia

Lo que entra se rechaza con **400 y un mensaje que lo explica**, y no se guarda nada. Las reglas están en dos lugares:

- **En la puerta** (`api/src/chat/chat.validacion.ts`, funciones puras): el tipo y el formato de cada campo.
- **En el servicio** (`ChatService`, con datos): que el destinatario exista, esté activo y sea un contacto; que el edificio exista.

| Qué | Regla | Mensaje (400) |
|---|---|---|
| Cuerpo | Tiene que ser un objeto | «El mensaje tiene que ser un objeto con el tipo de sala y el contenido.» |
| Tipo de sala | Solo `global` o `directo` | «El tipo de sala tiene que ser «global» o «directo».» |
| Contenido | Texto de hasta **2.000 caracteres** (sin contar espacios de los costados) | «El contenido del mensaje tiene que ser texto.» / «El mensaje no puede superar los 2000 caracteres.» |
| Destinatario (privado) | Un identificador válido, de alguien que **exista, esté activo y use el chat** (RT, Firmante, Administrador o Secretaría), y que no seas vos | «El destinatario no es un identificador válido.» / «El destinatario no existe o no es un contacto del chat.» |
| Edificio | Un identificador válido de un edificio que exista **y que quien escribe pueda ver** (con la seguridad por edificio, un Técnico o Firmante solo ve los asignados) | «El edificio elegido no es válido.» / «El edificio elegido no existe o no está disponible para vos.» |
| Adjunto | Una imagen **PNG, JPEG o WEBP** en base64 (`data:image/…;base64,…`). Se rechazan `javascript:`, `http(s)://`, SVG (puede llevar scripts), HTML y todo lo demás | «El adjunto tiene que ser una imagen PNG, JPEG o WEBP.» |
| Máquina | Texto de hasta 40 caracteres | «La referencia de la máquina tiene que ser un texto de hasta 40 caracteres.» |
| Conversación pedida (`GET …?sala=`) | `global` o el identificador de un compañero | «La conversación pedida no es válida: tiene que ser «global» o el identificador de un compañero.» |

Detalles:

- **El acceso se controla antes que el contenido:** una ECA recibe 403 (no 400) aunque mande un mensaje inválido, y sin sesión 401.
- **En la pantalla:** la caja de texto no deja escribir más de 2.000 caracteres (`maxLength`, constante `MAX_CARACTERES_MENSAJE` en `web/src/chat/limites.ts`, con una prueba que exige que sea el mismo número que valida la API), para que nadie pierda un mensaje largo por un rechazo.
- **En las pruebas existentes** hubo que ajustar dos cosas, ambas por reglas que esta tarjeta introduce: el repositorio en memoria usa ahora identificadores con forma de identificador, y la prueba de `chat.spec.ts` que etiquetaba un mensaje con el edificio «consorcio-123» ahora declara que ese edificio existe.

## Cómo probarlo

```bash
npm run db:up                                   # la base
npm run dev                                     # la API y la web
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-04-entrega.sh
```

Da **36 verificaciones OK**; contra el estado anterior, 13 OK y 23 errores (500 en lugar de 400 y mensajes que se guardaban). Crea usuarios temporales (dos RT —uno dado de baja—, una Secretaría y una ECA) y los borra, con sus mensajes, al terminar. Por cada caso inválido comprueba el **código 400, el mensaje y que no se guardó nada**.

**La pantalla (criterio 4), a mano:** ingresar con cualquier usuario del chat → **Chat Operativo** → pegar un texto de 2.500 caracteres en la caja de mensaje: queda en 2.000. Se envía completo.

## Pruebas automáticas

| Archivo | Qué prueba |
|---|---|
| `api/test/chat-validacion.spec.ts` (128) | Las funciones de la puerta, caso por caso (cuerpo, tipo de sala, contenido y sus límites exactos, destinatario, adjunto con 23 entradas inválidas, edificio, máquina, sala) y las reglas del servicio (contacto, edificio, también en un privado) |
| `api/test/chat-validacion.e2e-spec.ts` (34) | Por la API con sesiones: 23 pedidos inválidos con 400, su mensaje y que **no se guardó nada**, lo válido que sigue andando (incluidos los límites exactos y una foto de 8 MB), la sala inválida, y que la ECA recibe 403 antes que 400 |
| `api/test/chat-validacion.int-spec.ts` (29) | **Contra PostgreSQL de verdad**: destinatario inexistente, **dado de baja**, de **otro rol (una ECA)**, a sí mismo, un contacto de verdad; el edificio que no existe, el que existe (con su nombre) y el de un Técnico **sin ese edificio asignado**; los 2.001 y 2.000 caracteres; adjuntos inválidos; salas inválidas |
| `web/src/chat/limites.test.ts` (4) | El tope de 2.000 en la pantalla, sobre la caja correcta, y que sea el mismo número que valida la API |

**En un navegador real** (una Secretaría y un RT a la vez): la caja tiene `maxlength=2000`, pegar 2.500 caracteres deja 2.000, escribir 2.100 seguidos también, el mensaje de 2.000 se envía completo; y lo de siempre sigue andando con la validación nueva (texto con enlace, edificio y máquina con su etiqueta, una foto PNG, un privado a un contacto) sin ningún pedido del chat con error: **10 de 10**.

**Pruebas de mutación:** se rompió a propósito el código en 63 puntos (cada regla de la puerta, las del servicio, el SQL de contacto y de edificio, el repositorio en memoria, el controlador y el tope de la pantalla) y **las 63 fueron detectadas**: cuatro sobrevivieron en la primera pasada y se reforzaron las pruebas; ocho no compilaban y se rehicieron con reemplazos que compilan.

**Suites completas:** API 1568 en verde y 1 fallo que no es de esta tarjeta (`paradas.spec.ts`, de la HU-10 RF-08 de otro desarrollador); web 764 en verde y 1 fallo previo (`fechas/formato.test.ts`, lo arregla HU-19 RF-08); integración 215 pasan y 36 fallan, las mismas de antes.

## Limitaciones

- **La pantalla todavía no le muestra al usuario por qué se rechazó un mensaje:** si el servidor responde 400 el texto queda en la caja y no aparece ningún aviso. Eso es de HU-19 RF-06.
- **Una foto de formato distinto de PNG, JPEG o WEBP** (por ejemplo HEIC o GIF) se rechaza. Los celulares entregan JPEG; la reducción de las fotos antes de enviarlas (HU-19 RF-05) las convierte siempre a JPEG.
- **No hay tope de tamaño para la foto** más allá del que ya tenía el servidor (25 MB por pedido): el tope y su aviso son de HU-19 RF-05.
- Un Técnico o Firmante solo puede etiquetar los edificios que tiene asignados; el selector de la pantalla ya solo le lista esos.
