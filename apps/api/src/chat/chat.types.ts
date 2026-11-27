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
  /** Mensajes de otros que todavía no se leyeron en esta conversación (HU-19 RF-09). */
  noLeidos?: number;
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

/** Lo más largo que puede ser el texto de un mensaje (HU-19 RF-04). La caja de texto de la web usa el mismo número. */
export const LIMITE_CONTENIDO = 2000;

/** Lo más largo que puede ser la referencia de una máquina en un mensaje. */
export const LIMITE_MAQUINA = 40;

/** Los mensajes sin leer de un usuario, por conversación: la clave es «global» o el identificador del compañero (HU-19 RF-09). */
export type NoLeidosPorSala = Record<string, number>;

/** Lo que responde marcar una conversación como leída: lo que queda sin leer en ella y en total. */
export interface ResultadoLectura {
  sala: string;
  noLeidos: number;
  total: number;
}

/** Lo que hace falta de un mensaje sin leer para avisar de él: quién escribió y el comienzo del texto (sin la foto). HU-19 RF-10. */
export interface ResumenMensajeNoLeido {
  id: string;
  emisorNombre: string;
  /** Hasta los primeros 200 caracteres del texto: de ahí la pantalla muestra el comienzo. */
  contenido: string;
  conFoto: boolean;
  creadoEn: string;
}

/** Una conversación con mensajes sin leer y el último que le llegó a la persona (de otro). */
export interface ConversacionNoLeida {
  sala: string;
  noLeidos: number;
  ultimoMensaje: ResumenMensajeNoLeido;
}

/** Lo que responde GET /api/chat/no-leidos: el total de siempre y, además, lo necesario para avisar de lo que llega. */
export interface ResumenNoLeidos {
  total: number;
  conversaciones: ConversacionNoLeida[];
}
