# HU-11 / RF-07 · Entrega — FIX: scripts de entrega desactualizados de HU-11, HU-15 y HU-18, y datos de demo de HU-04

- **Tarea:** RF-07 — `REQ-1795091473089`
- **Rama:** `feature/hu-11-hu-11-notificaciones-automatic/req-1795091473089-fix-scripts-de-entrega-desactualizados-d`
- **Script del flujo integrado:** [RF-07-entrega.sh](RF-07-entrega.sh) (corre los 12 scripts, uno tras otro)
- **Guía visual:** no aplica. Son scripts de terminal, sin pantalla.
- **Depende de:** nada. Cambia solo archivos bajo `docs/pruebas/`; no toca `apps/`.

## 1. Qué quedó implementado

Seis scripts de entrega fallaban aunque la app andaba bien: se escribieron antes de cambios posteriores y nadie los volvió a correr. Quien los corriera iba a reportar defectos que no existen. Además, el script de datos de demo tiraba un error de SQL, y los scripts que dependen de esos datos bloqueaban la cuenta `demo.secretaria` 15 minutos si no estaban cargados.

| Script | Antes | Causa | Qué cambió | Ahora |
|---|---|---|---|---|
| HU-18 `RNF-01` | 17 OK, 1 con error | El recálculo del hash por fuera incluía `clientReportId`, que el API excluye del contenido sellado (`contenidoSellado`) desde HU-18 RNF-02 | El recálculo descarta `clientReportId`, igual que el API | 18 OK, 0 con error |
| HU-11 `RF-05` | Se corta en el paso 1 con un `TypeError` | `POST /api/fallas-criticas/informes` va sin sesión; desde HU-06 RF-06 exige rol `rt_calle` | Registra la falla con el token del RT temporal (`demo.rt.avisos`) | 14 OK, 0 con error |
| HU-11 `RF-06` | Se corta con el mismo `TypeError` | La misma | Crea un RT temporal (`demo.rt.enlace`), lo borra al terminar y registra las dos fallas con su token | 11 OK, 0 con error |
| HU-11 `RF-03` | 1 OK, 2 fallidas | El paso 3 disparaba un aviso que ahora queda «pendiente de revisión» (HU-11 RF-05) y responde 409 | Paso 3 nuevo: un RT registra la falla, el disparo responde 409 y el historial queda en 0; la Secretaría aprueba y todos los envíos quedan `no_realizado` / `no_configurado`, ninguno `entregado` | 6 OK, 0 fallidas |
| HU-15 `RNF-01` | 0 OK, 4 fallas | Mandaba el header `x-eca-actual`; desde HU-15 RNF-03 el contexto sale de la sesión. Y el diagnóstico exigía exactamente 5 tablas con RLS: hoy son 17 | Ingresa con usuarios ECA reales; el diagnóstico exige al menos 5 tablas, todas con RLS activo y una política como mínimo | 4 OK, 0 fallas |
| HU-15 `RNF-02` | 0 OK, 4 fallas | Mandaba `x-rol-actual` y `x-usuario-actual` | Ingresa como RT y como Firmante reales, asignados por nombre al edificio | 4 OK, 0 fallas |
| HU-04 `RF-02-datos-demo.sh` | Error SQL (`where id='undefined'`) y la inspección del 5/11 no se cargaba | El checklist es solo del RT (HU-06 RF-06) y el script lo cargaba con la sesión de la Secretaría: 403 | Los RT demo entran con la clave de demostración y la inspección la carga el RT del edificio; si falla, corta con el motivo | 5 edificios y 2 inspecciones del 5/11, sin errores |

Las cifras de «Antes» salen de la corrida del 19/11/2026 sobre `dev`, con los datos de demo cargados; solo HU-15 `RNF-01` y `RNF-02` se corrieron sin ellos, porque no los usan.

Y los scripts que dependen de los datos de demo (HU-11 `RF-03`, `RF-05`, `RF-06`; HU-15 `RF-02`, `RNF-01`, `RNF-02`; HU-18 `RF-01`, `RNF-01`, `RNF-02`) ahora **revisan primero que existan**. Si faltan, avisan que hay que correr `RF-02-datos-demo.sh` y salen con **código 2**, sin intentar ingresar: antes cada intento con un usuario inexistente sumaba un fallo, y a los 5 se bloqueaba la cuenta.

También se agrega [RF-07-entrega.sh](RF-07-entrega.sh), que corre los 12 scripts en orden y arma una tabla.

## 2. Cómo se levanta y cómo se prueba

Igual que HU-14 y HU-15: `.env` desde `.env.example` (con `DATABASE_APP_PASSWORD`), `npm run db:up` y `npm run dev`. Hace falta docker.

| Prueba | Resultado (19/11/2026) |
|---|---|
| `bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.sh` | 12 de 12 scripts con código 0, en 2 min 17 s |
| El mismo, con la base **sin** datos de demo | Los carga, corre los 12 y los borra: 12 de 12; después quedan 0 usuarios `demo.*` y 0 edificios DEMO |
| El mismo, con los datos de demo **ya cargados** | No los toca: después siguen 2 usuarios `demo.*` y 5 edificios DEMO |
| Los 9 scripts que dependen de los datos de demo, **sin** datos de demo | Los 9 salen con código 2 y el aviso; `intentos_login` queda sin filas de `demo.*` y no quedan usuarios temporales |
| `… RF-07-entrega.sh --carga 20` | HU-11 RF-03: p95 362 ms · HU-15 RNF-01: p95 184 ms · HU-15 RNF-02: p95 203 ms; 0 fallas en las 60 consultas |
| Regresión: HU-02 `RF-03` y `RF-05` (usan a `rt.carla`, `rt.diego` y `rt.ana` del script de datos de demo) | 6 de 6 y 9 de 9 |

## 3. Qué datos hacen falta

- Los datos de demo: `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh` (y `--limpiar` para borrarlos). `RF-07-entrega.sh` los carga y los borra solo si no estaban.
- Cada script crea sus usuarios temporales (`h15r1-*`, `h15r2-*`, `h15e-*`, `demo.rt.*`) y edificios de prueba, y los borra al terminar.

## 4. Endpoints o pantallas

Ninguna. No se cambia la app: solo los scripts.

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.sh             # los 12 scripts
bash docs/pruebas/hu-11-hu-11-notificaciones-automatic/RF-07-entrega.sh --carga 20  # el modo --carga de los 3 que lo tienen
```

Cada script se puede correr solo, con su propia ruta (por ejemplo `bash docs/pruebas/hu-15-hu-15-aislamiento-de-datos-ent/RNF-01-entrega.sh`).

## 5. Qué quedó afuera y qué se asumió

- **`docs/pruebas/hu-04-…/RF-02-entrega.sh` también falla, y no se tocó.** Es un script de HU-04, fuera del alcance de esta tarea. Contra la API directa (`BASE_URL=http://127.0.0.1:3050`) da 12 OK y 2 fallidas: espera que el RT `c` pese 1 y el API devuelve 2 (`candidatos 'd:0,b:2,c:2'`). Falla igual con la base sin datos de demo, así que no depende de estos cambios. Contra `https://localhost:8050` ni siquiera ingresa: ese script usa `curl` sin el certificado de mkcert. Conviene una tarea aparte.
- **`RF-03` ya no verifica el envío con origen `automatico` sobre `ALT-MAICON-001`.** Esa alerta es un dato fijo de prueba y su estado cambia con cada aprobación. Para una falla registrada por un RT, lo que se observó es que el envío sale al aprobar el aviso y el historial lo registra con origen `manual`; el disparo `trigger-alerta-critica` con ese id responde 404. Lo que sí se verifica es la regla del cliente: nada sale hasta que la Secretaría aprueba, y sin proveedor de WhatsApp el envío queda `no_realizado`, nunca `entregado`.
- **Los RT del script de datos de demo ahora tienen clave** (`Demo-Clave-2026`, la misma de los demás usuarios demo) en lugar de `sin-login`. Hace falta para que el RT del edificio cargue la inspección con su sesión. Son datos de desarrollo, solo en la máquina de quien prueba.
- **Los avisos aprobados quedan en la bandeja de la API hasta que se reinicia.** Los scripts de RF-03, RF-05 y RF-06 aprueban avisos de fallas de prueba y no los pueden borrar. No molestan a las corridas siguientes, pero la bandeja de la Secretaría los muestra como «Falló el envío».
- **El bloqueo por intentos fallidos no se cambió.** El API sigue contando como fallo cada intento con un usuario que no existe: es la regla de HU-14 RF-01. Lo que cambia es que los scripts ya no lo disparan.
- **`RF-07-entrega.sh` usa el `BASE_URL` por defecto de cada script** (unos la API directa, otros `https://localhost:8050`): no define uno para todos, para no cambiar lo que ya probaba cada uno.
