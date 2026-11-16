import { describe, expect, it, vi } from 'vitest';
import { edificioResuelto, enviarReporteParada, puedeGuardarParada, usoRespondido } from './usoEquipo';

describe('usoRespondido (HU-17 RF-02, criterio 3: no se avanza sin responder)', () => {
  it('es falso mientras el equipo no tiene respuesta y verdadero con cualquiera de las dos', () => {
    expect(usoRespondido({}, 'm1')).toBe(false);
    expect(usoRespondido({ m2: 'en_uso' }, 'm1')).toBe(false); // la respuesta de otro equipo no cuenta
    expect(usoRespondido({ m1: 'en_uso' }, 'm1')).toBe(true);
    expect(usoRespondido({ m1: 'fuera_de_servicio' }, 'm1')).toBe(true);
  });
});

describe('puedeGuardarParada (HU-17 RF-03, criterio 1)', () => {
  it('se habilita sólo con una causa escrita y al menos una foto', () => {
    expect(puedeGuardarParada(undefined)).toBe(false);
    expect(puedeGuardarParada({ causa: '', fotos: ['data:image/jpeg;base64,AAA'] })).toBe(false);
    expect(puedeGuardarParada({ causa: '   ', fotos: ['data:image/jpeg;base64,AAA'] })).toBe(false);
    expect(puedeGuardarParada({ causa: 'Cabina trabada en el 3.º', fotos: [] })).toBe(false);
    expect(puedeGuardarParada({ causa: 'Cabina trabada en el 3.º', fotos: ['data:image/jpeg;base64,AAA'] })).toBe(true);
  });
});

describe('edificioResuelto (HU-17 RF-03, criterio 3)', () => {
  it('el edificio se resuelve recién cuando todos sus equipos están resueltos', () => {
    expect(edificioResuelto(['a', 'b'], new Set(['a']))).toBe(false);
    expect(edificioResuelto(['a', 'b'], new Set(['a', 'b']))).toBe(true);
    expect(edificioResuelto(['a', 'b'], new Set(['a', 'b', 'otro']))).toBe(true);
  });

  it('un edificio sin equipos no se da por resuelto', () => {
    expect(edificioResuelto([], new Set(['a']))).toBe(false);
  });
});

describe('enviarReporteParada', () => {
  const borrador = { causa: '  Sin energía  ', fotos: ['data:image/jpeg;base64,AAA'] };

  it('manda la máquina, la causa sin espacios sobrantes y las fotos, y devuelve el reporte guardado', async () => {
    const enviar = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'PAR-1', estado: 'Fuera de Servicio — Pendiente de confirmación', avisadoA: ['secretaria', 'firmante:gonza'] }),
    });

    const res = await enviarReporteParada('MAQ-1', borrador, enviar);

    expect(res).toEqual({ ok: true, reporte: { id: 'PAR-1', estado: 'Fuera de Servicio — Pendiente de confirmación', avisadoA: ['secretaria', 'firmante:gonza'] } });
    const [url, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/paradas');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ maquinaId: 'MAQ-1', causa: 'Sin energía', fotos: ['data:image/jpeg;base64,AAA'] });
  });

  it('un error de la API vuelve como texto (con la lista de errores de validación) y un corte de red también', async () => {
    const rechazo = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'Datos inválidos', errores: ['causa es obligatoria', 'fotos: hace falta una'] }) });
    expect(await enviarReporteParada('M', borrador, rechazo)).toEqual({ ok: false, error: 'causa es obligatoria · fotos: hace falta una' });

    const sinRed = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    expect(await enviarReporteParada('M', borrador, sinRed)).toEqual({ ok: false, error: 'Failed to fetch' });
  });
});
