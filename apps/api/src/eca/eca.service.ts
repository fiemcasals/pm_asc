import { Injectable, UnauthorizedException } from '@nestjs/common';
import { FirmanteService } from '../firmante/firmante.service';
import { CoberturaEcaResponse, MaquinaEca } from './eca.types';

@Injectable()
export class EcaService {
  constructor(private readonly firmanteService: FirmanteService) {}

  /**
   * Resuelve el nombre canónico de la ECA a partir del identificador provisto.
   */
  resolverEca(identificador?: string): string {
    if (!identificador || identificador.trim() === '') {
      return 'Conservación Porteña S.R.L.';
    }

    const term = identificador.trim().toLowerCase();
    if (term.includes('porteña') || term.includes('portena')) {
      return 'Conservación Porteña S.R.L.';
    }
    if (term.includes('san mart') || term.includes('san martin')) {
      return 'Elevadores San Martín';
    }
    if (term.includes('maicon')) {
      return 'MAICON Mantenimiento';
    }
    return identificador.trim();
  }

  /**
   * Obtiene la lista de máquinas pertenecientes a la flota de la ECA para un mes dado.
   */
  async getMaquinasFlota(
    ecaIdentificador?: string,
    mes: string = '2026-11',
  ): Promise<MaquinaEca[]> {
    const ecaCanonica = this.resolverEca(ecaIdentificador);
    const todas = this.firmanteService.getMaquinas();

    return todas.filter((m) => {
      const matchEca =
        m.eca.toLowerCase() === ecaCanonica.toLowerCase() ||
        m.eca.toLowerCase().includes(ecaCanonica.toLowerCase()) ||
        ecaCanonica.toLowerCase().includes(m.eca.toLowerCase());
      const matchMes = !mes || m.mes === mes;
      return matchEca && matchMes;
    });
  }

  /**
   * Calcula el porcentaje y las métricas de cobertura de flota (inspeccionadas y firmadas)
   * para la ECA en el mes consultado.
   */
  async getCobertura(
    ecaIdentificador?: string,
    mes: string = '2026-11',
  ): Promise<CoberturaEcaResponse> {
    const ecaCanonica = this.resolverEca(ecaIdentificador);
    const maquinas = await this.getMaquinasFlota(ecaCanonica, mes);

    const totalMaquinas = maquinas.length;
    const inspeccionadas = maquinas.filter((m) => m.estado === 'Recorrida').length;
    const firmadas = maquinas.filter((m) => Boolean(m.visita?.autorizada)).length;
    const pendientes = maquinas.filter((m) => m.estado === 'Pendiente de Visita').length;
    const advertencias = maquinas.filter((m) => m.estado === 'Advertencia').length;

    const porcentajeInspeccionadas =
      totalMaquinas > 0 ? Number(((inspeccionadas / totalMaquinas) * 100).toFixed(1)) : 0;

    const porcentajeFirmadas =
      totalMaquinas > 0 ? Number(((firmadas / totalMaquinas) * 100).toFixed(1)) : 0;

    // Cobertura global combinada: promedio ponderado de avance o porcentaje de inspeccionadas firmadas
    const porcentajeCobertura = porcentajeFirmadas;

    return {
      eca: ecaCanonica,
      mes,
      totalMaquinas,
      inspeccionadas,
      firmadas,
      pendientes,
      advertencias,
      porcentajeInspeccionadas,
      porcentajeFirmadas,
      porcentajeCobertura,
    };
  }
}
