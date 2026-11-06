export type EstadoVisita = 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';

export interface FotosObligatorias {
  cables: string;
  frente: string;
}

export interface VisitaInspeccion {
  id: string;
  fecha: string;
  inspector: string;
  estado: EstadoVisita;
  motivoAdvertencia?: string;
  fotosObligatorias?: FotosObligatorias | null;
  firmaEncargado?: string | null;
  nombreEncargado?: string | null;
  autorizada: boolean;
  fechaAutorizacion?: string | null;
  autorizadoPor?: string | null;
  protocoloAGC?: string | null;
}

export interface EdificioConsorcio {
  id: string;
  direccion: string;
  administracion: string;
  consorcio: string;
}

export interface MaquinaAsignada {
  id: string;
  codigoAGC: string;
  nombre: string;
  edificio: EdificioConsorcio;
  eca: string;
  rtCalle: string;
  firmanteId: string;
  firmanteUsername: string;
  mes: string;
  estado: EstadoVisita;
  visita: VisitaInspeccion | null;
}

export interface AutorizarFirmaDto {
  maquinaId?: string;
  visitaId?: string;
}

export interface AutorizarFirmaResponse {
  ok: boolean;
  mensaje: string;
  maquinaId: string;
  visitaId: string;
  autorizacion: {
    autorizada: boolean;
    fechaAutorizacion: string;
    autorizadoPor: string;
    protocoloAGC: string;
  };
}
