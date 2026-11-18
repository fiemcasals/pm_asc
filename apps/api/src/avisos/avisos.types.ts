/** Aviso de una falla crítica a la ECA y al Firmante: nada sale hasta que la Secretaría lo aprueba (HU-11 RF-05). */
export type EstadoAviso = 'Pendiente de revisión' | 'Enviado' | 'Falló el envío';

export type CanalAviso = 'whatsapp_eca' | 'whatsapp_firmante' | 'email_eca';

export interface EnvioAviso {
  canal: CanalAviso;
  destino: string;
  ok: boolean;
  /** entregado / enviado / Envío fallido / no_configurado (como informa el proveedor o el correo). */
  estado: string;
  motivo?: string;
  fecha: string;
  /** Archivo PDF legal adjunto cuando el canal es `email_eca`. */
  archivoPdf?: string;
  pdfSha256?: string;
}

/** Constancia del envío del PDF legal MAICON S.R.L. por correo a la ECA (HU-06 RF-02). */
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
  /** El informe de falla crítica (o la alerta de la máquina) que lo originó. */
  alertaId: string;
  maquinaId: string;
  consorcio: string;
  direccion: string;
  equipo: string;
  eca: string;
  firmanteUsername: string;
  detalle: string;
  enlaceInforme: string;
  estado: EstadoAviso;
  creadoEn: string;
  /** Quién aprobó el envío y cuándo (HU-11 RF-05, criterio 4). */
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  /** Hasta cuándo sirve el enlace del informe que va en el aviso (7 días desde el envío); null mientras no se envió (HU-11 RF-06). */
  enlaceVenceEn: string | null;
  /** El enlace del informe que viaja en el aviso; sólo lo ven la Secretaría y el Administrador (si el WhatsApp falla se puede mandar a mano). */
  enlace: string | null;
  /** Constancia formal del envío del PDF legal MAICON S.R.L. por email a la ECA (HU-06 RF-02). */
  constanciaEmailLegal: ConstanciaEmailLegal | null;
  /** Cada envío intentado al aprobar (WhatsApp a la ECA y al Firmante, y el correo a la ECA). */
  envios: EnvioAviso[];
}

/** Destinos que se pueden indicar al aprobar; sin ellos se usan los provisorios (todavía no hay agenda de contactos por ECA). */
export interface DestinosAviso {
  telefonoEca?: string;
  telefonoFirmante?: string;
  emailEca?: string;
}

export const DESTINOS_PROVISORIOS = {
  telefonoEca: '+5491144009988',
  telefonoFirmante: '+5491155000001',
  emailEca: 'avisos-eca@maicon.com.ar',
} as const;

/** El enlace del aviso vence a los 7 días del envío (HU-11 RF-06). */
export const VENCIMIENTO_ENLACE_MS = 7 * 24 * 60 * 60 * 1000;
