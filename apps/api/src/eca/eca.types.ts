import {
  AlertaCritica,
  ChecklistItemCritico,
  EstadoOperativo,
  MaquinaAsignada,
  TipoAlertaCritica,
} from '../firmante/firmante.types';

export { AlertaCritica, ChecklistItemCritico, EstadoOperativo, TipoAlertaCritica };

export interface CoberturaEcaResponse {
  eca: string;
  mes: string;
  totalMaquinas: number;
  inspeccionadas: number;
  firmadas: number;
  pendientes: number;
  advertencias: number;
  alertasCriticas: number;
  porcentajeInspeccionadas: number;
  porcentajeFirmadas: number;
  porcentajeCobertura: number;
}

export type MaquinaEca = MaquinaAsignada;

export interface AlertaFlotaItem {
  maquinaId: string;
  codigoAGC: string;
  nombreMaquina: string;
  edificio: {
    id: string;
    direccion: string;
    administracion: string;
    consorcio: string;
  };
  eca: string;
  estadoOperativo: EstadoOperativo;
  alerta: AlertaCritica;
}

export interface AlertasEcaResponse {
  eca: string;
  mes: string;
  totalAlertas: number;
  alertas: AlertaFlotaItem[];
}

export interface AcuseReciboDto {
  usuario?: string;
}

export interface AcuseReciboResponse {
  ok: boolean;
  mensaje: string;
  alertaId: string;
  maquinaId: string;
  eca: string;
  acuse: {
    id: string;
    fechaHora: string;
    usuario: string;
    remitoUrl: string;
  };
}

export interface RemitoTecnicoResponse {
  id: string;
  alertaId: string;
  maquinaId: string;
  codigoAGC: string;
  nombreMaquina: string;
  edificio: {
    direccion: string;
    consorcio: string;
    administracion: string;
  };
  eca: string;
  tipoAlerta: TipoAlertaCritica;
  titulo: string;
  motivo: string;
  fotografiaCabinaTrabada?: string | null;
  checklist?: ChecklistItemCritico[];
  fechaDeteccion: string;
  acuseLegal: {
    registrado: boolean;
    fechaHora: string;
    usuario: string;
  };
}
