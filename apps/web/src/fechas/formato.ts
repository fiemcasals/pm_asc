/**
 * Formato de fechas y horas de toda la web (HU-12 RF-03).
 *
 * `toLocaleString('es-AR')` sin más usa el reloj de 12 horas sin decir «a. m.» ni «p. m.»: las 15:15 se leen «03:15».
 * Acá todo sale en 24 horas (`hourCycle: 'h23'`, así la medianoche es 00:xx y nunca 24:xx) y en la hora de Buenos Aires,
 * esté donde esté el navegador. Un valor vacío o inválido devuelve '' y cada pantalla decide qué mostrar en su lugar.
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

export type ValorFecha = string | number | Date | null | undefined;

const PARTES = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface Partes {
  dia: string;
  mes: string;
  anio: string;
  hora: string;
  minuto: string;
  segundo: string;
}

function partes(valor: ValorFecha): Partes | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const p = Object.fromEntries(PARTES.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: p.day, mes: p.month, anio: p.year, hora: p.hour, minuto: p.minute, segundo: p.second };
}

/** «15:15» (o «15:15:07» con segundos). */
export function hora(valor: ValorFecha, opciones: { segundos?: boolean } = {}): string {
  const p = partes(valor);
  if (!p) return '';
  return opciones.segundos ? `${p.hora}:${p.minuto}:${p.segundo}` : `${p.hora}:${p.minuto}`;
}

/** «21/11/2026 15:15»; con `segundos` «21/11/2026 15:15:07»; con `anio: false` «21/11, 15:15». */
export function fechaHora(valor: ValorFecha, opciones: { segundos?: boolean; anio?: boolean } = {}): string {
  const p = partes(valor);
  if (!p) return '';
  const h = hora(valor, opciones);
  return opciones.anio === false ? `${p.dia}/${p.mes}, ${h}` : `${p.dia}/${p.mes}/${p.anio} ${h}`;
}
