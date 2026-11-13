import {
  ReasignacionPedida,
  RegistroReasignacion,
  ResultadoReasignacion,
  RtDisponible,
} from './reasignacion.types';
import { EdificioBase, FechaCalendario } from './semaforo.types';

/**
 * Contrato de lectura y de reasignación del semáforo. En producción lo implementa PostgreSQL y en las pruebas
 * aisladas, una versión en memoria. Devuelve hechos (cuántas máquinas, cuántas inspeccionadas, cuándo fue la última);
 * el color lo decide `semaforo.logic.ts`.
 */
export abstract class SemaforoRepository {
  /**
   * Un `EdificioBase` por cada edificio visible para la ECA de la petición, contando las inspecciones del
   * mes de `fecha` desde el día 1 hasta el final de `fecha` (hora de Buenos Aires). Las inspecciones de
   * otros meses, o posteriores a `fecha`, no cuentan.
   */
  abstract leerEdificios(fecha: FechaCalendario): Promise<EdificioBase[]>;

  /** Los usuarios activos con rol `rt_calle`: los RT a los que se puede reasignar un edificio. */
  abstract listarRtDisponibles(): Promise<RtDisponible[]>;

  /**
   * Aplica una reasignación y la registra, todo o nada. No se aplica (`ok: false`) si el edificio no tiene terna
   * asignada o si su RT ya no es `rtAnterior` (alguien lo cambió mientras la Secretaría decidía).
   */
  abstract reasignarRt(pedida: ReasignacionPedida): Promise<ResultadoReasignacion>;

  /** El registro de reasignaciones de un edificio, la más reciente primero. */
  abstract listarReasignaciones(consorcioId: string): Promise<RegistroReasignacion[]>;
}
