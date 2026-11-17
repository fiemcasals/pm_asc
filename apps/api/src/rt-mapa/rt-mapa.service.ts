import { Injectable, NotFoundException } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { UsuariosRepository } from '../auth/usuarios.repository';
import { HorariosService } from '../horarios/horarios.service';
import { VisitasFallidasService } from '../visitas-fallidas/visitas-fallidas.service';
import { RtMapaRepository } from './rt-mapa.repository';
import { DatosEdificioRt, MapaRt } from './rt-mapa.types';

/** Un edificio está resuelto en el día cuando todos sus equipos tienen una inspección de hoy; uno sin equipos no se da por resuelto. */
export const edificioResueltoHoy = (d: Pick<DatosEdificioRt, 'maquinas' | 'inspeccionadasHoy'>): boolean => d.maquinas > 0 && d.inspeccionadasHoy >= d.maquinas;

/** El mapa de la pantalla inicial del RT (HU-16 RF-01). */
@Injectable()
export class RtMapaService {
  constructor(
    private readonly visitas: VisitasFallidasService,
    private readonly horarios: HorariosService,
    private readonly repo: RtMapaRepository,
    private readonly usuarios: UsuariosRepository,
  ) {}

  /**
   * Los edificios del RT que siguen pendientes hoy. La base ya los limita a los que el RT tiene asignados (RLS); acá se sacan además
   * los bloqueados, los que ya tienen una visita fallida de hoy y los resueltos en el día (todos sus equipos inspeccionados).
   */
  async obtener(quien: UsuarioAutenticado): Promise<MapaRt> {
    const rt = await this.usuarios.buscarPorId(quien.id);
    if (!rt) throw new NotFoundException('No existe ese usuario.');
    const pendientes = await this.visitas.getRecorrido('rt_calle'); // sin bloqueados ni visita fallida de hoy
    const datos = await this.repo.datos(pendientes.map((e) => e.id));
    const edificios = [];
    for (const e of pendientes) {
      const d = datos.get(e.id);
      if (!d || edificioResueltoHoy(d)) continue;
      const h = await this.horarios.obtener(e.id);
      edificios.push({ id: e.id, nombre: e.nombre, direccion: e.direccion, ubicacion: d.ubicacion, aCoordinar: h.aCoordinar, franjas: h.franjas });
    }
    return { rt: { nombre: rt.nombre, zona: rt.zona }, ahora: new Date().toISOString(), feriados: this.horarios.getFeriados(), edificios };
  }
}
