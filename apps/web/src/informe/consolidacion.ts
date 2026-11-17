import { obtenerChecklistParaTipo, type EstadoEquipoUso, type TipoMaquinaChecklist } from '../checklist/checklist.config';
import { esSolapaCompleta, type FotosPorEquipo, type ObservacionesChecklist, type RespuestasChecklist } from '../checklist/checklist.logic';
import { type EquipoInspeccion } from '../checklist/navegacion';

/** Consolidación del informe y firma del encargado (HU-18 RF-01): lógica de la pantalla, sin React. */

export const CARACTERES = ['Encargado', 'Administrador', 'Propietario'] as const;
export type Caracter = (typeof CARACTERES)[number];

export const MIN_PUNTOS_FIRMA = 8;
export const MIN_TAMANO_FIRMA_PX = 15;
export const MIN_MOTIVO = 10;
export const MAX_MOTIVO = 500;

export type Punto = [number, number];

export interface EstadoVisita {
  estadoPorEquipo: Record<string, EstadoEquipoUso>;
  respuestasPorEquipo: Record<string, RespuestasChecklist>;
  obsPorEquipo: Record<string, ObservacionesChecklist>;
  fotosPorEquipo: Record<string, FotosPorEquipo>;
  tipoOverride: Record<string, TipoMaquinaChecklist>;
}

export interface PendienteConsolidar {
  equipo: string;
  motivo: string;
}

/**
 * ¿Se puede consolidar el informe? Cada equipo tiene que estar **completo** (todas las solapas de su tipo con sus ítems respondidos y las
 * fotos obligatorias) o **resuelto como fuera de servicio** (HU-17 RF-02/RF-03). Mientras falte uno no se habilita el botón, y se dice cuál.
 */
export function puedeConsolidar(equipos: readonly EquipoInspeccion[], v: EstadoVisita): { puede: boolean; pendientes: PendienteConsolidar[] } {
  const pendientes: PendienteConsolidar[] = [];
  for (const e of equipos) {
    const estado = v.estadoPorEquipo[e.maquinaId];
    if (estado === undefined) {
      pendientes.push({ equipo: e.referenciaAgc, motivo: 'falta indicar si está en uso' });
      continue;
    }
    if (estado === 'fuera_de_servicio') continue; // resuelto como fuera de servicio
    const tipo = v.tipoOverride[e.maquinaId] ?? e.tipo;
    const respuestas = v.respuestasPorEquipo[e.maquinaId] ?? {};
    const fotos = v.fotosPorEquipo[e.maquinaId] ?? {};
    const incompletas = obtenerChecklistParaTipo(tipo).solapas.filter((s) => !esSolapaCompleta(s, respuestas[s.id] ?? {}, fotos, estado));
    if (incompletas.length > 0) pendientes.push({ equipo: e.referenciaAgc, motivo: `faltan completar: ${incompletas.map((s) => s.nombre).join(', ')}` });
  }
  return { puede: equipos.length > 0 && pendientes.length === 0, pendientes };
}

/** Los DNI argentinos tienen 7 u 8 dígitos; se aceptan puntos y espacios. Vacío es válido (el DNI es opcional). */
export function dniValido(dni: string): boolean {
  const s = dni.trim();
  if (s === '') return true;
  return /^[\d.\s]+$/.test(s) && /^\d{7,8}$/.test(s.replace(/\D/g, ''));
}

export interface DatosFirmante {
  nombre: string;
  apellido: string;
  caracter: Caracter | '';
  dni: string;
}

/** Los errores de los datos de quien firma: nombre, apellido y carácter son obligatorios; el DNI es opcional pero, si se pone, válido. */
export function erroresFirmante(d: DatosFirmante): string[] {
  const e: string[] = [];
  if (d.nombre.trim().length < 2) e.push('Falta el nombre.');
  if (d.apellido.trim().length < 2) e.push('Falta el apellido.');
  if (!(CARACTERES as readonly string[]).includes(d.caracter)) e.push('Elegí en qué carácter firma (Encargado, Administrador o Propietario).');
  if (!dniValido(d.dni)) e.push('El DNI tiene que tener 7 u 8 dígitos (o dejalo vacío).');
  return e;
}

/** ¿Los trazos forman una firma? Mínimo de puntos y un tamaño: un toque suelto o una raya mínima no cuentan (no se acepta vacía). */
export function firmaTrazada(trazos: readonly (readonly Punto[])[]): boolean {
  const puntos = trazos.flat();
  if (puntos.length < MIN_PUNTOS_FIRMA) return false;
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  return Math.max(...xs) - Math.min(...xs) >= MIN_TAMANO_FIRMA_PX || Math.max(...ys) - Math.min(...ys) >= MIN_TAMANO_FIRMA_PX;
}

export interface DatosSinFirma {
  motivo: string;
  foto: string | null;
}

/** «Sin firma» exige el motivo (al menos 10 caracteres) y una foto. */
export function erroresSinFirma(d: DatosSinFirma): string[] {
  const e: string[] = [];
  if (d.motivo.trim().length < MIN_MOTIVO) e.push(`Escribí el motivo (al menos ${MIN_MOTIVO} caracteres).`);
  if (d.motivo.trim().length > MAX_MOTIVO) e.push(`El motivo no puede superar los ${MAX_MOTIVO} caracteres.`);
  if (!d.foto) e.push('Sacá una foto que respalde el motivo.');
  return e;
}

export interface CuerpoInforme {
  consorcioId: string;
  horaDispositivo: string;
  equipos: {
    maquinaId: string;
    referenciaAgc: string;
    tipo: TipoMaquinaChecklist;
    estadoEquipo: EstadoEquipoUso;
    respuestas: RespuestasChecklist;
    observaciones: ObservacionesChecklist;
    fotos: FotosPorEquipo;
  }[];
  firma?: { nombre: string; apellido: string; caracter: Caracter; dni?: string; imagen: string; trazos: Punto[][] };
  sinFirma?: { motivo: string; foto: string };
}

/** Arma el cuerpo del informe con todos los equipos y la firma o el «Sin firma». */
export function armarInforme(
  consorcioId: string,
  equipos: readonly EquipoInspeccion[],
  v: EstadoVisita,
  cierre: { firma: { datos: DatosFirmante; imagen: string; trazos: Punto[][] } } | { sinFirma: DatosSinFirma },
  ahora: Date = new Date(),
): CuerpoInforme {
  const cuerpo: CuerpoInforme = {
    consorcioId,
    horaDispositivo: ahora.toISOString(),
    equipos: equipos.map((e) => ({
      maquinaId: e.maquinaId,
      referenciaAgc: e.referenciaAgc,
      tipo: v.tipoOverride[e.maquinaId] ?? e.tipo,
      estadoEquipo: v.estadoPorEquipo[e.maquinaId] ?? 'en_uso',
      respuestas: v.respuestasPorEquipo[e.maquinaId] ?? {},
      observaciones: v.obsPorEquipo[e.maquinaId] ?? {},
      fotos: v.fotosPorEquipo[e.maquinaId] ?? {},
    })),
  };
  if ('firma' in cierre) {
    const d = cierre.firma.datos;
    cuerpo.firma = {
      nombre: d.nombre.trim(), apellido: d.apellido.trim(), caracter: d.caracter as Caracter, imagen: cierre.firma.imagen, trazos: cierre.firma.trazos,
      ...(d.dni.trim() !== '' ? { dni: d.dni.trim() } : {}),
    };
  } else {
    cuerpo.sinFirma = { motivo: cierre.sinFirma.motivo.trim(), foto: cierre.sinFirma.foto as string };
  }
  return cuerpo;
}

export interface InformeCerrado {
  id: string;
  requiereRevision: boolean;
  /** El sello del informe cerrado: SHA-256 de su contenido, firma y fotos (HU-18 RNF-01). */
  hashSha256?: string | null;
}

/** El sello abreviado para mostrarlo en pantalla («3fa9c1d2e7b4…»); vacío si el informe no tiene sello. */
export function selloCorto(hash: string | null | undefined): string {
  return hash && /^[0-9a-f]{64}$/.test(hash) ? `${hash.slice(0, 12)}…` : '';
}

type Enviar = (url: string, init?: RequestInit) => Promise<Response>;

/** Cierra el informe en la API. Devuelve el informe o el motivo del rechazo. */
export async function enviarInforme(cuerpo: CuerpoInforme, enviar: Enviar): Promise<{ ok: true; informe: InformeCerrado } | { ok: false; error: string }> {
  try {
    const res = await enviar('/api/informes-visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const json = (await res.json()) as { message?: string | string[]; errores?: string[] } & InformeCerrado;
    if (!res.ok) {
      const motivo = Array.isArray(json.message) ? json.message.join(' · ') : json.message;
      return { ok: false, error: json.errores?.join(' · ') || motivo || `No se pudo cerrar el informe (error ${res.status})` };
    }
    return { ok: true, informe: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
  }
}
