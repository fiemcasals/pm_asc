import { claveDeDia, fecha, hora, type ValorFecha } from '../fechas/formato';

// HU-19 RF-08 — el día de cada mensaje del chat: «Hoy», «Ayer» o la fecha, en la hora de Buenos Aires y en 24 horas (el formato común de la aplicación).

/** La clave del día anterior a otro: «2026-11-01» → «2026-10-31». Sin zonas horarias de por medio: es aritmética de calendario. */
export function diaAnterior(clave: string): string {
  const [anio, mes, dia] = clave.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** «Hoy», «Ayer» o la fecha completa («21/11/2026»), según `ahora`. Un valor vacío o inválido da ''. */
export function etiquetaDeDia(valor: ValorFecha, ahora: ValorFecha = new Date()): string {
  const clave = claveDeDia(valor);
  const hoy = claveDeDia(ahora);
  if (!clave || !hoy) return '';
  if (clave === hoy) return 'Hoy';
  if (clave === diaAnterior(hoy)) return 'Ayer';
  return fecha(valor);
}

/** Lo que dice la lista de conversaciones del último mensaje: la hora si es de hoy («15:15»), «Ayer», o la fecha. */
export function horaOFecha(valor: ValorFecha, ahora: ValorFecha = new Date()): string {
  const etiqueta = etiquetaDeDia(valor, ahora);
  return etiqueta === 'Hoy' ? hora(valor) : etiqueta;
}

/** Un renglón del hilo: el separador de un día o un mensaje. */
export type ElementoDelHilo<T> = { tipo: 'dia'; clave: string; etiqueta: string } | { tipo: 'mensaje'; mensaje: T };

/** Pone un separador con el día («Hoy», «Ayer» o la fecha) delante del primer mensaje de cada día. Un mensaje sin fecha válida no cambia de día. */
export function conSeparadores<T extends { creadoEn: string }>(mensajes: T[], ahora: ValorFecha = new Date()): ElementoDelHilo<T>[] {
  const lista: ElementoDelHilo<T>[] = [];
  let diaActual = '';
  for (const mensaje of mensajes) {
    const clave = claveDeDia(mensaje.creadoEn);
    if (clave && clave !== diaActual) {
      lista.push({ tipo: 'dia', clave, etiqueta: etiquetaDeDia(mensaje.creadoEn, ahora) });
      diaActual = clave;
    }
    lista.push({ tipo: 'mensaje', mensaje });
  }
  return lista;
}
