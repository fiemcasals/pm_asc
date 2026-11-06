import { Consorcio, ConsorcioInput, ConsorcioResumen } from './consorcio.types';

/** Lanzado cuando la base rechaza una referencia AGC repetida dentro del mismo edificio. */
export class ReferenciaAgcDuplicadaError extends Error {
  constructor(public readonly referenciaAgc?: string) {
    super('Referencia AGC repetida en el consorcio');
  }
}

/**
 * Contrato de persistencia de consorcios. El controlador depende de esta clase abstracta
 * (token de inyección): en producción la implementa PostgreSQL y en las pruebas aisladas,
 * una versión en memoria.
 */
export abstract class ConsorciosRepository {
  abstract crear(datos: ConsorcioInput): Promise<Consorcio>;
  abstract listar(): Promise<ConsorcioResumen[]>;
  abstract obtener(id: string): Promise<Consorcio | null>;
  /** Reemplaza los datos y la lista completa de máquinas. `null` si el consorcio no existe. */
  abstract reemplazar(id: string, datos: ConsorcioInput): Promise<Consorcio | null>;
  /** `false` si no existía. Borra también sus máquinas. */
  abstract eliminar(id: string): Promise<boolean>;
}
