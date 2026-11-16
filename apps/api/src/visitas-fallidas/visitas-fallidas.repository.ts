import { randomUUID } from 'node:crypto';
import { AnulacionRecargo, EmailNotificacionConsorcio, VisitaFallidaRegistro } from './visitas-fallidas.types';

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

  /** Los ids de las máquinas del edificio con al menos una inspección en el mes `periodo` (AAAA-MM, hora de Buenos Aires). */
  abstract maquinasInspeccionadasEnMes(consorcioId: string, periodo: string): Promise<string[]>;

  abstract listarAnulaciones(consorcioId: string): Promise<AnulacionRecargo[]>;

  /** Registra la anulación; devuelve null si ese recargo (3.ª visita + máquina) ya estaba anulado. */
  abstract anularRecargo(datos: Omit<AnulacionRecargo, 'id' | 'fecha'>): Promise<AnulacionRecargo | null>;
}

/** Implementación en memoria para pruebas unitarias y e2e aisladas sin PostgreSQL. */
export class InMemoryVisitasFallidasRepository extends VisitasFallidasRepository {
  readonly registros: VisitaFallidaRegistro[] = [];
  /** Máquinas inspeccionadas por edificio y mes, para las pruebas: la clave es `consorcioId|AAAA-MM`. */
  readonly inspeccionadas = new Map<string, string[]>();
  readonly anulaciones: AnulacionRecargo[] = [];

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

  async maquinasInspeccionadasEnMes(consorcioId: string, periodo: string): Promise<string[]> {
    return [...(this.inspeccionadas.get(`${consorcioId}|${periodo}`) ?? [])];
  }

  async listarAnulaciones(consorcioId: string): Promise<AnulacionRecargo[]> {
    return this.anulaciones.filter((a) => a.consorcioId === consorcioId).map((a) => structuredClone(a));
  }

  async anularRecargo(datos: Omit<AnulacionRecargo, 'id' | 'fecha'>): Promise<AnulacionRecargo | null> {
    if (this.anulaciones.some((a) => a.visitaFallidaId === datos.visitaFallidaId && a.maquinaId === datos.maquinaId)) return null;
    const anulacion: AnulacionRecargo = { ...datos, id: randomUUID(), fecha: new Date().toISOString() };
    this.anulaciones.push(anulacion);
    return structuredClone(anulacion);
  }
}

export function esEmailNotificacion(val: unknown): val is EmailNotificacionConsorcio {
  return Boolean(val && typeof val === 'object');
}
