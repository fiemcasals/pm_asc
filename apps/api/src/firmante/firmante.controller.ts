import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { FirmanteService } from './firmante.service';
import {
  AutorizarFirmaDto,
  AutorizarFirmaResponse,
  BandejaSecretaria,
  MaquinaAsignada,
  RechazarInformeDto,
  RechazarInformeResponse,
} from './firmante.types';

/**
 * Portal del Firmante (HU-08 RF-04). Piden sesión: un Firmante ve y firma sólo SUS máquinas (su identidad sale de la sesión, no de un
 * header); la Secretaría y el Administrador ven las de todos pero no autorizan ni rechazan: la autorización de la firma AGC es del Firmante.
 */
@Controller('firmante')
export class FirmanteController {
  constructor(private readonly firmanteService: FirmanteService) {}

  @Get('maquinas')
  @Roles('firmante', 'secretaria', 'administrador')
  async getMaquinas(
    @UsuarioActual() sesion: UsuarioAutenticado,
    @Query('mes') mes?: string,
    @Query('firmante') firmante?: string,
  ): Promise<MaquinaAsignada[]> {
    // Un Firmante ve las suyas (sin importar lo que pida). La Secretaría y el Administrador ven las de todos, o las del que elijan.
    return this.firmanteService.getMaquinasDelMes(sesion.rol === 'firmante' ? sesion.usuario : firmante, mes);
  }

  @Post('autorizar')
  @Roles('firmante')
  @HttpCode(HttpStatus.OK)
  async autorizar(@Body() dto: AutorizarFirmaDto, @UsuarioActual() sesion: UsuarioAutenticado): Promise<AutorizarFirmaResponse> {
    return this.firmanteService.autorizarFirma(dto, sesion.usuario, sesion.usuario);
  }

  /** HU-08 RF-03: el Firmante rechaza un informe con motivo obligatorio; vuelve a la Secretaría. */
  @Post('rechazar')
  @Roles('firmante')
  @HttpCode(HttpStatus.OK)
  async rechazar(@Body() dto: RechazarInformeDto, @UsuarioActual() sesion: UsuarioAutenticado): Promise<RechazarInformeResponse> {
    return this.firmanteService.rechazarInforme(dto, sesion.usuario, new Date(), sesion.usuario);
  }

  /** HU-08 RF-03: lo que vuelve a la Secretaría: informes rechazados con su motivo y avisos de plazo de 5 días hábiles vencido. */
  @Get('bandeja-secretaria')
  @Roles('secretaria', 'administrador')
  bandejaSecretaria(): BandejaSecretaria {
    return this.firmanteService.getBandejaSecretaria();
  }
}
