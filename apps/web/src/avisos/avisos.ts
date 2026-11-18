/** Bandeja de avisos de falla crítica de la Secretaría (HU-11 RF-05): lógica sin React. */

export type EstadoAviso = 'Pendiente de revisión' | 'Enviado' | 'Falló el envío';

export interface EnvioAviso {
  canal: 'whatsapp_eca' | 'whatsapp_firmante' | 'email_eca';
  destino: string;
  ok: boolean;
  estado: string;
  motivo?: string;
  fecha: string;
  archivoPdf?: string;
  pdfSha256?: string;
}

export interface ConstanciaEmailLegal {
  estado: 'Enviado' | 'Envío fallido' | 'No configurado';
  destino: string;
  remitente: string;
  fecha: string;
  archivoPdf: string;
  pdfSha256: string;
  tamanoBytes: number;
  intentos: number;
  motivo?: string;
}

export interface AvisoFalla {
  id: string;
  alertaId: string;
  consorcio: string;
  direccion: string;
  equipo: string;
  eca: string;
  detalle: string;
  enlaceInforme: string;
  estado: EstadoAviso;
  creadoEn: string;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  /** Hasta cuándo sirve el enlace del informe y el enlace mismo (sólo para la Secretaría). */
  enlaceVenceEn: string | null;
  enlace: string | null;
  constanciaEmailLegal?: ConstanciaEmailLegal | null;
  envios: EnvioAviso[];
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

const ETIQUETA_CANAL: Record<EnvioAviso['canal'], string> = {
  whatsapp_eca: 'WhatsApp a la ECA',
  whatsapp_firmante: 'WhatsApp al Firmante',
  email_eca: 'Correo a la ECA',
};

export const etiquetaCanal = (canal: EnvioAviso['canal']): string => ETIQUETA_CANAL[canal];

/** «Aprobar y enviar» está disponible mientras el aviso espera revisión o si falló y hay que reintentar. */
export function puedeAprobar(a: AvisoFalla): boolean {
  return a.estado === 'Pendiente de revisión' || a.estado === 'Falló el envío';
}

/** Primero los que esperan revisión, después los que fallaron y al final los enviados; dentro de cada grupo, los más viejos primero. */
export function ordenarBandeja(avisos: readonly AvisoFalla[]): AvisoFalla[] {
  const peso: Record<EstadoAviso, number> = { 'Pendiente de revisión': 0, 'Falló el envío': 1, Enviado: 2 };
  return [...avisos].sort((a, b) => peso[a.estado] - peso[b.estado] || a.creadoEn.localeCompare(b.creadoEn));
}

export async function cargarAvisos(enviar: Enviar): Promise<AvisoFalla[] | null> {
  try {
    const res = await enviar('/api/avisos');
    return res.ok ? ((await res.json()) as AvisoFalla[]) : null;
  } catch {
    return null;
  }
}

/** Aprueba el aviso: la API manda los envíos y devuelve el aviso actualizado, o el motivo si no se pudo. */
export async function aprobarAviso(id: string, enviar: Enviar): Promise<{ ok: true; aviso: AvisoFalla } | { ok: false; error: string }> {
  try {
    const res = await enviar(`/api/avisos/${encodeURIComponent(id)}/aprobar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = (await res.json()) as { message?: string | string[] } & AvisoFalla;
    if (!res.ok) return { ok: false, error: Array.isArray(json.message) ? json.message.join(' · ') : json.message || `No se pudo aprobar el aviso (error ${res.status})` };
    return { ok: true, aviso: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

/** Reintenta el envío del email con PDF legal a la ECA cuando el envío anterior quedó como Envío fallido. */
export async function reintentarEmailAviso(id: string, enviar: Enviar): Promise<{ ok: true; aviso: AvisoFalla } | { ok: false; error: string }> {
  try {
    const res = await enviar(`/api/avisos/${encodeURIComponent(id)}/reintentar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const json = (await res.json()) as { message?: string | string[] } & AvisoFalla;
    if (!res.ok) return { ok: false, error: Array.isArray(json.message) ? json.message.join(' · ') : json.message || `No se pudo reintentar el correo (error ${res.status})` };
    return { ok: true, aviso: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

/** Descarga el PDF legal con membrete MAICON S.R.L. de un aviso. */
export async function descargarPdfLegalAviso(id: string, enviar: Enviar): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  try {
    const res = await enviar(`/api/avisos/${encodeURIComponent(id)}/pdf-legal`);
    if (!res.ok) return { ok: false, error: `No se pudo generar el PDF legal (error ${res.status})` };
    const blob = await res.blob();
    return { ok: true, blob, filename: `deslinde-maicon-${id}.pdf` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}
