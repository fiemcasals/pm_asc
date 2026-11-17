/** Horarios de atención por edificio (HU-01 RF-04): lógica de la pantalla de la Secretaría, sin React. */

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
export type Dia = (typeof DIAS)[number];
export const ETIQUETA_DIA: Record<Dia, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};
export const MAX_FRANJAS = 2;

export interface Franja {
  desde: string;
  hasta: string;
}
export type FranjasPorDia = Partial<Record<Dia, Franja[]>>;

export interface HorariosEdificio {
  consorcioId: string;
  aCoordinar: boolean;
  franjas: FranjasPorDia;
  porDefecto: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** Lo que se edita en pantalla: por día, hasta 2 filas de texto (pueden estar vacías = sin franja). */
export type Borrador = { aCoordinar: boolean; dias: Record<Dia, [Franja, Franja]> };

const VACIA: Franja = { desde: '', hasta: '' };

export function borradorDesde(h: Pick<HorariosEdificio, 'aCoordinar' | 'franjas'>): Borrador {
  const dias = {} as Borrador['dias'];
  for (const d of DIAS) {
    const f = h.franjas[d] ?? [];
    dias[d] = [f[0] ? { ...f[0] } : { ...VACIA }, f[1] ? { ...f[1] } : { ...VACIA }];
  }
  return { aCoordinar: h.aCoordinar, dias };
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const vacia = (f: Franja) => f.desde.trim() === '' && f.hasta.trim() === '';

/** Errores de lo escrito, por día, antes de mandarlo (la API vuelve a validar). Con «A coordinar» no hay nada que validar. */
export function validarBorrador(b: Borrador): string[] {
  if (b.aCoordinar) return [];
  const errores: string[] = [];
  for (const d of DIAS) {
    const llenas = b.dias[d].filter((f) => !vacia(f));
    const ok: Franja[] = [];
    llenas.forEach((f) => {
      if (!HORA.test(f.desde.trim()) || !HORA.test(f.hasta.trim())) errores.push(`${ETIQUETA_DIA[d]}: completá desde y hasta con una hora válida (HH:MM).`);
      else if (minutos(f.hasta.trim()) <= minutos(f.desde.trim())) errores.push(`${ETIQUETA_DIA[d]}: el fin (${f.hasta}) tiene que ser posterior al inicio (${f.desde}).`);
      else ok.push({ desde: f.desde.trim(), hasta: f.hasta.trim() });
    });
    if (ok.length === 2) {
      const [a, c] = [...ok].sort((x, y) => minutos(x.desde) - minutos(y.desde));
      if (minutos(c.desde) <= minutos(a.hasta)) errores.push(`${ETIQUETA_DIA[d]}: las dos franjas se superponen.`);
    }
  }
  return errores;
}

/** El cuerpo del PUT: sólo las filas completas; «A coordinar» no manda franjas. */
export function cuerpoHorarios(b: Borrador): { aCoordinar: true } | { aCoordinar: false; franjas: FranjasPorDia } {
  if (b.aCoordinar) return { aCoordinar: true };
  const franjas: FranjasPorDia = {};
  for (const d of DIAS) {
    const llenas = b.dias[d].filter((f) => !vacia(f)).map((f) => ({ desde: f.desde.trim(), hasta: f.hasta.trim() }));
    if (llenas.length > 0) franjas[d] = llenas;
  }
  return { aCoordinar: false, franjas };
}

/** Resumen legible de un día: «08:00–12:00 · 17:00–20:00» o «Cerrado». */
export function resumenDia(franjas: Franja[] | undefined): string {
  return franjas && franjas.length > 0 ? franjas.map((f) => `${f.desde}–${f.hasta}`).join(' · ') : 'Cerrado';
}

export async function cargarHorarios(consorcioId: string, enviar: Enviar): Promise<HorariosEdificio | null> {
  try {
    const res = await enviar(`/api/consorcios/${encodeURIComponent(consorcioId)}/horarios`);
    return res.ok ? ((await res.json()) as HorariosEdificio) : null;
  } catch {
    return null;
  }
}

export async function guardarHorarios(
  consorcioId: string,
  b: Borrador,
  enviar: Enviar,
): Promise<{ ok: true; horarios: HorariosEdificio } | { ok: false; errores: string[] }> {
  try {
    const res = await enviar(`/api/consorcios/${encodeURIComponent(consorcioId)}/horarios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoHorarios(b)),
    });
    const json = (await res.json()) as { message?: string | string[]; errores?: string[] } & HorariosEdificio;
    if (!res.ok) return { ok: false, errores: json.errores ?? [Array.isArray(json.message) ? json.message.join(' · ') : json.message || `No se pudieron guardar los horarios (error ${res.status})`] };
    return { ok: true, horarios: json };
  } catch (err) {
    return { ok: false, errores: [err instanceof Error ? err.message : 'Error de conexión'] };
  }
}
