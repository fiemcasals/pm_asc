# HU-04 / RF-03 — El panel de reasignación se refresca solo cuando el RT cambió

Qué se prueba: si otra persona reasigna un edificio mientras tenés abierto el panel, al confirmar con la vista vieja la API responde 409. El panel muestra el aviso, se vuelve a cargar solo con el RT vigente y no se cierra.

## Antes de empezar

1. `npm run db:up` y `npm run dev` (con `DATABASE_APP_PASSWORD` y `AUTH_JWT_SECRET` definidas en la terminal).
2. `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh` para crear los datos de demostración.

## Pasos

1. Entrá a https://localhost:8050 con `demo.secretaria` / `Demo-Clave-2026`.
2. Abrí la pestaña del semáforo y elegí el día 25/11/2026.
3. En «DEMO Rivadavia 1234» (RT actual: `rt.ana`) tocá Reasignar. No confirmes todavía.
4. Simulá a la otra persona. En otra terminal, con el token de la Secretaría, mandá `POST /api/semaforo/<id del edificio>/reasignacion` con `{"rtAnterior":"rt.ana","rtNuevo":"rt.carla","fecha":"2026-11-25"}`. Responde 201.
5. Volvé al panel (sigue mostrando `rt.ana`) y tocá «Confirmar reasignación».

## Resultado esperado

- Aparece el aviso «El RT del edificio cambió: ahora es "rt.carla". Se actualizó el panel con el RT vigente.» y no se cierra.
- «RT actual» pasa a `rt.carla`; `rt.carla` ya no está entre los candidatos.
- El botón «Confirmar reasignación» sigue disponible.
- «Reasignaciones registradas» tiene una sola fila (la de la otra persona, `rt.ana → rt.carla`): la confirmación rechazada no agregó ninguna.

Para borrar los datos: `bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh --limpiar`.
