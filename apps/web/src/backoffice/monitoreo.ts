import { fechaHora } from '../fechas/formato';
/** Tablero de monitoreo del backoffice (HU-05 RF-02): lógica de la pantalla, sin React. */

export type EstadoVisita = 'Recorrida' | 'Pendiente de Visita' | 'Advertencia';
export const ESTADOS: readonly EstadoVisita[] = ['Recorrida', 'Pendiente de Visita', 'Advertencia'];

export interface RemitoEnviado {
  enviadoPor: string;
  enviadoEn: string;
  eca: string;
}
export interface ReclamoHecho {
  reclamadoPor: string;
  reclamadoEn: string;
  administracion: string;
}

export interface FilaMonitoreo {
  id: string;
  maquinaId: string;
  codigoAGC: string;
  equipo: string;
  direccion: string;
  consorcio: string;
  eca: string;
  inspector: string;
  estadoVisita: EstadoVisita;
  fecha: string | null;
  estadoOperativo: string;
  firmante: string;
  autorizada: boolean;
  rechazada: boolean;
  alertaCritica: boolean;
  remito: RemitoEnviado | null;
  administracion: string;
  reclamo: ReclamoHecho | null;
  fotos: number;
  itemsChecklist: number;
}

export interface PaginaMonitoreo {
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  items: FilaMonitoreo[];
}

export interface DetalleVisita {
  id: string;
  maquinaId: string;
  direccion: string;
  consorcio: string;
  administracion: string;
  eca: string;
  inspector: string;
  estadoVisita: EstadoVisita;
  fecha: string | null;
  titulo: string | null;
  motivo: string | null;
  motivoAdvertencia: string | null;
  nombreEncargado: string | null;
  fotos: { etiqueta: string; url: string }[];
  checklist: { item: string; estado: string; observaciones: string }[];
}

export interface Filtros {
  direccion: string;
  eca: string;
  inspector: string;
  estado: '' | EstadoVisita;
}
export const FILTROS_VACIOS: Filtros = { direccion: '', eca: '', inspector: '', estado: '' };
export const POR_PAGINA = 10;
/** Cuánto se espera tras la última tecla antes de volver a consultar (los filtros responden «en tiempo real» sin una consulta por letra). */
export const ESPERA_FILTROS_MS = 300;

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** La URL del listado con los filtros que tienen algo escrito y la página pedida. */
export function urlMonitoreo(f: Filtros, pagina: number, porPagina: number = POR_PAGINA): string {
  const q = new URLSearchParams();
  for (const k of ['direccion', 'eca', 'inspector', 'estado'] as const) if (f[k].trim() !== '') q.set(k, f[k].trim());
  q.set('pagina', String(pagina));
  q.set('porPagina', String(porPagina));
  return `/api/backoffice/monitoreo?${q.toString()}`;
}

export type AccionFila =
  /** Visita hecha (Recorrida) y todavía sin remito: «Enviar Remito a ECA». */
  | { tipo: 'enviar_remito'; etiqueta: string }
  | { tipo: 'remito_enviado'; etiqueta: string }
  /** Visita con advertencia y todavía sin reclamo: «Reclamar a Admin». */
  | { tipo: 'reclamar_admin'; etiqueta: string }
  | { tipo: 'reclamo_hecho'; etiqueta: string }
  | { tipo: 'ninguna'; etiqueta: string };

/**
 * La acción comercial de una fila según el estado de su visita: una visita Recorrida se informa a la ECA (remito); una con Advertencia se
 * le reclama a la administración; un equipo pendiente de visita no tiene acción. Si ya se hizo, se muestra quién y cuándo.
 */
export function accionDe(f: FilaMonitoreo): AccionFila {
  if (f.estadoVisita === 'Recorrida') {
    return f.remito ? { tipo: 'remito_enviado', etiqueta: `Remito enviado a ${f.remito.eca} el ${fecha(f.remito.enviadoEn)}` } : { tipo: 'enviar_remito', etiqueta: 'Enviar Remito a ECA' };
  }
  if (f.estadoVisita === 'Advertencia') {
    return f.reclamo ? { tipo: 'reclamo_hecho', etiqueta: `Reclamo enviado a ${f.reclamo.administracion} el ${fecha(f.reclamo.reclamadoEn)}` } : { tipo: 'reclamar_admin', etiqueta: 'Reclamar a Admin' };
  }
  return { tipo: 'ninguna', etiqueta: 'Sin visita todavía' };
}

/** Fecha y hora en Buenos Aires («04/11/2026 07:30»); «—» si no hay. */
export function fecha(iso: string | null): string {
  return fechaHora(iso) || '—';
}

/** El texto de la columna «Checklist»: cuántos ítems y fotos tiene el informe de la visita. */
export function resumenChecklist(f: Pick<FilaMonitoreo, 'itemsChecklist' | 'fotos'>): string {
  const partes: string[] = [];
  if (f.itemsChecklist > 0) partes.push(`${f.itemsChecklist} ${f.itemsChecklist === 1 ? 'ítem' : 'ítems'}`);
  if (f.fotos > 0) partes.push(`${f.fotos} ${f.fotos === 1 ? 'foto' : 'fotos'}`);
  return partes.length > 0 ? partes.join(' · ') : 'Sin informe';
}

/** El Firmante AGC de la fila con el estado de su autorización. */
export function textoFirmante(f: Pick<FilaMonitoreo, 'firmante' | 'autorizada' | 'rechazada'>): string {
  return `${f.firmante} · ${f.rechazada ? 'Rechazó' : f.autorizada ? 'Autorizó' : 'Sin autorizar'}`;
}

/** Sólo se muestran como imagen las fotos con una URL http(s) o una imagen en data URL: cualquier otro esquema no. */
export function fotoSegura(url: string): boolean {
  return /^(https?:\/\/[^\s"'<>]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(url);
}

export async function cargarMonitoreo(f: Filtros, pagina: number, enviar: Enviar): Promise<PaginaMonitoreo | null> {
  try {
    const res = await enviar(urlMonitoreo(f, pagina));
    return res.ok ? ((await res.json()) as PaginaMonitoreo) : null;
  } catch {
    return null;
  }
}

export async function cargarDetalle(maquinaId: string, enviar: Enviar): Promise<DetalleVisita | null> {
  try {
    const res = await enviar(`/api/backoffice/visitas/${encodeURIComponent(maquinaId)}`);
    return res.ok ? ((await res.json()) as DetalleVisita) : null;
  } catch {
    return null;
  }
}

async function postAccion(ruta: string, maquinaId: string, enviar: Enviar): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await enviar(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maquinaId }) });
    if (res.ok) return { ok: true };
    const json = (await res.json()) as { message?: string | string[] };
    return { ok: false, error: (Array.isArray(json.message) ? json.message.join(' · ') : json.message) || `No se pudo completar la acción (error ${res.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}

export const enviarRemitoEca = (maquinaId: string, enviar: Enviar) => postAccion('/api/backoffice/remito-eca', maquinaId, enviar);
export const reclamarAdmin = (maquinaId: string, enviar: Enviar) => postAccion('/api/backoffice/reclamo-admin', maquinaId, enviar);
