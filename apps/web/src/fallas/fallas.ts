import { obtenerFallasCriticasDefinidas } from '../checklist/checklist.config';

export type FallaCritica = 'CABLES_DESGASTADOS' | 'LIMITADOR_ANULADO' | (string & {});

export interface EventoFallaCritica {
  tipo: 'falla-critica';
  informeId: string;
  maquinaId: string;
  codigoAGC: string;
  nombreMaquina: string;
  direccion: string;
  consorcio: string;
  eca: string;
  inspector: string;
  fallas: FallaCritica[];
  registradoEn: string;
  enlaceInforme: string;
}

export const URL_EVENTOS_FALLAS = '/api/fallas-criticas/eventos';

const ETIQUETAS_CHECKLIST: Record<string, string> = Object.fromEntries(
  obtenerFallasCriticasDefinidas().map((f) => [
    f.codigoFallaCritica,
    `${f.itemEtiqueta}: ${f.opcionEtiqueta}`,
  ]),
);

export const ETIQUETA_FALLA: Record<string, string> = {
  ...ETIQUETAS_CHECKLIST,
  CABLES_DESGASTADOS: 'Cables de tracción desgastados',
  LIMITADOR_ANULADO: 'Limitador de velocidad anulado',
};

const FALLAS_VALIDAS = new Set<string>(Object.keys(ETIQUETA_FALLA));
const CAMPOS_TEXTO = [
  'informeId',
  'maquinaId',
  'codigoAGC',
  'nombreMaquina',
  'direccion',
  'consorcio',
  'eca',
  'inspector',
  'registradoEn',
  'enlaceInforme',
] as const;

/**
 * Interpreta el `data` de un evento SSE. Devuelve null si no es un evento de falla crítica bien
 * formado: el panel no muestra una alerta a medias. El enlace tiene que ser una ruta local de la
 * API, así nunca se abre un destino que no sea el informe.
 */
export function parsearEventoFalla(raw: string): EventoFallaCritica | null {
  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  if (d.tipo !== 'falla-critica') return null;
  if (!CAMPOS_TEXTO.every((c) => typeof d[c] === 'string')) return null;
  if (!Array.isArray(d.fallas) || d.fallas.length === 0) return null;
  if (!d.fallas.every((f) => typeof f === 'string' && FALLAS_VALIDAS.has(f))) return null;
  if (!(d.enlaceInforme as string).startsWith('/api/fallas-criticas/informes/')) return null;
  return d as unknown as EventoFallaCritica;
}

/** Lo mínimo de EventSource que usa el panel, para poder probarlo sin navegador. */
export interface FuenteEventos {
  addEventListener(tipo: string, fn: (e: { data: string }) => void): void;
  close(): void;
}

/**
 * Se suscribe al canal de fallas críticas. EventSource reconecta solo si se corta la conexión.
 * Devuelve la función para cerrar la suscripción.
 */
export function suscribirFallasCriticas(
  onEvento: (e: EventoFallaCritica) => void,
  crearFuente: (url: string) => FuenteEventos = (url) => new EventSource(url),
): () => void {
  const fuente = crearFuente(URL_EVENTOS_FALLAS);
  fuente.addEventListener('falla-critica', (msg) => {
    const evento = parsearEventoFalla(msg.data);
    if (evento) onEvento(evento);
  });
  return () => fuente.close();
}

/**
 * Aviso sonoro: tres pitidos de dos tonos generados con Web Audio (no hace falta ningún archivo
 * de audio). Devuelve false si el navegador no tiene Web Audio. Los navegadores sólo dejan sonar
 * audio en una página con la que el usuario ya interactuó; entrar a la pestaña Secretaría cuenta.
 */
export function reproducirAvisoSonoro(
  crearContexto: () => AudioContext | null = () =>
    typeof AudioContext === 'undefined' ? null : new AudioContext(),
): boolean {
  const ctx = crearContexto();
  if (!ctx) return false;
  void ctx.resume?.();
  const inicio = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    for (const [j, frecuencia] of [880, 660].entries()) {
      const t = inicio + i * 0.6 + j * 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = frecuencia;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }
  setTimeout(() => void ctx.close?.(), 2500);
  return true;
}
