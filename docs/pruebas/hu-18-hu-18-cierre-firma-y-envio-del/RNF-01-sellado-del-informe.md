# HU-18 · RNF-01 — Sellado del informe

**Qué hace.** Cuando el RT cierra el informe, la API lo **sella**: calcula un **SHA-256** de todo su contenido —equipos con sus fotos, firma o «Sin firma», usuario, id y las dos horas—, lo guarda y, a partir de ahí, el informe **no se puede modificar** (cualquier intento da 409 y queda registrado). Una **función de verificación** recalcula el hash y deja asentado en una auditoría si todavía coincide. Es lo que permite demostrar que el informe firmado no cambió (Ley 25.506).

## Cómo se sella

- **Hash:** SHA-256 en hexadecimal (64 caracteres) del **JSON canónico** del informe: las claves de los objetos van ordenadas y no hay espacios, así que el mismo contenido da siempre el mismo hash sin importar el orden en que llegó o en que lo devolvió la base. Versión del cálculo: `sha256-v1` (se guarda con el hash por si algún día cambia).
- **Qué cubre:** `id`, `consorcioId`, `usuario`, `equipos` (respuestas, observaciones y **fotos**), `firma` (datos, **imagen y trazos**) o `sinFirma` (motivo y **foto**), `requiereRevision`, **`horaDispositivo`** y **`horaServidor`**. Cambiar un solo carácter de cualquiera de ellos cambia el hash.
- **Las dos horas:** la del dispositivo es la que marcaba el celular; la del servidor la fija la API al cerrar (el celular no puede mandarla) y forma parte del sello.
- **El hash lo calcula la API:** el que mande el celular se ignora.
- Se puede comprobar por fuera: es el SHA-256 de ese JSON canónico (el script de entrega lo recalcula con otro programa y da el mismo valor).

## Inmodificable (criterio 3)

`PUT`, `PATCH` y `DELETE /api/informes-visita/:id` responden **409** «El informe está cerrado: no se puede modificar ni borrar. El intento quedó registrado.» **para cualquier rol** (RT, Secretaría, Administrador, Firmante) y el informe no cambia. Cada intento queda en `intentos_modificacion_informe`: quién, su rol, el método y cuándo. Un informe que no existe da 404 y no registra nada. Además, la base no da permisos de modificar ni borrar informes a la aplicación.

## Verificación y auditoría (criterio 4)

| Acción | Endpoint | Quién |
|---|---|---|
| Verificar el sello: recalcula el hash del contenido guardado y lo compara con el de cierre | `POST /api/informes-visita/:id/verificar` | Secretaría, Administrador |
| Ver las verificaciones y los intentos de modificación | `GET /api/informes-visita/:id/auditoria` | Secretaría, Administrador |

Cada verificación queda asentada en `verificaciones_informe` (quién, rol, hash guardado, hash recalculado, **coincide sí/no** y cuándo). Si alguien altera el contenido por fuera de la API (por ejemplo, directo en la base), la verificación da `coincide: false`. Un informe anterior al sellado (sin hash) tampoco coincide.

`GET /api/informes-visita` y el detalle traen `hashSha256`; en la pantalla del RT, al cerrar, aparece el sello abreviado («Sello digital (SHA-256): 3fa9c1d2e7b4… · el informe ya no se puede modificar»).

## Datos

Migración `030_sellado_informe`: columnas `hash_sha256` (64 hexadecimales, por CHECK) y `version_hash` en `informes_visita`, y las tablas `intentos_modificacion_informe` y `verificaciones_informe`, con RLS (cualquier usuario con sesión puede dejar registrado su intento; sólo la Secretaría y el Administrador leen y verifican) y **sin permisos de modificar ni borrar** (sólo se agrega).

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-18-hu-18-cierre-firma-y-envio-del/RNF-01-entrega.sh
```

Pruebas automáticas: `informes-sellado.spec.ts` (JSON canónico, vectores de SHA-256, qué cambia el hash, servicio), `informes.e2e-spec.ts` y `informes.int-spec.ts` (HTTP con roles reales y PostgreSQL real, incluida una alteración directa en la base) y `apps/web/src/informe/consolidacion.test.ts` (el sello abreviado). Se verificaron con 14 mutaciones (hash sin fotos, sin firma o sin la hora del servidor, JSON sin ordenar claves, verificación que siempre coincide o que no detecta cambios, intentos sin registrar, 404 en vez de 409, PATCH sin bloquear, hora o hash que manda el celular, el RT que verifica, verificación sin asentar, MD5 en vez de SHA-256): todas hacen fallar algún test.

## Supuestos y limitaciones

- **El sello demuestra integridad, no autoría ni fecha cierta por sí solo.** Quien tenga acceso de administración a la base podría recalcular el hash tras alterar el contenido; para reforzarlo conviene guardar el hash en otro lugar (por ejemplo, un registro externo o una firma digital del servidor), algo a definir con el cliente.
- La **hora del servidor** es el reloj de la API: no es un sello de tiempo de un tercero (TSA).
- La verificación es **a pedido** (no hay un proceso que verifique solo todos los informes), y no hay una pantalla: se usa por API.
- Los informes cerrados antes de esta tarjeta no tienen hash: la verificación los marca como no coincidentes.
- El sello cubre lo que la API recibe: las fotos se guardan tal como llegaron (ya comprimidas por el celular).
