/** Mapa del RT (HU-16 RF-01): color de cada pin según el horario del edificio, sin React. */

export type ColorPin = 'verde' | 'rojo' | 'amarillo';

export interface Franja {
  desde: string;
  hasta: string;
}
export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export interface HorarioEdificio {
  aCoordinar: boolean;
  franjas: Partial<Record<DiaSemana, Franja[]>>;
}

export const COLOR_HEX: Record<ColorPin, string> = { verde: '#16a34a', rojo: '#dc2626', amarillo: '#eab308' };
export const LEYENDA: { color: ColorPin; texto: string }[] = [
  { color: 'verde', texto: 'Abierto ahora' },
  { color: 'rojo', texto: 'Cerrado' },
  { color: 'amarillo', texto: 'A coordinar' },
];

const ZONA = 'America/Argentina/Buenos_Aires';
const PARTES = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DIA_EN: Record<string, DiaSemana> = { Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miercoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sabado', Sunday: 'domingo' };

/** Día de la semana, fecha (AAAA-MM-DD) y hora («HH:MM») de un instante en Buenos Aires. */
export function enBuenosAires(instante: Date): { dia: DiaSemana; fecha: string; hora: string } {
  const p = Object.fromEntries(PARTES.formatToParts(instante).map((x) => [x.type, x.value]));
  return { dia: DIA_EN[p.weekday], fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * El color del pin de un edificio en `ahora`: verde si está abierto, rojo si está cerrado (fuera de franja, día sin franjas o feriado)
 * y amarillo si es «A coordinar». Es la misma regla que aplica la API (`GET …/horarios/abierto`): el inicio de la franja cuenta como
 * abierto y el fin no; un feriado cierra aunque ese día tenga franjas; «A coordinar» gana sobre todo lo demás.
 */
export function colorDePin(horario: HorarioEdificio, feriados: ReadonlySet<string> | readonly string[], ahora: Date): ColorPin {
  if (horario.aCoordinar) return 'amarillo';
  const { dia, fecha, hora } = enBuenosAires(ahora);
  const esFeriado = Array.isArray(feriados) ? feriados.includes(fecha) : (feriados as ReadonlySet<string>).has(fecha);
  if (esFeriado) return 'rojo';
  const m = minutos(hora);
  const abierto = (horario.franjas[dia] ?? []).some((f) => m >= minutos(f.desde) && m < minutos(f.hasta));
  return abierto ? 'verde' : 'rojo';
}

/** El encabezado de la pantalla del RT: «Hola Ing. Aliado 1 | Zona Norte | 11:30 hs» (sin la zona si no tiene). */
export function encabezadoRt(nombre: string, zona: string | null, ahora: Date): string {
  const partes = [`Hola ${nombre}`];
  if (zona) partes.push(`Zona ${zona}`);
  partes.push(`${enBuenosAires(ahora).hora} hs`);
  return partes.join(' | ');
}

/** El instante «de verdad» a partir del reloj del celular y la hora del servidor: corrige un celular adelantado o atrasado. */
export function ahoraCorregido(relojLocalMs: number, desfaseMs: number): Date {
  return new Date(relojLocalMs + desfaseMs);
}

/** Cuánto hay que sumarle al reloj del celular para llegar a la hora del servidor. */
export function desfaseDeReloj(servidorIso: string, relojLocalMs: number): number {
  const s = Date.parse(servidorIso);
  return Number.isNaN(s) ? 0 : s - relojLocalMs;
}
