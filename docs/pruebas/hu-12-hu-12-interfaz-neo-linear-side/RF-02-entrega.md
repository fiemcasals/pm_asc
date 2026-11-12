# Entrega HU-12 · RF-02 (`REQ-1794488168014`) — FIX: Contraste en Modo Oscuro

## Qué quedó implementado

En [`apps/web/src/styles.css`](../../../apps/web/src/styles.css) se agregaron las reglas semánticas bajo `[data-theme='dark']` y `--surface-sunken`:

1. **`--surface-sunken`** definido para `:root, [data-theme='dark']` (`#101217`) y `[data-theme='light']` (`#f8fafc`), corrigiendo el fondo blanco heredado en `form-visita-fallida` y la fila `Total Consolidado` en `FichaConsorcio`.
2. **`.audit-grid` en `ModalAuditoria`**: fondo `--card-subtle` (`#101217`), borde `--border` y etiquetas legibles (`--muted` / `--text`), eliminando el recuadro blanco con texto claro.
3. **Recargos y bloqueos en `FichaConsorcio` / badges**: contraste corregido para `[data-testid="total-liquidacion-consorcio"]`, `[data-testid="badge-recargo-45-habilitado"]`, `.cartel-bloqueo-tercera-visita`, importes en rojo `#dc2626` / `#b91c1c`, `.solo-lectura-pill` y `.badge-modo-consulta`.

## Cómo se prueba

```bash
bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.sh
bash docs/pruebas/hu-12-hu-12-interfaz-neo-linear-side/RF-02-entrega.sh --carga 20
```

- **Guía visual con capturas:** [`RF-02-contraste-modo-oscuro.md`](RF-02-contraste-modo-oscuro.md)
