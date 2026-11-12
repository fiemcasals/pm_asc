import { describe, expect, it, vi } from 'vitest';
import {
  EventoFallaCritica,
  FuenteEventos,
  URL_EVENTOS_FALLAS,
  parsearEventoFalla,
  reproducirAvisoSonoro,
  suscribirFallasCriticas,
} from './fallas';

const EVENTO: EventoFallaCritica = {
  tipo: 'falla-critica',
  informeId: 'INF-1',
  maquinaId: 'MAQ-CALLAO-M1',
  codigoAGC: 'M1',
  nombreMaquina: 'M1: Ascensor Principal',
  direccion: 'Av. Callao 850, CABA',
  consorcio: 'Consorcio Callao 850',
  eca: 'Elevadores San Martín',
  inspector: 'dev-ma-2',
  fallas: ['CABLES_DESGASTADOS'],
  registradoEn: '2026-11-09T12:00:00.000Z',
  enlaceInforme: '/api/fallas-criticas/informes/INF-1',
};

describe('parsearEventoFalla', () => {
  it('acepta un evento bien formado', () => {
    expect(parsearEventoFalla(JSON.stringify(EVENTO))).toEqual(EVENTO);
  });

  it.each([
    ['JSON inválido', '{no'],
    ['otro tipo', JSON.stringify({ ...EVENTO, tipo: 'ping' })],
    ['sin fallas', JSON.stringify({ ...EVENTO, fallas: [] })],
    ['falla desconocida', JSON.stringify({ ...EVENTO, fallas: ['OTRA'] })],
    ['falta un campo', JSON.stringify({ ...EVENTO, direccion: undefined })],
    ['enlace externo', JSON.stringify({ ...EVENTO, enlaceInforme: 'https://malicioso.example/x' })],
    ['enlace javascript', JSON.stringify({ ...EVENTO, enlaceInforme: 'javascript:alert(1)' })],
  ])('descarta: %s', (_caso, raw) => {
    expect(parsearEventoFalla(raw)).toBeNull();
  });
});

describe('suscribirFallasCriticas', () => {
  function fuenteFalsa() {
    const listeners: Record<string, (e: { data: string }) => void> = {};
    const fuente: FuenteEventos & { emitir: (t: string, d: string) => void; cerrada: boolean } = {
      cerrada: false,
      addEventListener: (t, fn) => {
        listeners[t] = fn;
      },
      close() {
        this.cerrada = true;
      },
      emitir: (t, d) => listeners[t]?.({ data: d }),
    };
    return fuente;
  }

  it('se conecta al canal de la API y entrega sólo los eventos válidos', () => {
    const fuente = fuenteFalsa();
    const urls: string[] = [];
    const recibidos: EventoFallaCritica[] = [];
    const cerrar = suscribirFallasCriticas(
      (e) => recibidos.push(e),
      (url) => {
        urls.push(url);
        return fuente;
      },
    );

    fuente.emitir('falla-critica', JSON.stringify(EVENTO));
    fuente.emitir('falla-critica', '{roto');
    fuente.emitir('ping', '{}');

    expect(urls).toEqual([URL_EVENTOS_FALLAS]);
    expect(recibidos).toEqual([EVENTO]);

    cerrar();
    expect(fuente.cerrada).toBe(true);
  });
});

describe('reproducirAvisoSonoro', () => {
  it('sin Web Audio devuelve false', () => {
    expect(reproducirAvisoSonoro(() => null)).toBe(false);
  });

  it('programa tres pitidos de dos tonos (6 osciladores)', () => {
    vi.useFakeTimers();
    const osciladores: { frecuencia: number; inicio: number }[] = [];
    const nodo = () => ({ connect: (n: unknown) => n });
    const ctx = {
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createGain: () => ({
        ...nodo(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }),
      createOscillator: () => {
        const osc = {
          ...nodo(),
          type: '',
          frequency: { value: 0 },
          start: (t: number) => osciladores.push({ frecuencia: osc.frequency.value, inicio: t }),
          stop: vi.fn(),
        };
        return osc;
      },
    };

    expect(reproducirAvisoSonoro(() => ctx as unknown as AudioContext)).toBe(true);
    expect(osciladores.map((o) => o.frecuencia)).toEqual([880, 660, 880, 660, 880, 660]);
    vi.runAllTimers();
    expect(ctx.close).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
