/** El informe que muestra el enlace del aviso (HU-11 RF-06): sólo los datos de ese aviso, sin sesión. */
export interface VistaInformeAviso {
  titulo: string;
  equipo: string;
  direccion: string;
  consorcio: string;
  eca: string;
  /** Cuándo se detectó o registró la falla (ISO). */
  fecha: string;
  /** Qué falló: las fallas críticas o el motivo de la alerta. */
  detalle: string[];
  observaciones: string;
  /** Fotos como data URL de imagen. */
  fotografias: string[];
}

export const MENSAJE_ENLACE_VENCIDO = 'Este enlace venció';
export const MENSAJE_ENLACE_INVALIDO = 'El enlace no es válido';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Todo lo que viene de personas (observaciones, nombres, causas) se escapa antes de ir al HTML. */
export const escaparHtml = (t: string): string => t.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Fotos que cargó el RT (URL http/https) o capturadas en el equipo (data URL de imagen). Otro esquema (javascript:, etc.) no se muestra. */
const FOTO_VALIDA = /^(https?:\/\/[^\s"'<>]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

const PAGINA = (titulo: string, cuerpo: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escaparHtml(titulo)} - MAICON S.R.L.</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 16px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; background: #fee2e2; color: #991b1b; }
    h1 { color: #991b1b; font-size: 1.25rem; margin: 10px 0; }
    .card { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; margin: 14px 0; }
    img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
  </style>
</head>
<body><div class="container">${cuerpo}</div></body>
</html>`;

export function renderInformeAviso(v: VistaInformeAviso): string {
  const fotos = v.fotografias.filter((f) => FOTO_VALIDA.test(f)).map((f) => `<img src="${escaparHtml(f)}" alt="Foto de la falla" />`).join('');
  return PAGINA(
    v.titulo,
    `<div class="badge">MAICON S.R.L. — REPORTE OFICIAL AGC</div>
    <h1>${escaparHtml(v.titulo)}</h1>
    <div><strong>Equipo:</strong> ${escaparHtml(v.equipo)}</div>
    <div><strong>Edificio:</strong> ${escaparHtml(v.direccion)} (${escaparHtml(v.consorcio)})</div>
    <div><strong>Conservadora (ECA):</strong> ${escaparHtml(v.eca)}</div>
    <div><strong>Fecha:</strong> ${escaparHtml(new Date(v.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }))}</div>
    <div class="card"><strong>Falla:</strong><ul>${v.detalle.map((d) => `<li>${escaparHtml(d)}</li>`).join('')}</ul>${v.observaciones ? `<div>${escaparHtml(v.observaciones)}</div>` : ''}</div>
    ${fotos}`,
  );
}

export const renderMensaje = (titulo: string, mensaje: string): string =>
  PAGINA(titulo, `<div class="badge">MAICON S.R.L.</div><h1>${escaparHtml(mensaje)}</h1>`);
