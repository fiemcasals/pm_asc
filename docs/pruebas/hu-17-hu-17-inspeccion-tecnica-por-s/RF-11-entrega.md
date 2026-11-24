# HU-17 · RF-11 · Entrega — Fotos obligatorias del frente de cabina y de los cables en cada equipo en uso

- **Tarea:** HU-17 / RF-11 — `REQ-1795480710109`
- **Script:** [RF-11-entrega.sh](RF-11-entrega.sh) · **Prueba en el navegador:** [RF-11-navegador.cjs](RF-11-navegador.cjs)
- **Guía visual:** [RF-11-fotos-obligatorias.md](RF-11-fotos-obligatorias.md) — 7 capturas con Playwright, con el elemento de cada paso resaltado.
- **Archivos nuevos:** [`fotosObligatorias.ts`](../../../apps/web/src/checklist/fotosObligatorias.ts) (la regla), [`FotosObligatoriasEquipo.tsx`](../../../apps/web/src/checklist/FotosObligatoriasEquipo.tsx) (la pantalla) y su prueba [`fotosObligatorias.test.ts`](../../../apps/web/src/checklist/fotosObligatorias.test.ts).
- **Archivos cambiados:** [`InspeccionCampoView.tsx`](../../../apps/web/src/checklist/InspeccionCampoView.tsx), [`consolidacion.ts`](../../../apps/web/src/informe/consolidacion.ts) y su prueba, [`styles.css`](../../../apps/web/src/styles.css).
- **Es parte de:** la decisión de producto del 23/11/2026 de pedir estas fotos en toda visita, para que quede más auditada. Las otras partes son HU-18 RF-02 (la API las exige y las sella) y HU-08 RF-08 (el Portal Firmante no pide cables a un hidráulico). Esta tarea no depende de ninguna.

## 1. Qué quedó implementado

Hasta ahora el checklist sólo pedía foto cuando algo estaba mal (HU-17 RF-05). Un informe sin fallas no traía ninguna foto, y el Portal Firmante exige las de «frente» y «cables» para autorizar una visita. Esta tarea es la parte del celular.

- **«Fotos obligatorias del equipo»**: cuando el RT responde que el equipo **está en uso**, aparece una tarjeta con el recuadro de **Frente de cabina y botonera** y, si el equipo es de **tracción o montavehículos**, el de **Cables de tracción**. Un equipo **hidráulico** no tiene cables de tracción: sólo lleva la foto del frente, y la pantalla lo aclara.
- **Cada foto** se saca con la cámara, se comprime a 500 KB o menos (igual que las de anomalía) y queda con el equipo, su nombre y la hora en que se tomó. Se ve en miniatura y se puede **quitar** o **volver a sacar**.
- **No se puede consolidar sin ellas.** «Consolidar Informe y Proceder a Firma» sigue deshabilitado y la lista de pendientes dice, **en una sola línea por equipo**, qué solapas faltan y qué foto falta («M1: faltan completar: Fosa · falta la foto de frente de cabina y botonera y cables de tracción»).
- **Un equipo fuera de servicio no las pide** (ya lleva su reporte de parada con fotos); si se lo vuelve a poner en uso, sí. Cambiar el tipo de equipo a hidráulico deja de exigir la de cables.
- **Sin señal:** las fotos se guardan en el celular con el resto del borrador (IndexedDB), así que recargar sin señal no las pierde.
- **En el informe:** viajan dentro de `fotos` de cada equipo, con las claves reservadas `obligatoria:frente` y `obligatoria:cables` y el mismo formato que las fotos de anomalía (equipo, nombre, tamaño, hora). Por eso no cambia ningún contrato de la API ni del sellado: lo que el celular manda queda dentro del contenido sellado (HU-18 RNF-01). Si el RT sacó la de cables y después cambió el tipo a hidráulico, esa foto no se manda.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev                                   # API
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
npm run build -w apps/web && npm run preview -w apps/web        # web compilada en https://localhost:4173
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-entrega.sh
bash docs/pruebas/hu-17-hu-17-inspeccion-tecnica-por-s/RF-11-entrega.sh --carga 20
```

La prueba del navegador simula que el celular está en «DEMO Cabildo 1540» (para que el mapa habilite «Iniciar Inspección») y saca las fotos con imágenes dibujadas en el momento, con el rótulo «foto de prueba». No cierra ningún informe: sólo registra un inicio de inspección de `rt.beto`, como haría el RT.

## 3. Qué datos hacen falta

Los datos de demo de HU-04 RF-02: `rt.beto`, clave `Demo-Clave-2026`, con «DEMO Cabildo 1540» y sus equipos M1 y M2.

## 4. Qué endpoints o pantallas toca

Ningún endpoint. Pantallas: la Inspección Técnica del RT (la tarjeta nueva y el cierre de la visita). El envío del informe usa el mismo `POST /api/informes-visita` de siempre; que la API rechace un informe sin estas fotos es HU-18 RF-02.

## 5. Cómo se corre integrado

Resultado del 23/11/2026, en Chrome con Playwright a 360 × 740:

| Condición | Resultado |
|---|---|
| 1. Un equipo en uso muestra las fotos obligatorias, según su tipo | Tracción: «Frente de cabina y botonera» y «Cables de tracción», «Faltan 2 de 2». Antes de responder si está en uso, no se piden |
| 2. La foto se comprime, queda con su miniatura y se puede quitar y volver a sacar | Una foto de 4,9 MB quedó en 373 KB. «Quitar foto» la saca y vuelve a figurar «✗ Falta»; con la foto puesta el botón dice «Volver a sacar» |
| 3. Sin las fotos no se consolida y dice cuáles faltan | «Consolidar Informe y Proceder a Firma» deshabilitado; «M1: faltan completar… · falta la foto de frente de cabina y botonera y cables de tracción». Con sólo la de cables faltando, dice «falta la foto de cables de tracción» |
| 4. Fuera de servicio no las pide; el cambio de tipo ajusta la exigencia | M2 fuera de servicio: sin tarjeta (sí su reporte de parada); puesto de nuevo en uso, se piden las dos. Hidráulico: sólo el frente, con el aviso |
| 5. Sin señal las fotos siguen ahí, y el informe las lleva | Recargando sin señal siguen las dos fotos de M1. Que el informe las lleve (y que un hidráulico no mande la de cables) lo comprueban las pruebas de `armarInforme` |
| 6. Pruebas existentes en verde y pruebas nuevas | `npm run verify`: tipos bien, API 1250/1250, web 642/642 (**21 nuevas**: 11 de la regla y 10 de la consolidación y el armado del informe) |

`RF-11-entrega.sh`: 7 bien, 0 mal, 0 omitidos (con 20 comprobaciones en el navegador).

`RF-11-entrega.sh --carga 20`: 20 fotos de 4,9 MB seguidas, **0 fallidas**; promedio 2,7 s, p95 3,2 s y máximo 3,2 s por foto hasta tenerla comprimida y en pantalla. Se midió en la PC de desarrollo (Chrome de escritorio); un celular de gama baja va a tardar más.

## 6. Qué quedó afuera y qué se asumió

- **La decisión es de German (23/11/2026) y falta confirmarla con MAICON.** HU-17 RF-05 había dejado pendiente de MAICON «si la foto de cables y la del frente son siempre obligatorias». Se implementó que **sí, en todo equipo en uso**, porque deja cada visita más auditada. Si MAICON dice otra cosa, la regla vive en un solo archivo (`fotosObligatorias.ts`).
- **La API todavía no las exige.** Hasta que se haga HU-18 RF-02, un informe armado sin pasar por esta pantalla (una versión vieja de la app, un envío a mano) se acepta sin fotos. El Portal Firmante igualmente no deja autorizarlo sin ellas.
- **Los hidráulicos llevan sólo la foto del frente.** No tienen cables de tracción y el checklist ya no les pregunta por ellos. El Portal Firmante hoy exige las dos para todos: se corrige en HU-08 RF-08.
- **Equipo fuera de servicio:** no se le piden estas fotos. Lleva las de su reporte de parada.
- **Un montavehículos lleva las dos**, como uno de tracción: el checklist ya le pregunta por los cables de tracción.
- **No se probó con la cámara real de un celular.** Las fotos de la prueba son imágenes dibujadas e ingresadas al `<input type="file">`; la apertura de la cámara con `capture="environment"` es la misma que usan las fotos de anomalía, pero sigue sin probarse en un Android real (ver `docs/android/`).
- **El tamaño del informe crece**: dos fotos de hasta 500 KB por equipo en uso (≈ 1,3 MB en base64). El límite del cuerpo es 25 MB, así que con las fotos de las anomalías aparte entran unos 18 equipos por informe, aunque la API admite hasta 50. Un edificio con más equipos que eso no entraría en un solo envío. No se comprobó cuántos equipos tiene el edificio más grande de MAICON.
- **Las fotos de la prueba** quedaron sólo en la memoria del navegador automatizado: no se guardó nada en la base.
