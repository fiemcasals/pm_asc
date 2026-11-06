import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EcaService } from './eca.service';
import {
  AcuseReciboDto,
  AcuseReciboResponse,
  AlertasEcaResponse,
  CoberturaEcaResponse,
  MaquinaEca,
  RemitoTecnicoResponse,
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

  @Get('remito/:alertaId')
  async descargarRemito(
    @Param('alertaId') alertaId: string,
    @Query('usuario') queryUsuario?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('x-eca-user') headerEcaUser?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<RemitoTecnicoResponse> {
    const usuario = queryUsuario || headerEcaUser || headerUserId;
    const remito = await this.ecaService.getRemitoTecnico(alertaId, usuario);

    if (res) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="remito-tecnico-${alertaId}.json"`,
      );
    }

    return remito;
  }

  @Post('alertas/:alertaId/acuse')
  async registrarAcuse(
    @Param('alertaId') alertaId: string,
    @Body() dto: AcuseReciboDto = {},
    @Headers('x-user-id') headerUserId?: string,
    @Headers('x-eca-user') headerEcaUser?: string,
  ): Promise<AcuseReciboResponse> {
    const usuario = dto.usuario || headerEcaUser || headerUserId;
    return this.ecaService.registrarAcuseRecibo(alertaId, usuario);
  }
}
