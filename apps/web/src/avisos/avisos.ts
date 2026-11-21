/** Bandeja de avisos de falla crítica de la Secretaría (HU-11 RF-05): lógica sin React. */

export type EstadoAviso = 'Pendiente de revisión' | 'Enviado' | 'Falló el envío';

export interface EnvioAviso {
  canal: 'whatsapp_eca' | 'whatsapp_firmante' | 'email_eca';
  destino: string;
  ok: boolean;
  estado: string;
  motivo?: string;
  /** Id del mensaje del proveedor: identifica el registro exacto del historial (HU-11 RF-14). */
  idMensaje?: string;
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

/** Lo que informa GET /api/whatsapp/estado: sólo si hay proveedor y cuál, nunca credenciales (HU-11 RF-10). */
export interface EstadoWhatsApp {
  configurado: boolean;
  proveedor: 'meta' | 'twilio' | 'custom' | null;
}

export interface CartelWhatsApp {
  tipo: 'activo' | 'no_configurado' | 'sin_estado';
  texto: string;
}

export const TEXTO_WHATSAPP_NO_CONFIGURADO = 'WhatsApp no configurado: los avisos aprobados no salen por WhatsApp';
export const TEXTO_WHATSAPP_SIN_ESTADO = 'No se pudo consultar el estado de WhatsApp. Podés aprobar los avisos igual: el resultado de cada envío figura abajo.';

const NOMBRE_PROVEEDOR: Record<NonNullable<EstadoWhatsApp['proveedor']>, string> = {
  meta: 'Meta',
  twilio: 'Twilio',
  custom: 'proveedor propio',
};

/** El cartel de arriba de la bandeja. `null` es que no se pudo consultar el estado. No lleva credenciales ni teléfonos. */
export function cartelWhatsApp(estado: EstadoWhatsApp | null): CartelWhatsApp {
  if (estado === null) return { tipo: 'sin_estado', texto: TEXTO_WHATSAPP_SIN_ESTADO };
  if (!estado.configurado || estado.proveedor === null) return { tipo: 'no_configurado', texto: TEXTO_WHATSAPP_NO_CONFIGURADO };
  return { tipo: 'activo', texto: `WhatsApp activo: ${NOMBRE_PROVEEDOR[estado.proveedor]}` };
}

export async function cargarEstadoWhatsApp(enviar: Enviar): Promise<EstadoWhatsApp | null> {
  try {
    const res = await enviar('/api/whatsapp/estado');
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<EstadoWhatsApp> | null;
    if (!json || typeof json.configurado !== 'boolean') return null;
    return { configurado: json.configurado, proveedor: json.proveedor ?? null };
  } catch {
    return null;
  }
}

/** Un envío del historial de WhatsApp, tal como lo confirma el proveedor (HU-11 RF-09). */
export interface RegistroEnvioWhatsApp {
  alertaId?: string;
  /** Id del mensaje del proveedor (wamid o SM); vacío si no salió. */
  idMensaje?: string;
  telefonoDestino: string;
  estadoEntrega: 'aceptado' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'no_configurado' | 'sin_telefono';
  motivo?: string;
  errorProveedor?: { codigo?: string; mensaje?: string };
  timestamp: string;
}

export async function cargarHistorialWhatsApp(enviar: Enviar): Promise<RegistroEnvioWhatsApp[] | null> {
  try {
    const res = await enviar('/api/whatsapp/historial');
    if (!res.ok) return null;
    const json = (await res.json()) as { registros?: RegistroEnvioWhatsApp[] } | null;
    return Array.isArray(json?.registros) ? json.registros : null;
  } catch {
    return null;
  }
}

export interface EstadoRealEnvio {
  tipo: 'aceptado' | 'enviado' | 'entregado' | 'leido' | 'fallo' | 'no_salio';
  texto: string;
}

/**
 * El estado de un envío de WhatsApp con lo que confirmó el proveedor: Enviado, Entregado, Leído o Falló con el motivo
 * que informó (HU-11 RF-10). Devuelve `null` si no es un WhatsApp o si el historial no tiene ese envío (por ejemplo,
 * después de reiniciar la API): ahí la pantalla muestra lo que guardó el aviso.
 */
export function estadoRealDeEnvio(
  envio: Pick<EnvioAviso, 'canal' | 'destino' | 'idMensaje'>,
  alertaId: string,
  registros: readonly RegistroEnvioWhatsApp[] | null,
): EstadoRealEnvio | null {
  if (envio.canal === 'email_eca' || !registros) return null;
  // Con el id de mensaje se toma su registro exacto: después de un reintento, el envío que falló sigue mostrando su fallo (HU-11 RF-14).
  const registro = envio.idMensaje
    ? registros.find((r) => r.idMensaje === envio.idMensaje)
    : registros
        .filter((r) => r.alertaId === alertaId && r.telefonoDestino === envio.destino)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  if (!registro) return null;

  switch (registro.estadoEntrega) {
    case 'aceptado':
      return { tipo: 'aceptado', texto: 'Aceptado por WhatsApp: todavía sin confirmación de entrega' };
    case 'enviado':
      return { tipo: 'enviado', texto: 'Enviado' };
    case 'entregado':
      return { tipo: 'entregado', texto: 'Entregado' };
    case 'leido':
      return { tipo: 'leido', texto: 'Leído' };
    case 'fallido': {
      const codigo = registro.errorProveedor?.codigo ? ` (código ${registro.errorProveedor.codigo})` : '';
      const motivo = registro.errorProveedor?.mensaje ?? registro.motivo ?? 'el proveedor no informó el motivo';
      return { tipo: 'fallo', texto: `Falló: ${motivo}${codigo}` };
    }
    default:
      return { tipo: 'no_salio', texto: `No salió: ${registro.motivo ?? registro.estadoEntrega}` };
  }
}

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
