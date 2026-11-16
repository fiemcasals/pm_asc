import { describe, expect, it, vi } from 'vitest';
import {
  EventoFallaCritica,
  FuenteEventos,
  URL_EVENTOS_FALLAS,
  agruparFallasPorZona,
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

  it('acepta códigos críticos del checklist de inspección (HU-17 RF-08)', () => {
    const eventoChecklist: EventoFallaCritica = {
      ...EVENTO,
      fallas: ['PARACAIDAS_ANOMALIA', 'STOP_FOSA_DEFICIENTE_INEXISTENTE'],
    };
    expect(parsearEventoFalla(JSON.stringify(eventoChecklist))).toEqual(eventoChecklist);
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

describe('agruparFallasPorZona (HU-06 RF-03, criterio 4)', () => {
  it('agrupa por zona con el nombre legible, en el orden de las zonas del checklist', () => {
    const grupos = agruparFallasPorZona(['STOP_FOSA_DEFICIENTE_INEXISTENTE', 'PARACAIDAS_ANOMALIA', 'CABLES_DESGASTADOS', 'BOTON_PARE_FALLA']);

    expect(grupos.map((g) => g.zona)).toEqual(['Sala de Máquinas', 'Cabina', 'Fosa']);
    expect(grupos[1].fallas.map((f) => f.nombre)).toEqual(['Botón de PARE: Falla', 'Paracaídas: Anomalía']);
    expect(grupos[0].fallas[0]).toEqual({ codigo: 'CABLES_DESGASTADOS', nombre: 'Cables de tracción desgastados' });
  });

  it('un código que no está en la lista va a «Otras», al final, y no se oculta; los repetidos se muestran una vez', () => {
    const grupos = agruparFallasPorZona(['OTRA_COSA', 'CERRADURA_NO_TRABA', 'CERRADURA_NO_TRABA']);

    expect(grupos.map((g) => g.zona)).toEqual(['Accesos', 'Otras']);
    expect(grupos[0].fallas).toHaveLength(1);
    expect(grupos[1].fallas).toEqual([{ codigo: 'OTRA_COSA', nombre: 'OTRA_COSA' }]);
  });

  it('sin fallas devuelve una lista vacía', () => {
    expect(agruparFallasPorZona([])).toEqual([]);
  });
});
