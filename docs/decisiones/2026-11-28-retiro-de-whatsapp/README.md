# Decisión del 28/11/2026: la aplicación no usa más WhatsApp, los avisos van por el chat interno

- **Quién decidió:** German, que hace todos los roles del proyecto.
- **Qué pidió:** borrar del tablero todo lo relacionado con WhatsApp y que la aplicación use el sistema de mensajería interno (el chat de HU-19), y crear los arreglos que hagan falta, todo documentado.
- **Estado de este documento:** el tablero ya cambió (lo de la sección 2). **El código todavía no**: la API, las pantallas y la documentación siguen teniendo WhatsApp hasta que se hagan las tareas de la sección 4.

## 1. Por qué es seguro

- **Nunca salió un WhatsApp real.** El conector sólo se probó contra un receptor falso local: no hay cuenta, número ni plantilla aprobada (era la tarea operacional RO-03, que no se hizo).
- **No hay producción.** `main` sólo tiene `scrumDocs` y `.claude`: no hay datos reales de envíos que cuidar.
- **No se pierde la historia.** El código y la documentación de lo borrado siguen en git y en `docs/pruebas/`, y de cada tarea borrada hay un respaldo en [tareas-borradas.json](tareas-borradas.json).

## 2. Qué se hizo en el tablero (Scrum Master AI)

El tablero no tiene deshacer, así que se borró lo mínimo claro y se conservó lo que sigue valiendo con otro canal.

### 2.1 Se borró (clave del Project Manager)

Sólo existían por WhatsApp. Todas estaban `tested`.

| Historia | Tarea | Id | PR | Nombre |
|---|---|---|---|---|
| HU-11 | RF-01 | `REQ-1791910396804` | #10 | Conector de API de WhatsApp y Plantilla Formal de Alerta Crítica |
| HU-11 | RF-02 | `REQ-1791910396892` | #11 | Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo |
| HU-11 | RF-03 | `REQ-1794155773535` | #21 | No informar como entregado un WhatsApp que no se envió |
| HU-11 | RF-04 | `REQ-1794155774018` | #83 | Enviar las alertas por WhatsApp a través de un proveedor real |
| HU-11 | RF-08 | `REQ-1795097860369` | #90 | Enviar el aviso de falla crítica con una plantilla de WhatsApp aprobada |
| HU-11 | RF-09 | `REQ-1795097860589` | #91 | Confirmar la entrega real de cada WhatsApp con las notificaciones del proveedor |
| HU-11 | RF-10 | `REQ-1795097860686` | #92 | Mostrar en la bandeja de avisos si WhatsApp está activo y el estado real de cada envío |
| HU-11 | RF-12 | `REQ-1795263642415` | #103 | Guardar en PostgreSQL el historial de envíos de WhatsApp |
| HU-11 | RF-13 | `REQ-1795263642719` | #101 | Pedir sesión de la Secretaría para ver el historial de envíos de WhatsApp |
| HU-11 | RF-14 | `REQ-1795263643018` | #102 | Que el estado general de un aviso refleje un envío de WhatsApp que falla después |

Y los dos contenedores operacionales, con su tarea (estaban en `to_do`):

| Contenedor | Id | Qué era |
|---|---|---|
| RO-02 | `US-1795097860829` | Probar el envío real de WhatsApp con el celular de German |
| RO-03 | `US-1795097860904` | Dar de alta WhatsApp Business a nombre de MAICON y aprobar la plantilla del aviso |

### 2.2 Se conservó, porque vale con otro canal

| Tarea | Por qué se queda | Qué cambió |
|---|---|---|
| HU-11 RF-05 `REQ-1794493273993` | Ningún aviso sale hasta que la Secretaría lo aprueba | Se sacó su dependencia de las tareas borradas; nota en la descripción |
| HU-11 RF-06 `REQ-1794493274385` | El enlace del aviso sin contraseña y válido 7 días sigue | Renombrada: «Link del aviso sin contraseña y válido por 7 días» |
| HU-11 RF-11 `REQ-1795263642081` | Los avisos y sus enlaces se guardan en la base | Nota en la descripción |
| HU-11 RF-15 `REQ-1795608267360` | Incluye el diagnóstico de seguridad con sesión (`/api/seguridad/rls`), que no es de WhatsApp | Renombrada: «Diagnóstico de seguridad con sesión…» |
| HU-11 RF-07 `REQ-1795091473089` | Es un arreglo de scripts de entrega, no de WhatsApp | Sin cambios |

### 2.3 HU-11 reescrita (clave del Product Owner)

Antes: «Notificaciones Automáticas por WhatsApp a la ECA», con dos condiciones, las dos de WhatsApp. Ahora: **«Avisos automáticos de fallas críticas al Firmante y a la ECA»**, con cinco condiciones (aviso pendiente de revisión, mensaje por el chat al Firmante al aprobar, ECA por Portal y correo, enlace de 7 días, reintento si falla). El texto anterior está en el respaldo (`historia11_antes`).

## 3. Cómo llegan los avisos ahora (diseño a confirmar)

| Quién | Por dónde | De dónde sale |
|---|---|---|
| **Firmante del edificio** | Mensaje privado en el **chat interno**, de la Secretaría que aprobó, con la etiqueta del edificio y el equipo, el detalle y el enlace | Nuevo: tarea HU-11 RF-16, sobre el chat de HU-19 |
| **ECA** | **Portal ECA** (alerta con acuse de recibo) y **correo** con el PDF legal y el enlace | Ya existe (HU-10 y HU-06) |
| **Secretaría** | Bandeja de avisos: «Pendiente de revisión», «Enviado» o «Falló el envío» con reintento | Ya existe (HU-11 RF-05) |

### Por qué la ECA no recibe el aviso por el chat
**HU-19, criterio 7, dice que las ECA y los ajenos no tienen acceso al chat interno**, y el chat sólo admite los roles `rt_calle`, `firmante`, `administrador` y `secretaria`. El pedido «usar el mensajero interno» se cumple para el Firmante, pero no para la ECA sin cambiar esa regla.

**Decisión pendiente de German (o del cliente):**
- **Opción A (la que está escrita):** la ECA sigue como hasta ahora, por su Portal y por correo. No cambia HU-19.
- **Opción B:** abrirle el chat a la ECA. Obliga a cambiar el criterio 7 de HU-19, sumar el rol `eca` al chat, decidir qué ve y con quién puede hablar, y revisar la seguridad por edificio. Es una tarea grande, no un arreglo.

## 4. Las tarjetas creadas (el plan)

Todas están asignadas a germanG, en `to_do`. Los arreglos llevan `[FIX]` delante del nombre; HU-11 RF-16 no, porque es el canal nuevo y no un arreglo.

| Orden | Tarea | Id | Est. | Depende de |
|---|---|---|---|---|
| 1 | **HU-11 RF-16** — Los avisos aprobados por la Secretaría llegan al Firmante por el chat interno | `REQ-1795872286993` | 10 h | HU-19 RF-07 (PR #128: la etiqueta de edificio del chat) |
| 2 | **HU-11 RF-17** — [FIX] Retirar el envío por WhatsApp de la API | `REQ-1795872287077` | 12 h | RF-16 |
| 3 | **HU-11 RF-18** — [FIX] Retirar WhatsApp de las pantallas | `REQ-1795872287159` | 6 h | RF-17 |
| 4 | **HU-11 RF-19** — [FIX] Retirar WhatsApp de la documentación, la configuración y los datos de demo | `REQ-1795872287233` | 5 h | RF-17 y RF-18 |
| — | **HU-17 RF-12** — [FIX] La lista de paradas vuelve a no traer las imágenes | `REQ-1795872287313` | 4 h | nada |
| — | **HU-05 RF-03** — [FIX] El backoffice rotula la foto del frente como «Frente de cabina y botonera» | `REQ-1795872287370` | 1 h | nada |
| — | **HU-16 RF-07** — [FIX] La guía de Android incluye el mapa en las pantallas donde se usa | `REQ-1795872287430` | 2 h | nada |

Las tres últimas se pueden hacer en cualquier momento. La cadena de WhatsApp va en orden: primero el canal nuevo, después se retira lo viejo.

### Qué retira cada una
- **RF-17 (API):** la carpeta `apps/api/src/whatsapp` (conector, Meta y Twilio, formateador, disparador, webhook, historial), las rutas `/api/whatsapp/*`, las variables `WHATSAPP_*`, el canal `whatsapp_*` de los avisos y sus pruebas. Una migración reescribe los envíos viejos como canal histórico `whatsapp_retirado` y borra la tabla `whatsapp_envios`.
- **RF-18 (pantallas):** la bandeja de avisos, el Portal ECA, las alertas críticas, el menú y los estilos.
- **RF-19 (documentación):** unos 40 documentos de `docs/pruebas` que describen tareas borradas pasan a `docs/archivo/whatsapp/` con un índice; el manual de uso, el README, `.env.example` y los scripts de demo se corrigen.

## 5. El arreglo de la lista de paradas, y por qué está acá

Al revisar qué quedaba pendiente se vio que **`dev` (y `testing`, que es igual) tiene una prueba en rojo**: `paradas.spec.ts`, «la lista no devuelve las imágenes, sólo cuántas hay». HU-10 RF-08 (commit `dbed7f5`) agregó `fotoUrl` a cada parada, con la primera foto completa en base64, y quedó `tested` rompiendo el criterio de HU-17 RF-03. Además cada consulta de la lista baja una foto entera por parada, el mismo problema que el chat resolvió en HU-19 RF-05. Lo corrige HU-17 RF-12.

## 6. Lo que sigue sin tarea (a propósito)

No son arreglos, así que no se crearon:

- **Entornos de testing y producción:** no hay tarjetas operacionales para levantarlos (la promoción a producción es del PM y necesita el OK de German).
- **Probar la app y el mapa en un Android real.**
- **Confirmar con MAICON** que las fotos de frente y de cables son siempre obligatorias (decisión del 23/11/2026).
- **Historial de quién autoriza qué** en el Portal Firmante, con nombre y apellido (idea de German, sin historia todavía).
- **Los tres PRs del chat** (#126, #127, #128) siguen abiertos, esperando el merge.
- **HU-01 RNF-03** (el test `informes.e2e-spec` intermitente) sigue bloqueada: no se reproduce.

## 7. Cómo comprobar lo que se hizo

```bash
# En el tablero: ya no hay nada de WhatsApp salvo lo conservado, renombrado
curl -s -H "Authorization: Bearer $SCRUM_API_KEY" "$SCRUM_API_URL/api/v1/projects/PROJ-1791559426277/requirements" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).filter(r=>/whats/i.test(r.name)).forEach(r=>console.log(r.code,r.name)))"
# El respaldo de lo borrado
node -e "const j=require('./docs/decisiones/2026-11-28-retiro-de-whatsapp/tareas-borradas.json');console.log(j.tareasBorradas.length,'tareas y',j.contenedoresBorrados.length,'contenedores')"
```

El tablero quedó en **117 tareas**: 106 `tested`, 3 `pr_open`, 1 `blocked` y 7 `to_do` (las de la sección 4).
