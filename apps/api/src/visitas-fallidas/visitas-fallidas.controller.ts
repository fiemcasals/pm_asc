import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { VisitasFallidasService } from './visitas-fallidas.service';
import {
  BloqueoConsorcioInfo,
  LiquidacionConsorcioResultado,
  LiquidacionMaquinaDto,
  LiquidacionMaquinaResultado,
  ReporteVisitaFallidaDto,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
} from './visitas-fallidas.types';

@Controller('visitas-fallidas')
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
