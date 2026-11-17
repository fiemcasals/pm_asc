import { HorariosNuevos } from './horarios.types';

export interface HorariosGuardados extends HorariosNuevos {
  actualizadoEn: string;
  actualizadoPor: string;
}

export abstract class HorariosRepository {
  /** `null` si el edificio no existe; `{ horarios: null }` si existe y nadie editó sus horarios (rige el horario por defecto). */
  abstract obtener(consorcioId: string): Promise<{ horarios: HorariosGuardados | null } | null>;
  /** Guarda los horarios; `null` si el edificio no existe. */
  abstract guardar(consorcioId: string, nuevos: HorariosNuevos, usuario: string): Promise<HorariosGuardados | null>;
}

/** En memoria, para las pruebas aisladas: los edificios se dan de alta con `agregarEdificio`. */
export class InMemoryHorariosRepository extends HorariosRepository {
  readonly edificios = new Set<string>();
  readonly horarios = new Map<string, HorariosGuardados>();

  agregarEdificio(consorcioId: string): void {
    this.edificios.add(consorcioId);
  }

  async obtener(consorcioId: string) {
    if (!this.edificios.has(consorcioId)) return null;
    const h = this.horarios.get(consorcioId);
    return { horarios: h ? structuredClone(h) : null };
  }

  async guardar(consorcioId: string, nuevos: HorariosNuevos, usuario: string) {
    if (!this.edificios.has(consorcioId)) return null;
    const guardado: HorariosGuardados = { ...structuredClone(nuevos), actualizadoEn: new Date().toISOString(), actualizadoPor: usuario };
    this.horarios.set(consorcioId, guardado);
    return structuredClone(guardado);
  }
}
