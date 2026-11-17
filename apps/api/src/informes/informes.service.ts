import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { aResumen, validarInforme } from './informes.logic';
import { InformesRepository } from './informes.repository';
import { InformeVisita, ResumenInforme } from './informes.types';

/** Informes consolidados de la visita, con la firma del encargado o «Sin firma» (HU-18 RF-01). */
@Injectable()
export class InformesService {
  constructor(private readonly repo: InformesRepository) {}

  /** Cierra el informe de un edificio que el RT tiene asignado. Los datos de la firma se validan acá además de en la pantalla. */
  async crear(cuerpo: unknown, usuario: string): Promise<InformeVisita> {
    const nuevo = validarInforme(cuerpo);
    if (!(await this.repo.existeEdificio(nuevo.consorcioId))) throw new NotFoundException('Edificio no encontrado');
    return this.repo.guardar(nuevo, usuario);
  }

  /** `?sinFirma=true` trae los que la Secretaría y el Firmante tienen que ver; `false` los firmados; sin el parámetro, todos. */
  async listar(sinFirma?: string): Promise<ResumenInforme[]> {
    if (sinFirma !== undefined && sinFirma !== 'true' && sinFirma !== 'false') throw new BadRequestException('sinFirma tiene que ser true o false');
    return (await this.repo.listar(sinFirma === undefined ? undefined : sinFirma === 'true')).map(aResumen);
  }

  async obtener(id: string): Promise<InformeVisita> {
    const i = await this.repo.obtener(id);
    if (!i) throw new NotFoundException('Informe no encontrado');
    return i;
  }
}
