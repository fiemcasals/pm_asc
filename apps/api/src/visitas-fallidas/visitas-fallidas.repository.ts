import { randomUUID } from 'node:crypto';
import {
  AnulacionRecargo,
  DesbloqueoEdificio,
  EmailNotificacionConsorcio,
  VisitaFallidaRegistro,
} from './visitas-fallidas.types';

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
  /**
   * Guarda una visita fallida. `construirRegistro` recibe cuántas advertencias vigentes tiene el edificio (las posteriores a su última
   * inspección) y la fecha de su última visita fallida (null si no tuvo), todo dentro del mismo bloqueo; si lanza, no se guarda nada.
   */
  abstract registrar(
    consorcioId: string,
    construirRegistro: (previasCount: number, ultimaVisitaFallidaIso: string | null) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro>;

  abstract listarPorConsorcio(consorcioId: string): Promise<VisitaFallidaRegistro[]>;

  abstract listarTodas(): Promise<VisitaFallidaRegistro[]>;

  abstract buscarConsorcioInfo(consorcioId: string): Promise<ConsorcioBasico | null>;

  abstract listarMaquinasConsorcio(consorcioId: string): Promise<MaquinaBasica[]>;

  /** Los ids de las máquinas del edificio con al menos una inspección en el mes `periodo` (AAAA-MM, hora de Buenos Aires). */
  abstract maquinasInspeccionadasEnMes(consorcioId: string, periodo: string): Promise<string[]>;

  abstract listarAnulaciones(consorcioId: string): Promise<AnulacionRecargo[]>;

  /** El instante de la última inspección registrada en el edificio (su última visita exitosa), o null si no tiene. */
  abstract ultimaInspeccion(consorcioId: string): Promise<string | null>;

  /** La última inspección de cada edificio que tiene alguna, por id de edificio. */
  abstract ultimasInspecciones(): Promise<Record<string, string>>;

  /** Los desbloqueos de un edificio (o de todos si no se indica), en el orden en que se hicieron. */
  abstract listarDesbloqueos(consorcioId?: string): Promise<DesbloqueoEdificio[]>;

  /** Registra el desbloqueo; devuelve null si esa serie de advertencias ya estaba desbloqueada. */
  abstract desbloquear(datos: Omit<DesbloqueoEdificio, 'id' | 'fecha'>): Promise<DesbloqueoEdificio | null>;

  /** Los edificios que el usuario de la petición ve (el RLS decide cuáles), por nombre. */
  abstract listarEdificiosVisibles(): Promise<{ id: string; nombre: string; direccion: string }[]>;

  /** Registra la anulación; devuelve null si ese recargo (3.ª visita + máquina) ya estaba anulado. */
  abstract anularRecargo(datos: Omit<AnulacionRecargo, 'id' | 'fecha'>): Promise<AnulacionRecargo | null>;
}

/** Implementación en memoria para pruebas unitarias y e2e aisladas sin PostgreSQL. */
export class InMemoryVisitasFallidasRepository extends VisitasFallidasRepository {
  readonly registros: VisitaFallidaRegistro[] = [];
  /** Máquinas inspeccionadas por edificio y mes, para las pruebas: la clave es `consorcioId|AAAA-MM`. */
  readonly inspeccionadas = new Map<string, string[]>();
  readonly anulaciones: AnulacionRecargo[] = [];
  /** Última inspección por edificio, para las pruebas (su última visita exitosa). */
  readonly inspecciones = new Map<string, string>();
  readonly desbloqueos: DesbloqueoEdificio[] = [];
  /** Los edificios que ve el usuario, para las pruebas del recorrido. */
  edificios: { id: string; nombre: string; direccion: string }[] = [];

  async registrar(
    consorcioId: string,
    construirRegistro: (previasCount: number, ultimaVisitaFallidaIso: string | null) => VisitaFallidaRegistro,
  ): Promise<VisitaFallidaRegistro> {
    const propias = this.registros.filter((r) => r.consorcioId === consorcioId);
    const corte = this.inspecciones.get(consorcioId);
    const previasCount = propias.filter((r) => !corte || Date.parse(r.fechaHora) > Date.parse(corte)).length;
    const registro = construirRegistro(previasCount, propias.length > 0 ? propias[propias.length - 1].fechaHora : null);
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

  async ultimaInspeccion(consorcioId: string): Promise<string | null> {
    return this.inspecciones.get(consorcioId) ?? null;
  }

  async ultimasInspecciones(): Promise<Record<string, string>> {
    return Object.fromEntries(this.inspecciones);
  }

  async listarDesbloqueos(consorcioId?: string): Promise<DesbloqueoEdificio[]> {
    return this.desbloqueos.filter((d) => !consorcioId || d.consorcioId === consorcioId).map((d) => structuredClone(d));
  }

  async desbloquear(datos: Omit<DesbloqueoEdificio, 'id' | 'fecha'>): Promise<DesbloqueoEdificio | null> {
    if (this.desbloqueos.some((d) => d.hastaVisitaId === datos.hastaVisitaId)) return null;
    const desbloqueo: DesbloqueoEdificio = { ...datos, id: randomUUID(), fecha: new Date().toISOString() };
    this.desbloqueos.push(desbloqueo);
    return structuredClone(desbloqueo);
  }

  async listarEdificiosVisibles(): Promise<{ id: string; nombre: string; direccion: string }[]> {
    return structuredClone(this.edificios);
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
