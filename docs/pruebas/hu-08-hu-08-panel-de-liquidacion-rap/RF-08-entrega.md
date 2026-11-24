# HU-08 · RF-08 · Entrega — El Portal Firmante pide la foto de cables sólo a los equipos con cables de tracción

- **Tarea:** HU-08 / RF-08 — `REQ-1795480710843`
- **Script:** [RF-08-entrega.sh](RF-08-entrega.sh) · **Prueba en el navegador:** [RF-08-navegador.cjs](RF-08-navegador.cjs)
- **Guía visual:** [RF-08-portal-firmante-hidraulico.md](RF-08-portal-firmante-hidraulico.md) — 3 capturas con Playwright, con el elemento de cada paso resaltado.
- **Archivos cambiados:** API: [`firmante.types.ts`](../../../apps/api/src/firmante/firmante.types.ts) (`requiereFotoDeCables`) y [`firmante.service.ts`](../../../apps/api/src/firmante/firmante.service.ts) (la validación al autorizar). Web: [`firmante.ts`](../../../apps/web/src/firmante/firmante.ts), [`ModalAuditoria.tsx`](../../../apps/web/src/firmante/ModalAuditoria.tsx) y [`styles.css`](../../../apps/web/src/styles.css). Pruebas: `firmante.spec.ts`, `firmante.e2e-spec.ts`, `firmante-persistencia.int-spec.ts` y `firmante.test.ts`.
- **Es parte de:** la decisión de producto del 23/11/2026 de pedir las fotos del frente y de cables en toda visita (HU-17 RF-11 en el celular, HU-18 RF-02 en la API del informe). Esta tarea no depende de ninguna y se puede mergear en cualquier orden.

## 1. Qué quedó implementado

El Portal Firmante exigía dos fotos fijas, «cables» y «frente», para autorizar cualquier visita. Un ascensor **hidráulico** no tiene cables de tracción (el checklist ya no le pregunta por ellos), así que nunca iba a poder autorizarse y su modal de auditoría marcaba «✗ Falta» en una foto que no existe.

Ahora:

- **La foto del frente se exige siempre.** Sin ella no se autoriza ningún equipo, tampoco un hidráulico.
- **La foto de cables sólo se exige si el equipo tiene cables de tracción:** tracción, montavehículos, o una máquina sin tipo cargado (se toma como de tracción, como en el resto de la app). Un hidráulico no la necesita.
- **En la API** (`POST /api/firmante/autorizar`): para tracción el rechazo es el de siempre («…fotos obligatorias de cables y frente»); para un hidráulico sin la foto del frente dice «…la foto obligatoria del frente de cabina (un equipo hidráulico no lleva foto de cables)».
- **En la pantalla:** el botón **Autorizar Firma AGC** se habilita para un hidráulico con el frente y la firma; el motivo del bloqueo ya no habla de cables en un hidráulico; y en el modal de auditoría la tarjeta de cables dice **«No aplica (equipo hidráulico)»** con una insignia neutra y la explicación, en lugar de «✗ Falta».
- El tipo de la máquina sale de lo que la API ya devolvía (`tipo`, que se sincroniza con la ficha del edificio). No hay migración ni cambios de contrato: la foto de cables pasó a ser opcional en el tipo.

## 2. Cómo se levanta y se prueba

```bash
npm run db:up && npm run dev                                   # API
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
npm run build -w apps/web && npm run preview -w apps/web        # web compilada en https://localhost:4173
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.sh
bash docs/pruebas/hu-08-hu-08-panel-de-liquidacion-rap/RF-08-entrega.sh --carga 50
npm run test:int -w apps/api -- firmante-persistencia --testTimeout=120000   # la prueba contra PostgreSQL real
```

## 3. Qué datos hacen falta

Los de demo de HU-04 RF-02 (`demo.firmante`, clave `Demo-Clave-2026`). Esos datos no traen una máquina hidráulica con la visita recorrida, así que la prueba del navegador responde la lista de máquinas con dos de ejemplo (un hidráulico y uno de tracción); con datos reales los va a haber cuando HU-08 RF-07 conecte los informes del RT con el Portal.

## 4. Qué endpoints o pantallas toca

`POST /api/firmante/autorizar` (la validación de las fotos). Pantallas: el **Portal Firmante (RT Legal)**, la tarjeta de cada máquina y el modal **Auditoría Técnica**.

## 5. Cómo se corre integrado

Resultado del 23/11/2026:

| Condición | Resultado |
|---|---|
| 1. Hidráulico con el frente y la firma → se autoriza sin foto de cables | API: 200 con y sin `cables` (vacío, nulo o ausente). Pantalla: «Autorizar Firma AGC» habilitado y sin motivo de bloqueo |
| 2. Tracción, montavehículos o sin tipo, sin cables → se rechaza como hoy | API: 400 «…fotos obligatorias de cables y frente» (mismo mensaje). Pantalla: botón bloqueado, «Falta foto obligatoria de cables» |
| 3. Cualquier máquina sin foto del frente → se rechaza | API: 400, también para un hidráulico, con el mensaje del frente. Pantalla: «Falta foto obligatoria de frente de cabina» |
| 4. Modal de un hidráulico: «No aplica (equipo hidráulico)» y Autorizar habilitado | La tarjeta de cables dice «No aplica (equipo hidráulico)» (no «Falta»), el frente «✓ Presente» y el botón está habilitado. En la tracción, «✗ Falta» y el botón deshabilitado |
| 5. Pruebas en verde y las del caso hidráulico | `npm run verify`: tipos bien, API **1259/1259** (9 nuevas), web **626/626** (5 nuevas). `firmante-persistencia` contra PostgreSQL real: 4/4 (1 nueva: un hidráulico sin cables se guarda, se autoriza y sigue autorizado después de reiniciar la API) |

`RF-08-entrega.sh`: **8 bien, 0 mal, 0 omitidos** (con 9 comprobaciones en el navegador).

`RF-08-entrega.sh --carga 50`: 50 vueltas de abrir y cerrar el modal de las dos máquinas (100 aperturas), **0 fallidas**; promedio 106 ms, p95 135 ms, máx 169 ms, en Chrome de escritorio en la PC de desarrollo. Es lo único medible de una tarea que no agrega ninguna llamada nueva.

## 6. Qué quedó afuera y qué se asumió

- **La decisión es de German (23/11/2026) y falta confirmarla con MAICON.** El Portal rotula las dos fotos como «Normativa AGC»; no se confirmó que la normativa exija la de cables a un hidráulico (no tiene cables de tracción). La regla vive en `requiereFotoDeCables`, en la API y en la web.
- **Un hidráulico que trae foto de cables** (porque el RT la sacó antes de cambiar el tipo, o un dato viejo) la muestra como «✓ Presente»: no se esconde lo que existe.
- **La prueba del navegador responde la lista de máquinas con datos de ejemplo** (el modo en que lo hace está en el encabezado del script). Lo que hace la API con un hidráulico lo prueban `firmante.spec.ts`, `firmante.e2e-spec.ts` y `firmante-persistencia.int-spec.ts`; no se autoriza nada desde el navegador.
- **El tipo viene de la sincronización con la ficha del edificio.** Las máquinas de ejemplo de la API de desarrollo traen su tipo a mano (M2 de Av. Corrientes es hidráulico). Una máquina sin tipo se trata como de tracción: pide los cables.
- **Etiqueta del backoffice:** en el listado de fotos de una visita del backoffice, la foto `frente` se rotula «Frente del edificio» (`backoffice.logic.ts`), mientras el Portal Firmante y HU-17 RF-11 la llaman «Frente de cabina y botonera». No se tocó (otra pantalla, con sus pruebas); conviene alinear el nombre con una tarea aparte.
- **Falta HU-08 RF-07** (que el informe cerrado por el RT cree la visita en el Portal): hasta entonces las visitas que se ven siguen siendo las de ejemplo.
