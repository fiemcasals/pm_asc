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

  @Get('remito/:alertaId/informe')
  async verInformeMovil(
    @Param('alertaId') alertaId: string,
    @Res() res: Response,
  ): Promise<void> {
    const remito = await this.ecaService.getRemitoTecnico(alertaId);

    const checklistHtml = remito.checklist
      ? `
      <div style="margin-top: 18px; border: 1px solid #fed7aa; border-radius: 8px; overflow: hidden;">
        <div style="background: #fff7ed; padding: 10px 14px; font-weight: bold; color: #9a3412;">
          📋 Checklist de Seguridad Inspeccionado
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          ${remito.checklist
            .map(
              (item) => `
            <tr style="border-top: 1px solid #fed7aa;">
              <td style="padding: 8px 12px; font-weight: 600;">${item.item}</td>
              <td style="padding: 8px 12px; color: #b91c1c; font-weight: bold;">⚠️ ${item.estado}</td>
              <td style="padding: 8px 12px; color: #475569;">${item.observaciones}</td>
            </tr>
          `,
            )
            .join('')}
        </table>
      </div>
      `
      : '';

    const fotoHtml = remito.fotografiaCabinaTrabada
      ? `
      <div style="margin: 18px 0; text-align: center;">
        <img src="${remito.fotografiaCabinaTrabada}" alt="Foto de la falla" style="max-width: 100%; border-radius: 8px; border: 2px solid #b91c1c; max-height: 280px; object-fit: cover;" />
        <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">📷 Registro fotográfico de inspección técnica</div>
      </div>
      `
      : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Informe Técnico ${remito.codigoAGC} - MAICON S.R.L.</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 16px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { border-bottom: 2px solid #b91c1c; padding-bottom: 12px; margin-bottom: 16px; }
    .title { color: #991b1b; margin: 0 0 6px 0; font-size: 1.25rem; font-weight: 800; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; background: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
    .card { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; margin: 14px 0; }
    .footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">MAICON S.R.L. — REPORTE OFICIAL AGC</div>
      <h1 class="title">${remito.titulo}</h1>
      <div><strong>Equipo:</strong> ${remito.codigoAGC} - ${remito.nombreMaquina}</div>
      <div><strong>Edificio:</strong> ${remito.edificio.direccion} (${remito.edificio.consorcio})</div>
      <div><strong>Conservadora (ECA):</strong> ${remito.eca}</div>
    </div>

    <div class="card">
      <div style="font-weight: bold; color: #9f1239; margin-bottom: 6px;">DIAGNÓSTICO DE LA FALLA:</div>
      <div>${remito.motivo}</div>
    </div>

    ${fotoHtml}
    ${checklistHtml}

    <div class="footer">
      <div>✓ <strong>Acuse legal:</strong> Registrado el ${new Date(remito.acuseLegal.fechaHora).toLocaleString('es-AR')} por ${remito.acuseLegal.usuario}</div>
      <div style="margin-top: 4px;">Protocolo digital respaldado conforme ley de conservación y transporte vertical.</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
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
