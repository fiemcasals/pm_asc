import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fechaHora, hora } from './formato';

// Horas de Buenos Aires (UTC-3) escritas en UTC.
const TARDE = '2026-11-21T18:15:07.000Z'; // 15:15:07
const MANANA = '2026-11-21T12:05:00.000Z'; // 09:05
const MEDIANOCHE = '2026-11-22T03:05:00.000Z'; // 00:05 del 22

describe('formato de fecha y hora en 24 horas (HU-12 RF-03)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('criterio 1: una hora de la tarde se lee 15:15, nunca 03:15 ni con a. m./p. m.', () => {
    expect(hora(TARDE)).toBe('15:15');
    expect(fechaHora(TARDE)).toBe('21/11/2026 15:15');
    expect(fechaHora(TARDE)).not.toMatch(/03:15|(a|p)\. ?m\./i);
  });

  it('la mañana y la medianoche: 09:05 y 00:05 (nunca 24:05)', () => {
    expect(hora(MANANA)).toBe('09:05');
    expect(fechaHora(MEDIANOCHE)).toBe('22/11/2026 00:05');
    expect(fechaHora(MEDIANOCHE)).not.toMatch(/24:/);
  });

  it('con segundos y sin año', () => {
    expect(hora(TARDE, { segundos: true })).toBe('15:15:07');
    expect(fechaHora(TARDE, { segundos: true })).toBe('21/11/2026 15:15:07');
    expect(fechaHora(TARDE, { anio: false })).toBe('21/11, 15:15');
  });

  it('acepta texto ISO, milisegundos y Date', () => {
    expect(fechaHora(Date.parse(TARDE))).toBe('21/11/2026 15:15');
    expect(fechaHora(new Date(TARDE))).toBe('21/11/2026 15:15');
  });

  it('un valor vacío o inválido devuelve texto vacío', () => {
    for (const v of [null, undefined, '', 'ayer', Number.NaN]) {
      expect(fechaHora(v)).toBe('');
      expect(hora(v)).toBe('');
    }
  });

  it('criterio 4: un navegador en otra zona horaria muestra igual la hora de Buenos Aires', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.resetModules();
    const { fechaHora: enTokio } = await import('./formato');
    expect(new Date(TARDE).getHours()).not.toBe(15); // el proceso de verdad está en otra zona
    expect(enTokio(TARDE)).toBe('21/11/2026 15:15');
  });

  it('criterio 2: en apps/web/src ninguna fecha con hora se formatea con toLocaleString o toLocaleTimeString', () => {
    const raiz = join(__dirname, '..');
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) archivos.push(p);
      }
    };
    recorrer(raiz);
    const malos: string[] = [];
    for (const a of archivos) {
      readFileSync(a, 'utf8')
        .split('\n')
        .forEach((linea, i) => {
          // toLocaleTimeString siempre lleva hora; toLocaleString sólo importa sobre un Date (los montos usan números).
          if (/toLocaleTimeString\(/.test(linea) || /new Date\([^)]*\)\s*\.toLocaleString\(/.test(linea) || /\bahora\.toLocaleString\(/.test(linea)) {
            malos.push(`${a.slice(raiz.length + 1)}:${i + 1}`);
          }
        });
    }
    expect(malos).toEqual([]);
  });
});
