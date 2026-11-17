/** Aviso de una falla crítica a la ECA y al Firmante: nada sale hasta que la Secretaría lo aprueba (HU-11 RF-05). */
export type EstadoAviso = 'Pendiente de revisión' | 'Enviado' | 'Falló el envío';

export type CanalAviso = 'whatsapp_eca' | 'whatsapp_firmante' | 'email_eca';

export interface EnvioAviso {
  canal: CanalAviso;
  destino: string;
  ok: boolean;
  /** entregado / enviado / fallido / no_configurado (como informa el proveedor o el correo). */
  estado: string;
  motivo?: string;
  fecha: string;
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
