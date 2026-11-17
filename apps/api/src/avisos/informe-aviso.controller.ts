import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AvisosService } from './avisos.service';
import { MENSAJE_ENLACE_INVALIDO, MENSAJE_ENLACE_VENCIDO, renderInformeAviso, renderMensaje } from './informe-publico';

/**
 * El enlace del aviso (HU-11 RF-06): abre el informe de esa falla sin iniciar sesión. Sin `@Roles` a propósito: la seguridad es el
 * token (256 bits, imposible de adivinar) y el vencimiento a los 7 días. Muestra sólo el informe de ese aviso.
 */
@Controller('informe-aviso')
export class InformeAvisoController {
  constructor(private readonly avisos: AvisosService) {}

  @Get(':token')
  ver(@Param('token') token: string, @Res() res: Response): void {
    // Nada de esto se guarda en cachés compartidas ni se indexa, y el enlace no se filtra por el Referer.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const r = this.avisos.informePorToken(token);
    if (r.resultado === 'vencido') {
      res.status(410).send(renderMensaje(MENSAJE_ENLACE_VENCIDO, MENSAJE_ENLACE_VENCIDO));
      return;
    }
    if (r.resultado === 'inexistente') {
      // Un token inexistente o alterado no revela nada: ni si existió ni de qué aviso era.
      res.status(404).send(renderMensaje(MENSAJE_ENLACE_INVALIDO, MENSAJE_ENLACE_INVALIDO));
      return;
    }
    res.status(200).send(renderInformeAviso(r.vista));
  }
}
