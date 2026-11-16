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
import { Roles } from '../auth/roles.guard';
import { FirmanteService } from './firmante.service';
import {
  AutorizarFirmaDto,
  AutorizarFirmaResponse,
  BandejaSecretaria,
  MaquinaAsignada,
  RechazarInformeDto,
  RechazarInformeResponse,
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

  /** HU-08 RF-03: el Firmante rechaza un informe con motivo obligatorio; vuelve a la Secretaría. */
  @Post('rechazar')
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Body() dto: RechazarInformeDto,
    @Headers('x-user-name') username?: string,
  ): Promise<RechazarInformeResponse> {
    return this.firmanteService.rechazarInforme(dto, username || 'gonza');
  }

  /** HU-08 RF-03: lo que vuelve a la Secretaría: informes rechazados con su motivo y avisos de plazo de 5 días hábiles vencido. */
  @Get('bandeja-secretaria')
  @Roles('secretaria', 'administrador')
  bandejaSecretaria(): BandejaSecretaria {
    return this.firmanteService.getBandejaSecretaria();
  }
}
