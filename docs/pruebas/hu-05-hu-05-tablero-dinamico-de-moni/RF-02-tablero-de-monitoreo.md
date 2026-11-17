# HU-05 · RF-02 — Tablero dinámico de monitoreo general (backoffice)

**Qué hace.** En la Secretaría hay una pestaña nueva, **«Monitoreo»**: el mapa de edificios y, **debajo**, una tabla interactiva de las visitas con filtros en tiempo real, un visor de fotos e informe y los botones de acción comercial **«Enviar Remito a ECA»** y **«Reclamar a Admin»** según el estado de la visita. Usa los endpoints de HU-05 RF-01.

Capturas: `imagenes/RF-02-tablero-y-visor.png` y `imagenes/RF-02-acciones-registradas.png`.

## La tabla

| Columna | Qué muestra |
|---|---|
| Dirección | La del edificio, con el código del equipo y la ECA. |
| Inspector | Quien hizo la visita (sin visita, el RT asignado). |
| Estado de visita | Recorrida · Pendiente de Visita · Advertencia. |
| Fecha y hora | De la visita, en hora de Buenos Aires («04/11/2026 07:30»). |
| Checklist | Cuántos ítems y fotos tiene el informe: «4 ítems · 2 fotos», o «Sin informe». |
| Firmante AGC | El Firmante y si autorizó, rechazó o está sin autorizar. |
| Acciones | **Ver fotos e informe** y la acción comercial que corresponda. |

**Filtros en tiempo real:** dirección, ECA, inspector (texto, sin importar mayúsculas ni tildes) y estado de la visita (lista). Consultan solos poco después de la última tecla (300 ms) y vuelven a la página 1; «Limpiar filtros» los borra. Paginación de 10 en 10 con «Anterior / Siguiente» y «Página 1 de 1 · 5 visitas». Sin coincidencias: «No hay visitas que coincidan con los filtros».

## Las acciones según el estado de la visita

| Estado | Botón | Qué hace |
|---|---|---|
| **Recorrida** | **Enviar Remito a ECA** | Registra el envío del remito de esa visita a la ECA (`POST /api/backoffice/remito-eca`). Después la fila dice «Remito enviado a <ECA> el <fecha>» y no se vuelve a ofrecer. |
| **Advertencia** | **Reclamar a Admin** | Registra el reclamo a la **administración del consorcio** por la visita con advertencia (`POST /api/backoffice/reclamo-admin`, nuevo). Después la fila dice «Reclamo enviado a <administración> el <fecha>». |
| **Pendiente de Visita** | — | «Sin visita todavía»: no hay nada que mandar ni reclamar. |

Ver el visor: **Ver fotos e informe** abre un panel con la dirección, ECA, inspector y fecha, quién atendió, la alerta o el motivo de la advertencia, las **fotos** (obligatorias de cables y frente, y la de la cabina trabada; se abren en grande al tocarlas) y la **tabla del checklist** con el estado de cada ítem. Sólo se muestran como imagen las fotos `http(s)` o `data:image`; cualquier otro esquema aparece como «Foto no disponible».

## API nueva (además de RF-01)

- `GET /api/backoffice/visitas/:maquinaId` → detalle para el visor (`fotos`, `checklist`, `titulo`, `motivo`, `motivoAdvertencia`, `nombreEncargado`…); 404 si el equipo no existe.
- `POST /api/backoffice/reclamo-admin` `{ maquinaId }` → 201 con el reclamo (quién y cuándo). **409** si la visita no quedó con advertencia, o si ya se reclamó (el mensaje dice a quién, cuándo y quién). Tabla `reclamos_admin` (migración `028_reclamos_admin`): un reclamo por visita, RLS sólo Secretaría y Administrador, sin edición ni borrado desde la aplicación.
- Cada fila del listado suma `administracion`, `reclamo`, `fotos` e `itemsChecklist`.
- Todo es sólo para Secretaría y Administrador (RT, Firmante y ECA reciben 403).

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-05-hu-05-tablero-dinamico-de-moni/RF-02-entrega.sh
```

Para ver la pantalla: entrar como `demo.secretaria` › pestaña **Monitoreo**. Pruebas automáticas: `backoffice-acciones.spec.ts`, `backoffice.e2e-spec.ts` y `backoffice.int-spec.ts` (API, roles y PostgreSQL real) y `apps/web/src/backoffice/monitoreo.test.ts` (filtros, acciones por estado, textos, fotos seguras, llamadas). Se verificaron con 14 mutaciones (reclamo a una Recorrida, reclamo repetido, fotos vacías, foto de cabina, rol abierto, quién reclama desde el cuerpo, Recorrida/Advertencia intercambiadas, remito que se vuelve a ofrecer, filtros sin recortar, visor con cualquier esquema, fecha en UTC, singular/plural, firmante invertido): todas hacen fallar algún test. La pantalla se recorrió en el navegador: filtros por dirección (con tilde), ECA, inspector y estado, visor con fotos y checklist, y las dos acciones registrándose.

## Supuestos a confirmar con el cliente

- **«Reclamar a Admin» = reclamo a la administración del consorcio** (la «Administración» de la ficha del edificio), no al Administrador del sistema. Hoy sólo **deja constancia** (quién y cuándo); el envío real del reclamo (correo, carta) no está definido.
- «Enviar Remito a ECA» también sólo deja constancia; el correo y el PDF son HU-11 RF-02.
- Qué estados de visita habilitan cada acción: Recorrida → remito, Advertencia → reclamo. La API no impide mandar el remito de una visita con advertencia (la pantalla no lo ofrece).

## Limitaciones

- Las visitas salen del módulo en memoria del Firmante (5 equipos de demostración).
- Las fotos de demostración apuntan a un almacenamiento que no está disponible: en el visor se ve el nombre de la foto y el enlace, no la imagen (la consola del navegador muestra el error de carga).
- No se puede ordenar por columna ni exportar el listado.
