import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { PagosService } from './pagos.service';
import { CambioPago, PagoMaquina } from './pagos.types';

/** Abono mensual y porcentajes de pago por máquina (HU-02 RF-04). */
@Controller('consorcios/:consorcioId/maquinas/:maquinaId/pago')
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Get()
  @Roles('secretaria', 'administrador')
  obtener(@Param('consorcioId') consorcioId: string, @Param('maquinaId') maquinaId: string): Promise<PagoMaquina> {
    return this.service.obtener(consorcioId, maquinaId);
  }

  @Put()
  @Roles('secretaria', 'administrador')
  guardar(
    @Param('consorcioId') consorcioId: string,
    @Param('maquinaId') maquinaId: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ pago: PagoMaquina; cambios: CambioPago[] }> {
    return this.service.guardar(consorcioId, maquinaId, cuerpo, usuario.usuario);
  }

  @Get('historial')
  @Roles('secretaria', 'administrador')
  historial(@Param('consorcioId') consorcioId: string, @Param('maquinaId') maquinaId: string): Promise<CambioPago[]> {
    return this.service.historial(consorcioId, maquinaId);
  }
}
