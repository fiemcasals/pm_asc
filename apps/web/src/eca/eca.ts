export type EstadoOperativo = 'Normal' | 'Fuera de Servicio' | 'Reparación Urgente';

export type TipoAlertaCritica = 'FUERA_DE_SERVICIO' | 'REPARACION_URGENTE';

export interface ChecklistItemCritico {
  item: string;
  estado: 'Critico' | 'Falla' | 'Peligro';
  observaciones: string;
}

export interface AlertaCritica {
  id: string;
  tipo: TipoAlertaCritica;
  titulo: string;
  motivo: string;
  fotografiaCabinaTrabada?: string | null;
  checklist?: ChecklistItemCritico[];
  fechaDeteccion: string;
  remitoUrl?: string;
  acuseRecibo?: {
    fechaHora: string;
    usuario: string;
  } | null;
}

export interface CoberturaEca {
  eca: string;
  mes: string;
  totalMaquinas: number;
  inspeccionadas: number;
  firmadas: number;
  pendientes: number;
  advertencias: number;
  alertasCriticas?: number;
  porcentajeInspeccionadas: number;
  porcentajeFirmadas: number;
  porcentajeCobertura: number;
}

export interface MaquinaEca {
  id: string;
  codigoAGC: string;
  nombre: string;
  edificio: {
    id: string;
    direccion: string;
    administracion: string;
    consorcio: string;
  };
  eca: string;
  rtCalle: string;
  mes: string;
  estado: 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';
  estadoOperativo?: EstadoOperativo;
  alertaCritica?: AlertaCritica | null;
  visita: {
    id: string;
    fecha: string;
    inspector: string;
    estado: string;
    motivoAdvertencia?: string;
    autorizada: boolean;
    protocoloAGC?: string | null;
  } | null;
}

export interface FetchResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

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

export interface RemitoTecnico {
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

export async function descargarRemitoTecnico(
  alertaId: string,
  usuario?: string,
): Promise<FetchResult<RemitoTecnico>> {
  try {
    const params = new URLSearchParams();
    if (usuario) params.set('usuario', usuario);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/eca/remito/${alertaId}${query}`);

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo descargar el remito técnico` };
    }

    const data = (await res.json()) as RemitoTecnico;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al descargar remito técnico',
    };
  }
}

export interface MensajeAlertaWhatsAppInput {
  telefonoDestino?: string;
  nombreEca: string;
  consorcio: string;
  equipo: string;
  estado: string;
  detalle: string;
  remitoUrl?: string;
  fechaDeteccion?: string;
}

export interface WhatsAppEnvioResult {
  ok: boolean;
  idMensaje: string;
  telefonoDestino: string;
  mensajeFormateado: string;
  intentos: number;
  timestampEnvio: string;
  tiempoRespuestaMs: number;
  estadoEntrega: 'entregado' | 'enviado' | 'fallido';
  error?: string;
}

export async function enviarAlertaWhatsApp(
  input: MensajeAlertaWhatsAppInput,
): Promise<FetchResult<WhatsAppEnvioResult>> {
  try {
    const res = await fetch('/api/whatsapp/enviar-alerta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo despachar por WhatsApp` };
    }

    const data = (await res.json()) as WhatsAppEnvioResult;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al enviar alerta por WhatsApp',
    };
  }
}

export interface TriggerWhatsAppResult {
  ok: boolean;
  idMensaje: string;
  telefonoDestino: string;
  duracionMs: number;
  menorA5Segundos: boolean;
  timestampDisparo: string;
  enlaceDirecto: string;
  mensajeFormateado: string;
}

export async function triggerAlertaWhatsAppInmediata(
  alertaId?: string,
  maquinaId?: string,
): Promise<FetchResult<TriggerWhatsAppResult>> {
  try {
    const res = await fetch('/api/whatsapp/trigger-alerta-critica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertaId, maquinaId }),
    });

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: fallo en trigger de WhatsApp` };
    }

    const data = (await res.json()) as TriggerWhatsAppResult;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al conectar con trigger de WhatsApp',
    };
  }
}

export async function fetchAlertasEca(
  ecaName: string = 'Conservación Porteña S.R.L.',
  mes: string = '2026-11',
): Promise<FetchResult<AlertasEcaResponse>> {
  try {
    const params = new URLSearchParams({ eca: ecaName, mes });
    const res = await fetch(`/api/eca/alertas?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo obtener alertas de la flota` };
    }

    const data = (await res.json()) as AlertasEcaResponse;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}

export async function fetchCoberturaEca(
  ecaName: string = 'Conservación Porteña S.R.L.',
  mes: string = '2026-11',
): Promise<FetchResult<CoberturaEca>> {
  try {
    const params = new URLSearchParams({ eca: ecaName, mes });
    const res = await fetch(`/api/eca/cobertura?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo obtener cobertura` };
    }

    const data = (await res.json()) as CoberturaEca;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}

export async function fetchMaquinasEca(
  ecaName: string = 'Conservación Porteña S.R.L.',
  mes: string = '2026-11',
): Promise<FetchResult<MaquinaEca[]>> {
  try {
    const params = new URLSearchParams({ eca: ecaName, mes });
    const res = await fetch(`/api/eca/maquinas?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo obtener máquinas de la flota` };
    }

    const data = (await res.json()) as MaquinaEca[];
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}

/**
 * Determina el color semántico según el nivel de cobertura alcanzado.
 */
export function getCoberturaColor(porcentaje: number): string {
  if (porcentaje >= 80) return '#15803d'; // Verde éxito
  if (porcentaje >= 40) return '#b45309'; // Amarillo alerta
  return '#b91c1c'; // Rojo crítico
}
