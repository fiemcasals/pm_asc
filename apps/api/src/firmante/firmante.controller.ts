import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { FirmanteService } from './firmante.service';
import {
  AutorizarFirmaDto,
  AutorizarFirmaResponse,
  MaquinaAsignada,
} from './firmante.types';

@Controller('firmante')
export class FirmanteController {
  constructor(private readonly firmanteService: FirmanteService) {}

  @Get('maquinas')
  async getMaquinas(
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-name') username?: string,
    @Query('mes') mes?: string,
  ): Promise<MaquinaAsignada[]> {
    const firmante = username || userId || 'gonza';
    return this.firmanteService.getMaquinasDelMes(firmante, mes);
  }

  @Post('autorizar')
  @HttpCode(HttpStatus.OK)
  async autorizar(
    @Body() dto: AutorizarFirmaDto,
    @Headers('x-user-name') username?: string,
  ): Promise<AutorizarFirmaResponse> {
    const firmante = username || 'gonza';
    return this.firmanteService.autorizarFirma(dto, firmante);
  }
}
