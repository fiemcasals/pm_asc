import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { AvisosService } from './avisos.service';
import { AvisoFalla, DestinosAviso } from './avisos.types';

/** Bandeja de avisos de falla crítica de la Secretaría (HU-11 RF-05 y HU-06 RF-02). */
@Controller('avisos')
@Roles('secretaria', 'administrador')
export class AvisosController {
  constructor(private readonly service: AvisosService) {}

  /** La bandeja. `?estado=Pendiente de revisión` trae sólo los que esperan revisión. */
  @Get()
  listar(@Query('estado') estado?: string): AvisoFalla[] {
    return this.service.listar(estado);
  }

  @Get(':id')
  obtener(@Param('id') id: string): AvisoFalla {
    return this.service.obtener(id);
  }

  /** Genera y descarga el PDF legal con membrete MAICON S.R.L. de un aviso (HU-06 RF-02). */
  @Get(':id/pdf-legal')
  async descargarPdfLegal(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const pdf = await this.service.generarPdfLegal(id);
    res.setHeader('Content-Type', pdf.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.setHeader('X-PDF-SHA256', pdf.sha256);
    res.send(pdf.buffer);
  }

  /** «Aprobar y enviar»: WhatsApp a la ECA y al Firmante y correo con PDF legal a la ECA, a nombre de quien aprueba. */
  @Post(':id/aprobar')
  aprobar(@Param('id') id: string, @Body() destinos: DestinosAviso, @UsuarioActual() usuario: UsuarioAutenticado): Promise<AvisoFalla> {
    return this.service.aprobar(id, { usuario: usuario.usuario }, destinos ?? {});
  }

  /** Reintenta únicamente el envío del email legal con PDF a la ECA cuando el envío anterior falló (HU-06 RF-02). */
  @Post(':id/reintentar-email')
  reintentarEmail(@Param('id') id: string, @Body() destinos: DestinosAviso): Promise<AvisoFalla> {
    return this.service.reintentarEmail(id, destinos ?? {});
  }
}
