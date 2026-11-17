# HU-05 · RF-01 — API de monitoreo del backoffice y registro de remitos a la ECA

**Qué hace.** Dos endpoints para la Secretaría y el Administrador: un **listado paginado y filtrable** de las visitas por equipo (con su estado) y el **registro del envío del remito digital** de una visita a la empresa conservadora (ECA). La pantalla que los usa es HU-05 RF-02.

## `GET /api/backoffice/monitoreo`

Una fila por equipo con el estado de su visita del mes. Filtros por URL (se combinan con «y»):

| Parámetro | Qué hace |
|---|---|
| `direccion` | Parte de la dirección o del consorcio; sin importar mayúsculas ni tildes («CORRIÉNTES» encuentra «Corrientes»). |
| `eca` | Parte del nombre de la ECA. |
| `inspector` | Parte del nombre de quien hizo la visita (sin visita, el RT de Calle asignado). |
| `estado` | Exacto: `Recorrida`, `Pendiente de Visita` o `Advertencia` (otro valor → 400). |
| `pagina`, `porPagina` | Paginación: página desde 1; `porPagina` de 1 a 100 (20 por defecto). Fuera de rango → 400. |

Respuesta: `{ total, pagina, porPagina, totalPaginas, items: [...] }`, lo más reciente primero (los equipos sin visita al final). Cada fila trae: `id` (de la visita), `maquinaId`, `codigoAGC`, `equipo`, `direccion`, `consorcio`, `eca`, `inspector`, `estadoVisita`, `fecha`, `estadoOperativo`, `firmante`, `autorizada`, `rechazada`, `alertaCritica` y `remito` (el envío a la ECA, o `null`). Una página más allá de la última viene vacía con el total correcto.

## `POST /api/backoffice/remito-eca`

Cuerpo `{ "maquinaId": "MAQ-SANTAFE-M1", "visitaId"?: "…" }`. Registra **quién** y **cuándo** mandó el remito de esa visita a esa ECA (el usuario sale de la sesión). Respuestas: **201** con el remito · **409** si el equipo todavía no tiene una visita hecha («Pendiente de Visita»), si la `visitaId` no es la vigente, o si **esa visita ya tenía su remito** (el mensaje dice a qué ECA, cuándo y quién) · **404** equipo inexistente · **400** sin `maquinaId`.

Quedan en la tabla `remitos_eca` (migración `027_remitos_eca`): **un remito por visita**, con RLS (sólo la Secretaría y el Administrador) y sin posibilidad de modificarlo ni borrarlo desde la aplicación (constancia).

Ambos endpoints: Secretaría y Administrador; el RT, el Firmante y la ECA reciben 403; sin sesión, 401.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-01-entrega.sh
```

Pruebas automáticas: `backoffice.spec.ts` (filtros, orden, paginación y remitos), `backoffice.e2e-spec.ts` (roles reales) y `backoffice.int-spec.ts` (PostgreSQL real: persistencia, RLS, constancia). Se verificaron con 14 mutaciones (tildes, estado invertido, orden, página mal calculada, sin tope de 100, filtro de ECA que mira otro campo, remito duplicado, usuario del cuerpo, rol abierto, visita que no es la vigente, fila sin remito, etc.): todas hacen fallar algún test.

## Limitaciones y para confirmar

- **De dónde salen las visitas.** Hoy el módulo de visitas (el que usan el Firmante y la ECA) vive en memoria con 5 equipos de demostración: el listado refleja esos datos y se pierde al reiniciar la API. Cuando ese módulo pase a la base, este endpoint no cambia.
- **«Registrar el envío» no manda nada por sí mismo:** deja constancia de que el remito se mandó. El envío real por correo y la generación del PDF son HU-11 RF-02 (el correo a la ECA con contactos reales todavía no tiene agenda).
- Hay **un remito por visita**: si hace falta reenviar, habría que definir si se agrega un «reenvío» con su propio registro.
- El estado «Reclamar a Admin» de RF-02 no es de esta tarjeta.
