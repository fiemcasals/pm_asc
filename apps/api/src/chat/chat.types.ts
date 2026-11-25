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
