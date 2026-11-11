import { EmailNotificacionConsorcio, VisitaFallidaRegistro } from './visitas-fallidas.types';

export interface ConsorcioBasico {
  nombre: string;
  direccion: string;
  email: string | null;
}

export interface MaquinaBasica {
  id: string;
  referenciaAgc: string;
}

/**
 * Contrato de persistencia de visitas fallidas. En producción y contra base real
 * lo implementa PostgreSQL; en pruebas unitarias/e2e aisladas, la versión en memoria.
 */
export abstract class VisitasFallidasRepository {
  abstract registrar(
    consorcioId: string,
    construirRegistro: (previasCount: number) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro>;

  abstract listarPorConsorcio(consorcioId: string): Promise<VisitaFallidaRegistro[]>;

  abstract listarTodas(): Promise<VisitaFallidaRegistro[]>;

  abstract buscarConsorcioInfo(consorcioId: string): Promise<ConsorcioBasico | null>;

  abstract listarMaquinasConsorcio(consorcioId: string): Promise<MaquinaBasica[]>;
}

/** Implementación en memoria para pruebas unitarias y e2e aisladas sin PostgreSQL. */
export class InMemoryVisitasFallidasRepository extends VisitasFallidasRepository {
  readonly registros: VisitaFallidaRegistro[] = [];

  async registrar(
    consorcioId: string,
    construirRegistro: (previasCount: number) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro> {
    const previasCount = this.registros.filter((r) => r.consorcioId === consorcioId).length;
    const registro = construirRegistro(previasCount);
    this.registros.push(structuredClone(registro));
    return structuredClone(registro);
  }

  async listarPorConsorcio(consorcioId: string): Promise<VisitaFallidaRegistro[]> {
    return this.registros
      .filter((r) => r.consorcioId === consorcioId)
      .map((r) => structuredClone(r));
  }

  async listarTodas(): Promise<VisitaFallidaRegistro[]> {
    return this.registros.map((r) => structuredClone(r));
  }

  async buscarConsorcioInfo(_consorcioId: string): Promise<ConsorcioBasico | null> {
    return null;
  }

  async listarMaquinasConsorcio(_consorcioId: string): Promise<MaquinaBasica[]> {
    return [];
  }
}

export function esEmailNotificacion(val: unknown): val is EmailNotificacionConsorcio {
  return Boolean(val && typeof val === 'object');
}
