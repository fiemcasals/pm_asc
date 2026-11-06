import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { VisitasFallidasService } from './visitas-fallidas.service';
import {
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
