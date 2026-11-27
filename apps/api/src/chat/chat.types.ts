import { Rol } from '../auth/auth.types';

export type TipoSala = 'global' | 'directo';

export interface MensajeChat {
  id: string;
  emisorId: string;
  emisorNombre: string;
  emisorUsuario: string;
  emisorRol: Rol;
  destinatarioId: string | null;
  destinatarioNombre?: string | null;
  destinatarioUsuario?: string | null;
  tipoSala: TipoSala;
  contenido: string;
  adjuntoUrl?: string | null;
  consorcioId?: string | null;
  edificioNombre?: string | null;
  maquinaRef?: string | null;
  creadoEn: string;
}

export interface CanalChat {
  id: string;
  tipo: TipoSala;
  nombre: string;
  usuario?: string;
  rol?: Rol;
  ultimoMensaje?: string | null;
  ultimoMensajeHora?: string | null;
}

export interface ContactoChat {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
}

export interface CrearMensajeDto {
  tipoSala: TipoSala;
  destinatarioId?: string | null;
  contenido: string;
  adjuntoUrl?: string | null;
  consorcioId?: string | null;
  maquinaRef?: string | null;
}

/** Cuántos mensajes trae el hilo de una conversación por vez (HU-19 RF-02). */
export const LIMITE_HILO = 200;

export interface OpcionesHilo {
  /** Id del mensaje más viejo que ya se ve: trae los anteriores a ese. Sin él, trae los más nuevos. */
  antes?: string | null;
  /** Cuántos traer, de 1 a LIMITE_HILO. Por defecto LIMITE_HILO. */
  limite?: number;
}

/** Un tramo del hilo, de más viejo a más nuevo, y si quedan mensajes anteriores a él. */
export interface PaginaMensajes {
  mensajes: MensajeChat[];
  hayAnteriores: boolean;
}
