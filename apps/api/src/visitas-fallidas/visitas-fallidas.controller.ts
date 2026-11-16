import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { VisitasFallidasService } from './visitas-fallidas.service';
import {
  AnulacionRecargo,
  AnularRecargoDto,
  BloqueoConsorcioInfo,
  DesbloqueoEdificio,
  DesbloquearEdificioDto,
  EdificioRecorrido,
  LiquidacionConsorcioResultado,
  LiquidacionMaquinaDto,
  LiquidacionMaquinaResultado,
  ReporteVisitaFallidaDto,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
} from './visitas-fallidas.types';

@Controller('visitas-fallidas')
@Roles()
export class VisitasFallidasController {
  constructor(private readonly service: VisitasFallidasService) {}

  /**
   * Criterio 1: Registra y valida el reporte de visita fallida con foto del frente y GPS congelado.
   * Criterio 2: Al confirmarse Advertencia 1 o 2, despacha email formal a la administración del consorcio.
   */
  @Post()
  async registrar(
    @Body() dto: ReporteVisitaFallidaDto,
  ): Promise<VisitaFallidaRegistro> {
    return this.service.registrarVisitaFallida(dto);
  }

  /**
   * HU-07 / RF-02 Criterio 1:
   * Al acumularse la Advertencia 3, el edificio queda bloqueado en el tablero exhibiendo el aviso
   * "Cobro de Tercer Visita Habilitado".
   */
  @Get('consorcio/:consorcioId/bloqueo')
  async getBloqueo(
    @Param('consorcioId') consorcioId: string,
  ): Promise<BloqueoConsorcioInfo> {
    return this.service.getBloqueoConsorcio(consorcioId);
  }

  /**
   * HU-07 / RF-02 Criterio 2:
   * Facturación mensual por máquina sumando automáticamente recargo del 45% extra si tiene Advertencia 3.
   */
  @Post('liquidar-maquina')
  async liquidarMaquina(
    @Body() dto: LiquidacionMaquinaDto,
  ): Promise<LiquidacionMaquinaResultado> {
    return this.service.liquidarMaquina(dto);
  }

  /**
   * HU-07 RF-05: la Secretaría (o el Administrador) desbloquea el edificio, con motivo obligatorio; vuelve al recorrido del RT.
   */
  @Post('consorcio/:consorcioId/desbloquear')
  @Roles('secretaria', 'administrador')
  async desbloquear(
    @Param('consorcioId') consorcioId: string,
    @Body() dto: DesbloquearEdificioDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<DesbloqueoEdificio> {
    return this.service.desbloquearEdificio(consorcioId, dto, usuario.usuario);
  }

  /**
   * HU-07 RF-04: anula el recargo del 45 % de una máquina. Sólo el Administrador (otro rol recibe 403); el motivo es
   * obligatorio y queda registrado con el usuario de la sesión y la fecha.
   */
  @Post('recargos/anular')
  @Roles('administrador')
  async anularRecargo(
    @Body() dto: AnularRecargoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<AnulacionRecargo> {
    return this.service.anularRecargo(dto, usuario.usuario);
  }

  /**
   * HU-07 / RF-02 Criterio 2:
   * Liquidación mensual consolidada de consorcio con recargos del 45% aplicados a las máquinas.
   */
  @Get('consorcio/:consorcioId/liquidacion')
  async getLiquidacionConsorcio(
    @Param('consorcioId') consorcioId: string,
    @Query('periodo') periodo?: string,
    @Query('montoBase') montoBase?: string,
  ): Promise<LiquidacionConsorcioResultado> {
    const base = montoBase ? parseFloat(montoBase) : undefined;
    return this.service.liquidarConsorcio(consorcioId, periodo, base);
  }

  /**
   * Devuelve el historial y resumen de advertencias acumuladas por consorcio.
   */
  @Get('consorcio/:consorcioId')
  async getPorConsorcio(
    @Param('consorcioId') consorcioId: string,
  ): Promise<ResumenAdvertenciasConsorcio> {
    return this.service.getHistorialConsorcio(consorcioId);
  }

  /**
   * Lista todas las visitas fallidas registradas.
   */
  @Get()
  async getTodas(): Promise<VisitaFallidaRegistro[]> {
    return this.service.getTodas();
  }
}

/** HU-07 RF-05: la lista de edificios a visitar. Los edificios bloqueados no aparecen en la del RT de Calle. */
@Controller('recorrido')
export class RecorridoController {
  constructor(private readonly service: VisitasFallidasService) {}

  @Get()
  @Roles('rt_calle', 'secretaria', 'administrador')
  async recorrido(@UsuarioActual() usuario: UsuarioAutenticado): Promise<EdificioRecorrido[]> {
    return this.service.getRecorrido(usuario.rol);
  }
}
