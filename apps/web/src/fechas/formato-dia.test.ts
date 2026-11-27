import { afterEach, describe, expect, it, vi } from 'vitest';
import { claveDeDia, fecha } from './formato';

// HU-19 RF-08 — el día de un momento, en la hora de Buenos Aires (UTC-3), esté donde esté el navegador.
describe('fecha y claveDeDia', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fecha: «21/11/2026»', () => {
    expect(fecha('2026-11-21T18:15:07.000Z')).toBe('21/11/2026');
    expect(fecha(new Date('2026-01-05T15:00:00.000Z'))).toBe('05/01/2026');
    expect(fecha(Date.parse('2026-11-21T18:15:07.000Z'))).toBe('21/11/2026');
  });

  it('claveDeDia: «2026-11-21»', () => {
    expect(claveDeDia('2026-11-21T18:15:07.000Z')).toBe('2026-11-21');
    expect(claveDeDia('2026-01-05T15:00:00.000Z')).toBe('2026-01-05');
  });

  it('el día cambia a la medianoche de Buenos Aires (03:00 UTC), no a la de UTC', () => {
    expect(claveDeDia('2026-11-22T02:59:59.000Z')).toBe('2026-11-21'); // 23:59:59 del 21
    expect(claveDeDia('2026-11-22T03:00:00.000Z')).toBe('2026-11-22'); // 00:00 del 22
    expect(fecha('2026-11-22T02:59:59.000Z')).toBe('21/11/2026');
    expect(fecha('2026-11-22T03:00:00.000Z')).toBe('22/11/2026');
  });

  it('el cambio de año también es el de Buenos Aires', () => {
    expect(claveDeDia('2027-01-01T02:59:00.000Z')).toBe('2026-12-31');
    expect(claveDeDia('2027-01-01T03:00:00.000Z')).toBe('2027-01-01');
  });

  it('un valor vacío o inválido devuelve texto vacío', () => {
    for (const v of [null, undefined, '', 'ayer', Number.NaN]) {
      expect(fecha(v)).toBe('');
      expect(claveDeDia(v)).toBe('');
    }
  });

  it('un navegador en otra zona horaria muestra el mismo día', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.resetModules();
    const { claveDeDia: enTokio, fecha: fechaEnTokio } = await import('./formato');
    const momento = '2026-11-21T18:15:07.000Z'; // en Tokio ya es el 22
    expect(new Date(momento).getDate()).toBe(22);
    expect(enTokio(momento)).toBe('2026-11-21');
    expect(fechaEnTokio(momento)).toBe('21/11/2026');
  });
});
