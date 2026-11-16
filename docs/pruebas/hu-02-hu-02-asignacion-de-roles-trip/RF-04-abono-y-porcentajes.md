# HU-02 · RF-04 — Abono y porcentajes de pago por máquina

**Qué hace.** Cada máquina guarda su **abono mensual** y los porcentajes que se pagan al **RT de Calle** (60 % por defecto) y al **Firmante** (25 % por defecto). Antes eran constantes del código. Los edita la Secretaría o el Administrador, cada cambio queda registrado y la liquidación usa lo guardado.

## Cómo se usa

| Acción | Endpoint | Quién |
|---|---|---|
| Ver el pago de una máquina | `GET /api/consorcios/:consorcioId/maquinas/:maquinaId/pago` | Secretaría, Administrador |
| Editar abono y/o porcentajes | `PUT` a la misma ruta, cuerpo `{ "abonoMensual": 200000, "porcentajeRt": 50, "porcentajeFirmante": 30 }` (todos opcionales, al menos uno; `abonoMensual: null` lo borra) | Secretaría, Administrador |
| Ver el historial de cambios | `GET …/pago/historial` | Secretaría, Administrador |

RT de Calle, Firmante y ECA reciben 403. Sin sesión, 401. Máquina inexistente o de otro consorcio, 404.

## Reglas

- Cada porcentaje va de 0 a 100 y **la suma de los dos no puede superar 100** (70 + 30 = 100 es válido). Si no se cumple → 400 con el motivo (por ejemplo «la suma de los porcentajes (80 + 30 = 110) no puede superar 100»).
- El abono no puede ser negativo.
- Las mismas reglas están como `CHECK` en la base (migración `021_pago_por_maquina`), así que ni un acceso directo las salta.
- Cada campo que cambia genera un registro en `maquinas_pago_historial` con **usuario, fecha, valor anterior y valor nuevo**. La tabla sólo admite INSERT y SELECT (RLS): no se modifica ni se borra desde la aplicación. Si el valor enviado es igual al actual no se registra nada.
- **Liquidación** (`POST /api/visitas-fallidas/liquidar-maquina`): si la máquina tiene abono cargado, se usa ese (`origenAbono: "maquina"`); si no, el `montoBase` que manda quien liquida (`"parametro"`) o 150000 (`"por_defecto"`). La respuesta incluye `porcentajeRt`, `porcentajeFirmante`, `montoRt` y `montoFirmante`.

## Cómo probarlo

```bash
npm run db:up
bash docs/pruebas/hu-04-hu-04-semaforo-de-control-mens/RF-02-datos-demo.sh
# con la API levantada:
bash docs/pruebas/hu-02-hu-02-asignacion-de-roles-trip/RF-04-entrega.sh
```

Pruebas automáticas: `apps/api/test/pagos.spec.ts` (reglas), `pagos.e2e-spec.ts` (roles reales y liquidación) y `pagos.int-spec.ts` (base real: CHECK, historial, RLS, liquidación). Se verificaron con 10 mutaciones (quitar el tope de la suma, cambiar `>` por `>=`, abrir el rol, fijar el usuario del historial, ignorar lo guardado en la liquidación, etc.): todas hacen fallar al menos un test.

## Supuestos a confirmar con el cliente

- Que 60 % y 25 % sean los valores de arranque de toda máquina nueva (el 15 % restante queda para la administración).
- Que el abono sea un monto único por máquina y mes (sin vigencias ni histórico de abonos por período más allá del registro de cambios).
- Sin abono cargado, la liquidación sigue funcionando con el valor por defecto de 150000.
