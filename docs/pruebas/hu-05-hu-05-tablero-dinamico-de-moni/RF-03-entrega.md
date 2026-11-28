# HU-05 · RF-03 · Entrega — [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera»

- **Tarea:** HU-05 / RF-03 — `REQ-1795872287370`
- **Script:** [RF-03-entrega.sh](RF-03-entrega.sh) · **Prueba en el navegador:** [RF-03-navegador.cjs](RF-03-navegador.cjs)
- **Guía visual:** [RF-03-rotulo-del-frente.md](RF-03-rotulo-del-frente.md) — 2 capturas con Playwright, con el elemento de cada paso resaltado.
- **Archivos cambiados:** [`backoffice.logic.ts`](../../../apps/api/src/backoffice/backoffice.logic.ts) (una línea), `backoffice-acciones.spec.ts` (los dos rótulos que esperaba), el script [`RF-02-entrega.sh`](RF-02-entrega.sh) de esta historia y la nota de [HU-08 RF-08](../hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.md).
- **Prueba nueva:** [`backoffice-fotos.e2e-spec.ts`](../../../apps/api/test/backoffice-fotos.e2e-spec.ts) (5 pruebas, por HTTP y con roles reales).

## 1. Qué pasaba

En el detalle de una visita del backoffice (**Secretaría › Monitoreo › Ver fotos e informe**), la foto `frente` se rotulaba **«Frente del edificio»**. Pero esa foto es la **del frente de la cabina y la botonera** (decisión del 23/11/2026, HU-17 RF-11): el Portal Firmante, el celular del RT y el visor de la API la llaman «Frente de cabina y botonera». Quien miraba el visor buscaba una fachada que no era.

## 2. Qué quedó implementado

- **El visor rotula la foto como «Frente de cabina y botonera».** El rótulo sale de `fotosDe` en `backoffice.logic.ts` y lo muestra la pantalla tal cual, así que el cambio de una línea alcanza para la API y para la pantalla.
- **El resto del visor no cambia:** «Cables» para la foto de cables (un equipo hidráulico no la tiene) y «Cabina trabada» para la de la alerta.
- **Se actualizaron los lugares que esperaban el rótulo viejo:** `backoffice-acciones.spec.ts` y el script de entrega de HU-05 RF-02.
- **No se tocó la «foto del frente del edificio» de HU-07 y HU-16.** Es otra foto: la fachada, que se saca para certificar la presencia en una visita fallida o al iniciar una inspección. Su nombre es correcto.

## 3. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev                                   # API
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
npm run build -w apps/web && npm run preview -w apps/web        # web compilada en https://localhost:4173
bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-entrega.sh
bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-03-entrega.sh --carga 30
```

La prueba del navegador **crea un edificio de prueba** («Calle Rótulo 1») con su terna, hace que `rt.beto` cierre un informe con las dos fotos obligatorias y mira el visor. **Al terminar borra el edificio por la API** (se llevan en cascada el informe y la máquina de la vista de firma) y la visita guardada en la base: no deja nada.

## 4. Qué datos hacen falta

Los de demo de HU-04 RF-02: `demo.admin`, `demo.secretaria`, `rt.beto` y `demo.firmante`, clave `Demo-Clave-2026`. Docker prendido (el script limpia la visita guardada con `docker exec`; sin Docker lo avisa y el edificio ya no existe de todos modos).

## 5. Qué endpoints o pantallas toca

`GET /api/backoffice/visitas/:id` (el rótulo de `fotos[].etiqueta`). Pantalla: **Secretaría › Monitoreo › Ver fotos e informe**.

## 6. Cómo se corre integrado

Resultado del 28/11/2026:

| Condición | Resultado |
|---|---|
| 1. El detalle de una visita rotula la foto del frente «Frente de cabina y botonera» | API: `["Cables", "Frente de cabina y botonera"]`, y la respuesta no contiene «Frente del edificio». Pantalla: el visor muestra «Cables» y «Frente de cabina y botonera», con las dos fotos como imagen. Un hidráulico (sin cables): sólo el frente y, si hay, «Cabina trabada» |
| 2. Las pruebas se actualizan y ninguna parte vuelve a llamar «del edificio» a esa foto | `backoffice*`: 77 de 77 (5 nuevas). El script comprueba que ningún archivo de `apps/`, ni los scripts de HU-05 y HU-08, usa «Frente del edificio» |

`npm run verify`: tipos bien, **API 1698/1698** (5 nuevas) y **web 1049/1049**.

`RF-03-entrega.sh`: **5 bien, 0 mal, 0 omitidos** (con 9 comprobaciones en el navegador).

`RF-03-entrega.sh --carga 30`: 30 pedidos del detalle de la visita, **0 fallidos**; promedio 12 ms, p95 20 ms, máx 21 ms, contra la API local.

## 7. Qué quedó afuera y qué se asumió

- **Hallazgo, sin arreglar: el script `RF-02-entrega.sh` de esta historia ya estaba roto.** Prueba la API en vivo con las máquinas de ejemplo (`MAQ-SANTAFE-M1` y otras), y desde HU-08 RF-06 la API en vivo las retira: corrido hoy da **4 bien y 15 con error** («Equipo no encontrado»), con o sin este cambio. Sus textos del rótulo se actualizaron igual. **Otros 22 scripts de `docs/pruebas` nombran las mismas máquinas** (HU-05 RF-01, HU-06, HU-08, HU-10 RF-04, HU-11, HU-17 RF-03 y RF-08, entre otros); no se corrieron, así que no se sabe cuántos fallan. Hace falta una tarea aparte que los revise.
- **La captura `imagenes/RF-02-tablero-y-visor.png`** de HU-05 RF-02 es anterior y todavía muestra el rótulo viejo.
- **«Cables»** sigue rotulándose así en el visor, mientras el Portal Firmante dice «Cables de Tracción». Es otra palabra para lo mismo, no un error, y no estaba en la tarea.
- **El visor no aclara cuándo falta una foto:** un equipo sin foto de cables simplemente no la muestra. Es lo que pasa con un hidráulico y es lo correcto.
