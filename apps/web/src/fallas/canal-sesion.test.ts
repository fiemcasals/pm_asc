import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// HU-06 RF-07 — el panel escucha el canal de fallas críticas con la sesión (sin EventSource) y se reconecta solo.
vi.mock('../auth/sesion', () => ({ fetchConSesion: vi.fn() }));

import { fetchConSesion } from '../auth/sesion';
import { DURACION_MINIMA_MS, ESPERA_TRAS_CORTE_NORMAL_MS, ParserSse, abrirCanalConSesion, esperaDeReintento } from './canalSesion';
import { type EventoFallaCritica, URL_EVENTOS_FALLAS, fusionarPendientes, suscribirFallasCriticas } from './fallas';

const sesion = vi.mocked(fetchConSesion);
const codificar = (t: string) => new TextEncoder().encode(t);

describe('ParserSse', () => {
  const todo = (...pedazos: string[]) => {
    const p = new ParserSse();
    return pedazos.flatMap((t) => p.alimentar(t));
  };

  it('entrega un mensaje completo con su tipo y su dato', () => {
    expect(todo('event: falla-critica\ndata: {"informeId":"INF-1"}\n\n')).toEqual([{ event: 'falla-critica', data: '{"informeId":"INF-1"}' }]);
  });

  it('un mensaje sin tipo es «message»', () => {
    expect(todo('data: hola\n\n')).toEqual([{ event: 'message', data: 'hola' }]);
  });

  it('junta los pedazos aunque corten una palabra, una línea o el salto de línea', () => {
    const entero = 'event: falla-critica\r\ndata: {"informeId":"INF-1"}\r\n\r\n';
    for (let corte = 1; corte < entero.length; corte++) {
      expect(todo(entero.slice(0, corte), entero.slice(corte))).toEqual([{ event: 'falla-critica', data: '{"informeId":"INF-1"}' }]);
    }
  });

  it('entiende los tres saltos de línea del estándar (LF, CRLF y CR)', () => {
    expect(todo('event: a\ndata: 1\n\n')).toEqual([{ event: 'a', data: '1' }]);
    expect(todo('event: b\r\ndata: 2\r\n\r\n')).toEqual([{ event: 'b', data: '2' }]);
    expect(todo('event: c\rdata: 3\r\r')).toEqual([{ event: 'c', data: '3' }]);
  });

  it('varias líneas data se unen con un salto de línea', () => {
    expect(todo('data: uno\ndata: dos\n\n')).toEqual([{ event: 'message', data: 'uno\ndos' }]);
  });

  it('un dato con «:» adentro (un JSON) conserva todo; el espacio después de «:» es opcional', () => {
    expect(todo('event:x\ndata:{"a":"b:c"}\n\n')).toEqual([{ event: 'x', data: '{"a":"b:c"}' }]);
  });

  it('ignora los comentarios, los campos que no usa y los mensajes sin dato', () => {
    expect(todo(': ping\nid: 7\nretry: 1000\nevent: vacio\n\n')).toEqual([]);
  });

  it('el tipo de un mensaje no se arrastra al siguiente', () => {
    expect(todo('event: a\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('varios mensajes en un mismo pedazo salen en orden', () => {
    expect(todo('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('un mensaje sin la línea en blanco final todavía no se entrega: sale cuando llega', () => {
    const p = new ParserSse();
    expect(p.alimentar('event: a\ndata: 1\n')).toEqual([]);
    expect(p.alimentar('\n')).toEqual([{ event: 'a', data: '1' }]);
  });
});

describe('esperaDeReintento', () => {
  it.each([[0, 1000], [1, 2000], [2, 4000], [3, 8000], [4, 16000], [5, 30000], [12, 30000]])('intento %i → %i ms', (intento, ms) => {
    expect(esperaDeReintento(intento)).toBe(ms);
  });
});

/** Un Response con un flujo de eventos: manda los textos y termina (el servidor cerró). */
const flujoQueTermina = (textos: string[], alTerminar: () => void = () => undefined) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        textos.forEach((t) => c.enqueue(codificar(t)));
        alTerminar();
        c.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
/** Un Response con un flujo que sigue abierto hasta que se aborta la señal. */
const flujoAbierto = (signal: AbortSignal, textos: string[] = []) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        textos.forEach((t) => c.enqueue(codificar(t)));
        signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
const sinCuerpo = (status: number) => new Response(null, { status });
const revocada = () => Promise.reject(Object.assign(new Error('Tu sesión fue cerrada'), { name: 'SesionRevocadaError' }));
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));

/** Deja correr las promesas pendientes hasta que se cumpla la condición. */
const hasta = async (condicion: () => boolean, nombre = 'la condición') => {
  for (let i = 0; i < 500 && !condicion(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!condicion()) throw new Error(`No se cumplió ${nombre}`);
};

describe('abrirCanalConSesion', () => {
  let t: number;
  const ahora = () => t;
  const esperas: number[] = [];
  // La espera simulada anota el plazo y cede un turno (sin eso el ciclo correría solo con microtareas y no dejaría mirar la condición).
  const esperar = (ms: number) => {
    esperas.push(ms);
    return new Promise<void>((r) => setTimeout(r, 0));
  };
  beforeEach(() => {
    t = 0;
    esperas.length = 0;
    sesion.mockReset();
  });

  it('pide el canal como un flujo de eventos, sin caché y con una señal para poder cerrarlo', async () => {
    const pedir = vi.fn((_u: string, init: RequestInit) => Promise.resolve(flujoAbierto(init.signal!)));
    const canal = abrirCanalConSesion('/api/fallas-criticas/eventos', { pedir, esperar, ahora });
    await hasta(() => pedir.mock.calls.length === 1);

    const [url, init] = pedir.mock.calls[0];
    expect(url).toBe('/api/fallas-criticas/eventos');
    expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    canal.close();
  });

  it('le entrega a cada oyente los mensajes de su tipo, en orden, y no los de otros tipos', async () => {
    const recibidos: string[] = [];
    const pings: string[] = [];
    const pedir = (_u: string, init: RequestInit) =>
      Promise.resolve(flujoAbierto(init.signal!, ['event: ping\ndata: {}\n\n', 'event: falla-critica\ndata: {"n":1}\n\nevent: falla-critica\nda', 'ta: {"n":2}\n\n']));
    const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
    canal.addEventListener('falla-critica', (m) => recibidos.push(m.data));
    canal.addEventListener('ping', (m) => pings.push(m.data));
    await hasta(() => recibidos.length === 2, 'los dos mensajes');
    expect(recibidos).toEqual(['{"n":1}', '{"n":2}']);
    expect(pings).toEqual(['{}']);
    canal.close();
  });

  it('por defecto pide con la sesión (fetchConSesion) y nunca con EventSource', async () => {
    const eventSource = vi.fn(() => {
      throw new Error('no se debe usar EventSource: no manda la sesión');
    });
    vi.stubGlobal('EventSource', eventSource);
    sesion.mockImplementation((_u, init) => Promise.resolve(flujoAbierto(init!.signal!)));

    const cerrar = suscribirFallasCriticas(() => undefined);
    await hasta(() => sesion.mock.calls.length === 1);
    expect(sesion.mock.calls[0][0]).toBe(URL_EVENTOS_FALLAS);
    expect(eventSource).not.toHaveBeenCalled();
    cerrar();
    vi.unstubAllGlobals();
  });

  describe('cuando el servidor cierra la conexión (el corte periódico)', () => {
    it('si había durado lo normal la reabre enseguida y avisa «reconexion» (la primera conexión no la avisa)', async () => {
      let llamadas = 0;
      const pedir = vi.fn((_u: string, init: RequestInit) => {
        llamadas++;
        return Promise.resolve(llamadas === 1 ? flujoQueTermina(['event: falla-critica\ndata: {"n":1}\n\n'], () => (t += 5 * DURACION_MINIMA_MS)) : flujoAbierto(init.signal!));
      });
      const reconexiones: string[] = [];
      const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
      canal.addEventListener('reconexion', () => reconexiones.push('r'));
      await hasta(() => reconexiones.length === 1, 'la reconexión');

      expect(pedir).toHaveBeenCalledTimes(2);
      expect(esperas).toEqual([ESPERA_TRAS_CORTE_NORMAL_MS]);
      expect(reconexiones).toEqual(['r']);
      canal.close();
    });

    it('si se cerró enseguida (menos de un segundo) lo toma como una falla: espera creciente, sin lazo apretado', async () => {
      const pedir = vi.fn(() => Promise.resolve(flujoQueTermina([])));
      const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
      await hasta(() => esperas.length >= 4, 'cuatro esperas');
      canal.close();
      expect(esperas.slice(0, 4)).toEqual([1000, 2000, 4000, 8000]);
    });
  });

  describe('cuando falla el pedido', () => {
    it('sin red reintenta con espera creciente, y tras una conexión buena la espera vuelve a empezar', async () => {
      let llamadas = 0;
      const pedir = vi.fn((_u: string, init: RequestInit) => {
        llamadas++;
        if (llamadas <= 2) return sinRed();
        if (llamadas === 3) return Promise.resolve(flujoQueTermina([], () => (t += 5 * DURACION_MINIMA_MS)));
        if (llamadas === 4) return sinRed();
        return Promise.resolve(flujoAbierto(init.signal!));
      });
      const reconexiones: string[] = [];
      const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
      canal.addEventListener('reconexion', () => reconexiones.push('r'));
      await hasta(() => reconexiones.length === 1, 'la reconexión');
      canal.close();

      expect(esperas).toEqual([1000, 2000, ESPERA_TRAS_CORTE_NORMAL_MS, 1000]);
    });

    it.each([[401], [500], [502]])('un %i se reintenta con espera creciente (puede ser pasajero)', async (status) => {
      const pedir = vi.fn(() => Promise.resolve(sinCuerpo(status)));
      const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
      await hasta(() => esperas.length >= 3, 'tres esperas');
      canal.close();
      expect(esperas.slice(0, 3)).toEqual([1000, 2000, 4000]);
      expect(pedir.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('un 403 (el rol no alcanza) no se reintenta: reintentar no lo arregla', async () => {
      const pedir = vi.fn(() => Promise.resolve(sinCuerpo(403)));
      abrirCanalConSesion('/x', { pedir, esperar, ahora });
      await hasta(() => pedir.mock.calls.length === 1);
      await new Promise((r) => setTimeout(r, 20));
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(esperas).toEqual([]);
    });

    it('si la sesión fue revocada no se reintenta (fetchConSesion ya avisó para que la app la cierre)', async () => {
      const pedir = vi.fn(revocada);
      abrirCanalConSesion('/x', { pedir, esperar, ahora });
      await hasta(() => pedir.mock.calls.length === 1);
      await new Promise((r) => setTimeout(r, 20));
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(esperas).toEqual([]);
    });
  });

  describe('close()', () => {
    it('aborta la conexión abierta y no vuelve a pedir', async () => {
      let señal!: AbortSignal;
      const pedir = vi.fn((_u: string, init: RequestInit) => {
        señal = init.signal!;
        return Promise.resolve(flujoAbierto(init.signal!));
      });
      const canal = abrirCanalConSesion('/x', { pedir, esperar, ahora });
      await hasta(() => pedir.mock.calls.length === 1);
      expect(señal.aborted).toBe(false);

      canal.close();
      expect(señal.aborted).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(esperas).toEqual([]);
    });

    it('cancela la espera de un reintento: cerrada la suscripción, no se vuelve a pedir', async () => {
      vi.useFakeTimers();
      try {
        const pedir = vi.fn(sinRed);
        const canal = abrirCanalConSesion('/x', { pedir, ahora });
        await vi.advanceTimersByTimeAsync(0);
        expect(pedir).toHaveBeenCalledTimes(1);

        canal.close();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(pedir).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('suscribirFallasCriticas: aviso de reconexión', () => {
  const fuenteFalsa = () => {
    const oyentes: Record<string, ((e: { data: string }) => void)[]> = {};
    return {
      oyentes,
      addEventListener: (tipo: string, fn: (e: { data: string }) => void) => ((oyentes[tipo] ??= []).push(fn)),
      close: vi.fn(),
    };
  };

  it('avisa cada vez que el canal vuelve tras un corte', () => {
    const fuente = fuenteFalsa();
    const avisos: string[] = [];
    suscribirFallasCriticas(() => undefined, () => fuente, undefined, () => avisos.push('volvió'));
    fuente.oyentes.reconexion.forEach((fn) => fn({ data: '' }));
    fuente.oyentes.reconexion.forEach((fn) => fn({ data: '' }));
    expect(avisos).toEqual(['volvió', 'volvió']);
  });

  it('sin quien lo pida, no se queda escuchando la reconexión', () => {
    const fuente = fuenteFalsa();
    suscribirFallasCriticas(() => undefined, () => fuente);
    expect(fuente.oyentes.reconexion).toBeUndefined();
  });
});

describe('fusionarPendientes', () => {
  const alerta = (informeId: string, abiertaPor: string | null = null): EventoFallaCritica =>
    ({ tipo: 'falla-critica', informeId, abiertaPor, abiertaEn: abiertaPor ? '2026-11-18T10:00:00Z' : null }) as EventoFallaCritica;
  const ninguna = new Set<string>();

  it('agrega las alertas que faltan y cuenta cuántas son', () => {
    const r = fusionarPendientes([alerta('A')], [alerta('A'), alerta('B'), alerta('C')], ninguna);
    expect(r.pendientes.map((e) => e.informeId)).toEqual(['A', 'B', 'C']);
    expect(r.agregadas).toBe(2);
  });

  it('no agrega las que este usuario ya marcó como vistas', () => {
    const r = fusionarPendientes([], [alerta('A'), alerta('B')], new Set(['A']));
    expect(r.pendientes.map((e) => e.informeId)).toEqual(['B']);
    expect(r.agregadas).toBe(1);
  });

  it('si alguien abrió una alerta mientras el canal estaba cortado, la actualiza (para que la alarma deje de sonar)', () => {
    const r = fusionarPendientes([alerta('A')], [alerta('A', 'secretaria.e2e')], ninguna);
    expect(r.pendientes[0].abiertaPor).toBe('secretaria.e2e');
    expect(r.pendientes[0].abiertaEn).toBe('2026-11-18T10:00:00Z');
    expect(r.agregadas).toBe(0);
  });

  it('si nada cambia devuelve la misma lista (no hay que volver a dibujar)', () => {
    const actuales = [alerta('A'), alerta('B', 'x')];
    const r = fusionarPendientes(actuales, [alerta('A'), alerta('B', 'x')], ninguna);
    expect(r.pendientes).toBe(actuales);
    expect(r.agregadas).toBe(0);
  });

  it('no repite las que ya están ni toca el resto de lo que se muestra', () => {
    const actuales = [alerta('A'), alerta('Z')];
    const r = fusionarPendientes(actuales, [alerta('A'), alerta('B')], ninguna);
    expect(r.pendientes.map((e) => e.informeId)).toEqual(['A', 'Z', 'B']);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
