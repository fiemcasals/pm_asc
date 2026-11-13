import { ColorSemaforo, RtCalleAsignado } from './semaforo.types';

/** Un RT de Calle que puede recibir un edificio: un usuario activo con rol `rt_calle`. */
export interface RtDisponible {
  /** Nombre de usuario: es lo que el RLS compara para darle acceso a sus edificios. */
  usuario: string;
  /** Nombre para mostrar. */
  nombre: string;
}

export interface RtCandidato extends RtDisponible {
  /** Edificios que tiene hoy asignados y todavía no inspeccionó en el mes. */
  pendientes: number;
}

export interface SugerenciaReasignacion {
  consorcioId: string;
  nombre: string;
  /** Fecha para la que se calculó (AAAA-MM-DD, hora de Buenos Aires). */
  fecha: string;
  color: ColorSemaforo;
  rtActual: RtCalleAsignado | null;
  /** El RT con menos edificios pendientes del mes, sin contar al actual; null si no hay a quién reasignar. */
  sugerido: RtCandidato | null;
  /** Todos los RT a los que se puede reasignar (sin el actual), del menos al más cargado. */
  candidatos: RtCandidato[];
}

/** Una reasignación confirmada, tal como queda registrada. */
export interface RegistroReasignacion {
  id: string;
  consorcioId: string;
  rtAnterior: string;
  rtNuevo: string;
  /** Usuario de la Secretaría que la confirmó. */
  usuario: string;
  /** Instante (ISO 8601) en que se confirmó, puesto por el servidor. */
  fecha: string;
}

export interface ReasignacionPedida {
  consorcioId: string;
  /** El RT que la Secretaría vio al pedirla: si el edificio ya cambió de RT, no se aplica. */
  rtAnterior: string;
  rtNuevo: string;
  /** Usuario de la sesión que confirma. */
  usuario: string;
}

export type ResultadoReasignacion =
  | { ok: true; registro: RegistroReasignacion }
  | { ok: false; motivo: 'sin_terna' | 'rt_cambio' | 'sin_contacto' };
