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
  horaDispositivo: string;
  horaServidor: string;
}

export type InformeNuevo = Omit<InformeVisita, 'id' | 'usuario' | 'horaServidor'>;

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
}

export const MIN_PUNTOS_FIRMA = 8;
export const MIN_TAMANO_FIRMA_PX = 15;
export const MIN_MOTIVO = 10;
export const MAX_MOTIVO = 500;
/** El cuerpo de un informe puede llevar fotos y firma: el límite del JSON se sube para esa ruta. */
export const LIMITE_CUERPO = '25mb';
