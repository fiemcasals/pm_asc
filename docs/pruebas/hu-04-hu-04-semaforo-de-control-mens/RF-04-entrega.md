# HU-04 / RF-04 · Entrega — [FIX] Script de entrega de HU-04 RF-02: la inspección de prueba la carga un RT

- **Tarea:** RF-04 — `REQ-1795095941025`
- **Rama:** `feature/hu-04-hu-04-semaforo-de-control-mens/req-1795095941025-fix-script-de-entrega-de-hu-04-rf-02-la`
- **Script del flujo integrado:** [RF-04-entrega.sh](RF-04-entrega.sh)
- **Guía visual:** [RF-04-reasignar-en-pantalla.md](RF-04-reasignar-en-pantalla.md). El arreglo es de un script de terminal, pero lo que ese script verifica se ve en Secretaría › Semáforo › «Reasignar»: 3 capturas sacadas con Playwright, con el elemento de cada paso resaltado. El edificio inspeccionado el 5/11 en verde también está en el paso 4 de [RF-07-datos-de-demo.md](../hu-11-hu-11-notificaciones-automatic/RF-07-datos-de-demo.md).
- **Depende de:** nada. Cambia solo archivos bajo `docs/pruebas/`; no toca `apps/`.

## 1. Qué quedó implementado

`RF-02-entrega.sh` fallaba 2 de sus 14 verificaciones, y por `https://localhost:8050` ni siquiera llegaba a correrlas. La app anda bien: el script estaba desactualizado, por el mismo motivo que `RF-02-datos-demo.sh` (HU-11 RF-07).

| Qué fallaba | Causa | Qué cambió |
|---|---|---|
| «un edificio ya inspeccionado no cuenta como carga»: el RT `c` pesaba 2 y no 1 (`candidatos 'd:0,b:2,c:2'`, se esperaba `d:0,c:1,b:2`) | La inspección del 5/11 del edificio C2 se cargaba con la sesión de la Secretaría. Desde HU-06 RF-06 el checklist es solo del RT y el API responde 403, así que la inspección nunca se creaba | El RT `c` ingresa con una sesión real y es él quien la carga. Los otros tres RT siguen sin poder ingresar |
| Si la inspección no se creaba, el script seguía con un SQL sobre `id='undefined'` y nadie se enteraba | El error quedaba oculto | Si el API no la crea, el script corta, imprime el motivo y sale con código 1 |
| Por `https://localhost:8050` no ingresaba la Secretaría de prueba | El login usaba `curl` a secas. En Windows, `curl` (Schannel) sin `--ssl-no-revoke` termina con el error 35 al comprobar la revocación del certificado local; con esa opción ingresa | El login usa el mismo `curl` que el resto de las llamadas, con `--ssl-no-revoke` y el certificado de mkcert |

También se corrigió el comentario del encabezado: el script crea 5 edificios, no 4. Y la verificación de que hubo sesión ahora rechaza también el texto `undefined`, que el `json` del script imprime cuando falta el campo.

[RF-04-entrega.sh](RF-04-entrega.sh) corre `RF-02-entrega.sh` contra las dos direcciones y revisa que no queden residuos.

## 2. Cómo se levanta y cómo se prueba

Igual que HU-04: `npm run db:up` y `npm run dev` (la web en `https://localhost:8050` y la API en `http://127.0.0.1:3050`). Hace falta docker.

| Prueba | Resultado (19/11/2026) |
|---|---|
| `RF-02-entrega.sh` contra `https://localhost:8050` | 14 verificaciones OK, 0 fallidas (antes: no ingresaba) |
| `RF-02-entrega.sh` contra `http://127.0.0.1:3050` | 14 verificaciones OK, 0 fallidas (antes: 12 OK y 2 fallidas) |
| `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.sh` | Las dos direcciones en verde y 0 residuos |
| `… RF-04-entrega.sh --carga 20` | 20 sugerencias por dirección, 0 fallidas · `https://localhost:8050`: promedio 60 ms, p95 70 ms · API directa: promedio 25 ms, p95 34 ms |
| Residuos tras correr | 0 usuarios `RF02-ent-*`, 0 edificios de prueba, 0 filas en `intentos_login` |
| El script con la inspección cargada por la Secretaría (copia temporal, el comportamiento viejo) | Corta con «no se pudo cargar la inspección de prueba del edificio C2» y el 403 `Tu rol no tiene acceso a este recurso`, sale con código 1 y no deja residuos |

## 3. Qué datos hacen falta

Ninguno previo. El script crea 1 Secretaría, 4 RT (`RF02-ent-<pid>-a` a `-d`) y 5 edificios, y los borra al terminar.

## 4. Endpoints o pantallas

Ninguna. No se cambia la app: solo el script.

## 4.5. Cómo se corre integrado

```bash
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.sh             # RF-02-entrega.sh contra las dos direcciones
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-04-entrega.sh --carga 20  # el modo --carga contra las dos
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-entrega.sh             # solo el script, contra https://localhost:8050
```

## 5. Qué quedó afuera y qué se asumió

- **La primera corrida por HTTPS falló una vez, y no fue el script.** Fue justo después de cambiar de rama: la API recompiló y se reinició, y en ese momento el proxy de la web no la alcanzaba (`ECONNREFUSED` en el log de `npm run dev`). Con la API ya arriba, el script pasó las 4 veces que se corrió por HTTPS (3 seguidas y una desde `RF-04-entrega.sh`). Si falla el ingreso, conviene esperar a que la API termine de arrancar y repetir.
- **El RT `c` ahora tiene clave.** Es un usuario temporal (`RF02-ent-<pid>-c`) con la misma clave de prueba de la Secretaría del script, y se borra al terminar. Los otros tres RT siguen con `sin-login`.
- **`RF-07-entrega.sh` (HU-11) no incluye este script.** Ese corredor es de los 12 scripts de HU-11, HU-15 y HU-18. El de HU-04 RF-02 se corre con `RF-04-entrega.sh`. Se podría sumar al corredor general si se quiere un solo comando.
- **No se tocó ningún otro script.** Este arreglo no cambia `RF-02-datos-demo.sh` ni los scripts de HU-02 que usan a los RT de demo.
