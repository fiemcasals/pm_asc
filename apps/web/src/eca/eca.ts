import { fetchConSesion } from '../auth/sesion';
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
  /** Si la alerta viene de un reporte de parada: la ruta para pedir su foto aparte, con sesión (HU-17 RF-12). */
  fotoRuta?: string | null;
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
  /** Si el Firmante todavía no confirmó el estado que marcó el RT (HU-06 RF-05). */
  confirmacionEstado?: 'Pendiente de confirmación' | 'Confirmado' | 'Rechazado';
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
  maquinaId?: string;
  codigoAGC?: string;
  nombreMaquina?: string;
  edificio?: {
    direccion: string;
    consorcio: string;
    administracion: string;
  };
  eca?: string;
  tipoAlerta?: TipoAlertaCritica;
  titulo?: string;
  motivo?: string;
  fotografiaCabinaTrabada?: string | null;
  checklist?: ChecklistItemCritico[];
  fechaDeteccion?: string;
  acuseLegal: {
    registrado: boolean;
    fechaHora: string;
    usuario: string;
  };
  blob?: Blob;
  filename?: string;
}

/**
 * El mensaje de una respuesta HTTP que no fue exitosa. 401 y 403 se explican (HU-15 RF-02: el portal pide sesión y cada rol ve lo suyo).
 * `soloEca`: la ruta es de la ECA (remito y acuse), así que un 403 significa que quien pide no es una ECA.
 */
export function mensajeDeError(status: number, accion: string, soloEca = false): string {
  if (status === 401) return 'La sesión venció: ingresá de nuevo.';
  if (status === 403) {
    return soloEca ? 'Sólo la ECA puede descargar el remito y registrar el acuse legal.' : 'Tu usuario no tiene acceso a esta información (o no tiene una ECA asignada).';
  }
  if (status === 404) return `No se encontró lo que se pidió (error 404): ${accion}`;
  return `Error ${status}: ${accion}`;
}

/**
 * Descarga el remito de la alerta en PDF. Lo hace la ECA con su sesión: el acuse legal queda a nombre de ese usuario
 * (el servidor lo toma de la sesión, no de lo que mande la pantalla).
 */
export async function descargarRemitoTecnico(alertaId: string): Promise<FetchResult<RemitoTecnico>> {
  try {
    const res = await fetchConSesion(`/api/eca/remito/${encodeURIComponent(alertaId)}?formato=pdf`, {
      headers: {
        Accept: 'application/pdf, application/json',
      },
    });

    if (!res.ok) {
      return { ok: false, error: mensajeDeError(res.status, 'no se pudo descargar el remito técnico', true) };
    }

    const contentType = res.headers?.get?.('content-type') || '';

    if (contentType.includes('application/pdf')) {
      const blob = typeof res.blob === 'function' ? await res.blob() : new Blob([], { type: 'application/pdf' });
      const fechaHora = res.headers?.get?.('x-acuse-fecha-hora') || new Date().toISOString();
      const acuseUsuario = decodeURIComponent(res.headers?.get?.('x-acuse-usuario') || '');
      const codigoAGC = res.headers?.get?.('x-codigo-agc') || 'M1';

      const dispo = res.headers?.get?.('content-disposition');
      let filename = `remito-tecnico-${codigoAGC}-${alertaId}.pdf`;
      if (dispo) {
        const match = dispo.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return {
        ok: true,
        data: {
          id: `REM-${alertaId}`,
          alertaId,
          codigoAGC,
          acuseLegal: {
            registrado: true,
            fechaHora,
            usuario: acuseUsuario,
          },
          blob,
          filename,
        },
      };
    }

    const data = (await res.json()) as RemitoTecnico;
    return {
      ok: true,
      data: {
        ...data,
        filename: data.filename || `remito-tecnico-${data.codigoAGC || alertaId}-${alertaId}.pdf`,
      },
    };
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

export type EstadoEntregaWhatsApp = 'aceptado' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'no_configurado';

export interface WhatsAppEnvioResult {
  ok: boolean;
  idMensaje: string;
  telefonoDestino: string;
  mensajeFormateado: string;
  intentos: number;
  timestampEnvio: string;
  tiempoRespuestaMs: number;
  estadoEntrega: EstadoEntregaWhatsApp;
  error?: string;
}

async function leerJsonSeguro<T>(res: Response): Promise<T | null> {
  try {
    if (typeof res.json !== 'function') return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** El WhatsApp lo despacha la Secretaría o el Administrador, con su sesión (HU-11 RF-15). */
export function puedeDespacharWhatsApp(usuario: { rol: string }): boolean {
  return usuario.rol === 'secretaria' || usuario.rol === 'administrador';
}

/** Lo que se le dice a quien no puede despachar: la sesión venció (401) o su rol no alcanza (403). */
export function mensajeDeErrorWhatsApp(status: number): string {
  return status === 401 ? 'La sesión venció: ingresá de nuevo.' : 'Sólo la Secretaría y el Administrador despachan alertas por WhatsApp.';
}

export async function enviarAlertaWhatsApp(
  input: MensajeAlertaWhatsAppInput,
): Promise<FetchResult<WhatsAppEnvioResult>> {
  try {
    const res = await fetchConSesion('/api/whatsapp/enviar-alerta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (res.status === 401 || res.status === 403) return { ok: false, error: mensajeDeErrorWhatsApp(res.status) };

    const data = await leerJsonSeguro<WhatsAppEnvioResult & { message?: string }>(res);
    const motivoError =
      data?.error || data?.message || `Error ${res.status}: no se pudo despachar por WhatsApp`;

    if (
      !res.ok ||
      !data ||
      !data.ok ||
      data.estadoEntrega === 'no_configurado' ||
      data.estadoEntrega === 'fallido'
    ) {
      return { ok: false, data: data ?? undefined, error: motivoError };
    }

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
  envioRealizado?: boolean;
  estado?: 'realizado' | 'no_realizado';
  estadoEntrega?: EstadoEntregaWhatsApp;
  idMensaje: string;
  telefonoDestino: string;
  duracionMs: number;
  menorA5Segundos: boolean;
  timestampDisparo: string;
  enlaceDirecto: string;
  mensajeFormateado: string;
  motivo?: string;
}

export async function triggerAlertaWhatsAppInmediata(
  alertaId?: string,
  maquinaId?: string,
): Promise<FetchResult<TriggerWhatsAppResult>> {
  try {
    const res = await fetchConSesion('/api/whatsapp/trigger-alerta-critica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertaId, maquinaId }),
    });

    if (res.status === 401 || res.status === 403) return { ok: false, error: mensajeDeErrorWhatsApp(res.status) };

    const data = await leerJsonSeguro<TriggerWhatsAppResult & { message?: string; error?: string }>(res);
    const motivoError =
      data?.motivo || data?.error || data?.message || `Error ${res.status}: fallo en trigger de WhatsApp`;

    if (!res.ok || !data || !data.ok || data.envioRealizado === false) {
      return { ok: false, data: data ?? undefined, error: motivoError };
    }

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
    const res = await fetchConSesion(`/api/eca/alertas?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: mensajeDeError(res.status, 'no se pudo obtener alertas de la flota') };
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
    const res = await fetchConSesion(`/api/eca/cobertura?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: mensajeDeError(res.status, 'no se pudo obtener cobertura') };
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
    const res = await fetchConSesion(`/api/eca/maquinas?${params.toString()}`, {
      headers: {
        'x-eca-name': ecaName,
      },
    });

    if (!res.ok) {
      return { ok: false, error: mensajeDeError(res.status, 'no se pudo obtener máquinas de la flota') };
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

/** Qué ECA mira el portal según quién ingresó (HU-15 RF-02). */
export type AlcanceEca = { modo: 'propia'; eca: string } | { modo: 'elegir' } | { modo: 'sin-eca' };

/**
 * Un usuario ECA ve siempre la suya (sale de su sesión; el servidor ignora cualquier otra); si su usuario no tiene ECA asignada, no puede
 * ver nada. La Secretaría y el Administrador eligen cuál mirar. Otro rol no entra a este portal (el servidor le responde 403).
 */
export function alcanceEca(usuario: { rol: string; eca?: string | null }): AlcanceEca {
  if (usuario.rol !== 'eca') return { modo: 'elegir' };
  const eca = usuario.eca?.trim();
  return eca ? { modo: 'propia', eca } : { modo: 'sin-eca' };
}

/** El remito y el acuse de recibo legal son de la ECA: sólo un usuario ECA los descarga y registra (HU-15 RF-02). */
export function puedeAcusarRemito(usuario: { rol: string }): boolean {
  return usuario.rol === 'eca';
}

/**
 * Determina el color semántico según el nivel de cobertura alcanzado.
 */
export function getCoberturaColor(porcentaje: number): string {
  if (porcentaje >= 80) return '#15803d'; // Verde éxito
  if (porcentaje >= 40) return '#b45309'; // Amarillo alerta
  return '#b91c1c'; // Rojo crítico
}
