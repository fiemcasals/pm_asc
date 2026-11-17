import {
  encolarInformeVisita,
  listarInformesVisitaEnCola,
  quitarInformeVisitaDeCola,
  type InformeVisitaEncolado,
} from '../checklist/offlineStore';
import { type CuerpoInforme, type InformeCerrado } from './consolidacion';

/**
 * Cola de sincronización de los informes cerrados (HU-18 RNF-02): lógica de la pantalla, sin React.
 *
 * Un informe cerrado **se guarda primero en el celular** (con sus fotos y su firma) y recién después se intenta subir; sale de la cola sólo
 * cuando la API confirma. Cada informe lleva un identificador generado en el celular (`clientReportId`), así que reenviarlo —porque se cortó
 * la señal a mitad de camino o porque la respuesta no llegó— no lo duplica: la API devuelve el original.
 */

export type ItemCola = Omit<InformeVisitaEncolado, 'cuerpo'> & { cuerpo: CuerpoInforme };

/** Dónde se guarda la cola. En la app es IndexedDB; en las pruebas, memoria. */
export interface AlmacenCola {
  guardar(item: ItemCola): Promise<void>;
  listar(): Promise<ItemCola[]>;
  eliminar(clientReportId: string): Promise<void>;
}

export function almacenIdb(factory?: IDBFactory): AlmacenCola {
  return {
    guardar: (item) => encolarInformeVisita(item, factory),
    listar: async () => (await listarInformesVisitaEnCola(factory)) as ItemCola[],
    eliminar: (id) => quitarInformeVisitaDeCola(id, factory),
  };
}

export function almacenEnMemoria(): AlmacenCola & { items: Map<string, ItemCola> } {
  const items = new Map<string, ItemCola>();
  return {
    items,
    guardar: async (i) => void items.set(i.clientReportId, structuredClone(i)),
    listar: async () => [...items.values()].map((i) => structuredClone(i)),
    eliminar: async (id) => void items.delete(id),
  };
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

export type ResultadoEnvio =
  | { tipo: 'enviado'; informe: InformeCerrado }
  /** Se vuelve a intentar solo: no hay señal, la sesión venció o el servidor falló. El informe sigue en el celular. */
  | { tipo: 'reintentable'; motivo: 'red' | 'sesion' | 'servidor'; error: string }
  /** El servidor lo rechazó de forma definitiva (datos inválidos, edificio que ya no tiene asignado…): reintentar no lo arregla. */
  | { tipo: 'rechazado'; error: string };

const STATUS_REINTENTABLES = new Set([408, 425, 429]);

async function motivoDelServidor(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string | string[]; errores?: string[] };
    const motivo = Array.isArray(json.message) ? json.message.join(' · ') : json.message;
    return json.errores?.join(' · ') || motivo || `El servidor lo rechazó (error ${res.status})`;
  } catch {
    return `El servidor lo rechazó (error ${res.status})`;
  }
}

/**
 * Manda un informe a la API y clasifica el resultado. **200 y 201 son lo mismo**: el informe quedó guardado (200 si ya estaba por un envío
 * anterior). Un corte de señal, un 5xx, un 401 (sesión vencida) o una sesión revocada son reintentables; el resto de los 4xx, no.
 */
export async function enviarUno(cuerpo: CuerpoInforme, enviar: Enviar): Promise<ResultadoEnvio> {
  let res: Response;
  try {
    res = await enviar('/api/informes-visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch (err) {
    if (err instanceof Error && err.name === 'SesionRevocadaError') return { tipo: 'reintentable', motivo: 'sesion', error: err.message };
    return { tipo: 'reintentable', motivo: 'red', error: 'Sin conexión con el servidor.' };
  }
  if (res.ok) {
    try {
      return { tipo: 'enviado', informe: (await res.json()) as InformeCerrado };
    } catch {
      // La respuesta se cortó: el informe puede estar guardado. Se reenvía y la API devuelve el original sin duplicarlo.
      return { tipo: 'reintentable', motivo: 'red', error: 'Se cortó la respuesta del servidor.' };
    }
  }
  if (res.status === 401) return { tipo: 'reintentable', motivo: 'sesion', error: 'La sesión venció: ingresá de nuevo y se envía solo.' };
  if (res.status >= 500 || STATUS_REINTENTABLES.has(res.status)) {
    return { tipo: 'reintentable', motivo: 'servidor', error: `El servidor no pudo recibirlo (error ${res.status}).` };
  }
  return { tipo: 'rechazado', error: await motivoDelServidor(res) };
}

// ---- Avisos a la pantalla.
export type EventoCola = { tipo: 'cambio' } | { tipo: 'enviado'; clientReportId: string; informe: InformeCerrado };
const oyentes = new Set<(e: EventoCola) => void>();

/** La pantalla se suscribe para refrescar el contador y, cuando un informe pendiente por fin se sube, mostrar su sello. */
export function alCambiarCola(oyente: (e: EventoCola) => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
export function avisarCambioCola(e: EventoCola = { tipo: 'cambio' }): void {
  oyentes.forEach((o) => {
    try {
      o(e);
    } catch {
      // un oyente que falla no frena a los demás
    }
  });
}

// ---- Envío de la cola.
export interface DepsCola {
  usuario: string;
  almacen: AlmacenCola;
  enviar: Enviar;
  /** Quién tiene la sesión ahora. Si cambió durante el envío (otro RT ingresó en el mismo celular), se frena: no se manda con el token ajeno. */
  usuarioVigente?: () => string | null;
}

export interface ResultadoSync {
  enviados: number;
  /** Los informes que se subieron en esta pasada, por identificador. */
  informes: Record<string, InformeCerrado>;
  pendientes: number;
  rechazados: number;
  /** El último motivo por el que quedó algo sin subir (sin señal, sesión vencida…). */
  error?: string;
}

// Los últimos informes que se subieron. Si un informe se cierra justo cuando otra pasada ya está enviando, esa pasada puede llevárselo antes
// que la que espera `cerrarInforme`: acá queda su resultado (con el sello) para no decir «pendiente» de algo que ya llegó.
const enviadosRecientes = new Map<string, InformeCerrado>();
const MAX_RECIENTES = 50;
function recordarEnviado(id: string, informe: InformeCerrado): void {
  enviadosRecientes.set(id, informe);
  if (enviadosRecientes.size > MAX_RECIENTES) enviadosRecientes.delete(enviadosRecientes.keys().next().value as string);
}

async function pasada(d: DepsCola): Promise<ResultadoSync> {
  const informes: Record<string, InformeCerrado> = {};
  let error: string | undefined;
  try {
    const mios = (await d.almacen.listar()).filter((i) => i.usuario === d.usuario && i.estado === 'pendiente');
    mios.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    for (const item of mios) {
      if (d.usuarioVigente && d.usuarioVigente() !== d.usuario) break;
      const r = await enviarUno(item.cuerpo, d.enviar);
      if (r.tipo === 'enviado') {
        informes[item.clientReportId] = r.informe;
        recordarEnviado(item.clientReportId, r.informe);
        // Si no se puede borrar, queda pendiente y el próximo envío recibe el original (200) sin duplicar.
        await d.almacen.eliminar(item.clientReportId).catch(() => undefined);
        avisarCambioCola({ tipo: 'enviado', clientReportId: item.clientReportId, informe: r.informe });
      } else if (r.tipo === 'rechazado') {
        await d.almacen.guardar({ ...item, estado: 'rechazado', ultimoError: r.error });
      } else {
        error = r.error;
        // Sin señal o sin sesión no tiene sentido seguir; un error del servidor con un informe no frena a los demás.
        if (r.motivo !== 'servidor') break;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'No se pudo leer la cola del celular.';
  }
  let pendientes = 0;
  let rechazados = 0;
  try {
    const restantes = (await d.almacen.listar()).filter((i) => i.usuario === d.usuario);
    pendientes = restantes.filter((i) => i.estado === 'pendiente').length;
    rechazados = restantes.length - pendientes;
  } catch {
    // sin almacén: no hay nada que contar
  }
  avisarCambioCola();
  return { enviados: Object.keys(informes).length, informes, pendientes, rechazados, ...(error && pendientes > 0 ? { error } : {}) };
}

// Una sola pasada a la vez: dos (la automática y un cierre al mismo tiempo) no mandan lo mismo en paralelo. Las que llegan mientras otra
// corre se juntan en una sola que arranca cuando termina la actual, y esa lee la cola recién entonces (ve lo último que se guardó).
let anterior: Promise<unknown> = Promise.resolve();
let enEspera: { usuario: string; promesa: Promise<ResultadoSync> } | null = null;

/** Sube lo pendiente de `d.usuario`, en el orden en que se cerró. Nunca lanza: lo que no se pudo subir queda en la cola. */
export function enviarCola(d: DepsCola): Promise<ResultadoSync> {
  if (enEspera && enEspera.usuario === d.usuario) return enEspera.promesa;
  const promesa = anterior.then(() => {
    if (enEspera?.promesa === promesa) enEspera = null;
    return pasada(d);
  });
  enEspera = { usuario: d.usuario, promesa };
  anterior = promesa.catch(() => undefined);
  return promesa;
}

// ---- Cierre del informe.
export type ResultadoCierre =
  | { estado: 'enviado'; informe: InformeCerrado }
  /** Quedó guardado en el celular y se sube solo. */
  | { estado: 'encolado' }
  /** El servidor lo rechazó (datos inválidos): se puede corregir y volver a cerrar. */
  | { estado: 'rechazado'; error: string }
  /** No se pudo ni subir ni guardar en el celular: el informe sigue en pantalla para reintentar. */
  | { estado: 'error'; error: string };

export const ERROR_SIN_GUARDAR = 'No hay señal y no se pudo guardar el informe en el celular. No cierres la pantalla: probá de nuevo.';

/**
 * Cierra el informe: lo **guarda primero en el celular** y después intenta subirlo si hay señal. Si el envío se corta, ya está a salvo
 * (fotos y firma incluidas) y se reintenta solo con el mismo identificador. Sin señal queda directamente en la cola.
 */
export async function cerrarInforme(p: DepsCola & { cuerpo: CuerpoInforme; enLinea: boolean; ahora?: Date }): Promise<ResultadoCierre> {
  const id = p.cuerpo.clientReportId;
  if (!id) throw new Error('El informe no tiene identificador.');
  const item: ItemCola = { clientReportId: id, usuario: p.usuario, cuerpo: p.cuerpo, creadoEn: (p.ahora ?? new Date()).toISOString(), estado: 'pendiente' };
  let guardado = true;
  try {
    await p.almacen.guardar(item);
  } catch {
    guardado = false;
  }

  if (!guardado) {
    if (!p.enLinea) return { estado: 'error', error: ERROR_SIN_GUARDAR };
    const r = await enviarUno(p.cuerpo, p.enviar);
    if (r.tipo === 'enviado') return { estado: 'enviado', informe: r.informe };
    if (r.tipo === 'rechazado') return { estado: 'rechazado', error: r.error };
    return { estado: 'error', error: ERROR_SIN_GUARDAR };
  }

  avisarCambioCola();
  if (!p.enLinea) return { estado: 'encolado' };

  const sync = await enviarCola(p);
  if (sync.informes[id]) return { estado: 'enviado', informe: sync.informes[id] };
  const actual = (await p.almacen.listar().catch(() => [] as ItemCola[])).find((i) => i.clientReportId === id);
  if (actual?.estado === 'rechazado') {
    // Recién cerrado y rechazado: se muestra el motivo en pantalla y se corrige; no queda en la cola.
    await p.almacen.eliminar(id).catch(() => undefined);
    avisarCambioCola();
    return { estado: 'rechazado', error: actual.ultimoError ?? 'El servidor rechazó el informe.' };
  }
  // Ya no está en la cola: otra pasada que estaba enviando lo subió antes que ésta.
  const yaSubido = actual ? undefined : enviadosRecientes.get(id);
  if (yaSubido) return { estado: 'enviado', informe: yaSubido };
  return { estado: 'encolado' };
}

/** Descarta un informe que el servidor rechazó (decisión del RT: se pierde). */
export async function descartarRechazado(almacen: AlmacenCola, clientReportId: string): Promise<void> {
  const item = (await almacen.listar()).find((i) => i.clientReportId === clientReportId);
  if (item?.estado !== 'rechazado') return; // un pendiente nunca se descarta desde acá: todavía se tiene que subir
  await almacen.eliminar(clientReportId);
  avisarCambioCola();
}

// ---- Qué mostrar.
/** «17/11, 13:59» (24 horas): el formato de 12 horas de es-AR no dice si es de mañana o de tarde y se presta a confusión. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function textoSinSubir(n: number): string {
  return `${n} ${n === 1 ? 'inspección' : 'inspecciones'} sin subir`;
}

export interface ResumenCola {
  pendientes: number;
  rechazados: ItemCola[];
  /** Todo lo que todavía no está en el servidor: pendientes + rechazados. */
  sinSubir: number;
}

export function resumirCola(items: readonly ItemCola[], usuario: string): ResumenCola {
  const mios = items.filter((i) => i.usuario === usuario);
  const rechazados = mios.filter((i) => i.estado === 'rechazado');
  return { pendientes: mios.length - rechazados.length, rechazados, sinSubir: mios.length };
}

// ---- Envío automático.
export interface ConfigAutoSync {
  sincronizar: () => Promise<unknown>;
  objetivo: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  enLinea: () => boolean;
  hayPendientes: () => boolean;
  intervaloMs?: number;
}

export const INTERVALO_REINTENTO_MS = 30_000;

/**
 * Hace que la cola se envíe sola con la app abierta: al arrancar (si hay señal), cuando vuelve la señal (evento `online`) y cada
 * `intervaloMs` mientras haya algo pendiente (por si la señal volvió sin avisar o el servidor tardó en responder). Devuelve cómo detenerlo.
 */
export function iniciarAutoSync(c: ConfigAutoSync): () => void {
  const lanzar = () => {
    void Promise.resolve(c.sincronizar()).catch(() => undefined);
  };
  const alVolverLaSenal = () => lanzar();
  c.objetivo.addEventListener('online', alVolverLaSenal);
  if (c.enLinea()) lanzar();
  const timer = setInterval(() => {
    if (c.enLinea() && c.hayPendientes()) lanzar();
  }, c.intervaloMs ?? INTERVALO_REINTENTO_MS);
  return () => {
    c.objetivo.removeEventListener('online', alVolverLaSenal);
    clearInterval(timer);
  };
}
