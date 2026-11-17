import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../firmante/firmante.service';
import { aDetalle, aFila, filtrar, ordenar, paginar } from './backoffice.logic';
import { DetalleVisita, ESTADOS_VISITA, FiltrosMonitoreo, PaginaMonitoreo, POR_PAGINA_DEFECTO, POR_PAGINA_MAXIMA, ReclamoAdmin, RemitoEca } from './backoffice.types';
import { ReclamosRepository } from './reclamos.repository';
import { RemitosRepository } from './remitos.repository';

const entero = (v: unknown, nombre: string, min: number, max: number, defecto: number): number => {
  if (v === undefined || v === '') return defecto;
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${nombre} tiene que ser un entero entre ${min} y ${max}`);
  return n;
};
const texto = (v: unknown, nombre: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new BadRequestException(`${nombre} tiene que ser un texto`);
  return v.trim() === '' ? undefined : v.trim().slice(0, 100);
};

/** Monitoreo general del backoffice y registro de remitos a la ECA (HU-05 RF-01). */
@Injectable()
export class BackofficeService {
  constructor(
    private readonly firmante: FirmanteService,
    private readonly remitos: RemitosRepository,
    private readonly reclamos: ReclamosRepository,
  ) {}

  /**
   * El listado paginado de visitas por equipo, filtrable por dirección, ECA, inspector y estado de la visita. Cada fila trae el remito
   * a la ECA si ya se mandó. Lo más reciente primero.
   */
  async monitoreo(query: Record<string, unknown>): Promise<PaginaMonitoreo> {
    const filtros: FiltrosMonitoreo = { direccion: texto(query.direccion, 'direccion'), eca: texto(query.eca, 'eca'), inspector: texto(query.inspector, 'inspector') };
    const estado = texto(query.estado, 'estado');
    if (estado !== undefined) {
      if (!(ESTADOS_VISITA as readonly string[]).includes(estado)) throw new BadRequestException(`estado tiene que ser ${ESTADOS_VISITA.join(', ')}`);
      filtros.estado = estado as FiltrosMonitoreo['estado'];
    }
    const pagina = entero(query.pagina, 'pagina', 1, 1_000_000, 1);
    const porPagina = entero(query.porPagina, 'porPagina', 1, POR_PAGINA_MAXIMA, POR_PAGINA_DEFECTO);

    const porVisita = new Map((await this.remitos.listar()).map((r) => [r.visitaId, r]));
    const reclamosPorVisita = new Map((await this.reclamos.listar()).map((r) => [r.visitaId, r]));
    const filas = this.firmante.getMaquinas().map((m) => aFila(m, (id) => porVisita.get(id) ?? null, (id) => reclamosPorVisita.get(id) ?? null));
    return paginar(ordenar(filtrar(filas, filtros)), pagina, porPagina);
  }

  /** El detalle de la visita de un equipo para el visor de fotos e informe. 404 si el equipo no existe. */
  detalle(maquinaId: string): DetalleVisita {
    const m = this.firmante.getMaquinas().find((x) => x.id === maquinaId);
    if (!m) throw new NotFoundException('Equipo no encontrado');
    return aDetalle(m);
  }

  /**
   * Registra el reclamo a la administración del consorcio por una visita con advertencia (quién y cuándo). Sólo corresponde cuando la visita
   * quedó en «Advertencia» (409 si no); un reclamo por visita (409 con el anterior).
   */
  async reclamarAdmin(cuerpo: unknown, usuario: string): Promise<ReclamoAdmin> {
    const b = (cuerpo ?? {}) as Record<string, unknown>;
    const maquinaId = typeof b.maquinaId === 'string' ? b.maquinaId.trim() : '';
    if (!maquinaId) throw new BadRequestException('maquinaId es obligatorio');
    const maquina = this.firmante.getMaquinas().find((m) => m.id === maquinaId);
    if (!maquina) throw new NotFoundException('Equipo no encontrado');
    if (!maquina.visita || maquina.estado !== 'Advertencia') {
      throw new ConflictException('Sólo se le reclama a la administración una visita que quedó con advertencia.');
    }
    const visita = maquina.visita;
    const guardado = await this.reclamos.guardar({ maquinaId: maquina.id, visitaId: visita.id, administracion: maquina.edificio.administracion, direccion: maquina.edificio.direccion, reclamadoPor: usuario });
    if (!guardado) {
      const previo = (await this.reclamos.listar()).find((r) => r.visitaId === visita.id);
      throw new ConflictException(`Esta visita ya se le reclamó a ${maquina.edificio.administracion}${previo ? ` el ${previo.reclamadoEn} (${previo.reclamadoPor})` : ''}.`);
    }
    return guardado;
  }

  /**
   * Registra el envío del remito digital de una visita a la ECA (quién y cuándo). Sólo se manda el de una visita que ya se hizo; un
   * equipo «Pendiente de Visita» no tiene qué informar (409), y la misma visita no se manda dos veces (409 con el envío anterior).
   */
  async enviarRemito(cuerpo: unknown, usuario: string): Promise<RemitoEca> {
    const b = (cuerpo ?? {}) as Record<string, unknown>;
    const maquinaId = typeof b.maquinaId === 'string' ? b.maquinaId.trim() : '';
    if (!maquinaId) throw new BadRequestException('maquinaId es obligatorio');
    if (b.visitaId !== undefined && typeof b.visitaId !== 'string') throw new BadRequestException('visitaId tiene que ser un texto');
    const maquina = this.firmante.getMaquinas().find((m) => m.id === maquinaId);
    if (!maquina) throw new NotFoundException('Equipo no encontrado');
    const visita = maquina.visita;
    if (!visita || maquina.estado === 'Pendiente de Visita') {
      throw new ConflictException('Este equipo todavía no tiene una visita hecha: no hay remito para mandar a la ECA.');
    }
    if (typeof b.visitaId === 'string' && b.visitaId !== visita.id) {
      throw new ConflictException('La visita indicada no es la vigente de este equipo.');
    }
    const guardado = await this.remitos.guardar({ maquinaId: maquina.id, visitaId: visita.id, eca: maquina.eca, direccion: maquina.edificio.direccion, enviadoPor: usuario });
    if (!guardado) {
      const previo = (await this.remitos.listar()).find((r) => r.visitaId === visita.id);
      throw new ConflictException(`El remito de esta visita ya se mandó a ${maquina.eca}${previo ? ` el ${previo.enviadoEn} (${previo.enviadoPor})` : ''}.`);
    }
    return guardado;
  }
}
