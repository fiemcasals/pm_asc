import { Body, Controller, Get, Header, HttpCode, Inject, Optional, Param, Post, Sse } from '@nestjs/common';
import { Observable, interval, map, merge, takeUntil, timer } from 'rxjs';
import { UsuarioAutenticado } from '../auth/auth.types';
import { Roles, UsuarioActual } from '../auth/roles.guard';
import { obtenerFallasCriticasDefinidas } from '../checklist/checklist.config';
import { APP_CONFIG, AppConfig } from '../config';
import { FallasCriticasService } from './fallas-criticas.service';
import {
  EventoFallaCritica,
  FallaCritica,
  InformeFalla,
  RegistrarInformeResponse,
} from './fallas-criticas.types';

/** Cada cuánto se manda un `ping` por el canal para que ningún proxy corte la conexión ociosa. */
export const PING_MS = 25_000;

/** Cuánto dura una conexión al canal si la configuración no dice otra cosa: 5 minutos (después el panel la reabre con la sesión). */
export const VIGENCIA_CANAL_POR_DEFECTO_MS = 5 * 60 * 1000;

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
  private readonly vigenciaCanalMs: number;

  constructor(
    private readonly service: FallasCriticasService,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    this.vigenciaCanalMs = config?.canalFallasVigenciaMs ?? VIGENCIA_CANAL_POR_DEFECTO_MS;
  }

  /** Lista de informes críticos activos para Secretaría y Firmante (el Firmante, sólo los de sus edificios). */
  @Get('informes')
  @Roles('secretaria', 'administrador', 'firmante')
  listar(@UsuarioActual() usuario: UsuarioAutenticado): EventoFallaCritica[] {
    return this.service.listarEventosCriticos(usuario);
  }

  /** HU-06 RF-04: el usuario abre la alerta; queda registrado el primero y la alarma deja de sonar en todas las pantallas. */
  @Post('informes/:id/abrir')
  @HttpCode(200)
  @Roles('secretaria', 'administrador', 'firmante')
  abrir(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.service.abrir(id, usuario);
  }

  /** El RT de calle carga el informe de una máquina. Sólo el RT lo registra y el inspector es el usuario de la sesión (HU-06 RF-06). */
  @Post('informes')
  @Roles('rt_calle')
  registrar(@Body() body: unknown, @UsuarioActual() usuario: UsuarioAutenticado): RegistrarInformeResponse {
    return this.service.registrarInforme(body, usuario.usuario);
  }

  /**
   * Canal en tiempo real (Server-Sent Events) que escucha el panel de Secretaría y el del Firmante (HU-06 RF-07). Pide sesión; un Firmante
   * recibe solo lo de sus edificios. Una conexión abierta no se vuelve a validar, así que el servidor la corta pasado `vigenciaCanalMs`:
   * el panel la reabre con la sesión (que se renueva o, si la revocaron, ya no entra).
   */
  @Sse('eventos')
  @Roles('secretaria', 'administrador', 'firmante')
  eventos(@UsuarioActual() usuario: UsuarioAutenticado): Observable<MensajeSse> {
    const fallas = this.service
      .eventosPara(usuario)
      .pipe(map((evento) => ({ type: 'falla-critica', data: JSON.stringify(evento) })));
    const aperturas = this.service
      .aperturasPara(usuario)
      .pipe(map((evento) => ({ type: 'falla-abierta', data: JSON.stringify(evento) })));
    const pings = interval(PING_MS).pipe(map(() => ({ type: 'ping', data: '{}' })));
    return merge(fallas, aperturas, pings).pipe(takeUntil(timer(this.vigenciaCanalMs)));
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
  // Las fallas críticas, con su nombre legible y agrupadas por zona (Sala de Máquinas, Cabina, Accesos, Caja, Fosa).
  const zonas = new Map<string, string[]>();
  for (const d of informe.fallasCriticasDetalle) zonas.set(d.zona, [...(zonas.get(d.zona) ?? []), d.nombre]);
  const fallas = informe.fallasCriticas.length
    ? [...zonas.entries()].map(([zona, nombres]) => `<h3>${esc(zona)}</h3><ul>${nombres.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`).join('')
    : '<p>Sin fallas críticas.</p>';
  const comunes = informe.fallasComunes.length
    ? `<h2>Otras fallas (no críticas)</h2><ul>${informe.fallasComunes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '';
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
  ${comunes}
  <h2>Observaciones</h2>
  <p>${informe.observaciones ? esc(informe.observaciones) : 'Sin observaciones.'}</p>
  <h2>Fotografías</h2>
  ${fotos}
</main>
</body>
</html>`;
}
