import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { EcaService } from './eca.service';
import { RemitoPdfService } from './remito-pdf.service';
import {
  AvisoSecretaria,
  AcuseReciboResponse,
  AlertasEcaResponse,
  CoberturaEcaResponse,
  MaquinaEca,
  RemitoTecnicoResponse,
} from './eca.types';

/**
 * Portal ECA (HU-15 RF-02). Las rutas piden sesión: un usuario ECA ve y descarga sólo lo de SU ECA (sale de la sesión: un header o
 * un parámetro con otra ECA se ignora); la Secretaría y el Administrador ven cualquier ECA, eligiéndola. El remito y el acuse
 * legal son de la ECA: los hace su usuario y queda a su nombre, no el que venga en la URL.
 */
@Controller('eca')
export class EcaController {
  constructor(
    private readonly ecaService: EcaService,
    private readonly remitoPdfService: RemitoPdfService,
  ) {}

  /** La ECA de un usuario con rol `eca` (de su sesión); `null` para la Secretaría y el Administrador, que eligen cuál mirar. */
  private ecaPropia(usuario: UsuarioAutenticado): string | null {
    if (usuario.rol !== 'eca') return null;
    if (!usuario.eca || usuario.eca.trim() === '') {
      throw new ForbiddenException('Tu usuario no tiene una ECA asignada: pedile al Administrador que la cargue.');
    }
    return usuario.eca;
  }

  @Get('cobertura')
  @Roles('eca', 'secretaria', 'administrador')
  async getCobertura(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<CoberturaEcaResponse> {
    const propia = this.ecaPropia(usuario);
    return this.ecaService.getCobertura(propia ?? (ecaHeaderName || ecaHeaderId || ecaQuery), mes, propia !== null);
  }

  @Get('maquinas')
  @Roles('eca', 'secretaria', 'administrador')
  async getMaquinas(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<MaquinaEca[]> {
    const propia = this.ecaPropia(usuario);
    return this.ecaService.getMaquinasFlota(propia ?? (ecaHeaderName || ecaHeaderId || ecaQuery), mes, propia !== null);
  }

  @Get('alertas')
  @Roles('eca', 'secretaria', 'administrador')
  async getAlertas(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Headers('x-eca-name') ecaHeaderName?: string,
    @Headers('x-eca-id') ecaHeaderId?: string,
    @Query('eca') ecaQuery?: string,
    @Query('mes') mes: string = '2026-11',
  ): Promise<AlertasEcaResponse> {
    const propia = this.ecaPropia(usuario);
    const ecaCanonica = propia ?? this.ecaService.resolverEca(ecaHeaderName || ecaHeaderId || ecaQuery);
    const alertas = await this.ecaService.getAlertasCriticas(ecaCanonica, mes, propia !== null);
    return {
      eca: ecaCanonica,
      mes,
      totalAlertas: alertas.length,
      alertas,
    };
  }

  /** HU-10 RF-04: las alertas que la ECA no acusó en 48 horas (aviso a la Secretaría), con el edificio y la ECA. */
  @Get('avisos-secretaria')
  @Roles('secretaria', 'administrador')
  async getAvisosSecretaria(): Promise<AvisoSecretaria[]> {
    return this.ecaService.getAvisosSecretaria();
  }

  /** Sólo la ECA descarga su remito: la descarga registra el acuse de recibo legal a nombre de su usuario (el de la sesión). */
  @Get('remito/:alertaId')
  @Roles('eca')
  async descargarRemito(
    @Param('alertaId') alertaId: string,
    @UsuarioActual() sesion: UsuarioAutenticado,
    @Query('formato') queryFormato?: string,
    @Req() req?: Request,
    @Res() res?: Response,
  ): Promise<RemitoTecnicoResponse | void> {
    const remito = await this.ecaService.getRemitoTecnico(alertaId, sesion.usuario, { ecaPermitida: this.ecaPropia(sesion) ?? undefined });

    const accept = req?.headers['accept'];
    const esPdf =
      queryFormato === 'pdf' ||
      (typeof accept === 'string' && accept.includes('application/pdf'));

    if (esPdf) {
      const pdfBuffer = await this.remitoPdfService.generarPdf(remito);
      const filename = `remito-tecnico-${remito.codigoAGC || alertaId}-${alertaId}.pdf`;

      if (res) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"`,
        );
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('x-acuse-fecha-hora', remito.acuseLegal.fechaHora);
        res.setHeader('x-acuse-usuario', encodeURIComponent(remito.acuseLegal.usuario));
        res.setHeader('x-codigo-agc', remito.codigoAGC);
        res.setHeader('x-alerta-id', remito.alertaId);
        res.end(pdfBuffer);
        return;
      }
      return;
    }

    // Por compatibilidad (APIs y pruebas existentes en formato JSON)
    if (res) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="remito-tecnico-${alertaId}.json"`,
      );
      res.setHeader('Content-Type', 'application/json');
      res.json(remito);
      return;
    }

    return remito;
  }

  @Get('remito/:alertaId/informe')
  async verInformeMovil(
    @Param('alertaId') alertaId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Sólo lectura: abrir este enlace no registra ningún acuse (HU-15 RF-02). El enlace con sesión o firmado llega con HU-11.
    const remito = await this.ecaService.getRemitoTecnico(alertaId, undefined, { registrarAcuse: false });

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
      <div>${
        remito.acuseLegal.registrado
          ? `✓ <strong>Acuse legal:</strong> Registrado el ${new Date(remito.acuseLegal.fechaHora).toLocaleString('es-AR')} por ${remito.acuseLegal.usuario}`
          : '<strong>Acuse legal:</strong> pendiente: lo registra la ECA al descargar el remito'
      }</div>
      <div style="margin-top: 4px;">Protocolo digital respaldado conforme ley de conservación y transporte vertical.</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** Sólo la ECA acusa recibo, y queda a nombre del usuario de la sesión (un `usuario` en el cuerpo o en un header se ignora). */
  @Post('alertas/:alertaId/acuse')
  @Roles('eca')
  async registrarAcuse(
    @Param('alertaId') alertaId: string,
    @UsuarioActual() sesion: UsuarioAutenticado,
  ): Promise<AcuseReciboResponse> {
    return this.ecaService.registrarAcuseRecibo(alertaId, sesion.usuario, this.ecaPropia(sesion) ?? undefined);
  }
}
