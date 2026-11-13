import {
  ColorSemaforo,
  EdificioBase,
  EstadoEdificio,
  FechaCalendario,
  SemaforoEdificio,
} from './semaforo.types';

/**
 * Zona horaria con la que se cuentan los días del mes. El día de una inspección es el de Buenos Aires:
 * una inspección a las 22:00 del día 31 es del 31 aunque en UTC ya sea el 1.º del mes siguiente.
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Último día del tramo verde y del tramo amarillo; del 21 en adelante, rojo. */
export const ULTIMO_DIA_VERDE = 10;
export const ULTIMO_DIA_AMARILLO = 20;

const FORMATO_EN_ZONA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** La fecha de calendario que corresponde a un instante, en hora de Buenos Aires. */
export function fechaEnZona(instanteMs: number): FechaCalendario {
  const partes = Object.fromEntries(
    FORMATO_EN_ZONA.formatToParts(new Date(instanteMs)).map((p) => [p.type, p.value]),
  );
  return { anio: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day) };
}

export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** AAAA-MM-DD estricto y con un día que exista en el calendario (rechaza 2026-02-30 y 2026-13-01). */
export function parsearFecha(texto: string): FechaCalendario | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (anio < 2000 || mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDelMes(anio, mes)) return null;
  return { anio, mes, dia };
}

const dos = (n: number) => String(n).padStart(2, '0');

export function formatearFecha(f: FechaCalendario): string {
  return `${f.anio}-${dos(f.mes)}-${dos(f.dia)}`;
}

export function formatearMes(f: FechaCalendario): string {
  return `${f.anio}-${dos(f.mes)}`;
}

/** El color que le toca a un edificio pendiente según el día del mes: 1-10 verde, 11-20 amarillo, 21 al último día rojo. */
export function colorDelTramo(dia: number): ColorSemaforo {
  if (dia <= ULTIMO_DIA_VERDE) return 'verde';
  if (dia <= ULTIMO_DIA_AMARILLO) return 'amarillo';
  return 'rojo';
}

/** Inspeccionado = tiene máquinas y todas tienen una inspección en el mes. Sin máquinas no hay nada que inspeccionar. */
export function estadoDelEdificio(base: Pick<EdificioBase, 'maquinas' | 'maquinasInspeccionadas'>): EstadoEdificio {
  return base.maquinas > 0 && base.maquinasInspeccionadas >= base.maquinas ? 'inspeccionado' : 'pendiente';
}

/**
 * Un edificio inspeccionado en el mes está en verde cualquiera sea el día; uno pendiente toma el color del
 * tramo del día (el 1.º de cada mes ya no hay inspecciones del mes y todos vuelven a pendiente).
 */
export function calcularEdificio(base: EdificioBase, fecha: FechaCalendario): SemaforoEdificio {
  const estado = estadoDelEdificio(base);
  return {
    id: base.id,
    nombre: base.nombre,
    direccion: base.direccion,
    color: estado === 'inspeccionado' ? 'verde' : colorDelTramo(fecha.dia),
    estado,
    maquinas: base.maquinas,
    maquinasInspeccionadas: base.maquinasInspeccionadas,
    diaUltimaInspeccion: base.ultimaInspeccion ? fechaEnZona(Date.parse(base.ultimaInspeccion)).dia : null,
    rtCalle: base.rtCalle,
  };
}

const SEVERIDAD: Record<ColorSemaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };

/** Lo más urgente primero: rojos, amarillos y verdes; dentro de cada color, por nombre y por id. */
export function ordenarPorUrgencia(edificios: SemaforoEdificio[]): SemaforoEdificio[] {
  return [...edificios].sort(
    (a, b) =>
      SEVERIDAD[a.color] - SEVERIDAD[b.color] ||
      a.nombre.localeCompare(b.nombre, 'es') ||
      a.id.localeCompare(b.id),
  );
}
