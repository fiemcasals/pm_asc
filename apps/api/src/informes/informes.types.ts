/** Informe consolidado de la visita a un edificio (HU-18 RF-01): los equipos inspeccionados y la firma única del encargado, o «Sin firma». */
export const CARACTERES_FIRMANTE = ['Encargado', 'Administrador', 'Propietario'] as const;
export type CaracterFirmante = (typeof CARACTERES_FIRMANTE)[number];

export const TIPOS_EQUIPO = ['traccion', 'hidraulico', 'montavehiculos'] as const;
export const ESTADOS_EQUIPO = ['en_uso', 'fuera_de_servicio'] as const;

export interface EquipoInforme {
  maquinaId: string;
  referenciaAgc: string;
  tipo: (typeof TIPOS_EQUIPO)[number];
  estadoEquipo: (typeof ESTADOS_EQUIPO)[number];
  /** Respuestas por solapa: { solapaId: { itemId: opcionId } }. */
  respuestas: Record<string, Record<string, string>>;
  /** Observaciones por solapa. */
  observaciones: Record<string, string>;
  /** Fotos de las anomalías, por clave de solapa e ítem. */
  fotos: Record<string, unknown>;
}

/** Un punto del trazo de la firma, en píxeles del lienzo. */
export type Punto = [number, number];

export interface FirmaInforme {
  nombre: string;
  apellido: string;
  caracter: CaracterFirmante;
  /** Sólo los dígitos; opcional. */
  dni: string | null;
  /** La firma dibujada con el dedo (PNG en data URL). */
  imagen: string;
  /** Los trazos que la forman: sirven para comprobar que no está vacía. */
  trazos: Punto[][];
}

export interface SinFirmaInforme {
  motivo: string;
  /** Foto (data URL de imagen) que respalda el motivo. */
  foto: string;
}

export interface InformeVisita {
  id: string;
  consorcioId: string;
  /** El RT de Calle que cerró el informe: siempre el de la sesión. */
  usuario: string;
  equipos: EquipoInforme[];
  firma: FirmaInforme | null;
  sinFirma: SinFirmaInforme | null;
  /** «Sin firma»: lo tienen que ver la Secretaría y el Firmante (el Firmante decide, HU-18 RF-01). */
  requiereRevision: boolean;
  /** Hora que marcaba el celular al cerrar. */
  horaDispositivo: string;
  /** Hora del servidor al cerrar: la fija la API y forma parte del sello. */
  horaServidor: string;
  /**
   * Identificador generado en el celular al cerrar el informe (HU-18 RNF-02): reenviar el mismo informe no lo duplica. NO forma parte del sello,
   * porque es lo que usa el celular para reintentar y el hash se calcula en el servidor.
   */
  clientReportId: string | null;
  /** SHA-256 (hex) del informe cerrado: contenido, firma y fotos. null en informes anteriores al sellado. */
  hashSha256: string | null;
  versionHash: string | null;
}

export type InformeNuevo = Omit<InformeVisita, 'id' | 'usuario' | 'horaServidor' | 'hashSha256' | 'versionHash'>;

/** El resultado de cerrar un informe: `creado: false` si ya existía uno con el mismo identificador del celular (se devuelve el original). */
export interface ResultadoCierre {
  informe: InformeVisita;
  creado: boolean;
}

/** El identificador del celular: 8 a 100 caracteres de letras, números, guion y guion bajo (un UUID entra). */
export const CLIENT_REPORT_ID = /^[A-Za-z0-9_-]{8,100}$/;

/** Lo que se sella: todo el informe menos el propio hash. Cambiar cualquier dato (una foto, la firma, una hora) cambia el hash. */
export type ContenidoSellado = Omit<InformeVisita, 'hashSha256' | 'versionHash' | 'clientReportId'>;

/** Versión de la forma de calcular el hash (JSON canónico con las claves ordenadas, SHA-256). */
export const VERSION_HASH = 'sha256-v1';

/** Un intento de modificar o borrar un informe cerrado (HU-18 RNF-01): se rechaza con 409 y queda registrado. */
export interface IntentoModificacion {
  id: string;
  informeId: string;
  usuario: string;
  rol: string;
  metodo: string;
  fecha: string;
}

/** Una verificación del sello: el hash guardado contra el que se recalcula hoy del contenido guardado. */
export interface VerificacionInforme {
  id: string;
  informeId: string;
  usuario: string;
  rol: string;
  hashGuardado: string | null;
  hashCalculado: string;
  coincide: boolean;
  verificadoEn: string;
}

export interface AuditoriaInforme {
  informeId: string;
  verificaciones: VerificacionInforme[];
  intentosModificacion: IntentoModificacion[];
}

/** Lo que se lista de un informe, sin la firma ni las fotos. */
export interface ResumenInforme {
  id: string;
  consorcioId: string;
  usuario: string;
  equipos: number;
  firmante: string | null;
  motivoSinFirma: string | null;
  requiereRevision: boolean;
  horaDispositivo: string;
  horaServidor: string;
  hashSha256: string | null;
}

export const MIN_PUNTOS_FIRMA = 8;
export const MIN_TAMANO_FIRMA_PX = 15;
export const MIN_MOTIVO = 10;
export const MAX_MOTIVO = 500;
/** El cuerpo de un informe puede llevar fotos y firma: el límite del JSON se sube para esa ruta. */
export const LIMITE_CUERPO = '25mb';
