import { Consorcio, ConsorcioInput, ConsorcioMapaItem, ConsorcioResumen } from './consorcio.types';
import { RolesEdificio, RolesInput } from './roles.types';

/** Lanzado cuando la base rechaza una referencia AGC repetida dentro del mismo edificio. */
export class ReferenciaAgcDuplicadaError extends Error {
  constructor(public readonly referenciaAgc?: string) {
    super('Referencia AGC repetida en el consorcio');
  }
}

/**
 * Lanzado cuando la terna del edificio cambió después de que quien guarda la leyó (HU-02 RF-03).
 * Lleva la versión vigente para que la pantalla la muestre.
 */
export class TernaCambioError extends Error {
  constructor(public readonly vigente: RolesEdificio) {
    super('La terna del edificio cambió desde que se leyó');
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
  /** Lista solo consorcios con punto geográfico PostGIS asignado. */
  abstract listarParaMapa(): Promise<ConsorcioMapaItem[]>;
  abstract obtener(id: string): Promise<Consorcio | null>;
  /** Reemplaza los datos y la lista completa de máquinas. `null` si el consorcio no existe. */
  abstract reemplazar(id: string, datos: ConsorcioInput): Promise<Consorcio | null>;
  /** `false` si no existía. Borra también sus máquinas. */
  abstract eliminar(id: string): Promise<boolean>;
  /** Roles del edificio; sin terna asignada, los roles vienen en `null`. `null` si el consorcio no existe. */
  abstract obtenerRoles(id: string): Promise<RolesEdificio | null>;
  /**
   * Reemplaza la terna completa. `null` si el consorcio no existe.
   * `esperado` es la versión (`actualizadoEn`) que quien guarda leyó: `undefined` no controla nada; `null` dice "leí que
   * no había terna"; un instante ISO dice "leí la terna de ese momento". Si la terna vigente no es esa, no se guarda
   * nada y se lanza `TernaCambioError` con la vigente.
   */
  abstract asignarRoles(id: string, datos: RolesInput, esperado?: string | null): Promise<RolesEdificio | null>;
  /** Quita la asignación de roles del edificio; `false` si no existía. */
  abstract quitarRoles(id: string): Promise<boolean>;
}
