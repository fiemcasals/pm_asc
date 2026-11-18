import { fetchConSesion } from '../auth/sesion';

/**
 * Canal en tiempo real con sesión (HU-06 RF-07). `EventSource` no puede mandar el encabezado `Authorization`, así que el panel lee el
 * canal con `fetch` (a través de `fetchConSesion`, que agrega y renueva la sesión) y entiende el formato de Server-Sent Events.
 * Mantiene la misma interfaz mínima que `EventSource` (`addEventListener` / `close`), más el evento `reconexion`, que avisa que el canal
 * volvió después de un corte: lo ocurrido mientras tanto no llegó por el canal y hay que volver a pedir la lista.
 */

export interface MensajeSse {
  event: string;
  data: string;
}

/**
 * Parser del formato SSE. Se le van pasando los pedazos de texto como llegan (pueden cortar una línea o un CRLF por la mitad) y devuelve
 * los mensajes completos. Entiende `event:`, `data:` (varias líneas se unen con un salto de línea), comentarios (`: ping`) y los tres
 * saltos de línea que admite el estándar (LF, CRLF y CR). Un mensaje que no terminó con la línea en blanco no se entrega.
 */
export class ParserSse {
  private linea = '';
  /** Tras un CR, el LF que venga justo después es del mismo salto de línea (CRLF), aunque llegue en otro pedazo. */
  private saltarLF = false;
  private evento = '';
  private datos: string[] = [];

  alimentar(texto: string): MensajeSse[] {
    const lineas: string[] = [];
    for (const c of texto) {
      if (this.saltarLF) {
        this.saltarLF = false;
        if (c === '\n') continue;
      }
      if (c === '\n') {
        lineas.push(this.linea);
        this.linea = '';
      } else if (c === '\r') {
        lineas.push(this.linea);
        this.linea = '';
        this.saltarLF = true;
      } else {
        this.linea += c;
      }
    }

    const mensajes: MensajeSse[] = [];
    for (const linea of lineas) {
      if (linea === '') {
        if (this.datos.length > 0) mensajes.push({ event: this.evento || 'message', data: this.datos.join('\n') });
        this.evento = '';
        this.datos = [];
      } else if (!linea.startsWith(':')) {
        const dosPuntos = linea.indexOf(':');
        const campo = dosPuntos < 0 ? linea : linea.slice(0, dosPuntos);
        let valor = dosPuntos < 0 ? '' : linea.slice(dosPuntos + 1);
        if (valor.startsWith(' ')) valor = valor.slice(1);
        if (campo === 'event') this.evento = valor;
        else if (campo === 'data') this.datos.push(valor);
      }
    }
    return mensajes;
  }
}

/** Esperas entre reintentos tras un corte: 1 s, 2 s, 4 s… hasta 30 s. */
export function esperaDeReintento(intento: number): number {
  return Math.min(1000 * 2 ** intento, 30_000);
}

/** Si la conexión duró menos que esto, el corte se trata como una falla (no se reintenta en un lazo apretado). */
export const DURACION_MINIMA_MS = 1000;
/** Espera antes de reabrir cuando el servidor cerró una conexión que había durado lo normal. */
export const ESPERA_TRAS_CORTE_NORMAL_MS = 200;

export interface DependenciasCanal {
  pedir?: (url: string, init: RequestInit) => Promise<Response>;
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
}

type Oyente = (mensaje: { data: string }) => void;

/**
 * Abre el canal y lo mantiene abierto: lo reabre solo cuando el servidor lo cierra (corta cada tanto para volver a validar la sesión) o
 * cuando se corta la red, con espera creciente. No reintenta si la sesión fue revocada (`fetchConSesion` ya avisó para que la app cierre
 * la sesión) ni si el rol no alcanza (403). Un 401 sí se reintenta: puede ser que no se haya podido renovar justo por falta de señal.
 */
export function abrirCanalConSesion(url: string, deps: DependenciasCanal = {}) {
  const pedir = deps.pedir ?? fetchConSesion;
  const ahora = deps.ahora ?? Date.now;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let despertar: (() => void) | null = null;
  const esperar =
    deps.esperar ??
    ((ms: number) =>
      new Promise<void>((resolver) => {
        despertar = resolver;
        temporizador = setTimeout(resolver, ms);
      }));

  const oyentes = new Map<string, Oyente[]>();
  const emitir = (tipo: string, data: string) => (oyentes.get(tipo) ?? []).forEach((fn) => fn({ data }));
  let cerrada = false;
  let conexion: AbortController | null = null;

  const ciclo = async () => {
    let fallos = 0;
    let primera = true;
    while (!cerrada) {
      conexion = new AbortController();
      const inicio = ahora();
      let espera: number;
      try {
        const res = await pedir(url, { headers: { Accept: 'text/event-stream' }, cache: 'no-store', signal: conexion.signal });
        if (res.status === 403) return; // el rol no alcanza: reintentar no lo arregla
        if (!res.ok || !res.body) throw new Error(`El canal respondió ${res.status}`);
        if (!primera) emitir('reconexion', '');
        primera = false;

        const parser = new ParserSse();
        const decodificador = new TextDecoder();
        const lector = res.body.getReader();
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          for (const m of parser.alimentar(decodificador.decode(value, { stream: true }))) emitir(m.event, m.data);
        }
        // El servidor cerró el canal. Si había durado lo normal es el corte periódico: se reabre enseguida.
        const duro = ahora() - inicio >= DURACION_MINIMA_MS;
        espera = duro ? ESPERA_TRAS_CORTE_NORMAL_MS : esperaDeReintento(fallos++);
        if (duro) fallos = 0;
      } catch (error) {
        if (cerrada) return;
        if (error instanceof Error && error.name === 'SesionRevocadaError') return;
        espera = esperaDeReintento(fallos++);
      }
      await esperar(espera);
    }
  };
  void ciclo();

  return {
    addEventListener(tipo: string, fn: Oyente): void {
      oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), fn]);
    },
    close(): void {
      cerrada = true;
      conexion?.abort();
      if (temporizador) clearTimeout(temporizador);
      despertar?.();
    },
  };
}
