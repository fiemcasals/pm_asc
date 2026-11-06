export interface Administracion {
  nombre: string | null;
  telefono: string | null;
  email: string | null;
}

export interface MaquinaInput {
  referenciaAgc: string;
  descripcion: string | null;
}

export interface ConsorcioInput {
  nombre: string;
  direccion: string;
  administracion: Administracion;
  maquinas: MaquinaInput[];
}

export interface Maquina extends MaquinaInput {
  id: string;
}

export interface Consorcio {
  id: string;
  nombre: string;
  direccion: string;
  administracion: Administracion;
  maquinas: Maquina[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsorcioResumen {
  id: string;
  nombre: string;
  direccion: string;
  cantidadMaquinas: number;
}

export interface FetchResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errores?: string[];
}

export async function fetchConsorcios(): Promise<FetchResult<ConsorcioResumen[]>> {
  try {
    const res = await fetch('/api/consorcios');
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo listar consorcios` };
    }
    const data = (await res.json()) as ConsorcioResumen[];
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function fetchConsorcioById(id: string): Promise<FetchResult<Consorcio>> {
  try {
    const res = await fetch(`/api/consorcios/${id}`);
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: consorcio no encontrado` };
    }
    const data = (await res.json()) as Consorcio;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function crearConsorcio(input: ConsorcioInput): Promise<FetchResult<Consorcio>> {
  try {
    const res = await fetch('/api/consorcios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.message || 'Error al registrar consorcio',
        errores: Array.isArray(json.errores) ? json.errores : undefined,
      };
    }

    return { ok: true, data: json as Consorcio };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export interface CoordenadasGPS {
  latitud: number;
  longitud: number;
  precision?: number;
  timestamp?: string;
}

export interface ReporteVisitaFallidaInput {
  consorcioId: string;
  motivo?: string;
  fotoFrenteUrl: string;
  gps: CoordenadasGPS;
  inspector?: string;
  emailAdministracion?: string;
}

export interface EmailNotificacionConsorcio {
  id: string;
  destinatario: string;
  remitente: string;
  asunto: string;
  cuerpo: string;
  fechaEnvio: string;
  estado: 'enviado';
}

export interface VisitaFallidaRegistro {
  id: string;
  consorcioId: string;
  consorcioNombre: string;
  direccion: string;
  numeroAdvertencia: 1 | 2 | 3;
  motivo: string;
  fotoFrenteUrl: string;
  gps: CoordenadasGPS;
  inspector: string;
  fechaHora: string;
  emailNotificacion?: EmailNotificacionConsorcio | null;
}

export interface ResumenAdvertenciasConsorcio {
  consorcioId: string;
  consorcioNombre?: string;
  totalAdvertencias: number;
  ultimaAdvertencia: 1 | 2 | 3 | null;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicable: boolean;
  avisoCobro?: string | null;
  historial: VisitaFallidaRegistro[];
}

export interface BloqueoConsorcioInfo {
  consorcioId: string;
  consorcioNombre: string;
  bloqueado: boolean;
  avisoCobro: string | null;
  totalAdvertencias: number;
  recargoAplicable: boolean;
  porcentajeRecargo: number;
  motivoBloqueo: string | null;
}

export interface LiquidacionMaquinaInput {
  consorcioId: string;
  maquinaId?: string;
  referenciaAgc?: string;
  periodo?: string;
  montoBase?: number;
}

export interface DetalleConceptoLiquidacion {
  concepto: string;
  monto: number;
}

export interface LiquidacionMaquinaResultado {
  id: string;
  consorcioId: string;
  consorcioNombre: string;
  maquinaId: string;
  referenciaAgc: string;
  periodo: string;
  montoBase: number;
  totalAdvertencias: number;
  bloqueadoPorTerceraVisita: boolean;
  recargoAplicado: boolean;
  porcentajeRecargo: number;
  montoRecargo: number;
  montoTotal: number;
  avisoCobro: string | null;
  detalleConceptos: DetalleConceptoLiquidacion[];
  fechaLiquidacion: string;
}

export interface LiquidacionConsorcioResultado {
  consorcioId: string;
  consorcioNombre: string;
  periodo: string;
  totalMaquinas: number;
  totalAdvertencias: number;
  bloqueadoPorTerceraVisita: boolean;
  avisoCobro: string | null;
  subtotalBase: number;
  totalRecargos: number;
  totalGeneral: number;
  liquidacionesMaquinas: LiquidacionMaquinaResultado[];
  fechaLiquidacion: string;
}

export async function registrarVisitaFallida(
  input: ReporteVisitaFallidaInput,
): Promise<FetchResult<VisitaFallidaRegistro>> {
  try {
    const res = await fetch('/api/visitas-fallidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.message || 'Error al registrar visita fallida',
      };
    }

    return { ok: true, data: json as VisitaFallidaRegistro };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function fetchAdvertenciasConsorcio(
  consorcioId: string,
): Promise<FetchResult<ResumenAdvertenciasConsorcio>> {
  try {
    const res = await fetch(`/api/visitas-fallidas/consorcio/${encodeURIComponent(consorcioId)}`);
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo obtener advertencias` };
    }
    const data = (await res.json()) as ResumenAdvertenciasConsorcio;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function fetchBloqueoConsorcio(
  consorcioId: string,
): Promise<FetchResult<BloqueoConsorcioInfo>> {
  try {
    const res = await fetch(`/api/visitas-fallidas/consorcio/${encodeURIComponent(consorcioId)}/bloqueo`);
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo consultar bloqueo` };
    }
    const data = (await res.json()) as BloqueoConsorcioInfo;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function liquidarMaquina(
  input: LiquidacionMaquinaInput,
): Promise<FetchResult<LiquidacionMaquinaResultado>> {
  try {
    const res = await fetch('/api/visitas-fallidas/liquidar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json.message || 'Error al liquidar máquina' };
    }
    return { ok: true, data: json as LiquidacionMaquinaResultado };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export async function fetchLiquidacionConsorcio(
  consorcioId: string,
  periodo?: string,
  montoBase?: number,
): Promise<FetchResult<LiquidacionConsorcioResultado>> {
  try {
    const params = new URLSearchParams();
    if (periodo) params.set('periodo', periodo);
    if (montoBase) params.set('montoBase', montoBase.toString());
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`/api/visitas-fallidas/consorcio/${encodeURIComponent(consorcioId)}/liquidacion${qs}`);
    if (!res.ok) {
      return { ok: false, error: `Error ${res.status}: no se pudo obtener liquidación` };
    }
    const data = (await res.json()) as LiquidacionConsorcioResultado;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

