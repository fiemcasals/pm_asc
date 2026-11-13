import { EdificioBase, FechaCalendario } from './semaforo.types';

/**
 * Contrato de lectura del semáforo. En producción lo implementa PostgreSQL y en las pruebas aisladas,
 * una versión en memoria. Devuelve hechos (cuántas máquinas, cuántas inspeccionadas, cuándo fue la última);
 * el color lo decide `semaforo.logic.ts`.
 */
export abstract class SemaforoRepository {
  /**
   * Un `EdificioBase` por cada edificio visible para la ECA de la petición, contando las inspecciones del
   * mes de `fecha` desde el día 1 hasta el final de `fecha` (hora de Buenos Aires). Las inspecciones de
   * otros meses, o posteriores a `fecha`, no cuentan.
   */
  abstract leerEdificios(fecha: FechaCalendario): Promise<EdificioBase[]>;
}
