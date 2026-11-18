# HU-10 · RF-07 — FIX: Los símbolos del remito PDF salen como caracteres rotos

**Historia de Usuario:** HU-10: Centro de Alertas Críticas y Acuse Legal en Portal ECA
**Requerimiento:** RF-07 (`REQ-1795004203523`)
**Tipo:** FIX (surgió de la verificación de QA de RF-06)

## El problema

El remito técnico en PDF (RF-06) usa la fuente estándar Helvetica, que sólo tiene los caracteres de la codificación WinAnsi (Latin-1 más unos pocos signos). El documento imprimía `⚠️` y `✓` (y el título de la alerta venía con emojis desde los datos), y esos caracteres no se pueden dibujar: salían como basura.

| Dónde | Antes (lo que decía el PDF) | Ahora |
|---|---|---|
| Título de `ALT-MAICON-001` | `DIAGNÓSTICO … CRÍTICA: & þ REPARACIÓN URGENTE: …` | `DIAGNÓSTICO … CRÍTICA: REPARACIÓN URGENTE: …` |
| Título de `ALT-CP-001` | `DIAGNÓSTICO … CRÍTICA: Ø=Þ¨ FUERA DE SERVICIO: …` | `DIAGNÓSTICO … CRÍTICA: FUERA DE SERVICIO: CABINA TRABADA` |
| Estado de cada ítem del checklist | `& þ Critico` | `ATENCIÓN · Critico` |
| Certificado de acuse | `' Acuse Legal Registrado:` / `' Usuario Notificado:` | `OK · Acuse Legal Registrado:` / `OK · Usuario Notificado:` |

## Qué se hizo

- **`apps/api/src/eca/pdf-texto.ts`** — `textoParaPdf()`: deja pasar sólo lo que la fuente puede dibujar. Los emojis, símbolos, marcadores invisibles y caracteres de control se descartan sin tocar el resto del texto; una letra con acento que la fuente no tiene vuelve a su letra base (`ő` → `o`); una letra de otro alfabeto se marca con `?` (para que quien lee sepa que ahí había algo y no se pierda en silencio); se juntan los espacios y se conservan los saltos de línea. Los signos que la fuente sí tiene (comillas tipográficas, guiones largos, viñeta, euro) se respetan.
- **`apps/api/src/eca/remito-pdf.service.ts`** — todo dato que viene de los datos (número de remito, alerta, código AGC, máquina, consorcio, dirección, administración, ECA, título, tipo, motivo, checklist y usuario del acuse) pasa por `textoParaPdf()`. Las etiquetas con símbolos pasan a palabras: `⚠️` → `ATENCIÓN ·` y `✓` → `OK ·`. El título se limpia antes de pasarlo a mayúsculas.
- No cambia el membrete, los datos, el diagnóstico, el checklist ni el acuse, ni el endpoint (cabeceras, nombre del archivo, registro del acuse).

## Cómo probarlo

```bash
# con la API levantada (npm run dev) — baja los remitos de las dos alertas reales y lee el texto que el PDF dibuja:
bash docs/pruebas/hu-10-hu-10-centro-de-alertas-critic/RF-07-entrega.sh
```

El script usa `RF-07-pdf-a-texto.js` (sin dependencias) para leer el texto de cada PDF, comprueba las 4 condiciones de aprobación y corre las pruebas del ECA. Contra el código anterior da **8 errores** (símbolos rotos en los títulos y el checklist, etiquetas `OK ·` ausentes); con el arreglo, **13 verificaciones OK**.

Descargar un remito registra el acuse legal: el script borra de la base los acuses de prueba (`RF07-entrega-…`), pero la API los recuerda en memoria hasta que se reinicia.

Para mirarlo a ojo: en el Portal ECA, «Descargar Remito» sobre cualquier alerta y abrir el PDF.

## Pruebas automáticas

- `test/pdf-texto.spec.ts`: el sanitizador (emojis simples y compuestos —familia, bandera, tono de piel—, letras con acento y de otros alfabetos, invisibles, controles, saltos de línea) y tres propiedades con 600 cadenas al azar de semilla fija (todo lo que sale se puede dibujar; es idempotente; sin espacios repetidos ni en los bordes).
- `test/remito-pdf-simbolos.spec.ts`: genera el PDF real y verifica **línea por línea** que cada dato dinámico sale limpio (no alcanza con buscar caracteres sueltos: los emojis rotos dejan letras de Latin-1 válidas), que los estados se leen como palabras, el título con emoji, que el contenido sigue igual y que los signos válidos se imprimen bien.
- `test/eca.e2e-spec.ts`: el PDF de las dos alertas reales, por HTTP.
- `test/pdf-extraer-texto.ts`: extrae el texto de un PDF generado con pdfkit. Hasta ahora **ninguna prueba verificaba qué decía el PDF**, sólo que existía y pesaba más de 1000 bytes.
- Se verificaron con **31 mutaciones** (sanitizador que no hace nada, emojis aceptados, cada campo sin limpiar, símbolos que vuelven, «ATENCION» sin acento, letras que se borran en vez de marcarse, espacios y saltos de línea, signos de WinAnsi descartados, guion blando…): 30 hacen fallar alguna prueba. La que sobrevive es equivalente: pasar a mayúsculas antes o después de limpiar sólo cambia con letras como la «ı» turca, y el resultado es igual de seguro.

## Supuestos y limitaciones

- **La fuente estándar no tiene emojis ni otros alfabetos.** Un nombre con letras cirílicas, griegas o asiáticas sale con `?` en lugar de las letras. Si algún día hace falta imprimirlos, hay que incorporar al PDF una fuente TrueType que los tenga (otra tarjeta).
- Un emoji dentro de un dato desaparece del PDF (el dato guardado no cambia): el PDF dice lo mismo menos el adorno.
- El pie del certificado todavía dice «Registro inalterable almacenado en base de datos PostgreSQL con RLS context.»: es un texto técnico en un documento legal; se deja para que lo decida el cliente.
