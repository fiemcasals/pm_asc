import {
  Controller,
  Get,
  Headers,
  Query,
} from '@nestjs/common';
import { EcaService } from './eca.service';
import {
  AlertasEcaResponse,
  CoberturaEcaResponse,
  MaquinaEca,
} from './eca.types';

@Controller('eca')
export class EcaController {
  constructor(private readonly ecaService: EcaService) {}

  @Get('cobertura')
  async getCobertura(
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<CoberturaEcaResponse> {
    const eca = ecaHeaderName || ecaHeaderId || ecaQuery;
    return this.ecaService.getCobertura(eca, mes);
  }

  @Get('maquinas')
  async getMaquinas(
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<MaquinaEca[]> {
    const eca = ecaHeaderName || ecaHeaderId || ecaQuery;
    return this.ecaService.getMaquinasFlota(eca, mes);
  }

  @Get('alertas')
  async getAlertas(
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<AlertasEcaResponse> {
    const eca = ecaHeaderName || ecaHeaderId || ecaQuery;
    const ecaCanonica = this.ecaService.resolverEca(eca);
    const alertas = await this.ecaService.getAlertasCriticas(ecaCanonica, mes);
    return {
      eca: ecaCanonica,
      mes,
      totalAlertas: alertas.length,
      alertas,
    };
  }
}
