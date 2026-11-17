/** Registro del inicio de una inspección en el edificio (HU-16 RF-02). */
export type RevisionInicio = 'no_requiere' | 'pendiente' | 'revisada';

export interface InicioInspeccion {
  id: string;
  consorcioId: string;
  /** El RT de Calle que inició: siempre el de la sesión. */
  usuario: string;
  gps: { latitud: number; longitud: number; precision: number };
  /** A cuántos metros del punto del edificio estaba; null si el edificio no tiene punto cargado. */
  distanciaM: number | null;
  /** Hora que marcaba el celular. */
  horaDispositivo: string;
  /** Hora del servidor al registrar: la fija la API y nadie la edita. */
  horaServidor: string;
  /** «Sin buena señal GPS»: no se pudo verificar la distancia, así que se exigió foto del frente y justificación. */
  sinBuenaSenal: boolean;
  fotoFrenteUrl: string | null;
  justificacion: string | null;
  /** «pendiente» si la Secretaría tiene que revisar la visita. */
  revision: RevisionInicio;
  revisadaPor: string | null;
  revisadaEn: string | null;
}

export interface InicioNuevo {
  consorcioId: string;
  gps: { latitud: number; longitud: number; precision: number };
  distanciaM: number | null;
  horaDispositivo: string;
  sinBuenaSenal: boolean;
  fotoFrenteUrl: string | null;
  justificacion: string | null;
}

/** A esta distancia o menos del edificio se puede iniciar la inspección (P1 del cliente). */
export const RADIO_PRESENCIA_M = 30;
/** Precisión del GPS (radio de error, en metros) por encima de la cual se considera «Sin buena señal GPS». Provisorio: configurable. */
export const PRECISION_MAX_POR_DEFECTO_M = 30;
