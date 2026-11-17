import {
  DIAS_SEMANA,
  DiaSemana,
  EstadoApertura,
  Franja,
  FranjasPorDia,
  HorariosNuevos,
  MAX_FRANJAS_POR_DIA,
  ZONA_HORARIA,
} from './horarios.types';

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde las 00:00 de una hora «HH:MM». */
export const aMinutos = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/**
 * Valida y normaliza lo que manda la Secretaría. Devuelve los horarios limpios o la lista de errores (cada uno dice el día y el motivo).
 * Reglas: hasta 2 franjas por día; «HH:MM» de 00:00 a 23:59; el fin tiene que ser posterior al inicio; las dos franjas de un día no se
 * pisan ni se tocan. «A coordinar» reemplaza las franjas (quedan vacías).
 */
export function validarHorarios(cuerpo: unknown): { ok: true; horarios: HorariosNuevos } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const b = (cuerpo ?? {}) as Record<string, unknown>;
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return { ok: false, errores: ['El cuerpo tiene que ser un objeto con aCoordinar y/o franjas.'] };
  if (b.aCoordinar !== undefined && typeof b.aCoordinar !== 'boolean') errores.push('aCoordinar tiene que ser verdadero o falso.');
  const aCoordinar = b.aCoordinar === true;
  if (aCoordinar) {
    return errores.length > 0 ? { ok: false, errores } : { ok: true, horarios: { aCoordinar: true, franjas: {} } };
  }
  if (b.franjas === undefined) return { ok: false, errores: [...errores, 'Mandá las franjas por día (franjas) o marcá el edificio «A coordinar» (aCoordinar: true).'] };
  if (typeof b.franjas !== 'object' || b.franjas === null || Array.isArray(b.franjas)) return { ok: false, errores: [...errores, 'franjas tiene que ser un objeto con los días de la semana.'] };

  const franjas: FranjasPorDia = {};
  for (const [dia, valor] of Object.entries(b.franjas as Record<string, unknown>)) {
    if (!(DIAS_SEMANA as readonly string[]).includes(dia)) {
      errores.push(`«${dia}» no es un día válido (${DIAS_SEMANA.join(', ')}).`);
      continue;
    }
    if (!Array.isArray(valor)) {
      errores.push(`${dia}: tiene que ser una lista de franjas.`);
      continue;
    }
    if (valor.length > MAX_FRANJAS_POR_DIA) {
      errores.push(`${dia}: como máximo ${MAX_FRANJAS_POR_DIA} franjas por día (mandaste ${valor.length}).`);
      continue;
    }
    const limpias: Franja[] = [];
    let validas = true;
    valor.forEach((f, i) => {
      const x = f as Record<string, unknown>;
      const desde = typeof x?.desde === 'string' ? x.desde : '';
      const hasta = typeof x?.hasta === 'string' ? x.hasta : '';
      if (!HORA.test(desde) || !HORA.test(hasta)) {
        errores.push(`${dia}, franja ${i + 1}: desde y hasta tienen que ser horas «HH:MM» de 00:00 a 23:59.`);
        validas = false;
      } else if (aMinutos(hasta) <= aMinutos(desde)) {
        errores.push(`${dia}, franja ${i + 1}: la hora de fin (${hasta}) tiene que ser posterior a la de inicio (${desde}).`);
        validas = false;
      } else limpias.push({ desde, hasta });
    });
    if (!validas) continue;
    limpias.sort((a, b2) => aMinutos(a.desde) - aMinutos(b2.desde));
    if (limpias.length === 2 && aMinutos(limpias[1].desde) <= aMinutos(limpias[0].hasta)) {
      errores.push(`${dia}: las dos franjas se superponen (${limpias[0].desde}–${limpias[0].hasta} y ${limpias[1].desde}–${limpias[1].hasta}).`);
      continue;
    }
    if (limpias.length > 0) franjas[dia as DiaSemana] = limpias;
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, horarios: { aCoordinar: false, franjas } };
}

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const DIA_EN: Record<string, DiaSemana> = { Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miercoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sabado', Sunday: 'domingo' };

/** Día de la semana, fecha y hora de un instante en Buenos Aires. */
export function enBuenosAires(instante: Date): { dia: DiaSemana; fecha: string; hora: string } {
  const p = Object.fromEntries(PARTES.formatToParts(instante).map((x) => [x.type, x.value]));
  return { dia: DIA_EN[p.weekday], fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/**
 * ¿Está abierto el edificio en `instante`? Se evalúa en hora de Buenos Aires. «A coordinar» no está abierto (hay que coordinar la
 * visita); un feriado cuenta como cerrado aunque ese día de la semana tenga franjas; la franja incluye el inicio y excluye el fin.
 */
export function estadoDeApertura(
  consorcioId: string,
  horarios: { aCoordinar: boolean; franjas: FranjasPorDia },
  feriados: ReadonlySet<string>,
  instante: Date,
): EstadoApertura {
  const { dia, fecha, hora } = enBuenosAires(instante);
  const base = { consorcioId, en: instante.toISOString(), fechaLocal: fecha, horaLocal: hora, diaSemana: dia };
  if (horarios.aCoordinar) return { ...base, abierto: false, motivo: 'a_coordinar', franjaVigente: null };
  if (feriados.has(fecha)) return { ...base, abierto: false, motivo: 'feriado', franjaVigente: null };
  const delDia = horarios.franjas[dia] ?? [];
  if (delDia.length === 0) return { ...base, abierto: false, motivo: 'dia_cerrado', franjaVigente: null };
  const m = aMinutos(hora);
  const vigente = delDia.find((f) => m >= aMinutos(f.desde) && m < aMinutos(f.hasta));
  return vigente
    ? { ...base, abierto: true, motivo: 'dentro_de_franja', franjaVigente: { ...vigente } }
    : { ...base, abierto: false, motivo: 'fuera_de_franja', franjaVigente: null };
}
