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
