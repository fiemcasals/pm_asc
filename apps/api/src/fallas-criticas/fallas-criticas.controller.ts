import { Body, Controller, Get, Header, Param, Post, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import { obtenerFallasCriticasDefinidas } from '../checklist/checklist.config';
import { FallasCriticasService } from './fallas-criticas.service';
import {
  EventoFallaCritica,
  FallaCritica,
  InformeFalla,
  RegistrarInformeResponse,
} from './fallas-criticas.types';

/** Cada cuánto se manda un `ping` por el canal para que ningún proxy corte la conexión ociosa. */
export const PING_MS = 25_000;

interface MensajeSse {
  type: string;
  data: string;
}

const ETIQUETAS_CHECKLIST: Record<string, string> = Object.fromEntries(
  obtenerFallasCriticasDefinidas().map((f) => [
    f.codigoFallaCritica,
    `${f.itemEtiqueta}: ${f.opcionEtiqueta}`,
  ]),
);

export const ETIQUETA_FALLA: Record<FallaCritica, string> = {
  ...ETIQUETAS_CHECKLIST,
  CABLES_DESGASTADOS: 'Cables de tracción desgastados',
  LIMITADOR_ANULADO: 'Limitador de velocidad anulado',
};

@Controller('fallas-criticas')
export class FallasCriticasController {
  constructor(private readonly service: FallasCriticasService) {}

  /** Lista de informes críticos activos para Secretaría y Firmante. */
  @Get('informes')
  listar(): EventoFallaCritica[] {
    return this.service.listarEventosCriticos();
  }

  /** El RT de calle carga el informe de una máquina. */
  @Post('informes')
  registrar(@Body() body: unknown): RegistrarInformeResponse {
    return this.service.registrarInforme(body);
  }

  /** Canal en tiempo real (Server-Sent Events) que escucha el panel de Secretaría. */
  @Sse('eventos')
  eventos(): Observable<MensajeSse> {
    const fallas = this.service
      .eventos$()
      .pipe(map((evento) => ({ type: 'falla-critica', data: JSON.stringify(evento) })));
    const pings = interval(PING_MS).pipe(map(() => ({ type: 'ping', data: '{}' })));
    return merge(fallas, pings);
  }

  /** El informe, legible en el navegador. Sólo lectura: no registra ningún acuse. */
  @Get('informes/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  verInforme(@Param('id') id: string): string {
    return renderInforme(this.service.obtenerInforme(id));
  }
}

function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderInforme(informe: InformeFalla): string {
  const fallas = informe.fallasCriticas.length
    ? `<ul>${informe.fallasCriticas.map((f) => `<li>${esc(ETIQUETA_FALLA[f] ?? f)}</li>`).join('')}</ul>`
    : '<p>Sin fallas críticas.</p>';
  const fotos = informe.fotografias.length
    ? informe.fotografias
        .map((url) => `<img src="${esc(url)}" alt="Fotografía del informe" />`)
        .join('')
    : '<p>Sin fotografías adjuntas.</p>';

  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Informe ${esc(informe.id)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f8fafc; color: #0f172a; }
  main { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
  h1 { font-size: 1.3rem; color: #b91c1c; margin-top: 0; }
  dt { font-weight: 600; margin-top: 8px; }
  dd { margin: 2px 0 0; }
  img { max-width: 100%; max-height: 280px; border-radius: 8px; margin: 6px 0; display: block; }
</style>
</head>
<body>
<main>
  <h1>Informe de falla crítica</h1>
  <dl>
    <dt>Informe</dt><dd>${esc(informe.id)}</dd>
    <dt>Máquina</dt><dd>${esc(informe.codigoAGC)} — ${esc(informe.nombreMaquina)}</dd>
    <dt>Edificio</dt><dd>${esc(informe.edificio.direccion)} (${esc(informe.edificio.consorcio)})</dd>
    <dt>ECA</dt><dd>${esc(informe.eca)}</dd>
    <dt>Inspector</dt><dd>${esc(informe.inspector)}</dd>
    <dt>Registrado</dt><dd>${esc(informe.registradoEn)}</dd>
  </dl>
  <h2>Fallas detectadas</h2>
  ${fallas}
  <h2>Observaciones</h2>
  <p>${informe.observaciones ? esc(informe.observaciones) : 'Sin observaciones.'}</p>
  <h2>Fotografías</h2>
  ${fotos}
</main>
</body>
</html>`;
}
